// Offer / message composer shared by "QR Ordering" (send to everybody) and "Customers" (send to chosen customers).
// The form keeps its values in a plain object `f`, so a page refresh or redraw never wipes what staff typed.
import { sb } from './sb.js';
import { $, esc, fmt, errMsg } from './utils.js';

export const newOffer = () => ({ title: '', body: '', ex: 'today', sel: {}, custom: [], image: '', preview: '' });   // sel: item id -> offer price text ('' = normal price)

export function shrinkImg(file) {
  return new Promise((res, rej) => {
    const img = new Image(), u = URL.createObjectURL(file);
    img.onload = () => { const k = Math.min(1, 900 / Math.max(img.width, img.height)), c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(u); c.toBlob(b => (b ? res(b) : rej(new Error('Could not read the photo'))), 'image/jpeg', 0.82); };
    img.onerror = () => rej(new Error('Could not read the photo')); img.src = u;
  });
}

const EX = [['today', 'Until end of today'], ['1', '1 hour'], ['3', '3 hours'], ['24', '24 hours'], ['72', '3 days'], ['0', 'Until I stop it']];

const cid = () => 'c' + Math.random().toString(36).slice(2, 8);
export function customHTML(f, items, p) {
  return (f.custom || []).map(c => `<div class="row wrap" data-${p}cr="${c.id}" style="gap:6px;padding:6px 0;border-top:1px solid var(--line)">
    <input data-${p}cn placeholder="Offer name, e.g. 2 Buns + Tea" maxlength="80" value="${esc(c.name)}" style="flex:2;min-width:150px">
    <input data-${p}cp type="number" min="0" step="0.01" placeholder="Price" value="${esc(c.price)}" style="width:100px">
    <select data-${p}ci style="flex:1;min-width:130px" title="Optional: reduce the stock of this menu item when ordered"><option value="">No stock link</option>${items.map(i => `<option value="${i.id}" ${c.item_id === i.id ? 'selected' : ''}>${esc(i.name)}</option>`).join('')}</select>
    <button type="button" class="btn ghost sm" data-${p}cx aria-label="Remove">✕</button></div>`).join('');
}
export function itemsHTML(f, items, p) {
  return items.map(i => `<div class="row" style="gap:8px;padding:5px 0;border-top:1px solid var(--line)"><label style="flex:1;display:flex;gap:8px;align-items:center;margin:0;min-width:0"><input type="checkbox" data-${p}oi="${i.id}" ${i.id in f.sel ? 'checked' : ''}> <span data-noi18n>${esc(i.name)}</span> <span class="muted small">${fmt(i.price)}</span></label>
    <input type="number" min="0" step="0.01" data-${p}op="${i.id}" placeholder="Offer price" value="${esc(f.sel[i.id] ?? '')}" style="width:120px"></div>`).join('') || '<div class="muted small">No menu items</div>';
}

// p = id prefix so two forms can exist on one page
export function offerFormHTML(f, items, p = 'n') {
  return `<div class="two"><label>Title<input id="${p}ti" maxlength="60" placeholder="e.g. Today's offer" value="${esc(f.title)}"></label>
      <label>Show for<select id="${p}ex">${EX.map(([v, t]) => `<option value="${v}" ${f.ex === v ? 'selected' : ''}>${t}</option>`).join('')}</select></label></div>
    <label>Message<textarea id="${p}bo" rows="2" maxlength="300" placeholder="e.g. Hot buns only Rs. 60 until 6 PM!">${esc(f.body)}</textarea></label>
    <label>Photo (optional)<input type="file" id="${p}file" accept="image/*"></label><div id="${p}prev">${f.preview || ''}</div>
    <div style="margin:10px 0 4px"><b>🎁 Offer items &amp; offer price</b> <span class="muted small">(optional)</span></div>
    <div class="muted small" style="margin-bottom:4px">Tick the items in this offer and type the <b>offer price</b> for each (empty = normal price). The customer opens the offer and can order these items at that price.</div>
    <div id="${p}items" style="max-height:240px;overflow:auto">${itemsHTML(f, items, p)}</div>
    <div style="margin:12px 0 2px"><b>✏️ Custom offer item</b> <span class="muted small">(your own name and price – e.g. the combo in your photo)</span></div>
    <div class="muted small">Optional <b>stock link</b>: choose a menu item and its stock / ingredients go down when the offer is ordered.</div>
    <div id="${p}custom">${customHTML(f, items, p)}</div>
    <button type="button" class="btn ghost sm" id="${p}addc" style="margin-top:6px">➕ Add custom offer item</button>`;
}

