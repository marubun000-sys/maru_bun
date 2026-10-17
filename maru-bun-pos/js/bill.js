import { esc, fmt, money, billNo, dtstr, normPhone, modal, ico, toast, $ } from './utils.js';
import { state } from './state.js';

const TYPE = { dine_in: 'Dine-in', takeaway: 'Takeaway' };
const PAY = { cash: 'Cash', card: 'Card', bank: 'Bank Transfer', qr: 'QR Pay' };
export const typeLabel = t => TYPE[t] || t;
export const payLabel = p => PAY[p] || p;

// ---------- customer bill (print + preview). NO review link here, on purpose ----------
export function billHTML(o, s = state.settings) {
  const items = (o.items || []).map(l => `
    <div class="r-item">
      <div class="r-line"><span>${l.qty} × ${esc(l.name)}</span><span>${fmt(l.unit * l.qty)}</span></div>
      ${(l.addons || []).map(a => `<div class="r-sub">+ ${esc(a.name)} (${fmt(a.price)})</div>`).join('')}
    </div>`).join('');
  const row = (a, b, cls = '') => `<div class="r-line ${cls}"><span>${a}</span><span>${b}</span></div>`;
  return `<div class="receipt">
    <div class="r-head">
      <div class="r-name">${esc(s.shop_name)}</div>
      ${s.tagline ? `<div class="r-tag">${esc(s.tagline)}</div>` : ''}
      ${s.address ? `<div>${esc(s.address)}</div>` : ''}
      ${s.phone ? `<div>Tel: ${esc(s.phone)}</div>` : ''}
    </div>
    <div class="r-hr"></div>
    <div class="r-meta">
      ${row('Bill No', `<b>${billNo(o.bill_no)}</b>`)}
      ${row('Date', dtstr(o.created_at))}
      ${row('Type', typeLabel(o.order_type))}
      ${o.table_no ? row('Table/Token', esc(o.table_no)) : ''}
      ${o.customer_name ? row('Customer', esc(o.customer_name)) : ''}
      ${o.cashier ? row('Cashier', esc(o.cashier)) : ''}
    </div>
    <div class="r-hr"></div>
    ${items}
    <div class="r-hr"></div>
    ${row('Subtotal', fmt(o.subtotal))}
    ${o.discount > 0 ? row(`Discount${o.discount_label ? ' (' + esc(o.discount_label) + ')' : ''}`, '- ' + fmt(o.discount)) : ''}
    ${o.service_charge > 0 ? row(`Service charge${o.service_pct ? ' (' + o.service_pct + '%)' : ''}`, fmt(o.service_charge)) : ''}
    <div class="r-hr bold"></div>
    ${row('TOTAL (LKR)', fmt(o.total), 'r-total')}
    <div class="r-hr"></div>
    ${row('Paid by', payLabel(o.payment_method))}
    ${o.payment_method === 'cash' && o.cash_received > 0 ? row('Cash received', fmt(o.cash_received)) + row('Change', fmt(o.change_given)) : ''}
    <div class="r-hr"></div>
    <div class="r-foot">${esc(s.bill_footer || '')}</div>
  </div>`;
}

// ---------- kitchen slip ----------
export function kotHTML(o) {
  const items = (o.items || []).map(l => `
    <div class="k-item"><b>${l.qty} × ${esc(l.name)}</b>
    ${(l.addons || []).map(a => `<div class="k-sub">+ ${esc(a.name)}</div>`).join('')}</div>`).join('');
  return `<div class="receipt kot">
    <div class="r-head"><div class="r-name">KITCHEN ORDER</div></div>
    <div class="r-hr bold"></div>
    <div class="r-line r-total"><span>${billNo(o.bill_no)}</span><span>${typeLabel(o.order_type).toUpperCase()}</span></div>
    ${o.table_no ? `<div class="r-line"><span>Table/Token</span><b>${esc(o.table_no)}</b></div>` : ''}
    ${o.customer_name ? `<div class="r-line"><span>Customer</span><span>${esc(o.customer_name)}</span></div>` : ''}
    <div class="r-line"><span>Time</span><span>${dtstr(o.created_at)}</span></div>
    <div class="r-hr bold"></div>
    ${items}
    ${o.note ? `<div class="r-hr"></div><div class="k-note">NOTE: ${esc(o.note)}</div>` : ''}
  </div>`;
}

