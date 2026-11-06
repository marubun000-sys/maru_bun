// Customer page (opened from the shop's QR code): browse the menu, register / log in with phone + PIN, send an order.
import { sb } from './sb.js';
import { $, esc, fmt, money, ico, modal, toast, normPhone, beep } from './utils.js';
import { initI18n, getLang, setLang } from './i18n.js';

const LS = { get: k => { try { return localStorage.getItem(k) || ''; } catch { return ''; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } }, del: k => { try { localStorage.removeItem(k); } catch { /* ignore */ } } };
const root = $('#app');
let menu = null, me = null, cart = [], cat = 'all', orders = [], type = LS.get('mb_qr_type') === 'dine_in' ? 'dine_in' : 'takeaway', table = '', note = '', timer = null, loadErr = '';
try { cart = JSON.parse(LS.get('mb_qr_cart') || '[]'); } catch { cart = []; }
const saveCart = () => LS.set('mb_qr_cart', JSON.stringify(cart));
const uid = () => Math.random().toString(36).slice(2, 9);
const errText = e => (e && (e.message || e.error_description || e.error)) || 'Something went wrong';

// ---- data ----
async function loadMenu() {
  const { data, error } = await sb.rpc('qr_menu');
  if (error || !data) { loadErr = error ? errText(error) : 'Menu not available'; return false; }
  loadErr = ''; menu = data;
  // drop cart lines whose item vanished or sold out
  const ok = new Set((menu.items || []).map(i => i.id));
  cart = cart.filter(l => ok.has(l.item_id)); saveCart();
  return true;
}
async function loadMe() {
  const tok = LS.get('mb_qr_token'); me = null; if (!tok) return;
  const { data, error } = await sb.rpc('qr_me', { p_token: tok });
  if (!error && data) me = { token: tok, name: data.name, phone: data.phone };
  else if (!error) { LS.del('mb_qr_token'); }                      // token is not valid any more (not a network problem)
}
async function loadOrders() {
  if (!me) { orders = []; return; }
  const { data, error } = await sb.rpc('qr_my_orders', { p_token: me.token });
  if (!error && Array.isArray(data)) orders = data;
  checkReady();
}
const active = () => orders.filter(o => o.status === 'new' || o.status === 'confirmed');
const menuOpen = () => !menu || menu.open !== false;
const itemById = id => ((menu && menu.items) || []).find(i => i.id === id);
const inCart = id => cart.filter(l => l.item_id === id).reduce((n, l) => n + l.qty, 0);
const left = it => (it.track_stock ? it.stock - inCart(it.id) : Infinity);
const lineTotal = l => l.price * l.qty + l.addons.reduce((n, a) => n + a.price * a.qty, 0);
const cartTotal = () => cart.reduce((n, l) => n + lineTotal(l), 0);
const cartCount = () => cart.reduce((n, l) => n + l.qty, 0);

