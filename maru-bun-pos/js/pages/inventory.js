import { sb } from '../sb.js';
import { $, esc, num, fmt, money, r2, toast, modal, ico, confirmBox, promptModal, errMsg, onLive, unitChoices, convertQty, dtstr } from '../utils.js';
import { getCashier } from '../state.js';

export async function render(root) {
  let rows = [];

  async function load() {
    const { data, error } = await sb.from('inventory').select('*').order('name');
    if (error) throw error;
    rows = data || []; draw();
  }
  const wrap = fn => async (...a) => { try { await fn(...a); await load(); } catch (e) { console.error(e); toast(errMsg(e), 'err', 6000); } };
  const low = r => num(r.qty) <= num(r.low_level);
  // cost of 1 unit, plus the small unit when the stock is counted in kg / L  (e.g. LKR 1,200.00 / kg  ·  1.20 / g)
  function costCell(r) {
    const c = num(r.cost_per_unit); if (!c) return '<span class="muted">not set</span>';
    const small = convertQty(1, 'g', r.unit) != null ? ['g', convertQty(1, 'g', r.unit)] : convertQty(1, 'ml', r.unit) != null ? ['ml', convertQty(1, 'ml', r.unit)] : null;
    return `${fmt(c)} / ${esc(r.unit)}${small ? `<div class="muted small">${r2(c * small[1]).toLocaleString('en-US', { maximumFractionDigits: 4 })} / ${small[0]}</div>` : ''}`;
  }

  function draw() {
    const nLow = rows.filter(low).length;
    root.innerHTML = `<div class="page-head"><h1>Inventory</h1>${nLow ? `<span class="pill bad">${nLow} running low</span>` : ''}<div class="spacer"></div>
      <button class="btn" data-a="add">${ico('plus')} Add ingredient</button></div>
      <p class="muted small" style="margin-top:-6px">Track raw materials (buns, cheese, chicken…). Press <b>Add stock</b> when you buy more, and enter the price you paid. The cost per unit is averaged with what you already have, and it is used to work out the cost of each menu item and the profit on bills.</p>
      <div class="tbl-wrap"><table><thead><tr><th>Ingredient</th><th class="r">In stock</th><th>Unit</th><th class="r">Cost per unit</th><th class="r">Stock value</th><th class="r">Alert level</th><th>Status</th><th></th></tr></thead><tbody>
      ${rows.map(r => `<tr><td><b>${esc(r.name)}</b></td><td class="r">${num(r.qty)}</td><td>${esc(r.unit)}</td><td class="r">${costCell(r)}</td><td class="r">${num(r.cost_per_unit) ? fmt(num(r.qty) * num(r.cost_per_unit)) : '<span class="muted">—</span>'}</td><td class="r">${num(r.low_level)}</td>
        <td>${num(r.qty) <= 0 ? '<span class="pill bad">Empty</span>' : low(r) ? '<span class="pill warn">Low</span>' : '<span class="pill ok">OK</span>'}</td>
        <td class="r" style="white-space:nowrap"><button class="btn sm" data-a="stock" data-id="${r.id}">${ico('plus', 14)} Add stock</button> <button class="btn ghost sm" data-a="adj" data-id="${r.id}">± Use / waste</button> <button class="btn ghost sm" data-a="hist" data-id="${r.id}" title="Purchase history">🧾</button> <button class="btn ghost sm" data-a="edit" data-id="${r.id}">${ico('edit', 14)}</button> <button class="btn ghost sm" data-a="del" data-id="${r.id}">${ico('trash', 14)}</button></td></tr>`).join('') || '<tr><td colspan="6" class="empty">No ingredients yet</td></tr>'}
      </tbody></table></div>`;
    root.onclick = onClick;
  }

  function form(r = {}) {
    const m = modal(`<h3>${r.id ? 'Edit ingredient' : 'Add ingredient'}</h3><form id="f">
      <label>Name<input name="name" required value="${esc(r.name || '')}"></label>
      <div class="three"><label>Quantity<input name="qty" type="number" step="any" value="${r.qty ?? 0}"></label>
      <label>Unit<input name="unit" value="${esc(r.unit || 'pcs')}" placeholder="kg / pcs / L"></label>
      <label>Alert at<input name="low" type="number" min="0" step="any" value="${r.low_level ?? 0}"></label></div>
      <label>Cost per <span id="cu">${esc(r.unit || 'unit')}</span> (LKR) <span class="muted small">– worked out from your purchases; you can also type it by hand</span><input name="cost" type="number" min="0" step="any" value="${num(r.cost_per_unit) || ''}" placeholder="e.g. 1200"></label>
      <div class="row end"><button type="button" class="btn ghost" data-c>Cancel</button><button class="btn">Save</button></div></form>`);
    $('[data-c]', m.el).onclick = () => m.close();
    $('#f', m.el).elements.unit.oninput = e => { $('#cu', m.el).textContent = e.target.value.trim() || 'unit'; };
    $('#f', m.el).onsubmit = wrap(async e => {
      e.preventDefault(); const f = e.target;
      const row = { name: f.elements.name.value.trim(), qty: num(f.qty.value), unit: f.unit.value.trim() || 'pcs', low_level: num(f.low.value), cost_per_unit: num(f.cost.value) };
      const { error } = r.id ? await sb.from('inventory').update(row).eq('id', r.id) : await sb.from('inventory').insert(row);
      if (error) throw error; m.close(); toast('Saved');
    });
  }

  // ---- buy more stock: quantity + the price paid, cost per unit is averaged with the stock already there ----
  function addStock(r) {
    const units = unitChoices(r.unit), cur = num(r.cost_per_unit);
    const m = modal(`<h3>Add stock · ${esc(r.name)}</h3><form id="f">
      <p class="muted small" style="margin-top:-4px">In stock now: <b>${num(r.qty)} ${esc(r.unit)}</b>${cur ? ` · average cost ${fmt(cur)} / ${esc(r.unit)}` : ''}</p>
      <div class="two"><label>Quantity bought<input name="q" type="number" min="0" step="any" required autofocus placeholder="e.g. 5"></label>
        <label>Unit<select name="u">${units.map(u => `<option ${u.toLowerCase() === String(r.unit).toLowerCase() ? 'selected' : ''}>${esc(u)}</option>`).join('')}</select></label></div>
      <label>Total price paid (LKR) <span class="muted small">for this whole purchase</span><input name="t" type="number" min="0" step="any" placeholder="e.g. 6000"></label>
      <div class="card" id="pv" style="padding:10px;margin:8px 0"></div>
      <div class="row end"><button type="button" class="btn ghost" data-c>Cancel</button><button class="btn">Add to stock</button></div></form>`);
    const f = $('#f', m.el);
    const calc = () => {
      const q = convertQty(num(f.q.value), f.u.value, r.unit), t = num(f.t.value);
      if (!(q > 0)) return $('#pv', m.el).innerHTML = '<span class="muted small">Enter the quantity and the price you paid.</span>';
      const base = Math.max(num(r.qty), 0), avg = cur ? (base * cur + t) / (base + q) : t / q;
      $('#pv', m.el).innerHTML = `<div class="small">This purchase: <b>${fmt(t / q)}</b> per ${esc(r.unit)}</div>
        <div class="small">New stock: <b>${r2(num(r.qty) + q)} ${esc(r.unit)}</b> · new average cost: <b>${fmt(avg)}</b> per ${esc(r.unit)}</div>`;
    };
    f.oninput = calc; f.onchange = calc; calc();
    $('[data-c]', m.el).onclick = () => m.close();
    f.onsubmit = wrap(async e => {
      e.preventDefault();
      const q = convertQty(num(f.q.value), f.u.value, r.unit); if (!(q > 0)) return toast('Enter the quantity', 'err');
      const { error } = await sb.rpc('add_stock', { p_id: r.id, p_qty: r2(q * 1000) / 1000, p_total: num(f.t.value), p_by: getCashier() });
      if (error) throw error; m.close(); toast('Stock added');
    });
  }
  async function history(r) {
    const { data, error } = await sb.from('inventory_purchases').select('*').eq('inventory_id', r.id).order('created_at', { ascending: false }).limit(100);
    if (error) throw error; const list = data || [], spent = list.reduce((n, x) => n + num(x.total_cost), 0);
    const m = modal(`<h3>Purchases · ${esc(r.name)}</h3>
      <p class="small">Total spent (all purchases): <b>${money(spent)}</b> · ${list.length} purchase${list.length === 1 ? '' : 's'}</p>
      ${list.length ? `<div class="tbl-wrap" style="max-height:340px"><table><thead><tr><th>Date</th><th class="r">Bought</th><th class="r">Paid</th><th class="r">Per ${esc(r.unit)}</th><th>By</th></tr></thead><tbody>
        ${list.map(x => `<tr><td>${dtstr(x.created_at)}</td><td class="r">${num(x.qty)} ${esc(r.unit)}</td><td class="r">${fmt(x.total_cost)}</td><td class="r">${fmt(x.unit_cost)}</td><td>${esc(x.by_name || '—')}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">No purchases recorded yet. Use "Add stock" when you buy.</div>'}
      <div class="row end"><button class="btn ghost" data-c>Close</button></div>`, { wide: true });
    $('[data-c]', m.el).onclick = () => m.close();
  }

  const onClick = wrap(async e => {
    const b = e.target.closest('[data-a]'); if (!b) return;
    const r = rows.find(x => x.id === b.dataset.id);
    if (b.dataset.a === 'add') return form();
    if (b.dataset.a === 'edit') return form(r);
    if (b.dataset.a === 'stock') return addStock(r);
    if (b.dataset.a === 'hist') return history(r);
    if (b.dataset.a === 'adj') {
      const v = await promptModal({ title: `Use / waste · ${r.name}`, label: `Remove (−) used or wasted stock, in ${r.unit}. (To add bought stock use "Add stock".) Current: ${num(r.qty)}`, type: 'number', step: 'any', ok: 'Update', placeholder: 'e.g. 20 or -3' });
      if (v === null || !num(v)) return;
      const { error } = await sb.from('inventory').update({ qty: Math.round((num(r.qty) + num(v)) * 100) / 100 }).eq('id', r.id); if (error) throw error; toast('Inventory updated');
    }
    if (b.dataset.a === 'del' && await confirmBox(`Delete "${r.name}"?`)) {
      const { error } = await sb.from('inventory').delete().eq('id', r.id); if (error) throw error; toast('Deleted');
    }
  });

  await load();
  const offLive = onLive(() => { if (!document.querySelector('.modal-wrap')) load().catch(() => {}); }, 1500);
  return () => { root.onclick = null; offLive(); };
}
