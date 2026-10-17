import { useState } from 'react'
import { supabase } from './lib/supabase'
import { useData, useUI } from './ctx'
import { billNo, billText, dt, money, tm, typeLabel, validPhone, waLink } from './lib/util'

export function Modal({ title, onClose, children, wide }) {
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className={'modal' + (wide ? ' wide' : '')} role="dialog" aria-label={title}>
        <div className="modal-head">
          <h3>{title}</h3>
          {onClose && <button className="x" onClick={onClose} aria-label="Close">×</button>}
        </div>
        {children}
      </div>
    </div>
  )
}

export function Confirm({ title, message, okText = 'OK', onOk, onCancel }) {
  return (
    <Modal title={title} onClose={onCancel}>
      <p className="muted">{message}</p>
      <div className="row end gap">
        <button className="btn ghost" onClick={onCancel}>Cancel</button>
        <button className="btn primary" onClick={onOk}>{okText}</button>
      </div>
    </Modal>
  )
}

/** Thermal-printer receipt (80mm). type 'bill' = customer bill (NO review link), 'kot' = kitchen ticket. */
export function Receipt({ job }) {
  if (!job) return null
  const { type, order, settings: s } = job
  const items = order.order_items || []
  if (type === 'kot') {
    return (
      <div className="receipt">
        <h2 className="c">KITCHEN ORDER</h2>
        <div className="c big">{billNo(order.bill_no)} — {typeLabel(order.order_type).toUpperCase()}</div>
        <div className="c small">{dt(order.created_at)}</div>
        <hr />
        {items.map((it, i) => (
          <div key={i} className="kot-line">
            <b>{it.qty} x {it.name}</b>
            {(it.addons || []).map((a, j) => <div key={j} className="small">&nbsp;&nbsp;+ {a.name}</div>)}
          </div>
        ))}
        {order.note && <><hr /><div>Note: {order.note}</div></>}
      </div>
    )
  }
  return (
    <div className="receipt">
      <h2 className="c">{s.shop_name}</h2>
      {s.tagline && <div className="c small">{s.tagline}</div>}
      {s.address && <div className="c small">{s.address}</div>}
      {s.phone && <div className="c small">Tel: {s.phone}</div>}
      <hr />
      <div className="between"><span>Bill {billNo(order.bill_no)}</span><span>{typeLabel(order.order_type)}</span></div>
      <div className="small">{dt(order.created_at)}</div>
      {order.customer_name && <div className="small">Customer: {order.customer_name}</div>}
      {order.cashier && <div className="small">Cashier: {order.cashier}</div>}
      <hr />
      {items.map((it, i) => (
        <div key={i}>
          <div className="between"><span>{it.qty} x {it.name}</span><span>{money(it.line_total)}</span></div>
          {(it.addons || []).map((a, j) => <div key={j} className="small">&nbsp;&nbsp;+ {a.name}{a.price ? ` (${money(a.price)})` : ''}</div>)}
        </div>
      ))}
      <hr />
      <div className="between"><span>Subtotal</span><span>{money(order.subtotal)}</span></div>
      {Number(order.discount) > 0 && <div className="between"><span>Discount</span><span>-{money(order.discount)}</span></div>}
      {Number(order.service_charge) > 0 && <div className="between"><span>Service charge</span><span>{money(order.service_charge)}</span></div>}
      <div className="between big"><b>TOTAL</b><b>{money(order.total)}</b></div>
      <div className="between"><span>Paid by</span><span>{order.payment_method}</span></div>
      {order.payment_method === 'Cash' && order.cash_received != null && (
        <>
          <div className="between"><span>Cash received</span><span>{money(order.cash_received)}</span></div>
          <div className="between"><span>Change</span><span>{money(order.change_given)}</span></div>
        </>
      )}
      <hr />
      <div className="c">{s.receipt_footer}</div>
    </div>
  )
}

/** Print + WhatsApp buttons for one saved bill. */
export function BillActions({ order, onPhoneSaved }) {
  const { settings } = useData()
  const { print, toast } = useUI()
  const [phone, setPhone] = useState(order.customer_phone || '')
  const ok = validPhone(phone)

  const sendWA = async () => {
    if (!ok) return toast('Enter a valid WhatsApp number first', 'err')
    if (phone !== order.customer_phone) {
      await supabase.from('orders').update({ customer_phone: phone }).eq('id', order.id)
      onPhoneSaved?.(phone)
    }
    const text = billText({ ...order, customer_phone: phone }, settings)
    window.open(waLink(phone, text), '_blank', 'noopener')
  }

  return (
    <div className="stack gap">
      <label className="field">
        <span>Customer WhatsApp number</span>
        <input inputMode="tel" placeholder="07X XXX XXXX" value={phone} onChange={(e) => setPhone(e.target.value)} />
      </label>
      <div className="row gap wrap">
        <button className="btn wa" onClick={sendWA} disabled={!ok}>Send on WhatsApp</button>
        <button className="btn primary" onClick={() => print({ type: 'bill', order: { ...order, customer_phone: phone }, settings })}>Print bill</button>
      </div>
      <div className="small muted">Printed bill has no review link. The WhatsApp bill includes your Google review link (set it in the Google Review tab).</div>
    </div>
  )
}

export function Badge({ kind, children }) {
  return <span className={'badge ' + (kind || '')}>{children}</span>
}

export { tm }
