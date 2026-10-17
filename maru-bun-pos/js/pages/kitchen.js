import { sb } from '../sb.js';
import { state } from '../state.js';
import { $, esc, billNo, tstr, dayRange, toast, beep, ico, errMsg, onLive, noKitchen, lineRows } from '../utils.js';
import { kotHTML, printHTML, typeLabel } from '../bill.js';

export async function render(root) {
  root.innerHTML = `<div class="page-head"><h1>Kitchen Display</h1><div class="spacer"></div>
      <button class="btn ghost sm" id="snd">${ico('bell', 14)} Test sound</button></div>
    <div id="pending"></div>
    <h2 style="margin-top:22px" class="muted">Served today</h2>
    <div id="served"></div>`;
  $('#snd', root).onclick = () => beep('new');

  let pending = [], served = [], busy = false;
  const mins = o => Math.max(0, Math.floor((Date.now() - new Date(o.created_at)) / 60000));

  async function load() {
    if (busy) return; busy = true;
    try {
      const [p, sv] = await Promise.all([
        sb.from('orders').select('*').eq('status', 'pending').order('created_at', { ascending: true }),
        sb.from('orders').select('*').eq('status', 'served').gte('created_at', dayRange()[0]).order('created_at', { ascending: false }).limit(40),
      ]);
      if (p.error) throw p.error;
      pending = p.data || [];
      // orders saved straight as 'served' (not sent to kitchen) are not shown here
      served = (sv.data || []).filter(o => !noKitchen(o)).slice(0, 12);
      draw();
    } catch (e) { $('#pending').innerHTML = `<div class="err">${esc(errMsg(e))}</div>`; }
    busy = false;
  }

  function card(o, done) {
    const m = mins(o);
    return `<div class="kcard ${done ? 'done' : m >= 10 ? 'late' : ''}" data-id="${o.id}">
      <div class="kh"><b>${o.token_no ? `<span class="ktok">#${o.token_no}</span> ` : ''}<small class="kbill">${billNo(o.bill_no)}</small></b><span class="pill ${o.order_type === 'takeaway' ? 'info' : 'warn'}">${typeLabel(o.order_type)}${o.table_no ? ' · Table ' + esc(o.table_no) : ''}</span></div>
      <div class="muted small">${tstr(o.created_at)}${done ? '' : ` · <b style="color:${m >= 10 ? 'var(--bad)' : 'var(--text)'}">${m} min</b> waiting`}${o.customer_name ? ' · ' + esc(o.customer_name) : ''}</div>
      <ul>${(o.items || []).map(l => { const r = lineRows(l); return `<li><b>${r.qty} ×</b> ${esc(r.name)}${r.extras.length ? `<small>${r.extras.map(e => `+ ${e.qty} × ${esc(e.name)}`).join('<br>')}</small>` : ''}</li>`; }).join('')}</ul>
      ${o.note ? `<div class="knote">Note: ${esc(o.note)}</div>` : ''}
      <div class="row wrap">${done ? `<button class="btn ghost" data-a="undo">${ico('undo', 16)} Undo</button>` : `<button class="btn" data-a="served">${ico('check', 16)} Mark Served</button>`}<button class="btn ghost" data-a="print">${ico('print', 16)} Print</button></div>
    </div>`;
  }
  function draw() {
    $('#pending').innerHTML = pending.length ? `<div class="kgrid">${pending.map(o => card(o, false)).join('')}</div>` : '<div class="card empty">No pending orders. Kitchen is clear ✓</div>';
    $('#served').innerHTML = served.length ? `<div class="kgrid">${served.map(o => card(o, true)).join('')}</div>` : '<div class="empty small">Nothing served yet today</div>';
  }

  root.onclick = async e => {
    const b = e.target.closest('[data-a]'); if (!b) return;
    const id = b.closest('.kcard').dataset.id;
    const o = pending.find(x => x.id === id) || served.find(x => x.id === id);
    if (!o) return;
    if (b.dataset.a === 'print') return printHTML(kotHTML(o));
    b.disabled = true;
    const undo = b.dataset.a === 'undo';
    const stamp = new Date().toISOString();
    // tell this device not to alert itself about its own change
    state.own.add(undo ? `${id}:pending` : `${id}:served:${new Date(stamp).getTime()}`);
    const patch = undo ? { status: 'pending', served_at: null } : { status: 'served', served_at: stamp };
    const { error } = await sb.from('orders').update(patch).eq('id', id);
    if (error) { b.disabled = false; return toast('Could not update: ' + errMsg(error), 'err'); }
    toast(undo ? `${billNo(o.bill_no)} moved back to the kitchen` : `${billNo(o.bill_no)} marked as served ✓`);
    window.dispatchEvent(new Event('orders-changed'));
    load();
  };

  const offLive = onLive(load, 400);
  const t = setInterval(() => { draw(); }, 30000); // keep "x min" fresh
  await load();
  return () => { offLive(); clearInterval(t); root.onclick = null; };
}