// ---------- WhatsApp text (this one DOES contain the Google review link) ----------
export function billText(o, s = state.settings) {
  const L = [];
  L.push(`*${s.shop_name}*`);
  if (s.tagline) L.push(`_${s.tagline}_`);
  if (s.address) L.push(`📍 ${s.address}`);
  L.push('');
  L.push(`🧾 Bill: *${billNo(o.bill_no)}*`);
  L.push(`📅 ${dtstr(o.created_at)}`);
  L.push(`🍽️ ${typeLabel(o.order_type)}${o.table_no ? ' · ' + o.table_no : ''}`);
  if (o.customer_name) L.push(`👤 ${o.customer_name}`);
  L.push('--------------------------');
  (o.items || []).forEach(l => {
    L.push(`${l.qty} × ${l.name} — ${fmt(l.unit * l.qty)}`);
    (l.addons || []).forEach(a => L.push(`    + ${a.name} (${fmt(a.price)})`));
  });
  L.push('--------------------------');
  L.push(`Subtotal: ${fmt(o.subtotal)}`);
  if (o.discount > 0) L.push(`Discount${o.discount_label ? ' (' + o.discount_label + ')' : ''}: -${fmt(o.discount)}`);
  if (o.service_charge > 0) L.push(`Service charge${o.service_pct ? ' (' + o.service_pct + '%)' : ''}: ${fmt(o.service_charge)}`);
  L.push(`*TOTAL: LKR ${fmt(o.total)}*`);
  L.push(`Paid by: ${payLabel(o.payment_method)}`);
  if (o.payment_method === 'cash' && o.cash_received > 0) L.push(`Cash: ${fmt(o.cash_received)} · Change: ${fmt(o.change_given)}`);
  L.push('');
  if (s.review_link) { L.push('⭐ Enjoyed it? Rate us on Google:'); L.push(s.review_link); L.push(''); }
  L.push(s.bill_footer || 'Thank you!');
  return L.join('\n');
}

export function sendWhatsApp(o, phone, s = state.settings) {
  const p = normPhone(phone);
  const url = (p ? `https://wa.me/${p}` : 'https://wa.me/') + '?text=' + encodeURIComponent(billText(o, s));
  window.open(url, '_blank', 'noopener');
}

// ---------- printing ----------
export function printHTML(html) {
  const pa = document.getElementById('print-area');
  pa.innerHTML = html;
  const clear = () => { pa.innerHTML = ''; window.removeEventListener('afterprint', clear); };
  window.addEventListener('afterprint', clear);
  setTimeout(() => window.print(), 80);
}

// ---------- bill popup (used after placing an order and from Orders & Billing) ----------
export function showBillModal(o, { title, onClose } = {}) {
  const m = modal(`
    <h3>${esc(title || 'Bill ' + billNo(o.bill_no))}</h3>
    <div class="bill-preview">${billHTML(o)}</div>
    <label>Customer WhatsApp number
      <input id="waNum" inputmode="tel" value="${esc(o.customer_phone || '')}" placeholder="07XXXXXXXX">
    </label>
    <div class="row wrap">
      <button class="btn wa" id="bWa">${ico('whatsapp')} Send on WhatsApp</button>
      <button class="btn" id="bPrint">${ico('print')} Print Bill</button>
      <button class="btn ghost" id="bKot">${ico('print')} Kitchen Slip</button>
    </div>
    <p class="muted small">WhatsApp bill includes your Google review link. The printed bill does not.</p>`,
    { onClose });
  $('#bWa', m.el).onclick = () => {
    const phone = $('#waNum', m.el).value;
    if (!phone.trim()) toast('No number entered - choose the contact inside WhatsApp', 'info');
    sendWhatsApp(o, phone);
  };
  $('#bPrint', m.el).onclick = () => printHTML(billHTML(o));
  $('#bKot', m.el).onclick = () => printHTML(kotHTML(o));
  return m;
}

export { money };