// attach listeners (call once after the HTML is in the page). `busy(true/false)` disables the send button while a photo uploads.
export function bindOfferForm(root, f, p = 'n', busy = () => {}, getItems = () => []) {
  $(`#${p}ti`, root).oninput = e => { f.title = e.target.value; };
  $(`#${p}bo`, root).oninput = e => { f.body = e.target.value; };
  $(`#${p}ex`, root).onchange = e => { f.ex = e.target.value; };
  $(`#${p}items`, root).oninput = $(`#${p}items`, root).onchange = e => {
    const c = e.target.closest(`[data-${p}oi]`), n = e.target.closest(`[data-${p}op]`);
    if (c) { if (c.checked) f.sel[c.dataset[`${p}oi`]] = f.sel[c.dataset[`${p}oi`]] ?? ''; else delete f.sel[c.dataset[`${p}oi`]]; }
    if (n) { const id = n.dataset[`${p}op`]; f.sel[id] = n.value; if (n.value !== '') { const cb = root.querySelector(`[data-${p}oi="${id}"]`); if (cb) cb.checked = true; } }
  };
  const cbox = $(`#${p}custom`, root);
  $(`#${p}addc`, root).onclick = () => { f.custom.push({ id: cid(), name: '', price: '', item_id: '' }); cbox.innerHTML = customHTML(f, getItems(), p); const last = cbox.querySelector(`[data-${p}cr]:last-child [data-${p}cn]`); if (last) last.focus(); };
  cbox.oninput = cbox.onchange = e => {
    const row = e.target.closest(`[data-${p}cr]`); if (!row) return; const c = f.custom.find(x => x.id === row.dataset[`${p}cr`]); if (!c) return;
    if (e.target.matches(`[data-${p}cn]`)) c.name = e.target.value; else if (e.target.matches(`[data-${p}cp]`)) c.price = e.target.value; else if (e.target.matches(`[data-${p}ci]`)) c.item_id = e.target.value;
  };
  cbox.onclick = e => { const x = e.target.closest(`[data-${p}cx]`); if (!x) return; const id = x.closest(`[data-${p}cr]`).dataset[`${p}cr`]; f.custom = f.custom.filter(c => c.id !== id); cbox.innerHTML = customHTML(f, getItems(), p); };
  $(`#${p}file`, root).onchange = async e => {
    const file = e.target.files[0], prev = $(`#${p}prev`, root); f.image = ''; f.preview = ''; prev.textContent = ''; if (!file) return;
    busy(true); prev.textContent = 'Uploading photo…';
    try {
      const blob = await shrinkImg(file), path = `offer-${Date.now()}.jpg`;
      const { error } = await sb.storage.from('promos').upload(path, blob, { contentType: 'image/jpeg', upsert: false });
      if (error) throw error;
      f.image = sb.storage.from('promos').getPublicUrl(path).data.publicUrl;
      f.preview = `<img src="${URL.createObjectURL(blob)}" alt="" style="max-width:100%;max-height:160px;border-radius:10px;display:block;margin:6px 0"><button type="button" class="btn ghost sm" data-${p}noimg>Remove photo</button>`;
      prev.innerHTML = f.preview;
    } catch (err) { prev.innerHTML = `<div class="err">${esc(errMsg(err))}<br><small>Run sql/update-6.sql in the Supabase SQL Editor first (photo storage).</small></div>`; e.target.value = ''; }
    busy(false);
  };
  root.addEventListener('click', e => { if (e.target.closest(`[data-${p}noimg]`)) { f.image = ''; f.preview = ''; $(`#${p}prev`, root).innerHTML = ''; $(`#${p}file`, root).value = ''; } });
}

// the row to store in qr_notices (throws a readable error when something is missing)
export function offerRow(f) {
  const body = f.body.trim(); if (!body) throw new Error('Type the message first');
  let expires = null;
  if (f.ex === 'today') expires = new Date(new Date(Date.now() + 19800000).toISOString().slice(0, 10) + 'T00:00:00+05:30').getTime() + 864e5;
  else if (f.ex !== '0') expires = Date.now() + Number(f.ex) * 36e5;
  const offer = Object.entries(f.sel).map(([item_id, price]) => ({ item_id, price: price === '' || price == null ? null : Number(price) }));
  if (offer.some(o => o.price != null && !(o.price >= 0))) throw new Error('An offer price is not a valid number');
  for (const c of f.custom || []) {
    const name = String(c.name || '').trim(), price = String(c.price ?? '').trim();
    if (!name && !price) continue;
    if (!name) throw new Error('Type a name for the custom offer item');
    if (price === '' || !(Number(price) >= 0)) throw new Error(`Type a price for "${name}"`);
    offer.push({ id: c.id, name, price: Number(price), item_id: c.item_id || null });
  }
  return { title: f.title.trim(), body, image_url: f.image || null, offer_items: offer, expires_at: expires ? new Date(expires).toISOString() : null };
}
