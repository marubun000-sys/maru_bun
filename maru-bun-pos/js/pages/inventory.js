import { sb } from '../sb.js';
import { $, esc, num, toast, modal, ico, confirmBox, promptModal, errMsg } from '../utils.js';

export async function render(root) {
  let rows = [];

  async function load() {
    const { data, error } = await sb.from('inventory').select('*').order('name');
    if (error) throw error;
    rows = data || []; draw();
  }
  const wrap = fn => async (...a) => { try { await fn(...a); await load(); } catch (e) { console.error(e); toast(errMsg(e), 'err', 6000); } };
  const low = r => num(r.qty) <= num(r.low_level);

  function draw() {
    const nLow = rows.filter(low).length;
    root.innerHTML = `<div class="page-head"><h1>Inventory</h1>${nLow ? `<span class="pill bad">${nLow} running low</span>` : ''}<div class="spacer"></div>
      <button class="btn" data-a="add">${ico('plus')} Add ingredient</button></div>
      <p class="muted small" style="margin-top:-6px">Track raw materials (buns, cheese, chicken…). Use <b>Adjust</b> to add new stock or record usage / waste.</p>
      <div class="tbl-wrap"><table><thead><tr><th>Ingredient</th><th class="r">In stock</th><th>Unit</th><th class="r">Alert level</th><th>Status</th><th></th></tr></thead><tbody>
      ${rows.map(r => `<tr><td><b>${esc(r.name)}</b></td><td class="r">${num(r.qty)}</td><td>${esc(r.unit)}</td><td class="r">${num(r.low_level)}</td>
        <td>${num(r.qty) <= 0 ? '<span class="pill bad">Empty</span>' : low(r) ? '<span class="pill warn">Low</span>' : '<span class="pill ok">OK</span>'}</td>
        <td class="r" style="white-space:nowrap"><button class="btn ghost sm" data-a="adj" data-id="${r.id}">± Adjust</button> <button class="btn ghost sm" data-a="edit" data-id="${r.id}">${ico('edit', 14)}</button> <button class="btn ghost sm" data-a="del" data-id="${r.id}">${ico('trash', 14)}</button></td></tr>`).join('') || '<tr><td colspan="6" class="empty">No ingredients yet</td></tr>'}
      </tbody></table></div>`;
    root.onclick = onClick;
  }

  function form(r = {}) {
    const m = modal(`<h3>${r.id ? 'Edit ingredient' : 'Add ingredient'}</h3><form id="f">
      <label>Name<input name="name" required value="${esc(r.name || '')}"></label>
      <div class="three"><label>Quantity<input name="qty" type="number" step="any" value="${r.qty ?? 0}"></label>
      <label>Unit<input name="unit" value="${esc(r.unit || 'pcs')}" placeholder="kg / pcs / L"></label>
      <label>Alert at<input name="low" type="number" min="0" step="any" value="${r.low_level ?? 0}"></label></div>
      <div class="row end"><button type="button" class="btn ghost" data-c>Cancel</button><button class="btn">Save</button></div></form>`);
    $('[data-c]', m.el).onclick = () => m.close();
    $('#f', m.el).onsubmit = wrap(async e => {
      e.preventDefault(); const f = e.target;
      const row = { name: f.elements.name.value.trim(), qty: num(f.qty.value), unit: f.unit.value.trim() || 'pcs', low_level: num(f.low.value) };
      const { error } = r.id ? await sb.from('inventory').update(row).eq('id', r.id) : await sb.from('inventory').insert(row);
      if (error) throw error; m.close(); toast('Saved');
    });
  }

  const onClick = wrap(async e => {
    const b = e.target.closest('[data-a]'); if (!b) return;
    const r = rows.find(x => x.id === b.dataset.id);
    if (b.dataset.a === 'add') return form();
    if (b.dataset.a === 'edit') return form(r);
    if (b.dataset.a === 'adj') {
      const v = await promptModal({ title: `Adjust · ${r.name}`, label: `Add (+) or remove (−) in ${r.unit}. Current: ${num(r.qty)}`, type: 'number', step: 'any', ok: 'Update', placeholder: 'e.g. 20 or -3' });
      if (v === null || !num(v)) return;
      const { error } = await sb.from('inventory').update({ qty: Math.round((num(r.qty) + num(v)) * 100) / 100 }).eq('id', r.id); if (error) throw error; toast('Inventory updated');
    }
    if (b.dataset.a === 'del' && await confirmBox(`Delete "${r.name}"?`)) {
      const { error } = await sb.from('inventory').delete().eq('id', r.id); if (error) throw error; toast('Deleted');
    }
  });

  await load();
  return () => { root.onclick = null; };
}
