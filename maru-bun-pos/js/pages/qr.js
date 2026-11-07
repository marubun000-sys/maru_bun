// POS page "QR Ordering": orders sent by customers from the QR code.
//   new  -> staff press Confirm (becomes a real order in the kitchen)  ->  customer comes with the code -> "Collect & make bill" (discount, payment, print / WhatsApp)
import { sb } from '../sb.js';
import { state, getCashier } from '../state.js';
import { $, $$, esc, fmt, money, num, r2, toast, modal, ico, errMsg, onLive, confirmBox, promptModal, tstr, billNo, lineTotal, normPhone, itemCost, invMapOf, recipeUse, useDeltas } from '../utils.js';
import { showBillModal, typeLabel, payLabel } from '../bill.js';
import { openEdit, openRefund } from '../refund.js';
import { qrSvg } from '../vendor/qrcode.js';
import { qrPush } from '../push.js';

export const orderUrl = () => new URL('order.html', location.href).href;

export async function render(root) {
  let rows = [], notices = [], linked = {}, q = '', open = state.settings.qr_open !== false, showQr = false;

  async function load() {
    const since = new Date(Date.now() - 3 * 864e5).toISOString();
    const r = await sb.from('qr_orders').select('*').gte('created_at', since).order('created_at', { ascending: true });
    if (r.error) { root.innerHTML = `<div class="err">${esc(errMsg(r.error))}<br><small>Run sql/update-10.sql in the Supabase SQL Editor first.</small></div>`; return; }
    rows = r.data || [];
    { const nr = await sb.from('qr_notices').select('*').eq('active', true).order('created_at', { ascending: false }).limit(20); notices = nr.error ? [] : (nr.data || []).filter(n => !n.expires_at || n.expires_at > new Date().toISOString()); }
    const ids = rows.filter(x => x.order_id).map(x => x.order_id);
    linked = {};
    if (ids.length) { const o = await sb.from('orders').select('*').in('id', ids); (o.data || []).forEach(x => { linked[x.id] = x; }); }
    draw();
  }
  const wrap = fn => async (...a) => { try { await fn(...a); } catch (e) { console.error(e); toast(errMsg(e), 'err', 6000); } finally { load(); } };

  const match = x => { const s = q.trim().toLowerCase(); return !s || x.code.toLowerCase() === s || x.customer_name.toLowerCase().includes(s) || x.customer_phone.includes(s.replace(/\D/g, '') || '#none'); };
  const today = new Date(Date.now() + 19800000).toISOString().slice(0, 10);
  const sub = x => (x.items || []).reduce((n, l) => n + lineTotal(l), 0);

  function card(x) {
    const o = linked[x.order_id];
    const lines = (x.items || []).map(l => `<div><b>${l.qty} ×</b> ${esc(l.name)}${(l.addons || []).map(a => `<div class="muted small">+ ${a.qty} × ${esc(a.name)}</div>`).join('')}</div>`).join('');
    const kitchen = o ? (o.status === 'served' ? '<span class="pill ok">Kitchen: ready</span>' : '<span class="pill warn">In kitchen</span>') : '';
    return `<div class="qcard ${x.status}" data-id="${x.id}">
      <div class="row wrap" style="gap:8px"><span class="qo-code" data-noi18n>${esc(x.code)}</span><span class="pill ${x.order_type === 'takeaway' ? 'info' : 'warn'}">${typeLabel(x.order_type)}${x.table_no ? ' · Table ' + esc(x.table_no) : ''}</span>${kitchen}
        <div class="spacer"></div><span class="muted small">${tstr(x.created_at)}</span></div>
      <div class="small" style="margin:4px 0"><b data-noi18n>${esc(x.customer_name)}</b> · <a href="tel:${esc(x.customer_phone)}" class="muted" data-noi18n>${esc(x.customer_phone)}</a>${o ? ` · Bill <b data-noi18n>${billNo(o.bill_no)}</b>${o.token_no ? ` · Token <b data-noi18n>#${o.token_no}</b>` : ''}` : ''}</div>
      <div class="qlines">${lines}</div>${x.note ? `<div class="knote">Note: ${esc(x.note)}</div>` : ''}
      <div class="row wrap" style="margin-top:8px"><b>${money(o ? o.total : sub(x))}</b><div class="spacer"></div>
        ${x.status === 'new' ? `<button class="btn ghost" data-a="reject">Reject</button><button class="btn" data-a="confirm">${ico('check', 16)} Confirm → kitchen</button>`
          : x.status === 'confirmed' ? `<button class="btn ghost sm" data-a="noshow">Customer did not come</button><button class="btn" data-a="bill">${ico('receipt', 16)} Collect &amp; make bill</button>`
          : `<button class="btn ghost" data-a="view">${ico('receipt', 16)} View bill</button>`}</div></div>`;
  }

  function draw() {
    const list = rows.filter(match);
    const news = list.filter(x => x.status === 'new'), prog = list.filter(x => x.status === 'confirmed'), done = list.filter(x => x.status === 'done' && x.day === today).reverse();
    const url = orderUrl();
    root.innerHTML = `
      <div class="card" style="margin-bottom:12px"><div class="row wrap" style="gap:10px">
        <div style="flex:1;min-width:220px"><h2 style="margin:0 0 4px">QR ordering</h2>
          <div class="muted small">Customers scan the QR code, register on their phone and send an order here. You confirm it (it goes to the kitchen) and make the bill when they come with their code.</div></div>
        <label class="check" style="margin:0"><input type="checkbox" id="qopen" ${open ? 'checked' : ''}> Accepting QR orders</label>
        <button class="btn ghost" id="qshow">${ico('qr', 16)} ${showQr ? 'Hide' : 'Show'} QR code</button></div>
        ${showQr ? `<div class="row wrap" style="gap:16px;margin-top:12px;align-items:center"><div style="background:#fff;border-radius:12px;padding:6px;line-height:0">${qrSvg(url, { size: 200 })}</div>
          <div style="flex:1;min-width:220px"><div class="small">Customers open:</div><code data-noi18n style="word-break:break-all;color:var(--gold)">${esc(url)}</code>
          <div class="row wrap" style="margin-top:10px"><button class="btn" id="qprint">${ico('print', 16)} Print QR poster</button><button class="btn ghost" id="qcopy">Copy link</button></div></div></div>` : ''}</div>
      <div class="card" style="margin-bottom:12px"><h2 style="margin:0 0 4px">📣 Send offer / alert</h2>
        <div class="muted small" style="margin-bottom:8px">Shown to every customer who is logged in on the QR page, and sent to their phones as a notification (even if their page is closed).</div>
        <div class="two"><label>Title<input id="nti" maxlength="60" placeholder="e.g. Today's offer"></label>
          <label>Show for<select id="nex"><option value="today">Until end of today</option><option value="1">1 hour</option><option value="3">3 hours</option><option value="24">24 hours</option><option value="72">3 days</option><option value="0">Until I stop it</option></select></label></div>
        <label>Message<textarea id="nbo" rows="2" maxlength="300" placeholder="e.g. Buy 2 hot buns, get 1 free until 6 PM!"></textarea></label>
        <button class="btn" id="nsend">📣 Send now</button>
        ${notices.length ? `<div style="margin-top:12px"><div class="muted small">Showing now:</div>${notices.map(n => `<div class="row wrap" style="gap:8px;padding:6px 0;border-top:1px solid var(--line)"><div style="flex:1;min-width:180px"><b data-noi18n>${esc(n.title || '')}</b> <span data-noi18n>${esc(n.body)}</span><div class="muted small">${tstr(n.created_at)}${n.expires_at ? ' · until ' + tstr(n.expires_at) : ''}</div></div><button class="btn ghost sm" data-stopn="${n.id}">Stop showing</button></div>`).join('')}</div>` : ''}</div>
      <div class="toolbar"><input id="qs" placeholder="Find by order code (e.g. Q7), name or phone" value="${esc(q)}" style="max-width:380px"><div class="spacer"></div>
        <span class="muted small">Press Enter on a code to collect it</span></div>
      <h3 style="margin:14px 0 8px">New orders ${news.length ? `<span class="pill bad">${news.length}</span>` : ''}</h3>
      ${news.length ? `<div class="qgrid">${news.map(card).join('')}</div>` : '<div class="card empty">No new QR orders</div>'}
      <h3 style="margin:18px 0 8px">Confirmed – waiting for the customer ${prog.length ? `<span class="pill warn">${prog.length}</span>` : ''}</h3>
      ${prog.length ? `<div class="qgrid">${prog.map(card).join('')}</div>` : '<div class="card empty small">Nothing waiting</div>'}
      <h3 style="margin:18px 0 8px">Completed today</h3>
      ${done.length ? `<div class="qgrid">${done.map(card).join('')}</div>` : '<div class="empty small">Nothing completed yet today</div>'}`;
    const qs = $('#qs', root); qs.oninput = e => { q = e.target.value; const pos = e.target.selectionStart; draw(); const n = $('#qs', root); n.focus(); n.setSelectionRange(pos, pos); };
    qs.onkeydown = e => { if (e.key !== 'Enter') return; const c = rows.find(x => x.code.toLowerCase() === q.trim().toLowerCase() && x.status === 'confirmed'); if (c) finish(c); else toast('No confirmed order with that code', 'err'); };
    $('#qopen', root).onchange = wrap(async e => {
      open = e.target.checked;
      const { error } = await sb.from('settings').update({ qr_open: open }).eq('id', 1);
      if (error) { open = !open; throw new Error(errMsg(error) + ' (run sql/update-10.sql)'); }
      state.settings = { ...state.settings, qr_open: open }; toast(open ? 'QR orders are ON' : 'QR orders are OFF – customers see "not taking orders"');
    });
    $('#nsend', root).onclick = wrap(async () => {
      const title = $('#nti', root).value.trim(), body = $('#nbo', root).value.trim(); if (!body) return toast('Type the message first', 'err');
      const ex = $('#nex', root).value; let expires = null;
      if (ex === 'today') expires = new Date(new Date(Date.now() + 19800000).toISOString().slice(0, 10) + 'T00:00:00+05:30').getTime() + 864e5;
      else if (ex !== '0') expires = Date.now() + Number(ex) * 36e5;
      const { error } = await sb.from('qr_notices').insert({ title, body, expires_at: expires ? new Date(expires).toISOString() : null });
      if (error) throw new Error(errMsg(error) + ' (run sql/update-11.sql)');
      const r = await qrPush({ kind: 'notice', title: title || state.settings.shop_name, body });
      toast(r && r.sent != null ? `Offer sent · ${r.sent} phone${r.sent === 1 ? '' : 's'} notified` : 'Offer is now showing on the QR page (phone notifications are not set up yet)');
    });
    root.querySelectorAll('[data-stopn]').forEach(b => { b.onclick = wrap(async () => { await sb.from('qr_notices').update({ active: false }).eq('id', b.dataset.stopn); toast('Stopped'); }); });
    $('#qshow', root).onclick = () => { showQr = !showQr; draw(); };
    const pr = $('#qprint', root); if (pr) pr.onclick = () => printPoster(url);
    const cp = $('#qcopy', root); if (cp) cp.onclick = async () => { try { await navigator.clipboard.writeText(url); toast('Link copied'); } catch { toast(url, 'info', 8000); } };
  }

  function printPoster(url) {
    const w = window.open('', '_blank'); if (!w) return toast('Please allow pop-ups to print', 'err');
    const s = state.settings;
    w.document.write(`<!doctype html><title>QR poster</title><style>body{font-family:Arial,sans-serif;text-align:center;margin:0;padding:30px}h1{font-size:42px;margin:10px 0 0}h2{font-size:30px;margin:6px 0 20px}
      .qr{display:inline-block;border:6px solid #000;border-radius:18px;padding:10px;line-height:0}p{font-size:20px;margin:16px 0}small{color:#555;word-break:break-all}</style>
      <img src="${new URL('assets/logo.jpg', location.href).href}" style="width:120px;height:120px;border-radius:50%;object-fit:cover"><h1>${esc(s.shop_name)}</h1><h2>Scan &amp; order from your phone</h2>
      <div class="qr">${qrSvg(url, { size: 360 })}</div><p>1. Scan the QR code &nbsp; 2. Register &nbsp; 3. Choose your items &amp; send<br>Show your order code at the counter</p><small>${esc(url)}</small>
      <script>window.onload=function(){setTimeout(function(){window.print()},300)}<\/script>`);
    w.document.close();
  }

  // ---- confirm: becomes a real order in the kitchen (same rules as a POS order: bill number, token, stock, cost) ----
  async function confirmQr(x) {
    // enough stock now?
    const need = {}; (x.items || []).forEach(l => { need[l.item_id] = (need[l.item_id] || 0) + l.qty; });
    const ri = await sb.from('items').select('*'); if (ri.error) throw ri.error;
    const items = ri.data || [], short = [];
    Object.entries(need).forEach(([id, n]) => { const it = items.find(i => i.id === id); if (it && it.track_stock && it.stock < n) short.push(`${it.name}: only ${Math.max(it.stock, 0)} left, ordered ${n}`); });
    if (short.length && !await confirmBox('Not enough stock now: ' + short.join('; ') + '. Confirm anyway?', 'Confirm anyway', false)) return;
    const claim = await sb.from('qr_orders').update({ status: 'confirmed', confirmed_at: new Date().toISOString() }).eq('id', x.id).eq('status', 'new').select();
    if (claim.error) throw claim.error;
    if (!claim.data || !claim.data.length) return toast('Another device already handled this order', 'info');
    const [rv, ra] = await Promise.all([sb.from('inventory').select('*'), sb.from('addons').select('*')]);
    const invm = rv.error ? null : invMapOf(rv.data), adds = ra.data || [];
    const lines = (x.items || []).map(l => {
      const it = items.find(i => i.id === l.item_id) || {};
      return { item_id: l.item_id, name: l.name, qty: l.qty, unit: Number(l.unit),
        ...(invm ? { cost: itemCost(it, invm), use: recipeUse(it, invm) } : {}),
        addons: (l.addons || []).map(a => ({ id: a.id, name: a.name, price: Number(a.price), qty: a.qty, ...(invm ? { cost: num((adds.find(z => z.id === a.id) || {}).cost) } : {}) })) };
    });
    const subtotal = r2(lines.reduce((n, l) => n + lineTotal(l), 0));
    const order = { id: crypto.randomUUID(), order_type: x.order_type, table_no: x.table_no, customer_name: x.customer_name, customer_phone: x.customer_phone, note: x.note,
      items: lines, subtotal, discount: 0, discount_label: '', service_pct: 0, service_charge: 0, total: subtotal, payment_method: (state.settings.payment_methods || ['cash'])[0] || 'cash',
      cash_received: 0, change_given: 0, cashier: getCashier(), status: 'pending', source: 'qr', qr_code: x.code };
    state.own.add(`${order.id}:pending`);
    const ins = await sb.from('orders').insert(order).select().single();
    if (ins.error) { state.own.clear(); await sb.from('qr_orders').update({ status: 'new', confirmed_at: null }).eq('id', x.id); throw new Error(errMsg(ins.error) + ' (run sql/update-10.sql)'); }
    await sb.from('qr_orders').update({ order_id: order.id }).eq('id', x.id);
    try { if (normPhone(x.customer_phone)) await sb.rpc('upsert_customer', { p_phone: normPhone(x.customer_phone), p_name: x.customer_name, p_total: subtotal }); } catch (e) { console.warn('customer not saved', e); }
    await Promise.all(Object.entries(need).map(([id, n]) => sb.rpc('adjust_stock', { p_item: id, p_delta: -n })));
    try { const ch = useDeltas(lines.map(l => ({ use: l.use, times: l.qty })), -1); if (ch.length) await sb.rpc('adjust_inventory_bulk', { p_changes: ch }); } catch (e) { console.warn('inventory not reduced', e); }
    qrPush({ kind: 'confirmed', qr_id: x.id });
    window.dispatchEvent(new Event('orders-changed'));
    toast(`${x.code} sent to the kitchen · Token #${ins.data.token_no || ''}`.trim());
  }

  // ---- collect & make the bill: discount, service charge, payment -> print / WhatsApp ----
  async function finish(x) {
    const { data: o, error } = await sb.from('orders').select('*').eq('id', x.order_id).maybeSingle();
    if (error || !o) return toast('The order was not found', 'err');
    const s = state.settings, methods = (s.payment_methods && s.payment_methods.length ? s.payment_methods : ['cash']);
    let dtype = 'pct', dval = '', scOn = !!s.service_charge_enabled, pay = o.payment_method && methods.includes(o.payment_method) ? o.payment_method : methods[0], cash = '';
    const sub = r2((o.items || []).reduce((n, l) => n + lineTotal(l), 0));
    const m = modal(`<h3>${ico('receipt')} Collect &amp; make bill · <span data-noi18n>${esc(x.code)}</span></h3>
      <div class="small" style="margin-bottom:8px"><b data-noi18n>${esc(x.customer_name)}</b> · <span data-noi18n>${esc(x.customer_phone)}</span> · ${typeLabel(o.order_type)}${o.table_no ? ' · Table ' + esc(o.table_no) : ''} · Bill <b data-noi18n>${billNo(o.bill_no)}</b></div>
      <div class="qlines" style="margin-bottom:8px">${(o.items || []).map(l => `<div><b>${l.qty} ×</b> ${esc(l.name)} <span class="muted">${fmt(l.unit * l.qty)}</span>${(l.addons || []).map(a => `<div class="muted small">+ ${a.qty} × ${esc(a.name)} ${fmt(a.price * a.qty)}</div>`).join('')}</div>`).join('')}</div>
      <div class="two"><label>Discount<select id="dt"><option value="pct">%</option><option value="amt">LKR</option></select></label><label>Amount<input id="dv" type="number" min="0" step="any" inputmode="decimal" placeholder="0"></label></div>
      <label class="check"><input type="checkbox" id="sc" ${scOn ? 'checked' : ''}> Service charge (${num(s.service_charge_pct)}%)</label>
      <div class="chips" id="pm" style="margin:6px 0">${methods.map(p => `<button type="button" class="chip ${p === pay ? 'on' : ''}" data-p="${p}">${esc(payLabel(p))}</button>`).join('')}</div>
      <div id="cb"></div>
      <div class="totals"><div class="row"><span>Subtotal</span><span id="t1"></span></div><div class="row"><span>Discount</span><span id="t2"></span></div><div class="row"><span>Service charge</span><span id="t3"></span></div>
        <div class="grand"><span>Total</span><span id="t4"></span></div></div>
      <div class="row end" style="margin-top:10px"><button class="btn ghost" data-c>Cancel</button><button class="btn big" id="sv">Save &amp; show bill</button></div>`);
    const calc = () => {
      const v = num(dval); let disc = dtype === 'pct' ? sub * Math.min(100, Math.max(0, v)) / 100 : Math.min(Math.max(0, v), sub); disc = r2(disc);
      const pct = num(s.service_charge_pct), sc = scOn ? r2((sub - disc) * pct / 100) : 0;
      return { disc, sc, pct: scOn ? pct : 0, total: r2(sub - disc + sc) };
    };
    const paint = () => {
      const c = calc(); $('#t1', m.el).textContent = fmt(sub); $('#t2', m.el).textContent = '- ' + fmt(c.disc); $('#t3', m.el).textContent = fmt(c.sc); $('#t4', m.el).textContent = money(c.total);
      $('#cb', m.el).innerHTML = pay === 'cash' ? `<label style="margin:0">Cash received (LKR)<input id="cash" type="number" min="0" step="any" inputmode="decimal" value="${esc(cash)}"></label><div class="muted small" id="chg">${num(cash) >= c.total && cash !== '' ? 'Change: ' + money(num(cash) - c.total) : ''}</div>` : '';
      const ci = $('#cash', m.el); if (ci) ci.oninput = e => { cash = e.target.value; $('#chg', m.el).textContent = num(cash) >= calc().total && cash !== '' ? 'Change: ' + money(num(cash) - calc().total) : ''; };
    };
    $('#dt', m.el).onchange = e => { dtype = e.target.value; paint(); }; $('#dv', m.el).oninput = e => { dval = e.target.value; paint(); };
    $('#sc', m.el).onchange = e => { scOn = e.target.checked; paint(); };
    $('#pm', m.el).onclick = e => { const b = e.target.closest('[data-p]'); if (!b) return; pay = b.dataset.p; $$('#pm .chip', m.el).forEach(z => z.classList.toggle('on', z === b)); paint(); };
    $('[data-c]', m.el).onclick = () => m.close();
    $('#sv', m.el).onclick = wrap(async () => {
      const c = calc(), got = num(cash);
      if (pay === 'cash' && cash !== '' && got < c.total) return toast(`Cash received is less than the total (short ${money(c.total - got)})`, 'err');
      $('#sv', m.el).disabled = true;
      const patch = { discount: c.disc, discount_label: c.disc > 0 ? (dtype === 'pct' ? `${num(dval)}%` : 'LKR') : '', service_pct: c.pct, service_charge: c.sc, total: c.total, payment_method: pay,
        cash_received: pay === 'cash' ? got : 0, change_given: pay === 'cash' && got > c.total ? r2(got - c.total) : 0, cashier: getCashier() || o.cashier };
      const up = await sb.from('orders').update(patch).eq('id', o.id).select().single(); if (up.error) { $('#sv', m.el).disabled = false; throw up.error; }
      await sb.from('qr_orders').update({ status: 'done', done_at: new Date().toISOString() }).eq('id', x.id);
      window.dispatchEvent(new Event('orders-changed')); m.close(); bill(up.data);
    });
    paint();
  }
  const manage = { edit: o => openEdit(o, again), refund: o => openRefund(o, again) };
  async function again(id) { await load(); const { data } = await sb.from('orders').select('*').eq('id', id).maybeSingle(); if (data) bill(data); }
  const bill = o => showBillModal(o, { title: `Bill ${billNo(o.bill_no)}`, keep: true, manage });

  root.onclick = e => {
    const b = e.target.closest('[data-a]'); if (!b) return;          // (only real buttons reload the page - a click on the switch must not redraw it)
    const card = b.closest('.qcard'), x = rows.find(r => r.id === card.dataset.id); if (!x) return;
    act(b.dataset.a, x);
  };
  const act = wrap(async (a, x) => {
    const b = { dataset: { a } };
    if (b.dataset.a === 'confirm') return confirmQr(x);
    if (b.dataset.a === 'reject') {
      const why = await promptModal({ title: `Reject ${x.code}`, label: 'Reason shown to the customer (optional)', value: '', ok: 'Reject order' }); if (why === null) return;
      const { error } = await sb.from('qr_orders').update({ status: 'rejected', reason: why.trim() }).eq('id', x.id).eq('status', 'new'); if (error) throw error; qrPush({ kind: 'rejected', qr_id: x.id }); return toast('Order rejected');
    }
    if (b.dataset.a === 'bill') return finish(x);
    if (b.dataset.a === 'view') { const { data } = await sb.from('orders').select('*').eq('id', x.order_id).maybeSingle(); if (data) bill(data); return; }
    if (b.dataset.a === 'noshow') {
      const { data } = await sb.from('orders').select('*').eq('id', x.order_id).maybeSingle(); if (!data) return;
      toast('Refund the whole order (tick "put back in stock") and then mark it as not collected', 'info', 7000);
      openRefund(data, async () => { await sb.from('qr_orders').update({ status: 'cancelled', reason: 'Customer did not come' }).eq('id', x.id); load(); });
    }
  });

  await load();
  const offLive = onLive(() => { if (!document.querySelector('.modal-wrap')) load().catch(() => {}); }, 800);
  return () => { root.onclick = null; offLive(); };
}