// ---- screen ----
const theme = () => (document.documentElement.dataset.theme === 'light' ? 'light' : 'dark');
function paintCtl() {
  document.querySelectorAll('[data-ctl=lang]').forEach(b => { b.textContent = getLang() === 'si' ? 'English' : 'සිංහල'; });
  document.querySelectorAll('[data-ctl=theme]').forEach(b => { b.textContent = theme() === 'light' ? '🌙' : '☀️'; b.title = theme() === 'light' ? 'Dark mode' : 'Light mode'; });
}
function setTheme(t) {
  document.documentElement.dataset.theme = t; LS.set('mb_theme', t);
  const m = document.querySelector('meta[name=theme-color]'); if (m) m.content = t === 'light' ? '#f4f4f6' : '#0b0b0c';
  paintCtl();
}
function statusOf(o) {
  if (o.status === 'new') return ['warn', '⏳ Waiting for the shop to confirm'];
  if (o.status === 'confirmed') return o.ready ? ['ok', '✅ Ready! Please come to the counter'] : ['info', '👨‍🍳 Confirmed – being prepared'];
  if (o.status === 'done') return ['ok', '🧾 Completed'];
  if (o.status === 'rejected') return ['bad', '❌ Sorry, the shop could not accept this order'];
  return ['', 'Cancelled'];
}
// ---- "your order is ready" alert (sound + vibration + notification + banner) ----
let seen = null, banner = '';                                    // seen: order id -> ready flag, null until the first load
function askNotify() { try { if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission(); } catch { /* ignore */ } }
function checkReady() {
  const now = {}; orders.forEach(o => { now[o.id] = !!(o.ready && o.status === 'confirmed'); });
  if (seen) {
    const fresh = orders.filter(o => now[o.id] && !seen[o.id]);
    if (fresh.length) {
      const codes = fresh.map(o => o.code).join(', ');
      banner = `🔔 Your order ${codes} is ready! Please come to the counter.`;
      beep('new'); try { navigator.vibrate && navigator.vibrate([300, 150, 300, 150, 500]); } catch { /* ignore */ }
      try { if ('Notification' in window && Notification.permission === 'granted') new Notification('Your order is ready!', { body: `Order ${codes} is ready. Please come to the counter.`, icon: 'assets/logo.jpg', tag: 'mb-ready' }); } catch { /* ignore */ }
      toast(banner, 'ok', 8000);
    }
  }
  seen = now;
}
function draw() {
  const shop = (menu && menu.shop) || {};
  const open = !menu || menu.open !== false;
  const items = ((menu && menu.items) || []).filter(i => cat === 'all' || i.category_id === cat);
  const cats = ((menu && menu.categories) || []).filter(c => ((menu.items) || []).some(i => i.category_id === c.id));
  root.innerHTML = `<div class="qo">
    <div class="qo-head"><img src="assets/logo.jpg" alt=""><div class="qo-title"><b>${esc(shop.name || 'Order here')}</b><span>${esc(shop.tagline || '')}</span></div>
      <span class="ctls"><button class="ctl" data-ctl="theme" data-noi18n aria-label="Dark / light mode"></button><button class="ctl" data-ctl="lang" data-noi18n></button></span></div>
    <div class="qo-me">${me ? `Hi <b data-noi18n>${esc(me.name)}</b> <a href="#" id="qout">Log out</a>` : `<a href="#" id="qin">Log in / Register</a> to send your order`}</div>
    ${loadErr ? `<div class="err">${esc(loadErr)}<br><small>If this keeps happening, ask the shop.</small></div>` : ''}
    ${menu && !open ? '<div class="qo-closed">Sorry, we are not taking QR orders right now. You can look at the menu, but please order at the counter.</div>' : ''}
    ${banner && orders.some(o => o.ready && o.status === 'confirmed') ? `<div class="qo-ready" id="qready">${esc(banner)}</div>` : ''}
    ${orders.length ? `<div class="qo-orders">${orders.slice(0, active().length ? 10 : 3).map(orderCard).join('')}</div>` : ''}
    ${cats.length ? `<div class="chips"><button class="chip ${cat === 'all' ? 'on' : ''}" data-cat="all">All</button>${cats.map(c => `<button class="chip ${cat === c.id ? 'on' : ''}" data-cat="${c.id}" data-noi18n>${esc(c.name)}</button>`).join('')}</div>` : ''}
    <div class="qo-list">${items.map(itemRow).join('') || (menu ? '<div class="empty">Nothing here right now</div>' : '<div class="empty">Loading menu…</div>')}</div>
    <p class="muted small" style="text-align:center;margin:14px 0 90px">Prices are in LKR. The final bill is made at the counter.</p>
  </div>
  ${cartCount() && open ? `<button class="qo-bar" id="qcart"><span><b>${cartCount()}</b> item${cartCount() > 1 ? 's' : ''} · View order</span><b>${money(cartTotal())}</b></button>` : ''}`;
  paintCtl();
}
function orderCard(o) {
  const [cls, txt] = statusOf(o);
  const summary = (o.items || []).map(l => `${l.qty} × ${esc(l.name)}`).join(', ');
  return `<div class="qo-order"><div class="row"><span class="qo-code" data-noi18n>${esc(o.code)}</span><div class="spacer"></div><span class="pill ${cls}">${txt}</span></div>
    <div class="muted small" style="margin-top:6px" data-noi18n>${summary}</div>
    <div class="row" style="margin-top:6px"><span class="small">${o.order_type === 'dine_in' ? 'Dine-in' : 'Takeaway'} · ${money(o.subtotal)}</span><div class="spacer"></div>
      ${o.status === 'new' ? `<button class="btn ghost sm" data-cancel="${o.id}">Cancel order</button>` : ''}</div>
    ${o.status === 'rejected' && o.reason ? `<div class="small" style="color:var(--bad);margin-top:4px">${esc(o.reason)}</div>` : ''}
    ${o.status === 'confirmed' || o.status === 'new' ? '<div class="muted small" style="margin-top:4px">Show this code at the counter when you collect.</div>' : ''}</div>`;
}
function itemRow(it) {
  const out = it.track_stock && it.stock <= 0, n = inCart(it.id), l = left(it);
  return `<div class="qo-item ${out ? 'out' : ''}"><div class="qo-info"><b data-noi18n>${esc(it.name)}</b>
      <div class="muted small">${money(it.price)}${out ? '' : it.track_stock && it.stock <= 10 ? ` · <span style="color:var(--gold)">Only ${it.stock} left</span>` : ''}</div></div>
    ${out ? '<span class="pill bad">Finished</span>' : !menuOpen() ? '' : n ? `<div class="qty" style="margin:0"><button data-dec="${it.id}" aria-label="less">${ico('minus', 14)}</button><b>${n}</b><button data-add="${it.id}" aria-label="more" ${l <= 0 ? 'disabled' : ''}>${ico('plus', 14)}</button></div>`
      : `<button class="btn sm" data-add="${it.id}">${ico('plus', 14)} Add</button>`}</div>`;
}

