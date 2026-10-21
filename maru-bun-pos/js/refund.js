// Orders & Billing: change an order's type / payment, and refund items
import { sb } from './sb.js';
import { state, getCashier } from './state.js';
import { esc, fmt, money, num, r2, toast, modal, ico, errMsg, lineRows, useDeltas } from './utils.js';
import { payLabel, typeLabel } from './bill.js';
import { isAdminDevice, verifyAdmin } from './device.js';

const log = (o, key = 'edits') => (Array.isArray(o[key]) ? o[key] : []);

// ---------- admin check (refunds only): admin device = free, other devices must type admin email + password ----------
function askAdmin() {
  return new Promise(res => {
    if (isAdminDevice()) return res(true);
    let ok = false;
    const m = modal(`<h3>${ico('shield')} Admin approval needed</h3>
      <p class="muted small">Refunds on this device need the admin's email and password.</p><div id="aae"></div>
      <form id="aaf"><label>Admin email<input type="email" id="aa1" required autocomplete="off"></label>
      <label>Admin password<input type="password" id="aa2" required autocomplete="off"></label>
      <div class="row end"><button type="button" class="btn ghost" data-c>Cancel</button><button class="btn">Confirm</button></div></form>`, { onClose: () => res(ok) });
    m.el.querySelector('[data-c]').onclick = () => m.close();
    m.el.querySelector('#aaf').onsubmit = async e => {
      e.preventDefault();
      if (await verifyAdmin(m.el.querySelector('#aa1').value, m.el.querySelector('#aa2').value)) { ok = true; m.close(); }
      else { m.el.querySelector('#aae').innerHTML = '<div class="err">Wrong admin email or password</div>'; m.el.querySelector('#aa2').value = ''; }
    };
  });
}

// ---------- change type / table / payment ----------
export function openEdit(o, done) {
  const methods = [...new Set([...(state.settings.payment_methods || []), o.payment_method, 'cash'])];
  const m = modal(`<h3>Change bill ${esc('MB-' + String(o.bill_no).padStart(5, '0'))}</h3>
    <form id="ef">
      <label>Type<select id="eType"><option value="dine_in" ${o.order_type === 'dine_in' ? 'selected' : ''}>Dine-in</option><option value="takeaway" ${o.order_type === 'takeaway' ? 'selected' : ''}>Takeaway</option></select></label>
      <label>Table no. (optional)<input id="eTable" value="${esc(o.table_no || '')}"></label>
      <label>Payment method<select id="ePay">${methods.map(p => `<option value="${p}" ${p === o.payment_method ? 'selected' : ''}>${esc(payLabel(p))}</option>`).join('')}</select></label>
      <p class="muted small">The change is saved on the bill and recorded (who changed it and when).</p>
      <div class="row end"><button type="button" class="btn ghost" data-c>Cancel</button><button class="btn">Save</button></div></form>`);
  m.el.querySelector('[data-c]').onclick = () => m.close();
  m.el.querySelector('#ef').onsubmit = async e => {
    e.preventDefault();
    const type = m.el.querySelector('#eType').value, table = m.el.querySelector('#eTable').value.trim(), pay = m.el.querySelector('#ePay').value;
    const ch = [];
    if (type !== o.order_type) ch.push(`Type: ${typeLabel(o.order_type)} → ${typeLabel(type)}`);
    if (table !== (o.table_no || '')) ch.push(`Table: ${o.table_no || '-'} → ${table || '-'}`);
    if (pay !== o.payment_method) ch.push(`Payment: ${payLabel(o.payment_method)} → ${payLabel(pay)}`);
    if (!ch.length) return m.close();
    const patch = { order_type: type, table_no: table, payment_method: pay, edits: [...log(o), { at: new Date().toISOString(), by: getCashier(), text: ch.join('; ') }] };
    if (pay !== 'cash') { patch.cash_received = 0; patch.change_given = 0; }
    const { error } = await sb.from('orders').update(patch).eq('id', o.id);
    if (error) return toast(errMsg(error) + ' (run sql/update-7.sql)', 'err', 7000);
    toast('Bill updated'); m.close(); done(o.id);
  };
}

// ---------- refund ----------
export function refundRows(o) {
  const ratio = num(o.subtotal) > 0 ? num(o.total) / num(o.subtotal) : 1;   // share of discount / service charge
  const rows = [];
  (o.items || []).forEach((l, i) => {
    const r = lineRows(l);
    rows.push({ key: `i${i}`, name: r.name, qty: r.qty, ur: r2(r.unit * ratio), item_id: l.item_id });
    r.extras.forEach((e, j) => rows.push({ key: `i${i}x${j}`, name: '+ ' + e.name, qty: e.qty, ur: r2(e.unit * ratio) }));
  });
  const done = {};
  log(o, 'refunds').forEach(rf => (rf.items || []).forEach(it => { done[it.key] = (done[it.key] || 0) + num(it.qty); }));
  rows.forEach(r => { r.left = Math.max(0, r.qty - (done[r.key] || 0)); });
  return rows;
}
export function refundAmount(o, rows, sel) {
  const any = rows.some(r => (sel[r.key] || 0) > 0);
  if (!any) return 0;
  const room = r2(num(o.total) - num(o.refund_total));
  const remaining = rows.reduce((n, r) => n + r.left - (sel[r.key] || 0), 0);
  const raw = r2(rows.reduce((n, r) => n + (sel[r.key] || 0) * r.ur, 0));
  return remaining === 0 ? room : Math.min(raw, room);          // refunding everything left = exactly what is left (no rounding drift)
}

