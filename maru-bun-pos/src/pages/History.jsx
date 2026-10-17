import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useUI } from '../ctx'
import { BillActions, Confirm, Modal } from '../components'
import { billNo, dayKey, dt, money, r2, tm, typeLabel } from '../lib/util'

const todayStr = () => dayKey(new Date())
const monthStr = () => todayStr().slice(0, 7)

export default function History() {
  const { toast } = useUI()
  const [mode, setMode] = useState('day')
  const [day, setDay] = useState(todayStr())
  const [month, setMonth] = useState(monthStr())
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(null)
  const [del, setDel] = useState(null)
  const [filter, setFilter] = useState('')

  const range = useMemo(() => {
    if (mode === 'day') { const [y, m, d] = day.split('-').map(Number); return [new Date(y, m - 1, d), new Date(y, m - 1, d + 1)] }
    const [y, m] = month.split('-').map(Number)
    return [new Date(y, m - 1, 1), new Date(y, m, 1)]
  }, [mode, day, month])

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase.from('orders').select('*, order_items(*)')
      .gte('created_at', range[0].toISOString()).lt('created_at', range[1].toISOString()).order('created_at', { ascending: false })
    setLoading(false)
    if (error) return toast(error.message, 'err')
    setOrders(data)
  }, [range, toast])
  useEffect(() => { load() }, [load])

  const total = r2(orders.reduce((s, o) => s + Number(o.total), 0))
  const daily = useMemo(() => {
    const m = {}
    for (const o of orders) { const k = dayKey(o.created_at); m[k] = m[k] || { k, bills: 0, sales: 0 }; m[k].bills++; m[k].sales += Number(o.total) }
    return Object.values(m).sort((a, b) => (a.k < b.k ? 1 : -1))
  }, [orders])
  const maxSales = Math.max(1, ...daily.map((d) => d.sales))
  const shown = orders.filter((o) => {
    const s = filter.toLowerCase()
    return !s || String(o.bill_no).includes(s) || o.customer_name.toLowerCase().includes(s) || o.customer_phone.includes(s)
  })

  const remove = async () => {
    const { error } = await supabase.from('orders').delete().eq('id', del.id)
    if (error) return toast(error.message, 'err')
    toast(`Bill ${billNo(del.bill_no)} deleted`); setDel(null); load()
  }

  return (
    <div className="stack gap">
      <div className="row gap wrap center">
        <div className="seg">
          <button className={mode === 'day' ? 'on' : ''} onClick={() => setMode('day')}>Daily</button>
          <button className={mode === 'month' ? 'on' : ''} onClick={() => setMode('month')}>Monthly</button>
        </div>
        {mode === 'day'
          ? <input type="date" value={day} max={todayStr()} onChange={(e) => e.target.value && setDay(e.target.value)} />
          : <input type="month" value={month} max={monthStr()} onChange={(e) => e.target.value && setMonth(e.target.value)} />}
        <input className="grow" placeholder="Search bill no / name / phone" value={filter} onChange={(e) => setFilter(e.target.value)} />
      </div>

      <div className="kpis">
        <div className="kpi"><div className="kpi-l">{mode === 'day' ? 'Day sales' : 'Month sales'}</div><div className="kpi-v">{money(total)}</div></div>
        <div className="kpi"><div className="kpi-l">Bills</div><div className="kpi-v">{orders.length}</div></div>
        <div className="kpi"><div className="kpi-l">Average bill</div><div className="kpi-v">{money(orders.length ? total / orders.length : 0)}</div></div>
      </div>

      {mode === 'month' && daily.length > 0 && (
        <div className="card">
          <h4>Sales per day</h4>
          {daily.map((d) => (
            <div key={d.k} className="bar-row" onClick={() => { setDay(d.k); setMode('day') }} title="Open this day">
              <span className="bar-l">{d.k.slice(8)}</span>
              <div className="bar"><i style={{ width: (d.sales / maxSales) * 100 + '%' }} /></div>
              <span className="bar-v">{money(d.sales)} <span className="muted small">· {d.bills} bills</span></span>
            </div>
          ))}
        </div>
      )}

      <div className="card">
        <h4>Bills {loading && <span className="muted small">loading…</span>}</h4>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Bill</th><th>Time</th><th>Type</th><th>Customer</th><th>Payment</th><th className="r">Total</th><th /></tr></thead>
            <tbody>
              {shown.map((o) => (
                <tr key={o.id}>
                  <td><b>{billNo(o.bill_no)}</b></td>
                  <td>{mode === 'month' ? dt(o.created_at) : tm(o.created_at)}</td>
                  <td>{typeLabel(o.order_type)}</td>
                  <td>{o.customer_name || '—'}<div className="small muted">{o.customer_phone}</div></td>
                  <td>{o.payment_method}</td>
                  <td className="r">{money(o.total)}</td>
                  <td className="r"><button className="btn sm" onClick={() => setOpen(o)}>View</button></td>
                </tr>
              ))}
              {!shown.length && !loading && <tr><td colSpan={7} className="muted c-pad">No bills in this period.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {open && (
        <Modal title={`Bill ${billNo(open.bill_no)}`} onClose={() => setOpen(null)} wide>
          <div className="small muted">{dt(open.created_at)} · {typeLabel(open.order_type)} · {open.payment_method}{open.cashier ? ` · Cashier: ${open.cashier}` : ''}</div>
          <div className="table-wrap">
            <table>
              <tbody>
                {open.order_items.map((it) => (
                  <tr key={it.id}>
                    <td>{it.qty} × {it.name}{(it.addons || []).map((a, i) => <div key={i} className="small muted">+ {a.name}</div>)}</td>
                    <td className="r">{money(it.line_total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="sum">
            <div className="between"><span>Subtotal</span><span>{money(open.subtotal)}</span></div>
            {Number(open.discount) > 0 && <div className="between"><span>Discount</span><span>−{money(open.discount)}</span></div>}
            {Number(open.service_charge) > 0 && <div className="between"><span>Service charge</span><span>{money(open.service_charge)}</span></div>}
            <div className="between total"><span>Total</span><span>{money(open.total)}</span></div>
          </div>
          <BillActions order={open} onPhoneSaved={(p) => { setOpen((o) => ({ ...o, customer_phone: p })); load() }} />
          <div className="row end"><button className="btn danger sm" onClick={() => { setDel(open); setOpen(null) }}>Delete bill</button></div>
        </Modal>
      )}
      {del && <Confirm title="Delete this bill?" message={`Bill ${billNo(del.bill_no)} (${money(del.total)}) will be removed from sales. Stock is NOT restored.`} okText="Delete" onOk={remove} onCancel={() => setDel(null)} />}
    </div>
  )
}
