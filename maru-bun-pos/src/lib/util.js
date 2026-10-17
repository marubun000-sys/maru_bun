export const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100
export const money = (n) =>
  'Rs. ' + Number(n || 0).toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
export const billNo = (n) => '#' + String(n).padStart(4, '0')
export const dt = (s) =>
  new Date(s).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true })
export const tm = (s) => new Date(s).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: true })
export const startOfDay = (d = new Date()) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x }
export const dayKey = (s) => {
  const d = new Date(s)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
export const typeLabel = (t) => (t === 'takeaway' ? 'Takeaway' : 'Dine-in')

/** Sri Lankan numbers: 0771234567 / 771234567 / +94771234567 -> 94771234567 */
export function waNumber(p) {
  const raw = String(p || '').trim()
  let d = raw.replace(/\D/g, '')
  if (raw.startsWith('+')) return d
  if (d.startsWith('00')) return d.slice(2)
  if (d.startsWith('0')) return '94' + d.slice(1)
  if (d.length === 9) return '94' + d
  return d
}
export const validPhone = (p) => /^\d{10,15}$/.test(waNumber(p))

export function computeTotals({ lines, discType, discVal, svcOn, svcPct }) {
  const subtotal = r2(lines.reduce((s, l) => s + l.unit_price * l.qty, 0))
  const dv = Math.max(0, Number(discVal) || 0)
  const discount = r2(Math.min(subtotal, discType === 'pct' ? (subtotal * Math.min(dv, 100)) / 100 : dv))
  const afterDisc = subtotal - discount
  const service = svcOn ? r2((afterDisc * (Number(svcPct) || 0)) / 100) : 0
  return { subtotal, discount, service, total: r2(afterDisc + service) }
}

/** Bill text for WhatsApp. The Google review link is only added here (never on the printed bill). */
export function billText(order, settings) {
  const L = []
  const line = '------------------------------'
  L.push(`*${settings.shop_name}*`)
  if (settings.tagline) L.push(settings.tagline)
  if (settings.address) L.push(settings.address)
  if (settings.phone) L.push(`Tel: ${settings.phone}`)
  L.push(line)
  L.push(`Bill ${billNo(order.bill_no)}  |  ${typeLabel(order.order_type)}`)
  L.push(dt(order.created_at))
  if (order.customer_name) L.push(`Customer: ${order.customer_name}`)
  if (order.cashier) L.push(`Cashier: ${order.cashier}`)
  L.push(line)
  for (const it of order.order_items || []) {
    L.push(`${it.qty} x ${it.name} - ${money(it.line_total)}`)
    for (const a of it.addons || []) L.push(`    + ${a.name}${a.price ? ` (${money(a.price)})` : ''}`)
  }
  L.push(line)
  L.push(`Subtotal: ${money(order.subtotal)}`)
  if (Number(order.discount) > 0) L.push(`Discount: -${money(order.discount)}`)
  if (Number(order.service_charge) > 0) L.push(`Service charge: ${money(order.service_charge)}`)
  L.push(`*TOTAL: ${money(order.total)}*`)
  L.push(`Paid by: ${order.payment_method}`)
  if (order.payment_method === 'Cash' && order.cash_received != null)
    L.push(`Cash: ${money(order.cash_received)}  |  Change: ${money(order.change_given)}`)
  L.push(line)
  L.push(settings.thank_you || 'Thank you!')
  if (settings.review_url && settings.review_on_whatsapp) {
    L.push('')
    L.push('Enjoyed it? Rate us on Google:')
    L.push(settings.review_url)
  }
  return L.join('\n')
}

export const waLink = (phone, text) => `https://wa.me/${waNumber(phone)}?text=${encodeURIComponent(text)}`

let ctx
export function beep() {
  try {
    ctx = ctx || new (window.AudioContext || window.webkitAudioContext)()
    const play = (f, t) => {
      const o = ctx.createOscillator(); const g = ctx.createGain()
      o.frequency.value = f; o.connect(g); g.connect(ctx.destination)
      g.gain.setValueAtTime(0.25, ctx.currentTime + t); g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.35)
      o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 0.36)
    }
    play(880, 0); play(1175, 0.4); play(880, 0.8)
  } catch { /* sound is optional */ }
}
