import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useData, useUI } from '../ctx'
import { BillActions, Modal } from '../components'
import { billNo, computeTotals, money, r2 } from '../lib/util'

export default function NewBill() {
  const { settings, categories, items, addons, inventory, reload, refreshActive } = useData()
  const { toast } = useUI()

  const [cat, setCat] = useState('all')
  const [q, setQ] = useState('')
  const [cart, setCart] = useState([])
  const [pick, setPick] = useState(null)
  const [type, setType] = useState('dine-in')
  const [cust, setCust] = useState({ name: '', phone: '' })
  const [note, setNote] = useState('')
  const [discType, setDiscType] = useState('pct')
  const [discVal, setDiscVal] = useState('')
  const [svcOn, setSvcOn] = useState(!!settings.service_charge_enabled)
  const methods = settings.payment_methods?.length ? settings.payment_methods : ['Cash']
  const [pay, setPay] = useState(methods[0])
  const [cash, setCash] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(null)

  // Service charge defaults: on for dine-in, off for takeaway (cashier can still toggle)
  useEffect(() => { setSvcOn(type === 'dine-in' && !!settings.service_charge_enabled) }, [type, settings.service_charge_enabled])
  useEffect(() => { if (!methods.includes(pay)) setPay(methods[0]) }, [methods, pay])

  const stockOf = (it) => (it.inventory_id ? inventory.find((x) => x.id === it.inventory_id) : null)
  const visible = useMemo(
    () => items.filter((i) => i.active && (cat === 'all' || i.category_id === cat) && i.name.toLowerCase().includes(q.toLowerCase())),
    [items, cat, q],
  )
  const activeAddons = addons.filter((a) => a.active)

  const lines = cart.map((l) => ({ ...l, unit_price: l.item.price + l.addons.reduce((s, a) => s + a.price, 0) }))
  const t = computeTotals({ lines, discType, discVal, svcOn, svcPct: settings.service_charge_pct })
  const received = cash === '' ? null : Number(cash)
  const change = pay === 'Cash' && received != null ? r2(received - t.total) : null

  const addLine = (item, chosen, qty) => {
    const key = item.id + '|' + chosen.map((a) => a.id).sort().join(',')
    setCart((c) => {
      const f = c.find((l) => l.key === key)
      if (f) return c.map((l) => (l.key === key ? { ...l, qty: l.qty + qty } : l))
      return [...c, { key, item, addons: chosen, qty }]
    })
    const s = stockOf(item)
    if (s && s.qty <= 0) toast(`${s.name} is out of stock!`, 'err')
  }
  const tap = (item) => (activeAddons.length ? setPick(item) : addLine(item, [], 1))
  const setQty = (key, d) => setCart((c) => c.map((l) => (l.key === key ? { ...l, qty: l.qty + d } : l)).filter((l) => l.qty > 0))

  const reset = () => {
    setCart([]); setCust({ name: '', phone: '' }); setNote(''); setDiscVal(''); setCash(''); setType('dine-in'); setPay(methods[0])
  }

  const save = async () => {
    if (!cart.length) return toast('Add items to the bill first', 'err')
    if (pay === 'Cash' && received != null && received < t.total) return toast('Cash received is less than the total', 'err')
    setBusy(true)
    const cashReceived = pay === 'Cash' ? (received ?? t.total) : null
    const payload = {
      order_type: type, customer_name: cust.name.trim(), customer_phone: cust.phone.trim(),
      subtotal: t.subtotal, service_charge: t.service, discount: t.discount, total: t.total,
      payment_method: pay, cash_received: cashReceived, change_given: pay === 'Cash' ? r2(cashReceived - t.total) : null,
      cashier: settings.cashier || '', note: note.trim(),
      items: lines.map((l) => ({
        menu_item_id: l.item.id, name: l.item.name, qty: l.qty, unit_price: l.unit_price,
        addons: l.addons.map((a) => ({ name: a.name, price: a.price })), line_total: r2(l.unit_price * l.qty),
      })),
    }
    const { data, error } = await supabase.rpc('place_order', { p: payload })
    setBusy(false)
    if (error) return toast('Could not save bill: ' + error.message, 'err')
    setDone({ ...data, order_items: payload.items })
    reset()
    reload(); refreshActive()
  }

  return (
    <div className="pos">
      <section className="pos-menu">
        <div className="row gap wrap">
          <input className="grow" placeholder="Search item…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="chips">
          <button className={'chip' + (cat === 'all' ? ' on' : '')} onClick={() => setCat('all')}>All</button>
          {categories.map((c) => <button key={c.id} className={'chip' + (cat === c.id ? ' on' : '')} onClick={() => setCat(c.id)}>{c.name}</button>)}
        </div>
        <div className="grid">
          {visible.map((it) => {
            const s = stockOf(it)
            const out = s && s.qty <= 0
            return (
              <button key={it.id} className={'tile' + (out ? ' out' : '')} onClick={() => tap(it)}>
                <div className="tile-name">{it.name}</div>
                <div className="tile-price">{money(it.price)}</div>
                {out && <span className="tile-flag">OUT OF STOCK</span>}
                {s && !out && s.qty <= s.low_threshold && <span className="tile-flag low">LOW STOCK</span>}
              </button>
            )
          })}
          {!visible.length && <div className="muted">No items. Add some in Menu Management.</div>}
        </div>
      </section>

      <aside className="pos-cart">
        <div className="seg full">
          <button className={type === 'dine-in' ? 'on' : ''} onClick={() => setType('dine-in')}>Dine-in</button>
          <button className={type === 'takeaway' ? 'on' : ''} onClick={() => setType('takeaway')}>Takeaway</button>
        </div>

        <div className="cart-lines">
          {!lines.length && <div className="muted c-pad">Tap an item to add it to the bill.</div>}
          {lines.map((l) => (
            <div key={l.key} className="cart-line">
              <div className="grow">
                <div><b>{l.item.name}</b></div>
                {l.addons.map((a) => <div key={a.id} className="small muted">+ {a.name}{a.price ? ` (${money(a.price)})` : ''}</div>)}
                <div className="small muted">{money(l.unit_price)} each</div>
              </div>
              <div className="stepper">
                <button onClick={() => setQty(l.key, -1)} aria-label="Less">−</button>
                <span>{l.qty}</span>
                <button onClick={() => setQty(l.key, 1)} aria-label="More">+</button>
              </div>
              <div className="line-total">{money(l.unit_price * l.qty)}</div>
            </div>
          ))}
        </div>

        <div className="cart-form stack gap">
          <div className="row gap">
            <input placeholder="Customer name" value={cust.name} onChange={(e) => setCust({ ...cust, name: e.target.value })} />
            <input placeholder="WhatsApp no." inputMode="tel" value={cust.phone} onChange={(e) => setCust({ ...cust, phone: e.target.value })} />
          </div>
          <input placeholder="Order note (optional, shown in kitchen)" value={note} onChange={(e) => setNote(e.target.value)} />

          <div className="row gap center">
            <span className="small muted">Discount</span>
            <select value={discType} onChange={(e) => setDiscType(e.target.value)} style={{ width: 72 }}>
              <option value="pct">%</option><option value="amt">Rs.</option>
            </select>
            <input className="num" inputMode="decimal" placeholder="0" value={discVal} onChange={(e) => setDiscVal(e.target.value.replace(/[^\d.]/g, ''))} />
          </div>
          {discType === 'pct' && (settings.discount_presets || []).length > 0 && (
            <div className="chips tight">
              {settings.discount_presets.map((p) => <button key={p} className={'chip sm' + (String(discVal) === String(p) ? ' on' : '')} onClick={() => setDiscVal(String(p))}>{p}%</button>)}
              <button className="chip sm" onClick={() => setDiscVal('')}>None</button>
            </div>
          )}
          <label className="row gap center small">
            <input type="checkbox" checked={svcOn} onChange={(e) => setSvcOn(e.target.checked)} />
            Service charge ({settings.service_charge_pct}%)
          </label>

          <div className="sum">
            <div className="between"><span>Subtotal</span><span>{money(t.subtotal)}</span></div>
            {t.discount > 0 && <div className="between"><span>Discount</span><span>−{money(t.discount)}</span></div>}
            {t.service > 0 && <div className="between"><span>Service charge</span><span>{money(t.service)}</span></div>}
            <div className="between total"><span>Total</span><span>{money(t.total)}</span></div>
          </div>

          <div className="chips tight">
            {methods.map((m) => <button key={m} className={'chip' + (pay === m ? ' on' : '')} onClick={() => setPay(m)}>{m}</button>)}
          </div>

          {pay === 'Cash' && (
            <div className="stack gap">
              <label className="field"><span>Cash received (LKR)</span>
                <input className="num" inputMode="decimal" placeholder={String(t.total || 0)} value={cash} onChange={(e) => setCash(e.target.value.replace(/[^\d.]/g, ''))} />
              </label>
              <div className="chips tight">
                {[t.total, 1000, 2000, 5000].filter((v, i, a) => v > 0 && a.indexOf(v) === i).map((v) => (
                  <button key={v} className="chip sm" onClick={() => setCash(String(v))}>{v === t.total ? 'Exact' : v}</button>
                ))}
              </div>
              {change != null && (
                <div className={'change' + (change < 0 ? ' bad' : '')}>
                  {change < 0 ? `Still to pay: ${money(-change)}` : `Balance to give back: ${money(change)}`}
                </div>
              )}
            </div>
          )}

          <button className="btn primary lg" disabled={busy || !cart.length} onClick={save}>{busy ? 'Saving…' : `Complete bill · ${money(t.total)}`}</button>
          {!!cart.length && <button className="btn ghost" onClick={reset}>Clear bill</button>}
        </div>
      </aside>

      {pick && <ExtrasModal item={pick} addons={activeAddons} onClose={() => setPick(null)} onAdd={(chosen, qty) => { addLine(pick, chosen, qty); setPick(null) }} />}

      {done && (
        <Modal title={`Bill ${billNo(done.bill_no)} saved ✓`} onClose={() => setDone(null)}>
          <div className="sum">
            <div className="between total"><span>Total</span><span>{money(done.total)}</span></div>
            {done.payment_method === 'Cash' && done.change_given != null && <div className="between"><span>Balance to give back</span><b>{money(done.change_given)}</b></div>}
          </div>
          <div className="small muted">Order sent to the kitchen display.</div>
          <BillActions order={done} onPhoneSaved={(p) => setDone((d) => ({ ...d, customer_phone: p }))} />
          <div className="row end"><button className="btn ghost" onClick={() => setDone(null)}>Done — new bill</button></div>
        </Modal>
      )}
    </div>
  )
}

function ExtrasModal({ item, addons, onClose, onAdd }) {
  const [sel, setSel] = useState([])
  const [qty, setQty] = useState(1)
  const toggle = (a) => setSel((s) => (s.some((x) => x.id === a.id) ? s.filter((x) => x.id !== a.id) : [...s, a]))
  const each = item.price + sel.reduce((s, a) => s + a.price, 0)
  return (
    <Modal title={item.name} onClose={onClose}>
      <div className="muted small">Extras for this one (optional)</div>
      <div className="stack">
        {addons.map((a) => (
          <label key={a.id} className="check-row">
            <input type="checkbox" checked={sel.some((x) => x.id === a.id)} onChange={() => toggle(a)} />
            <span className="grow">{a.name}</span><span>{a.price ? '+ ' + money(a.price) : 'Free'}</span>
          </label>
        ))}
      </div>
      <div className="row between center">
        <div className="stepper lg">
          <button onClick={() => setQty((q) => Math.max(1, q - 1))}>−</button><span>{qty}</span><button onClick={() => setQty((q) => q + 1)}>+</button>
        </div>
        <button className="btn primary lg" onClick={() => onAdd(sel, qty)}>Add · {money(each * qty)}</button>
      </div>
    </Modal>
  )
}