// ---- cart actions ----
function addLine(it, qty, addons) {
  const same = cart.find(l => l.item_id === it.id && JSON.stringify(l.addons.map(a => [a.id, a.qty])) === JSON.stringify(addons.map(a => [a.id, a.qty])));
  if (same) same.qty += qty; else cart.push({ key: uid(), item_id: it.id, name: it.name, price: Number(it.price), qty, addons });
  saveCart(); draw();
}
function addItem(id) {
  const it = itemById(id); if (!it) return;
  if (!menuOpen()) return toast('QR orders are closed right now', 'err');
  if (left(it) <= 0) return toast(`Only ${it.stock} left of ${it.name}`, 'err');
  if (it.allow_addons && (menu.addons || []).length) return extrasSheet(it);
  addLine(it, 1, []);
}
function decItem(id) {                                           // take one away (from the last line of this item)
  const idx = [...cart].reverse().findIndex(l => l.item_id === id); if (idx < 0) return;
  const l = cart[cart.length - 1 - idx]; l.qty--; if (l.qty <= 0) cart.splice(cart.indexOf(l), 1);
  saveCart(); draw();
}
function extrasSheet(it) {
  let q = 1; const ex = {};
  const m = modal(`<h3 data-noi18n>${esc(it.name)} · ${money(it.price)}</h3><div class="muted small" style="margin:-6px 0 8px">Extras</div>
    ${menu.addons.map(a => `<div class="arow"><span data-noi18n>${esc(a.name)} <span class="muted small">+ ${fmt(a.price)}</span></span>
      <span class="qty" style="margin:0"><button data-ax="-" data-id="${a.id}">${ico('minus', 14)}</button><b id="ax-${a.id}">0</b><button data-ax="+" data-id="${a.id}">${ico('plus', 14)}</button></span></div>`).join('')}
    <div class="row" style="margin:12px 0"><span>How many?</span><div class="spacer"></div><div class="qty" style="margin:0"><button id="qm">${ico('minus', 14)}</button><b id="qv">1</b><button id="qp">${ico('plus', 14)}</button></div></div>
    <div class="row end"><button class="btn ghost" id="cx">Cancel</button><button class="btn" id="ok">Add to order</button></div>`);
  m.el.querySelectorAll('[data-ax]').forEach(b => b.onclick = () => { const id = b.dataset.id; ex[id] = Math.max(0, Math.min(20, (ex[id] || 0) + (b.dataset.ax === '+' ? 1 : -1))); $('#ax-' + id, m.el).textContent = ex[id]; });
  $('#qm', m.el).onclick = () => { q = Math.max(1, q - 1); $('#qv', m.el).textContent = q; };
  $('#qp', m.el).onclick = () => { if (q + inCart(it.id) < (it.track_stock ? it.stock : 999)) q++; else toast(`Only ${it.stock} left of ${it.name}`, 'err'); $('#qv', m.el).textContent = q; };
  $('#cx', m.el).onclick = () => m.close();
  $('#ok', m.el).onclick = () => { addLine(it, q, menu.addons.filter(a => ex[a.id] > 0).map(a => ({ id: a.id, name: a.name, price: Number(a.price), qty: ex[a.id] }))); m.close(); };
}

