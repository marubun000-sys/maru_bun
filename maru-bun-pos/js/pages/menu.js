import { sb } from '../sb.js';
import { $, $$, esc, fmt, num, toast, modal, ico, confirmBox, promptModal, errMsg } from '../utils.js';

export async function render(root) {
  let tab = 'items', cats = [], items = [], addons = [];

  async function load() {
    const [a, b, c] = await Promise.all([
      sb.from('categories').select('*').order('sort').order('name'),
      sb.from('items').select('*').order('name'),
      sb.from('addons').select('*').order('name'),
    ]);
    if (a.error) throw a.error; if (b.error) throw b.error; if (c.error) throw c.error;
    cats = a.data || []; items = b.data || []; addons = c.data || [];
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
  function itemsView() {
    return `<div class="toolbar"><button class="btn" data-a="add-item">${ico('plus')} Add item</button>
      ${cats.length ? '' : '<span class="muted small">Tip: create a category first (Categories tab)</span>'}</div>
      <div class="tbl-wrap"><table><thead><tr><th>Item</th><th>Category</th><th class="r">Price (LKR)</th><th>Extras</th><th class="r">Stock</th><th>Status</th><th></th></tr></thead><tbody>
      ${items.map(i => `<tr><td><b>${esc(i.name)}</b></td><td>${esc(catName(i.category_id))}</td><td class="r">${fmt(i.price)}</td>
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
      <div class="tbl-wrap"><table><thead><tr><th>Extra</th><th class="r">Price (LKR)</th><th>Status</th><th></th></tr></thead><tbody>
      ${addons.map(a => `<tr><td><b>${esc(a.name)}</b></td><td class="r">${fmt(a.price)}</td><td>${a.active ? '<span class="pill ok">Active</span>' : '<span class="pill">Hidden</span>'}</td>
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
        <label class="check"><input type="checkbox" name="track_stock" ${it.track_stock === false ? '' : 'checked'}> Track stock for this item</label>
        <div class="two"><label>Stock now<input name="stock" type="number" step="1" value="${it.stock ?? 0}"></label>
        <label>Low-stock alert at<input name="low_stock" type="number" min="0" step="1" value="${it.low_stock ?? 5}"></label></div>
        <label class="check"><input type="checkbox" name="allow_addons" ${it.allow_addons === false ? '' : 'checked'}> Allow extras (cheese, egg…) on this item</label>
        <label class="check"><input type="checkbox" name="active" ${it.active === false ? '' : 'checked'}> Show in POS</label>
        <div class="row end"><button type="button" class="btn ghost" data-c>Cancel</button><button class="btn">Save</button></div>
      </form>`);
    $('[data-c]', m.el).onclick = () => m.close();
    $('#f', m.el).onsubmit = wrap(async e => {
      e.preventDefault(); const f = e.target;
      const row = { name: f.elements.name.value.trim(), category_id: f.category_id.value || null, price: num(f.price.value), track_stock: f.track_stock.checked,
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
      <label>Price (LKR)<input name="price" type="number" min="0" step="any" required value="${a.price ?? ''}"></label>
      <label class="check"><input type="checkbox" name="active" ${a.active === false ? '' : 'checked'}> Active</label>
      <div class="row end"><button type="button" class="btn ghost" data-c>Cancel</button><button class="btn">Save</button></div></form>`);
    $('[data-c]', m.el).onclick = () => m.close();
    $('#f', m.el).onsubmit = wrap(async e => {
      e.preventDefault(); const f = e.target; const row = { name: f.elements.name.value.trim(), price: num(f.price.value), active: f.active.checked };
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
}
