import { useEffect, useState } from 'react'
import { supabase, DEMO } from './lib/supabase'

function Shell({ children }) {
  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <img src="/logo.jpg" alt="මරු Bun" className="auth-logo" />
        {children}
        {DEMO && <div className="demo-note">DEMO MODE — no Supabase keys found. Any email/password works. 2-step demo code: <b>123456</b>. Data stays in this browser only.</div>}
      </div>
    </div>
  )
}

export function Login({ onDone }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async (e) => {
    e.preventDefault(); setErr(''); setBusy(true)
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    setBusy(false)
    if (error) return setErr(error.message)
    onDone()
  }
  return (
    <Shell>
      <h2>Staff login</h2>
      <form onSubmit={submit} className="stack gap">
        <label className="field"><span>Email</span><input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
        <label className="field"><span>Password</span><input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
        {err && <div className="err">{err}</div>}
        <button className="btn primary lg" disabled={busy}>{busy ? 'Signing in…' : 'Login'}</button>
      </form>
    </Shell>
  )
}

export function MfaVerify({ onDone, onLogout }) {
  const [code, setCode] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async (e) => {
    e.preventDefault(); setErr(''); setBusy(true)
    const { data: f } = await supabase.auth.mfa.listFactors()
    const factor = f?.totp?.[0]
    if (!factor) { setBusy(false); return setErr('No authenticator found. Please log in again.') }
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code: code.trim() })
    setBusy(false)
    if (error) return setErr(error.message)
    onDone()
  }
  return (
    <Shell>
      <h2>2-step verification</h2>
      <p className="muted">Enter the 6-digit code from your authenticator app.</p>
      <form onSubmit={submit} className="stack gap">
        <input className="code-input" inputMode="numeric" maxLength={6} autoFocus placeholder="000000" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
        {err && <div className="err">{err}</div>}
        <button className="btn primary lg" disabled={busy || code.length !== 6}>{busy ? 'Checking…' : 'Verify'}</button>
        <button type="button" className="btn ghost" onClick={onLogout}>Back to login</button>
      </form>
    </Shell>
  )
}

/** Set up the authenticator app. Used at first login and from Settings & Security. */
export function MfaEnroll({ onDone, onLogout }) {
  const [info, setInfo] = useState(null)
  const [code, setCode] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let live = true
    ;(async () => {
      // remove half-finished enrollments from earlier attempts
      const { data: f } = await supabase.auth.mfa.listFactors()
      for (const x of f?.all || []) if (x.status !== 'verified') await supabase.auth.mfa.unenroll({ factorId: x.id })
      const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'POS ' + Date.now() })
      if (!live) return
      if (error) setErr(error.message); else setInfo(data)
    })()
    return () => { live = false }
  }, [])

  const submit = async (e) => {
    e.preventDefault(); setErr(''); setBusy(true)
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: info.id, code: code.trim() })
    setBusy(false)
    if (error) return setErr(error.message)
    onDone()
  }

  return (
    <Shell>
      <h2>Set up 2-step verification</h2>
      <p className="muted">Scan this QR code with Google Authenticator, Microsoft Authenticator or Authy, then enter the 6-digit code.</p>
      {info?.totp?.qr_code && <img className="qr" src={info.totp.qr_code} alt="QR code" />}
      {info && <div className="small muted">Can't scan? Enter this key manually:<br /><code>{info.totp.secret}</code></div>}
      <form onSubmit={submit} className="stack gap">
        <input className="code-input" inputMode="numeric" maxLength={6} placeholder="000000" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
        {err && <div className="err">{err}</div>}
        <button className="btn primary lg" disabled={busy || code.length !== 6 || !info}>{busy ? 'Checking…' : 'Activate'}</button>
        {onLogout && <button type="button" className="btn ghost" onClick={onLogout}>Logout</button>}
      </form>
    </Shell>
  )
}
