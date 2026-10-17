import { sb } from '../sb.js';
import { state } from '../state.js';
import { $, esc, billNo, tstr, dayRange, toast, beep, ico, errMsg } from '../utils.js';
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
        sb.from('orders').select('*').eq('status', 'served').gte('created_at', dayRange()[0]).order('created_at', { ascending: false }).limit(12),
      ]);
      if (p.error) throw p.error;
      pending = p.data || []; served = sv.data || [];
      draw();
    } catch (e) { $('#pending').innerHTML = `<div class="err">${esc(errMsg(e))}</div>`; }
    busy = false;
  }

  function card(o, done) {
    const m = mins(o);
    return `<div class="kcard ${done ? 'done' : m >= 10 ? 'late' : ''}" data-id="${o.id}">
      <div class="kh"><b>${billNo(o.bill_no)}</b><span class="pill ${o.order_type === 'takeaway' ? 'info' : 'warn'}">${typeLabel(o.order_type)}${o.table_no ? ' · ' + esc(o.table_no) : ''}</span></div>
      <div class="muted small">${tstr(o.created_at)}${done ? '' : ` · <b style="color:${m >= 10 ? 'var(--bad)' : 'var(--text)'}">${m} min</b> waiting`}${o.customer_name ? ' · ' + esc(o.customer_name) : ''}</div>
      <ul>${(o.items || []).map(l => `<li><b>${l.qty} ×</b> ${esc(l.name)}${(l.addons || []).length ? `<small>+ ${l.addons.map(a => esc(a.name)).join(', ')}</small>` : ''}</li>`).join('')}</ul>
      ${o.note ? `<div class="knote">Note: ${esc(o.note)}</div>` : ''}
      <div class="row">${done ? '' : `<button class="btn" data-a="served">${ico('check', 16)} Mark Served</button>`}<button class="btn ghost" data-a="print">${ico('print', 16)} Print</button></div>
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
    state.own.add(`${id}:served`);
    const { error } = await sb.from('orders').update({ status: 'served', served_at: new Date().toISOString() }).eq('id', id);
    if (error) { state.own.delete(`${id}:served`); b.disabled = false; return toast('Could not update: ' + errMsg(error), 'err'); }
    toast(`${billNo(o.bill_no)} marked as served ✓`);
    window.dispatchEvent(new Event('orders-changed'));
    load();
  };

  const onChange = () => load();
  window.addEventListener('orders-changed', onChange);
  const t = setInterval(() => { draw(); }, 30000); // keep "x min" fresh
  await load();
  return () => { window.removeEventListener('orders-changed', onChange); clearInterval(t); root.onclick = null; };
}