// ---- cart sheet + placing the order ----
function cartSheet() {
  const m = modal(`<h3>Your order</h3><div id="cl"></div>
    <div class="seg" id="ty" style="display:flex;margin:10px 0"><button data-t="takeaway" style="flex:1">Takeaway</button><button data-t="dine_in" style="flex:1">Dine-in</button></div>
    <label id="tb" hidden>Table number (optional)<input id="tn" maxlength="20" value="${esc(table)}" placeholder="e.g. 5"></label>
    <label>Note for the kitchen (optional)<input id="nt" maxlength="200" value="${esc(note)}" placeholder="e.g. less spicy"></label>
    <div class="totals"><div class="grand"><span>Total</span><span id="tt"></span></div></div>
    <p class="muted small">The shop confirms your order first. Discounts, if any, are applied when the bill is made.</p>
    <div class="row end"><button class="btn ghost" id="cb">Back to menu</button><button class="btn big" id="go">Place order</button></div>`);
  const paint = () => {
    $('#cl', m.el).innerHTML = cart.map(l => `<div class="qo-line"><div class="row"><b data-noi18n>${esc(l.name)}</b><div class="spacer"></div><span>${fmt(l.price * l.qty)}</span></div>
      ${l.addons.map(a => `<div class="muted small" data-noi18n>+ ${a.qty} × ${esc(a.name)} · ${fmt(a.price * a.qty)}</div>`).join('')}
      <div class="qty" style="margin:4px 0 0"><button data-d="${l.key}">${ico('minus', 14)}</button><b>${l.qty}</b><button data-i="${l.key}">${ico('plus', 14)}</button><button class="del" data-x="${l.key}">${ico('trash', 14)}</button></div></div>`).join('') || '<div class="empty">Your order is empty</div>';
    $('#tt', m.el).textContent = money(cartTotal());
    m.el.querySelectorAll('#ty button').forEach(b => b.classList.toggle('on', b.dataset.t === type));
    $('#tb', m.el).hidden = type !== 'dine_in'; $('#go', m.el).disabled = !cart.length;
  };
  m.el.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    const l = cart.find(x => x.key === (b.dataset.d || b.dataset.i || b.dataset.x));
    if (b.dataset.t) { type = b.dataset.t; LS.set('mb_qr_type', type); }
    else if (b.dataset.d && l) { l.qty--; if (l.qty <= 0) cart.splice(cart.indexOf(l), 1); }
    else if (b.dataset.i && l) { const it = itemById(l.item_id); if (it && left(it) > 0) l.qty++; else toast(`Only ${it ? it.stock : 0} left`, 'err'); }
    else if (b.dataset.x && l) cart.splice(cart.indexOf(l), 1);
    else return;
    saveCart(); paint(); draw(); if (!cart.length) m.close();
  });
  $('#tn', m.el).oninput = e => { table = e.target.value; }; $('#nt', m.el).oninput = e => { note = e.target.value; };
  $('#cb', m.el).onclick = () => m.close();
  $('#go', m.el).onclick = async () => {
    if (!me) { const ok = await authSheet(); if (!ok) return; }
    $('#go', m.el).disabled = true;
    const res = await place();
    if (res) m.close(); else if ($('#go', m.el)) $('#go', m.el).disabled = false;
  };
  paint();
}
async function place() {
  const lines = cart.map(l => ({ item_id: l.item_id, qty: l.qty, addons: l.addons.map(a => ({ id: a.id, qty: a.qty })) }));
  const { data, error } = await sb.rpc('qr_place_order', { p_token: me.token, p_type: type, p_table: type === 'dine_in' ? table : '', p_note: note, p_lines: lines });
  if (error) {
    toast(errText(error), 'err', 6000);
    if (/log in again/i.test(errText(error))) { LS.del('mb_qr_token'); me = null; draw(); }
    await loadMenu(); draw(); return false;
  }
  cart = []; note = ''; saveCart(); await loadOrders(); askNotify(); draw();
  const m = modal(`<div style="text-align:center"><div class="qo-big">✅</div><h3>Order sent!</h3>
    <div class="muted">Your order code</div><div class="qo-code big" data-noi18n>${esc(data.code)}</div>
    <p>The shop will confirm it shortly. Keep this page open to see the status, and <b>show this code at the counter</b> when you collect.</p>
    <button class="btn big" id="k">OK</button></div>`);
  $('#k', m.el).onclick = () => m.close(); schedule();
  return true;
}