export function openRefund(o, done) {
  const rows = refundRows(o), sel = {};
  const room = r2(num(o.total) - num(o.refund_total));
  const bn = 'MB-' + String(o.bill_no).padStart(5, '0');
  if (room <= 0 || rows.every(r => r.left === 0)) { toast('This bill is already fully refunded', 'info'); return done(o.id); }
  const m = modal(`<h3>↩ Refund · ${esc(bn)}</h3>
    ${num(o.refund_total) > 0 ? `<div class="pill warn" style="margin-bottom:8px">Already refunded ${money(o.refund_total)}</div>` : ''}
    <div class="tbl-wrap"><table><thead><tr><th>Item</th><th class="r">Each</th><th>Refund qty</th><th class="r">Amount</th></tr></thead><tbody>
    ${rows.map(r => `<tr><td>${esc(r.name)}<div class="muted small">${r.left} of ${r.qty} left to refund</div></td><td class="r">${fmt(r.ur)}</td>
      <td>${r.left ? `<span class="qty" style="margin:0"><button type="button" data-rk="${r.key}" data-d="-1" aria-label="less">${ico('minus', 14)}</button><b id="q-${r.key}">0</b><button type="button" data-rk="${r.key}" data-d="1" aria-label="more">${ico('plus', 14)}</button></span>` : '<span class="muted small">done</span>'}</td>
      <td class="r" id="a-${r.key}">0.00</td></tr>`).join('')}
    </tbody></table></div>
    <div class="row wrap" style="margin:8px 0"><button type="button" class="btn ghost sm" id="rAll">Refund everything left</button><button type="button" class="btn ghost sm" id="rNone">Clear</button></div>
    <label>Reason (optional)<input id="rWhy" placeholder="e.g. customer returned, wrong item"></label>
    <label class="check"><input type="checkbox" id="rStock" checked> Put the refunded items back in stock</label>
    <div class="totals"><div class="grand"><span>Refund</span><span id="rTot">LKR 0.00</span></div></div>
    <div class="row end"><button type="button" class="btn ghost" data-c>Cancel</button><button class="btn danger" id="rGo" disabled>Refund</button></div>`, { wide: true });
  const el = s => m.el.querySelector(s);
  const paint = () => {
    rows.forEach(r => { const q = el('#q-' + r.key); if (q) { q.textContent = sel[r.key] || 0; el('#a-' + r.key).textContent = fmt((sel[r.key] || 0) * r.ur); } });
    const amt = refundAmount(o, rows, sel);
    el('#rTot').textContent = money(amt); el('#rGo').disabled = amt <= 0; el('#rGo').textContent = amt > 0 ? `Refund ${money(amt)}` : 'Refund';
  };
  m.el.addEventListener('click', e => {
    const b = e.target.closest('[data-rk]'); if (!b) return;
    const r = rows.find(x => x.key === b.dataset.rk);
    sel[r.key] = Math.min(r.left, Math.max(0, (sel[r.key] || 0) + Number(b.dataset.d))); paint();
  });
  el('#rAll').onclick = () => { rows.forEach(r => { sel[r.key] = r.left; }); paint(); };
  el('#rNone').onclick = () => { rows.forEach(r => { sel[r.key] = 0; }); paint(); };
  el('[data-c]').onclick = () => m.close();
  el('#rGo').onclick = async () => {
    const amount = refundAmount(o, rows, sel); if (amount <= 0) return;
    el('#rGo').disabled = true;
    if (!await askAdmin()) { el('#rGo').disabled = false; return toast('Admin approval is needed for refunds', 'err'); }
    const { data: cur } = await sb.from('orders').select('*').eq('id', o.id).maybeSingle();   // make sure nobody refunded meanwhile
    if (!cur || num(cur.refund_total) !== num(o.refund_total)) { m.close(); toast('This bill was changed on another device - please open it again', 'err', 6000); return done(o.id); }
    const restock = el('#rStock').checked;
    const entry = { at: new Date().toISOString(), by: getCashier(), amount, reason: el('#rWhy').value.trim(), restock,
      items: rows.filter(r => (sel[r.key] || 0) > 0).map(r => ({ key: r.key, name: r.name, qty: sel[r.key], amount: r2(sel[r.key] * r.ur) })) };
    const { error } = await sb.from('orders').update({ refund_total: r2(num(cur.refund_total) + amount), refunds: [...log(cur, 'refunds'), entry] }).eq('id', o.id);
    if (error) { el('#rGo').disabled = false; return toast(errMsg(error) + ' (run sql/update-7.sql)', 'err', 7000); }
    if (restock) await Promise.all(rows.filter(r => r.item_id && (sel[r.key] || 0) > 0).map(r => sb.rpc('adjust_stock', { p_item: r.item_id, p_delta: sel[r.key] })));
    if (restock) {                                    // ingredients of the refunded items go back into the inventory too
      try {
        const ch = useDeltas(rows.filter(r => /^i\d+$/.test(r.key) && (sel[r.key] || 0) > 0).map(r => ({ use: ((cur.items || [])[Number(r.key.slice(1))] || {}).use, times: sel[r.key] })), 1);
        if (ch.length) await sb.rpc('adjust_inventory_bulk', { p_changes: ch });
      } catch (e) { console.warn('ingredients not put back', e); }
    }
    toast(`Refunded ${money(amount)}`); m.close(); window.dispatchEvent(new Event('orders-changed')); done(o.id);
  };
  paint();
}
