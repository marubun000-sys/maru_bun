import { sb } from '../sb.js';
import { $, esc, fmt, dtstr, toast, ico, errMsg, onLive, downloadCSV } from '../utils.js';

export async function render(root) {
  let rows = [], q = '';
  root.innerHTML = `<div class="page-head"><h1>Customers</h1><span class="pill info" id="cnt"></span><div class="spacer"></div>
      <button class="btn ghost sm" id="csv">${ico('download', 14)} Export CSV</button></div>
    <p class="muted small" style="margin-top:-6px">Every customer WhatsApp number typed in POS is saved here automatically.</p>
    <input id="cq" type="search" placeholder="Search name / phone" style="max-width:340px;margin-bottom:10px">
    <div id="err"></div>
    <div class="tbl-wrap"><table><thead><tr><th>Name</th><th>Phone</th><th class="r">Visits</th><th class="r">Total spent (LKR)</th><th>Last visit</th><th></th></tr></thead><tbody id="rows"></tbody></table></div>`;

  const list = () => rows.filter(r => !q || (r.name || '').toLowerCase().includes(q) || r.phone.includes(q.replace(/\D/g, '') || '\u0000'));
  function draw() {
    const l = list();
    $('#cnt', root).textContent = `${rows.length} customers`;
    $('#rows', root).innerHTML = l.length ? l.map(r => `<tr><td><b>${esc(r.name || '—')}</b></td><td>+${esc(r.phone)}</td><td class="r">${r.visits}</td><td class="r">${fmt(r.total_spent)}</td><td>${dtstr(r.last_visit)}</td>
      <td class="r" style="white-space:nowrap"><a class="btn ghost sm" target="_blank" rel="noopener" href="https://wa.me/${esc(r.phone)}">WhatsApp</a> <button class="btn ghost sm" data-a="edit" data-p="${esc(r.phone)}">${ico('edit', 14)}</button></td></tr>`).join('') : '<tr><td colspan="6" class="empty">No customers yet</td></tr>';
  }
  async function load() {
    const { data, error } = await sb.from('customers').select('*').order('last_visit', { ascending: false });
    if (error) { $('#err', root).innerHTML = `<div class="err">${esc(errMsg(error))}<br><small>Run sql/update-3.sql in the Supabase SQL Editor first.</small></div>`; return; }
    $('#err', root).innerHTML = ''; rows = data || []; draw();
  }
  $('#cq', root).oninput = e => { q = e.target.value.toLowerCase().trim(); draw(); };
  $('#csv', root).onclick = () => downloadCSV(`customers.csv`, [['Name', 'Phone', 'Visits', 'Total spent', 'Last visit'], ...rows.map(r => [r.name, '+' + r.phone, r.visits, r.total_spent, r.last_visit])]);
  root.onclick = async e => {
    const b = e.target.closest('[data-a="edit"]'); if (!b) return;
    const r = rows.find(x => x.phone === b.dataset.p); if (!r) return;
    const name = prompt('Customer name', r.name || ''); if (name === null) return;
    const { error } = await sb.from('customers').update({ name: name.trim() }).eq('phone', r.phone);
    if (error) return toast(errMsg(error), 'err'); toast('Saved'); load();
  };
  const off = onLive(load, 500);
  await load();
  return () => { off(); root.onclick = null; };
}
