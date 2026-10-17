import { esc, fmt, money, billNo, dtstr, normPhone, modal, ico, toast, $, lineRows } from './utils.js';
import { state } from './state.js';
import { SOFTWARE_NAME, SOFTWARE_SITE } from './brand.js';

const TYPE = { dine_in: 'Dine-in', takeaway: 'Takeaway' };
const PAY = { cash: 'Cash', card: 'Card', bank: 'Bank Transfer', qr: 'QR Pay' };
export const typeLabel = t => TYPE[t] || t;
export const payLabel = p => PAY[p] || p;
const LOGO_PRINT = 'assets/logo-print.png';   // black & white, prints well on thermal paper
const LOGO_COLOR = 'assets/logo-small.jpg';
const siteText = () => String(SOFTWARE_SITE || '').replace(/^https?:\/\//i, '').replace(/\/$/, '');

// ---------- customer bill (print + preview). NO review link here, on purpose ----------
export function billHTML(o, s = state.settings) {
  const items = (o.items || []).map(l => { const r = lineRows(l); return `
    <div class="r-item">
      <div class="r-iname">${esc(r.name)}</div>
      <div class="r-line"><span>${r.qty} × ${fmt(r.unit)}</span><span>${fmt(r.total)}</span></div>
      ${r.extras.map(e => `<div class="r-sub">+ ${esc(e.name)}</div><div class="r-line r-sub2"><span>${e.qty} × ${fmt(e.unit)}</span><span>${fmt(e.total)}</span></div>`).join('')}
    </div>`; }).join('');
  const row = (a, b, cls = '') => `<div class="r-line ${cls}"><span>${a}</span><span>${b}</span></div>`;
  const soft = (SOFTWARE_NAME || SOFTWARE_SITE) ? `<div class="r-soft">${SOFTWARE_NAME ? 'Software by ' + esc(SOFTWARE_NAME) : ''}${SOFTWARE_NAME && SOFTWARE_SITE ? '<br>' : ''}${esc(siteText())}</div>` : '';
  return `<div class="receipt">
    <div class="r-head">
      <img class="r-logo" src="${LOGO_PRINT}" alt="">
      <div class="r-name">${esc(s.shop_name)}</div>
      ${s.tagline ? `<div class="r-tag">${esc(s.tagline)}</div>` : ''}
      ${s.address ? `<div>${esc(s.address)}</div>` : ''}
      ${s.phone ? `<div>Tel: ${esc(s.phone)}</div>` : ''}
    </div>
    <div class="r-hr"></div>
    ${o.token_no ? `<div class="r-token">TOKEN NO: ${o.token_no}</div>` : ''}
    <div class="r-meta">
      ${row('Bill No', `<b>${billNo(o.bill_no)}</b>`)}
      ${row('Date', dtstr(o.created_at))}
      ${row('Type', typeLabel(o.order_type))}
      ${o.table_no ? row('Table', esc(o.table_no)) : ''}
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
    ${soft}
  </div>`;
}

// ---------- kitchen slip ----------
export function kotHTML(o) {
  const items = (o.items || []).map(l => { const r = lineRows(l); return `
    <div class="k-item"><b>${r.qty} × ${esc(r.name)}</b>
    ${r.extras.map(e => `<div class="k-sub">+ ${e.qty} × ${esc(e.name)}</div>`).join('')}</div>`; }).join('');
  return `<div class="receipt kot">
    <div class="r-head"><div class="r-name">KITCHEN ORDER</div></div>
    <div class="r-hr bold"></div>
    ${o.token_no ? `<div class="r-token">TOKEN NO: ${o.token_no}</div>` : ''}
    <div class="r-line r-total"><span>${billNo(o.bill_no)}</span><span>${typeLabel(o.order_type).toUpperCase()}</span></div>
    ${o.table_no ? `<div class="r-line"><span>Table</span><b>${esc(o.table_no)}</b></div>` : ''}
    ${o.customer_name ? `<div class="r-line"><span>Customer</span><span>${esc(o.customer_name)}</span></div>` : ''}
    <div class="r-line"><span>Time</span><span>${dtstr(o.created_at)}</span></div>
    <div class="r-hr bold"></div>
    ${items}
    ${o.note ? `<div class="r-hr"></div><div class="k-note">NOTE: ${esc(o.note)}</div>` : ''}
  </div>`;
}

// ---------- WhatsApp text (this one DOES contain the Google review link + software link) ----------
export function billText(o, s = state.settings) {
  const L = [];
  L.push(`*${s.shop_name}*`);
  if (s.tagline) L.push(`_${s.tagline}_`);
  if (s.address) L.push(`📍 ${s.address}`);
  L.push('');
  L.push(`🧾 Bill: *${billNo(o.bill_no)}*`);
  L.push(`📅 ${dtstr(o.created_at)}`);
  if (o.token_no) L.push(`🎫 Token No: *${o.token_no}*`);
  L.push(`🍽️ ${typeLabel(o.order_type)}${o.table_no ? ' · Table ' + o.table_no : ''}`);
  if (o.customer_name) L.push(`👤 ${o.customer_name}`);
  L.push('--------------------------');
  (o.items || []).forEach(l => {
    const r = lineRows(l);
    L.push(`${r.name}`);
    L.push(`   ${r.qty} × ${fmt(r.unit)} = ${fmt(r.total)}`);
    r.extras.forEach(e => L.push(`   + ${e.name}: ${e.qty} × ${fmt(e.unit)} = ${fmt(e.total)}`));
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
  if (SOFTWARE_NAME || SOFTWARE_SITE) L.push('');
  if (SOFTWARE_NAME) L.push(`_Software by ${SOFTWARE_NAME}_`);
  if (SOFTWARE_SITE) L.push(SOFTWARE_SITE);
  return L.join('\n');
}

// opens WhatsApp chat with this number + the bill typed (text can't carry the logo - see sendBillImage)
export function sendWhatsApp(o, phone, s = state.settings) {
  const p = normPhone(phone);
  const url = (p ? `https://wa.me/${p}` : 'https://wa.me/') + '?text=' + encodeURIComponent(billText(o, s));
  window.open(url, '_blank', 'noopener');
}

// ---------- bill as a PNG picture WITH the logo (drawn on a canvas) ----------
const loadImg = src => new Promise(res => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
export async function billImage(o, s = state.settings, { review = true } = {}) {
  try { await Promise.all([document.fonts.load('700 30px "Noto Sans Sinhala"'), document.fonts.load('600 22px Poppins'), document.fonts.load('400 22px Poppins')]); } catch { /* fonts optional */ }
  const logo = await loadImg(LOGO_COLOR);
  const W = 600, P = 28, FAM = 'Poppins, "Noto Sans Sinhala", sans-serif';
  const c = document.createElement('canvas'), ctx = c.getContext('2d');
  const wrap = (t, font, maxW) => { ctx.font = font; const out = []; let cur = ''; String(t).split(' ').forEach(w => { const test = cur ? cur + ' ' + w : w; if (ctx.measureText(test).width > maxW && cur) { out.push(cur); cur = w; } else cur = test; }); if (cur) out.push(cur); return out; };
  const ops = [];
  const add = (type, a = {}) => ops.push({ type, ...a });
  add('logo');
  add('center', { t: s.shop_name, f: `700 34px ${FAM}`, h: 44 });
  if (s.tagline) add('center', { t: s.tagline, f: `italic 400 18px ${FAM}`, h: 26 });
  wrap(s.address || '', `400 17px ${FAM}`, W - 2 * P).forEach(t => add('center', { t, f: `400 17px ${FAM}`, h: 24 }));
  if (s.phone) add('center', { t: 'Tel: ' + s.phone, f: `400 17px ${FAM}`, h: 24 });
  add('hr');
  const pair = (l, r, b = false, big = false, indent = 0) => add('pair', { l, r, f: `${b ? 600 : 400} ${big ? 28 : 20}px ${FAM}`, h: big ? 40 : 28, indent });
  if (o.token_no) add('center', { t: 'TOKEN NO: ' + o.token_no, f: `700 34px ${FAM}`, h: 52 });
  pair('Bill No', billNo(o.bill_no), true); pair('Date', dtstr(o.created_at)); pair('Type', typeLabel(o.order_type));
  if (o.table_no) pair('Table', o.table_no);
  if (o.customer_name) pair('Customer', o.customer_name);
  if (o.cashier) pair('Cashier', o.cashier);
  add('hr');
  (o.items || []).forEach(l => {
    const r = lineRows(l);
    add('left', { t: r.name, f: `600 21px ${FAM}`, h: 30 });
    pair(`${r.qty} × ${fmt(r.unit)}`, fmt(r.total), false, false, 22);
    r.extras.forEach(e => { add('sub', { t: `+ ${e.name}`, f: `400 17px ${FAM}`, h: 24 }); pair(`${e.qty} × ${fmt(e.unit)}`, fmt(e.total), false, false, 44); });
  });
  add('hr');
  pair('Subtotal', fmt(o.subtotal));
  if (o.discount > 0) pair('Discount' + (o.discount_label ? ` (${o.discount_label})` : ''), '- ' + fmt(o.discount));
  if (o.service_charge > 0) pair('Service charge' + (o.service_pct ? ` (${o.service_pct}%)` : ''), fmt(o.service_charge));
  add('hr', { bold: true });
  pair('TOTAL (LKR)', fmt(o.total), true, true);
  add('hr');
  pair('Paid by', payLabel(o.payment_method));
  if (o.payment_method === 'cash' && o.cash_received > 0) { pair('Cash received', fmt(o.cash_received)); pair('Change', fmt(o.change_given)); }
  add('hr');
  if (review && s.review_link) { add('center', { t: '⭐ Enjoyed it? Rate us on Google:', f: `600 18px ${FAM}`, h: 28 }); wrap(s.review_link, `400 15px ${FAM}`, W - 2 * P).forEach(t => add('center', { t, f: `400 15px ${FAM}`, h: 22, link: true })); }
  add('center', { t: s.bill_footer || 'Thank you!', f: `600 19px ${FAM}`, h: 34 });
  if (SOFTWARE_NAME) add('center', { t: 'Software by ' + SOFTWARE_NAME, f: `400 14px ${FAM}`, h: 20, muted: true });
  if (SOFTWARE_SITE) add('center', { t: siteText(), f: `400 14px ${FAM}`, h: 20, muted: true });

  const LOGO = 150;
  const H = P * 2 + ops.reduce((n, op) => n + (op.type === 'logo' ? (logo ? LOGO + 12 : 0) : op.type === 'hr' ? 16 : op.h), 0);
  c.width = W; c.height = H;
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H); ctx.textBaseline = 'middle';
  let y = P;
  for (const op of ops) {
    if (op.type === 'logo') { if (logo) { ctx.drawImage(logo, (W - LOGO) / 2, y, LOGO, LOGO); y += LOGO + 12; } continue; }
    if (op.type === 'hr') { y += 8; ctx.strokeStyle = '#000'; ctx.lineWidth = op.bold ? 3 : 1; ctx.setLineDash(op.bold ? [] : [5, 4]); ctx.beginPath(); ctx.moveTo(P, y); ctx.lineTo(W - P, y); ctx.stroke(); y += 8; continue; }
    ctx.font = op.f; ctx.fillStyle = op.muted ? '#555' : op.link ? '#0a58ca' : '#000';
    if (op.type === 'center') { ctx.textAlign = 'center'; ctx.fillText(op.t, W / 2, y + op.h / 2); }
    else if (op.type === 'left') { ctx.textAlign = 'left'; ctx.fillText(op.t, P, y + op.h / 2); }
    else if (op.type === 'sub') { ctx.textAlign = 'left'; ctx.fillStyle = '#333'; ctx.fillText(op.t, P + 22, y + op.h / 2); }
    else { ctx.textAlign = 'left'; ctx.fillText(op.l, P + (op.indent || 0), y + op.h / 2); ctx.textAlign = 'right'; ctx.fillText(op.r, W - P, y + op.h / 2); }
    y += op.h;
  }
  return new Promise(res => c.toBlob(res, 'image/png'));
}

// Phones: opens the share sheet with the bill picture (+text) -> pick WhatsApp -> pick the customer.
// Computers: saves the picture and opens the customer's WhatsApp chat so it can be attached.
export async function sendBillImage(o, phone, s = state.settings) {
  const blob = await billImage(o, s);
  if (!blob) return toast('Could not create the bill image', 'err');
  const file = new File([blob], `${billNo(o.bill_no)}.png`, { type: 'image/png' });
  const data = { files: [file], text: billText(o, s) };
  if (navigator.canShare && navigator.canShare(data)) {
    try { await navigator.share(data); return; } catch (e) { if (e && e.name === 'AbortError') return; }
  }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = file.name; document.body.appendChild(a); a.click(); a.remove();
  toast('Bill picture saved - attach it in the WhatsApp chat that just opened', 'info', 7000);
  sendWhatsApp(o, phone, s);
}

// ---------- printing (waits for the logo, supports several slips in one job) ----------
export async function printHTML(...htmls) {
  await loadImg(LOGO_PRINT);
  const pa = document.getElementById('print-area');
  pa.innerHTML = htmls.join('<div class="pb"></div>');
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
      <button class="btn" id="bPrint">${ico('print')} Print Bill</button>
      <button class="btn wa" id="bWaImg">${ico('whatsapp')} WhatsApp (with logo picture)</button>
      <button class="btn wa" id="bWa">${ico('whatsapp')} WhatsApp (text)</button>
      <button class="btn ghost" id="bKot">${ico('print')} Kitchen Slip</button>
    </div>
    <p class="muted small">WhatsApp bills include your Google review link${SOFTWARE_NAME || SOFTWARE_SITE ? ' and the software company line' : ''}. The printed bill does not show the review link. The <b>picture</b> version carries the logo (on a phone choose WhatsApp in the share list; on a computer the picture is saved and the chat opens).</p>`,
    { onClose, wide: true });
  const phone = () => $('#waNum', m.el).value;
  $('#bWa', m.el).onclick = () => { if (!phone().trim()) toast('No number entered - choose the contact inside WhatsApp', 'info'); sendWhatsApp(o, phone()); };
  $('#bWaImg', m.el).onclick = () => sendBillImage(o, phone());
  $('#bPrint', m.el).onclick = () => printHTML(billHTML(o));
  $('#bKot', m.el).onclick = () => printHTML(kotHTML(o));
  return m;
}

export { money };
