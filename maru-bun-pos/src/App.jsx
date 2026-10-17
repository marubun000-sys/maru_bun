import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase, DEMO } from './lib/supabase'
import { DataCtx, UICtx } from './ctx'
import { Login, MfaEnroll, MfaVerify } from './Auth'
import { Receipt } from './components'
import POS from './pages/POS'
import Dashboard from './pages/Dashboard'
import Kitchen from './pages/Kitchen'
import MenuManagement from './pages/MenuManagement'
import Inventory from './pages/Inventory'
import GoogleReview from './pages/GoogleReview'
import SettingsSecurity from './pages/SettingsSecurity'

const TABS = [
  ['pos', 'Orders & Billing'],
  ['dash', 'Dashboard'],
  ['kitchen', 'Kitchen Display'],
  ['menu', 'Menu Management'],
  ['inv', 'Inventory'],
  ['review', 'Google Review'],
  ['settings', 'Settings & Security'],
]

async function resolveStage() {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return 'login'
  const { data: a } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  if (a.currentLevel === 'aal2') return 'ready'
  if (a.nextLevel === 'aal2') return 'verify'
  return 'enroll'
}

export default function App() {
  const [stage, setStage] = useState('loading')
  const refreshStage = useCallback(async () => setStage(await resolveStage()), [])
  useEffect(() => { refreshStage() }, [refreshStage])
  const logout = async () => { await supabase.auth.signOut(); setStage('login') }

  if (stage === 'loading') return <div className="center-screen">Loading…</div>
  if (stage === 'login') return <Login onDone={refreshStage} />
  if (stage === 'verify') return <MfaVerify onDone={refreshStage} onLogout={logout} />
  if (stage === 'enroll') return <MfaEnroll onDone={refreshStage} onLogout={logout} />
  return <Main onLogout={logout} />
}

function Main({ onLogout }) {
  const [tab, setTab] = useState('pos')
  const [data, setData] = useState(null)
  const [active, setActive] = useState([])
  const [toasts, setToasts] = useState([])
  const [job, setJob] = useState(null)
  const [loadErr, setLoadErr] = useState('')
  const tid = useRef(0)

  const toast = useCallback((msg, kind = 'ok') => {
    const id = ++tid.current
    setToasts((t) => [...t, { id, msg, kind }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000)
  }, [])

  const print = useCallback((j) => { setJob(j); setTimeout(() => window.print(), 200) }, [])

  const reload = useCallback(async () => {
    const [s, c, m, a, i] = await Promise.all([
      supabase.from('settings').select('*').eq('id', 1).single(),
      supabase.from('categories').select('*').order('sort', { ascending: true }),
      supabase.from('menu_items').select('*').order('name', { ascending: true }),
      supabase.from('addons').select('*').order('name', { ascending: true }),
      supabase.from('inventory').select('*').order('name', { ascending: true }),
    ])
    const err = [s, c, m, a, i].find((r) => r.error)?.error
    if (err) { setLoadErr(err.message); return }
    setLoadErr('')
    setData({ settings: s.data, categories: c.data, items: m.data, addons: a.data, inventory: i.data })
  }, [])

  const refreshActive = useCallback(async () => {
    const { data: rows, error } = await supabase.from('orders').select('*, order_items(*)').eq('status', 'new').order('created_at', { ascending: true })
    if (!error) setActive(rows)
  }, [])

  useEffect(() => { reload() }, [reload])
  useEffect(() => {
    refreshActive()
    const t = setInterval(refreshActive, 4000)
    return () => clearInterval(t)
  }, [refreshActive])

  if (loadErr) return (
    <div className="center-screen stack gap">
      <div className="err">Could not load data: {loadErr}</div>
      <div className="muted small">Did you run supabase/schema.sql in the Supabase SQL Editor?</div>
      <button className="btn primary" onClick={reload}>Retry</button>
      <button className="btn ghost" onClick={onLogout}>Logout</button>
    </div>
  )
  if (!data) return <div className="center-screen">Loading…</div>

  const ui = { toast, print }
  const dataCtx = { ...data, reload, active, refreshActive, logout: onLogout }
  const { settings } = data

  return (
    <DataCtx.Provider value={dataCtx}>
      <UICtx.Provider value={ui}>
        <div className="app">
          <header className="topbar">
            <div className="brand">
              <img src="/logo.jpg" alt="" className="brand-logo" />
              <div>
                <div className="brand-name">{settings.shop_name}</div>
                <div className="brand-sub">{settings.tagline}</div>
              </div>
            </div>
            <div className="topbar-right">
              {DEMO && <span className="badge warn">DEMO</span>}
              <div className="cashier">Counter: <b>{settings.cashier || 'not set'}</b></div>
              <button className="btn ghost sm" onClick={onLogout}>Logout</button>
            </div>
          </header>
          <nav className="tabs">
            {TABS.map(([k, label]) => (
              <button key={k} className={'tab' + (tab === k ? ' on' : '')} onClick={() => setTab(k)}>
                {label}
                {k === 'kitchen' && active.length > 0 && <span className="pill">{active.length}</span>}
              </button>
            ))}
          </nav>
          <main className="page">
            {tab === 'pos' && <POS />}
            {tab === 'dash' && <Dashboard />}
            {tab === 'kitchen' && <Kitchen />}
            {tab === 'menu' && <MenuManagement />}
            {tab === 'inv' && <Inventory />}
            {tab === 'review' && <GoogleReview />}
            {tab === 'settings' && <SettingsSecurity />}
          </main>
        </div>
        <div className="toasts">{toasts.map((t) => <div key={t.id} className={'toast ' + t.kind}>{t.msg}</div>)}</div>
        <div id="print-area"><Receipt job={job} /></div>
      </UICtx.Provider>
    </DataCtx.Provider>
  )
}
