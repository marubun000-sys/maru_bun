import { sb } from '../sb.js';
import { $, $$, esc, fmt, num, r2, toast, modal, ico, confirmBox, promptModal, errMsg, onLive, unitChoices, convertQty, invMapOf, itemCost } from '../utils.js';

export async function render(root) {
  let tab = 'items', cats = [], items = [], addons = [], inv = [], invMap = {};

  async function load() {
    const [a, b, c, d] = await Promise.all([
      sb.from('categories').select('*').order('sort').order('name'),
      sb.from('items').select('*').order('name'),
      sb.from('addons').select('*').order('name'),
      sb.from('inventory').select('*').order('name'),
    ]);
    if (a.error) throw a.error; if (b.error) throw b.error; if (c.error) throw c.error; if (d.error) throw d.error;
    cats = a.data || []; items = b.data || []; addons = c.data || []; inv = d.data || []; invMap = invMapOf(inv);
    draw();
  }
  const catName = id => (cats.find(c => c.id === id) || {}).name || '—';
  const wrap = fn => async (...a) => { try { await fn(...a); await load(); } catch (e) { console.error(e); toast(errMsg(e), 'err', 6000); } };

  function draw() {
    root.innerHTML = `<div class="tabs" id="tabs">
      <button data-t="items" class="${tab === 'items' ? 'on' : ''}">Items (${items.length})</button>
      <button data-t="cats" class="${tab === 'cats' ? 'on' : ''}">Categories (${cats.length})</button>
      <button data-t="addons" class="${tab === 'addons' ? 'on' : ''}">Extras / Add-ons (${addons.length})</button></div>
      <div id="body">${tab === 'items' ? itemsView() : tab === 'cats' ? catsView() : addonsView()}</div>`;
    $('#tabs', root).onclick = e => { const b = e.target.closest('[data-t]'); if (b) { tab = b.dataset.t; draw(); } };
    $('#body', root).onclick = onBody;
  }

  // ---------- views ----------
  // cost of one item (from its ingredients, or typed by hand) and the profit on one sale
  function costCells(i) {
    const c = itemCost(i, invMap);
    if (!c) return '<td class="r"><span class="muted small">not set</span></td><td class="r"><span class="muted">—</span></td>';
    const p = num(i.price) - c, pct = num(i.price) ? Math.round(p / num(i.price) * 100) : 0;
    return `<td class="r">${fmt(c)}${i.cost_manual ? ' <span class="muted small" title="typed by hand">✎</span>' : ''}</td><td class="r"><b style="color:var(--${p >= 0 ? 'ok' : 'bad'})">${fmt(p)}</b><div class="muted small">${pct}%</div></td>`;
  }
  function itemsView() {
    return `<div class="toolbar"><button class="btn" data-a="add-item">${ico('plus')} Add item</button>
      ${cats.length ? '' : '<span class="muted small">Tip: create a category first (Categories tab)</span>'}</div>
      <div class="tbl-wrap"><table><thead><tr><th>Item</th><th>Category</th><th class="r">Price (LKR)</th><th class="r">Cost (LKR)</th><th class="r">Profit</th><th>Extras</th><th class="r">Stock</th><th>Status</th><th></th></tr></thead><tbody>
      ${items.map(i => `<tr><td><b>${esc(i.name)}</b></td><td>${esc(catName(i.category_id))}</td><td class="r">${fmt(i.price)}</td>${costCells(i)}
        <td>${i.allow_addons ? 'Yes' : 'No'}</td>
        <td class="r">${i.track_stock ? `<span class="pill ${i.stock <= 0 ? 'bad' : i.stock <= i.low_stock ? 'warn' : 'ok'}">${i.stock}</span>` : '<span class="muted">not tracked</span>'}</td>
        <td>${i.active ? '<span class="pill ok">Active</span>' : '<span class="pill">Hidden</span>'}</td>
        <td class="r" style="white-space:nowrap">${i.track_stock ? `<button class="btn ghost sm" data-a="restock" data-id="${i.id}">+ Stock</button> ` : ''}<button class="btn ghost sm" data-a="edit-item" data-id="${i.id}">${ico('edit', 14)}</button> <button class="btn ghost sm" data-a="del-item" data-id="${i.id}">${ico('trash', 14)}</button></td></tr>`).join('') || '<tr><td colspan="7" class="empty">No items yet</td></tr>'}
      </tbody></table></div>`;
  }
  function catsView() {
    return `<div class="toolbar"><button class="btn" data-a="add-cat">${ico('plus')} Add category</button></div>
      <div class="tbl-wrap"><table><thead><tr><th>Category</th><th class="r">Order</th><th class="r">Items</th><th></th></tr></thead><tbody>
      ${cats.map(c => `<tr><td><b>${esc(c.name)}</b></td><td class="r">${c.sort}</td><td class="r">${items.filter(i => i.category_id === c.id).length}</td>
        <td class="r"><button class="btn ghost sm" data-a="edit-cat" data-id="${c.id}">${ico('edit', 14)}</button> <button class="btn ghost sm" data-a="del-cat" data-id="${c.id}">${ico('trash', 14)}</button></td></tr>`).join('') || '<tr><td colspan="4" class="empty">No categories yet</td></tr>'}
      </tbody></table></div>`;
  }
  function addonsView() {
    return `<div class="toolbar"><button class="btn" data-a="add-addon">${ico('plus')} Add extra</button>
      <span class="muted small">Extras show up when a bun is added to an order (cheese, egg, sauce…)</span></div>
      <div class="tbl-wrap"><table><thead><tr><th>Extra</th><th class="r">Price (LKR)</th><th class="r">Cost (LKR)</th><th>Status</th><th></th></tr></thead><tbody>
      ${addons.map(a => `<tr><td><b>${esc(a.name)}</b></td><td class="r">${fmt(a.price)}</td><td class="r">${num(a.cost) ? fmt(a.cost) : '<span class="muted small">not set</span>'}</td><td>${a.active ? '<span class="pill ok">Active</span>' : '<span class="pill">Hidden</span>'}</td>
        <td class="r"><button class="btn ghost sm" data-a="edit-addon" data-id="${a.id}">${ico('edit', 14)}</button> <button class="btn ghost sm" data-a="del-addon" data-id="${a.id}">${ico('trash', 14)}</button></td></tr>`).join('') || '<tr><td colspan="4" class="empty">No extras yet</td></tr>'}
      </tbody></table></div>`;
  }

  // ---------- forms ----------
  function itemForm(it = {}) {
    const m = modal(`<h3>${it.id ? 'Edit item' : 'Add item'}</h3>
      <form id="f">
        <label>Name<input name="name" required value="${esc(it.name || '')}"></label>
        <div class="two"><label>Category<select name="category_id"><option value="">— none —</option>${cats.map(c => `<option value="${c.id}" ${c.id === it.category_id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>
        <label>Price (LKR)<input name="price" type="number" min="0" step="any" required value="${it.price ?? ''}"></label></div>
        <div class="card" style="padding:12px;margin:10px 0"><b>Cost of this item</b>
          <p class="muted small" style="margin:4px 0 8px">What goes into <u>one</u> ${esc(it.name || 'item')}? The cost is worked out from your inventory prices.</p>
          <div id="rec"></div>
          <button type="button" class="btn ghost sm" id="addIng">${ico('plus', 14)} Add ingredient</button>
          <label class="check" style="margin-top:10px"><input type="checkbox" name="cost_manual" ${it.cost_manual ? 'checked' : ''}> I will type the cost myself</label>
          <label id="costBox" style="${it.cost_manual ? '' : 'display:none'}">Cost of one item (LKR)<input name="cost" type="number" min="0" step="any" value="${it.cost_manual ? num(it.cost) : ''}"></label>
          <div id="costSum" class="small" style="margin-top:8px"></div></div>
        <label class="check"><input type="checkbox" name="track_stock" ${it.track_stock === false ? '' : 'checked'}> Track stock for this item</label>
        <div class="two"><label>Stock now<input name="stock" type="number" step="1" value="${it.stock ?? 0}"></label>
        <label>Low-stock alert at<input name="low_stock" type="number" min="0" step="1" value="${it.low_stock ?? 5}"></label></div>
        <label class="check"><input type="checkbox" name="allow_addons" ${it.allow_addons === false ? '' : 'checked'}> Allow extras (cheese, egg…) on this item</label>
        <label class="check"><input type="checkbox" name="active" ${it.active === false ? '' : 'checked'}> Show in POS</label>
        <div class="row end"><button type="button" class="btn ghost" data-c>Cancel</button><button class="btn">Save</button></div>
      </form>`);
    $('[data-c]', m.el).onclick = () => m.close();
    // ---- ingredients of one item (e.g. 10 g cheese + 1 bun) ----
    const rec = (it.recipe || []).map(x => ({ ...x }));
    const F = $('#f', m.el);
    const lineCost = r => { const i = invMap[r.inv_id]; if (!i) return 0; const q = convertQty(r.qty, r.unit, i.unit); return q == null ? 0 : q * num(i.cost_per_unit); };
    const recTotal = () => r2(rec.reduce((n, r) => n + lineCost(r), 0));
    function sums() {
      const manual = F.cost_manual.checked, c = manual ? num(F.cost.value) : recTotal(), price = num(F.price.value), p = price - c;
      rec.forEach((r, i) => { const el = $(`[data-lc="${i}"]`, m.el); if (el) el.textContent = lineCost(r) ? fmt(lineCost(r)) : '—'; });
      $('#costSum', m.el).innerHTML = c ? `Cost: <b>${fmt(c)}</b> · selling price ${fmt(price)} · profit <b style="color:var(--${p >= 0 ? 'ok' : 'bad'})">${fmt(p)}</b>${price ? ` (${Math.round(p / price * 100)}%)` : ''}${rec.some(r => invMap[r.inv_id] && !num(invMap[r.inv_id].cost_per_unit)) && !manual ? '<div class="muted">Some ingredients have no price yet – use "Add stock" in Inventory to set it.</div>' : ''}` : '<span class="muted">No cost set yet – add the ingredients above (or type the cost).</span>';
    }
    function drawRec() {
      $('#rec', m.el).innerHTML = rec.map((r, i) => {
        const iv = invMap[r.inv_id], units = iv ? unitChoices(iv.unit) : [];
        return `<div class="row" style="gap:6px;margin-bottom:6px;flex-wrap:nowrap" data-i="${i}">
          <select data-k="inv" style="flex:2;min-width:0"><option value="">— ingredient —</option>${inv.map(x => `<option value="${x.id}" ${x.id === r.inv_id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select>
          <input data-k="qty" type="number" min="0" step="any" value="${r.qty ?? ''}" placeholder="qty" style="flex:1;min-width:0">
          <select data-k="unit" style="flex:1;min-width:0">${units.map(u => `<option ${u.toLowerCase() === String(r.unit).toLowerCase() ? 'selected' : ''}>${esc(u)}</option>`).join('')}</select>
          <span class="muted small" style="min-width:58px;text-align:right" data-lc="${i}">—</span>
          <button type="button" class="btn ghost sm" data-k="del" title="Remove">${ico('trash', 14)}</button></div>`;
      }).join('') || (inv.length ? '' : '<div class="muted small">No ingredients in Inventory yet – add them there first.</div>');
      sums();
    }
    $('#rec', m.el).oninput = e => { const row = e.target.closest('[data-i]'); if (row && e.target.dataset.k === 'qty') { rec[row.dataset.i].qty = num(e.target.value); sums(); } };
    $('#rec', m.el).onchange = e => {
      const row = e.target.closest('[data-i]'); if (!row) return; const r = rec[row.dataset.i], k = e.target.dataset.k;
      if (k === 'inv') { r.inv_id = e.target.value; const iv = invMap[r.inv_id]; r.unit = iv ? (unitChoices(iv.unit).includes('g') ? 'g' : unitChoices(iv.unit).includes('ml') ? 'ml' : unitChoices(iv.unit)[0]) : ''; drawRec(); }
      if (k === 'unit') { r.unit = e.target.value; sums(); }
    };
    $('#rec', m.el).onclick = e => { const b = e.target.closest('[data-k="del"]'); if (b) { rec.splice(Number(b.closest('[data-i]').dataset.i), 1); drawRec(); } };
    $('#addIng', m.el).onclick = () => { if (!inv.length) return toast('Add ingredients in Inventory first', 'err'); rec.push({ inv_id: '', qty: '', unit: '' }); drawRec(); };
    F.cost_manual.onchange = () => { $('#costBox', m.el).style.display = F.cost_manual.checked ? '' : 'none'; sums(); };
    F.cost.oninput = sums; F.price.addEventListener('input', sums);
    drawRec();
    $('#f', m.el).onsubmit = wrap(async e => {
      e.preventDefault(); const f = e.target;
      const good = rec.filter(r => r.inv_id && num(r.qty) > 0).map(r => ({ inv_id: r.inv_id, qty: num(r.qty), unit: r.unit }));
      const row = { recipe: good, cost_manual: f.cost_manual.checked, cost: f.cost_manual.checked ? num(f.cost.value) : r2(good.reduce((n, r) => n + lineCost(r), 0)),
        name: f.elements.name.value.trim(), category_id: f.category_id.value || null, price: num(f.price.value), track_stock: f.track_stock.checked,
        stock: parseInt(f.stock.value || 0, 10) || 0, low_stock: parseInt(f.low_stock.value || 0, 10) || 0, allow_addons: f.allow_addons.checked, active: f.active.checked };
      const { error } = it.id ? await sb.from('items').update(row).eq('id', it.id) : await sb.from('items').insert(row);
      if (error) throw error; m.close(); toast('Saved');
    });
  }
  function catForm(c = {}) {
    const m = modal(`<h3>${c.id ? 'Edit category' : 'Add category'}</h3><form id="f">
      <label>Name<input name="name" required value="${esc(c.name || '')}"></label>
      <label>Display order (small number shows first)<input name="sort" type="number" step="1" value="${c.sort ?? cats.length + 1}"></label>
      <div class="row end"><button type="button" class="btn ghost" data-c>Cancel</button><button class="btn">Save</button></div></form>`);
    $('[data-c]', m.el).onclick = () => m.close();
    $('#f', m.el).onsubmit = wrap(async e => {
      e.preventDefault(); const f = e.target; const row = { name: f.elements.name.value.trim(), sort: parseInt(f.sort.value || 0, 10) || 0 };
      const { error } = c.id ? await sb.from('categories').update(row).eq('id', c.id) : await sb.from('categories').insert(row);
      if (error) throw error; m.close(); toast('Saved');
    });
  }
  function addonForm(a = {}) {
    const m = modal(`<h3>${a.id ? 'Edit extra' : 'Add extra'}</h3><form id="f">
      <label>Name<input name="name" required value="${esc(a.name || '')}"></label>
      <div class="two"><label>Price (LKR)<input name="price" type="number" min="0" step="any" required value="${a.price ?? ''}"></label>
      <label>Cost to you (LKR)<input name="cost" type="number" min="0" step="any" value="${num(a.cost) || ''}" placeholder="e.g. 35"></label></div>
      <label class="check"><input type="checkbox" name="active" ${a.active === false ? '' : 'checked'}> Active</label>
      <div class="row end"><button type="button" class="btn ghost" data-c>Cancel</button><button class="btn">Save</button></div></form>`);
    $('[data-c]', m.el).onclick = () => m.close();
    $('#f', m.el).onsubmit = wrap(async e => {
      e.preventDefault(); const f = e.target; const row = { name: f.elements.name.value.trim(), price: num(f.price.value), cost: num(f.cost.value), active: f.active.checked };
      const { error } = a.id ? await sb.from('addons').update(row).eq('id', a.id) : await sb.from('addons').insert(row);
      if (error) throw error; m.close(); toast('Saved');
    });
  }

  // ---------- actions ----------
  const onBody = wrap(async e => {
    const b = e.target.closest('[data-a]'); if (!b) return;
    const id = b.dataset.id, a = b.dataset.a;
    if (a === 'add-item') return itemForm();
    if (a === 'edit-item') return itemForm(items.find(x => x.id === id));
    if (a === 'add-cat') return catForm();
    if (a === 'edit-cat') return catForm(cats.find(x => x.id === id));
    if (a === 'add-addon') return addonForm();
    if (a === 'edit-addon') return addonForm(addons.find(x => x.id === id));
    if (a === 'restock') {
      const it = items.find(x => x.id === id);
      const v = await promptModal({ title: `Add stock · ${it.name}`, label: `Quantity received (current stock: ${it.stock}). Use a minus number to remove.`, type: 'number', step: '1', ok: 'Update' });
      if (v === null || !parseInt(v, 10)) return;
      const { error } = await sb.rpc('adjust_stock', { p_item: id, p_delta: parseInt(v, 10) }); if (error) throw error; toast('Stock updated');
    }
    if (a === 'del-item' && await confirmBox('Delete this item? (Old bills keep their history.) To just hide it, use Edit and untick "Show in POS".')) {
      const { error } = await sb.from('items').delete().eq('id', id); if (error) throw error; toast('Deleted');
    }
    if (a === 'del-cat' && await confirmBox('Delete this category? Items in it will become uncategorised.')) {
      const { error } = await sb.from('categories').delete().eq('id', id); if (error) throw error; toast('Deleted');
    }
    if (a === 'del-addon' && await confirmBox('Delete this extra?')) {
      const { error } = await sb.from('addons').delete().eq('id', id); if (error) throw error; toast('Deleted');
    }
  });

  await load();
  return onLive(() => { if (!document.querySelector('.modal-wrap')) load().catch(() => {}); }, 1500);
}