// ---- register / log in ----
function authSheet(first = 'reg') {
  return new Promise(resolve => {
    let tab = first, done = false; const end = v => { if (!done) { done = true; resolve(v); } };
    const m = modal(`<h3 id="at"></h3><div class="seg" id="atab" style="display:flex;margin-bottom:10px"><button data-t="reg" style="flex:1">Register</button><button data-t="login" style="flex:1">Log in</button></div>
      <div id="ae"></div><form id="af" autocomplete="on"><label id="nl">Your name<input id="an" maxlength="60" autocomplete="name"></label>
      <label>Phone number<input id="ap" type="tel" inputmode="tel" autocomplete="tel" placeholder="07XXXXXXXX" required></label>
      <label>PIN (4–6 digits)<input id="apin" type="password" inputmode="numeric" maxlength="6" autocomplete="off" required></label>
      <p class="muted small" id="ah"></p><button class="btn big" id="ab"></button></form>`, { onClose: () => end(false) });
    const paint = () => {
      $('#at', m.el).textContent = tab === 'reg' ? 'Register to order' : 'Log in';
      m.el.querySelectorAll('#atab button').forEach(b => b.classList.toggle('on', b.dataset.t === tab));
      $('#nl', m.el).style.display = tab === 'reg' ? '' : 'none'; $('#an', m.el).required = tab === 'reg';
      $('#ah', m.el).textContent = tab === 'reg' ? 'Choose a PIN you will remember. You use your phone number and this PIN to log in next time.' : '';
      $('#ab', m.el).textContent = tab === 'reg' ? 'Register & continue' : 'Log in & continue';
      $('#ae', m.el).innerHTML = '';
    };
    $('#atab', m.el).onclick = e => { const b = e.target.closest('[data-t]'); if (b) { tab = b.dataset.t; paint(); } };
    $('#af', m.el).onsubmit = async e => {
      e.preventDefault(); const b = $('#ab', m.el); b.disabled = true;
      const phone = normPhone($('#ap', m.el).value), pin = $('#apin', m.el).value.trim();
      const { data, error } = tab === 'reg'
        ? await sb.rpc('qr_register', { p_name: $('#an', m.el).value.trim(), p_phone: phone, p_pin: pin })
        : await sb.rpc('qr_login', { p_phone: phone, p_pin: pin });
      b.disabled = false;
      const msg = error ? errText(error) : data && data.error;
      if (msg) { $('#ae', m.el).innerHTML = `<div class="err">${esc(msg)}</div>`; return; }
      LS.set('mb_qr_token', data.token); me = { token: data.token, name: data.name, phone: data.phone };
      await loadOrders(); draw(); end(true); m.close();
    };
    paint(); $('#ap', m.el).focus();
  });
}

// ---- events ----
root.addEventListener('click', async e => {
  const t = e.target.closest('[data-add],[data-dec],[data-cat],[data-cancel],#qcart,#qin,#qout'); if (!t) return;
  if (t.dataset.add) return addItem(t.dataset.add);
  if (t.dataset.dec) return decItem(t.dataset.dec);
  if (t.dataset.cat) { cat = t.dataset.cat; return draw(); }
  if (t.id === 'qcart') return cartSheet();
  if (t.id === 'qin') { e.preventDefault(); return authSheet('login'); }
  if (t.id === 'qout') { e.preventDefault(); LS.del('mb_qr_token'); me = null; orders = []; draw(); return; }
  if (t.dataset.cancel) {
    t.disabled = true; const { error } = await sb.rpc('qr_cancel', { p_token: me.token, p_id: t.dataset.cancel });
    if (error) toast(errText(error), 'err'); await loadOrders(); draw();
  }
});
document.addEventListener('click', e => {
  const b = e.target.closest('[data-ctl=lang]'); if (b) { setLang(getLang() === 'si' ? 'en' : 'si'); paintCtl(); }
  if (e.target.closest('[data-ctl=theme]')) setTheme(theme() === 'light' ? 'dark' : 'light');
});

// keep the status + menu fresh while the page is open
function schedule() {
  clearInterval(timer);
  timer = setInterval(async () => {
    if (document.querySelector('.modal-wrap') && !document.hidden) return;
    const had = JSON.stringify(orders), hadM = JSON.stringify(menu && [menu.open, menu.items]);
    await loadOrders(); await loadMenu();
    if (!document.hidden && (had !== JSON.stringify(orders) || hadM !== JSON.stringify(menu && [menu.open, menu.items]))) draw();
    else if (document.hidden && had !== JSON.stringify(orders)) { /* alert already fired */ }
  }, 8000);
}
document.addEventListener('pointerdown', () => beep('unlock'), { once: true });   // lets the browser play the ready sound later
initI18n();
await loadMe(); await loadMenu(); await loadOrders(); draw(); schedule();
document.addEventListener('visibilitychange', async () => { if (!document.hidden) { await loadOrders(); await loadMenu(); if (!document.querySelector('.modal-wrap')) draw(); } });
