import { sb } from '../sb.js';
import { state } from '../state.js';
import { $, $$, esc, fmt, money, num, r2, toast, modal, ico, errMsg } from '../utils.js';
import { payLabel, showBillModal } from '../bill.js';

export async function render(root) {
  const [rc, ri, ra] = await Promise.all([
    sb.from('categories').select('*').order('sort').order('name'),
    sb.from('items').select('*').eq('active', true).order('name'),
    sb.from('addons').select('*').eq('active', true).order('name'),
  ]);
  if (rc.error) throw rc.error; if (ri.error) throw ri.error; if (ra.error) throw ra.error;
  const cats = rc.data || []; let items = ri.data || []; const addons = ra.data || [];
  const s = () => state.settings;

  // ---- order state ----
  let cart = [], activeCat = 'all', search = '', orderType = 'dine_in', discType = 'pct', discVal = num(s().discount_pct);
  let scOn = !!s().service_charge_enabled, pay = (s().payment_methods || ['cash'])[0] || 'cash', cash = '', placing = false;

  root.innerHTML = `<div class="pos">
    <section class="pos-left">
      <input id="q" type="search" placeholder="Search items…">
      <div class="chips" id="chips"></div>
      <div class="items" id="items"></div>
    </section>
    <aside class="pos-cart">
      <div class="seg" id="typeSeg"><button data-t="dine_in" class="on">Dine-in</button><button data-t="takeaway">Takeaway</button></div>
      <div class="two"><input id="table" placeholder="Table / Token no."><input id="cname" placeholder="Customer name"></div>
      <input id="cphone" inputmode="tel" placeholder="Customer WhatsApp (07XXXXXXXX)">
      <div class="lines" id="lines"></div>
      <input id="note" placeholder="Kitchen note (optional)">
      <div class="disc"><select id="dtype"><option value="pct">Discount %</option><option value="amt">Discount LKR</option></select><input id="dval" type="number" min="0" step="any" value="${discVal || ''}" placeholder="0"></div>
      <label class="check"><input type="checkbox" id="sc" ${scOn ? 'checked' : ''}> Service charge (${num(s().service_charge_pct)}%)</label>
      <div class="totals" id="totals"></div>
      <div class="pays" id="pays"></div>
      <div id="cashBox"></div>
      <button class="btn big" id="place">Place Order</button>
    </aside>
  </div>`;

  const lineKey = (it, ads) => it.id + '|' + ads.map(a => a.id).sort().join(',');
  const qtyInCart = id => cart.filter(l => l.item_id === id).reduce((n, l) => n + l.qty, 0);
  const stockLeft = it => (it.track_stock ? it.stock - qtyInCart(it.id) : Infinity);

  // ---- calculations ----
  function calc() {
    const sub = r2(cart.reduce((n, l) => n + l.unit * l.qty, 0));
    let disc = discType === 'pct' ? sub * Math.min(100, Math.max(0, discVal)) / 100 : Math.min(Math.max(0, discVal), sub);
    disc = r2(disc);
    const after = sub - disc;
    const pct = num(s().service_charge_pct);
    const sc = scOn ? r2(after * pct / 100) : 0;
    return { sub, disc, sc, pct: scOn ? pct : 0, total: r2(after + sc) };
  }

  // ---- renderers ----
  function renderChips() {
    $('#chips').innerHTML = [{ id: 'all', name: 'All' }, ...cats].map(c => `<button class="chip ${c.id === activeCat ? 'on' : ''}" data-c="${c.id}">${esc(c.name)}</button>`).join('');
  }
  function renderItems() {
    const list = items.filter(i => (activeCat === 'all' || i.category_id === activeCat) && i.name.toLowerCase().includes(search));
    $('#items').innerHTML = list.length ? list.map(i => {
      const left = stockLeft(i), out = i.track_stock && left <= 0;
      const st = i.track_stock ? `<div class="st ${out ? 'out' : left <= i.low_stock ? 'low' : ''}">${out ? 'Out of stock' : 'Stock: ' + left}</div>` : '';
      return `<button class="item ${out ? 'out' : ''}" data-i="${i.id}"><div class="n">${esc(i.name)}</div>${st}<div class="p">${fmt(i.price)}</div></button>`;
    }).join('') : '<div class="empty">No items. Add some in Menu Management.</div>';
  }
  function renderLines() {
    $('#lines').innerHTML = cart.length ? cart.map((l, idx) => `<div class="line">
        <div class="nm">${esc(l.name)}</div><div class="pr">${fmt(l.unit * l.qty)}</div>
        ${l.addons.length ? `<div class="ad">+ ${l.addons.map(a => esc(a.name)).join(', ')}</div>` : ''}
        <div class="qty"><button data-a="dec" data-x="${idx}" aria-label="less">${ico('minus', 14)}</button><b>${l.qty}</b><button data-a="inc" data-x="${idx}" aria-label="more">${ico('plus', 14)}</button>
        <span class="muted small">${fmt(l.unit)} each</span><button class="del" data-a="del" data-x="${idx}" aria-label="remove" style="background:none;border:0;width:auto">${ico('trash', 16)}</button></div>
      </div>`).join('') : '<div class="empty small">Tap items to add to the order</div>';
  }
  function renderTotals() {
    const c = calc();
    $('#totals').innerHTML = `<div><span>Subtotal</span><span>${fmt(c.sub)}</span></div>
      ${c.disc > 0 ? `<div><span>Discount</span><span>- ${fmt(c.disc)}</span></div>` : ''}
      ${c.sc > 0 ? `<div><span>Service charge (${c.pct}%)</span><span>${fmt(c.sc)}</span></div>` : ''}
      <div class="grand"><span>Total</span><span>${money(c.total)}</span></div>`;
    $('#place').textContent = `Place Order · ${money(c.total)}`;
    $('#place').disabled = !cart.length || placing;
    renderChange();
  }
  function renderPays() {
    const ms = (s().payment_methods && s().payment_methods.length ? s().payment_methods : ['cash']);
    if (!ms.includes(pay)) pay = ms[0];
    $('#pays').innerHTML = ms.map(m => `<button data-p="${m}" class="${m === pay ? 'on' : ''}">${payLabel(m)}</button>`).join('');
    $('#cashBox').innerHTML = pay === 'cash' ? `<label style="margin:0">Cash received (LKR)<input id="cash" type="number" min="0" step="any" inputmode="decimal" value="${esc(cash)}" placeholder="0.00"></label>
      <div class="quick" id="quick"></div><div class="change" id="change"></div>` : '';
    renderQuick(); renderChange();
  }
  function renderQuick() {
    const q = $('#quick'); if (!q) return;
    const t = calc().total;
    const notes = [...new Set([t, 500, 1000, 2000, 5000].filter(v => v >= t && v > 0))].sort((a, b) => a - b).slice(0, 5);
    q.innerHTML = notes.map((v, i) => `<button data-q="${v}">${v === t && i === 0 ? 'Exact ' : ''}${fmt(v)}</button>`).join('');
  }
  function renderChange() {
    renderQuick();
    const el = $('#change'); if (!el) return;
    const t = calc().total, got = num(cash);
    if (!cash || !t) { el.textContent = ''; el.className = 'change'; return; }
    if (got >= t) { el.className = 'change ok'; el.textContent = `Balance to give: ${money(got - t)}`; }
    else { el.className = 'change bad'; el.textContent = `Short by ${money(t - got)}`; }
  }

  // ---- cart actions ----
  function addLine(it, ads, qty = 1) {
    if (it.track_stock && qty > stockLeft(it)) { toast(`Only ${Math.max(0, stockLeft(it))} left in stock for ${it.name}`, 'err'); return false; }
    const key = lineKey(it, ads), ex = cart.find(l => l.key === key);
    if (ex) ex.qty += qty;
    else cart.push({ key, item_id: it.id, name: it.name, unit: r2(num(it.price) + ads.reduce((n, a) => n + num(a.price), 0)), qty, addons: ads.map(a => ({ id: a.id, name: a.name, price: num(a.price) })) });
    refreshAll(); return true;
  }
  function pickItem(it) {
    if (it.track_stock && stockLeft(it) <= 0) return toast(`${it.name} is out of stock`, 'err');
    if (!it.allow_addons || !addons.length) return addLine(it, []);
    let q = 1;
    const m = modal(`<h3>${esc(it.name)} <span class="muted">· ${money(it.price)}</span></h3>
      <div class="muted small" style="margin-bottom:8px">Extras</div>
      <div class="addon-list">${addons.map(a => `<label><span><input type="checkbox" value="${a.id}"> ${esc(a.name)}</span><span>+ ${fmt(a.price)}</span></label>`).join('')}</div>
      <div class="row" style="margin-top:10px"><span class="muted">Quantity</span><div class="spacer"></div>
        <div class="qty" style="margin:0"><button id="qm">${ico('minus', 14)}</button><b id="qv">1</b><button id="qp">${ico('plus', 14)}</button></div></div>
      <div class="row end"><button class="btn ghost" id="cx">Cancel</button><button class="btn" id="ok">Add to order</button></div>`);
    $('#qm', m.el).onclick = () => { q = Math.max(1, q - 1); $('#qv', m.el).textContent = q; };
    $('#qp', m.el).onclick = () => { q++; $('#qv', m.el).textContent = q; };
    $('#cx', m.el).onclick = () => m.close();
    $('#ok', m.el).onclick = () => {
      const ads = $$('input:checked', m.el).map(c => addons.find(a => a.id === c.value));
      if (addLine(it, ads, q)) m.close();
    };
  }
  function refreshAll() { renderItems(); renderLines(); renderTotals(); }

  // ---- place order ----
  async function place() {
    if (placing || !cart.length) return;
    const c = calc(), got = num(cash);
    if (pay === 'cash' && cash !== '' && got < c.total) return toast(`Cash received is less than the total (short ${money(c.total - got)})`, 'err');
    placing = true; $('#place').disabled = true;
    const order = {
      id: crypto.randomUUID(),
      order_type: orderType, table_no: $('#table').value.trim(), customer_name: $('#cname').value.trim(), customer_phone: $('#cphone').value.trim(),
      note: $('#note').value.trim(),
      items: cart.map(l => ({ item_id: l.item_id, name: l.name, qty: l.qty, unit: l.unit, addons: l.addons })),
      subtotal: c.sub, discount: c.disc, discount_label: c.disc > 0 ? (discType === 'pct' ? `${discVal}%` : 'LKR') : '',
      service_pct: c.pct, service_charge: c.sc, total: c.total, payment_method: pay,
      cash_received: pay === 'cash' ? got : 0, change_given: pay === 'cash' && got > c.total ? r2(got - c.total) : 0,
      cashier: s().cashier || '', status: 'pending',
    };
    try {
      state.own.add(`${order.id}:pending`); // set before saving so we don't alert ourselves
      const { data, error } = await sb.from('orders').insert(order).select().single();
      if (error) { state.own.delete(`${order.id}:pending`); throw error; }
      // reduce stock
      const used = {};
      cart.forEach(l => { used[l.item_id] = (used[l.item_id] || 0) + l.qty; });
      await Promise.all(Object.entries(used).map(([id, q]) => sb.rpc('adjust_stock', { p_item: id, p_delta: -q })));
      const { data: fresh } = await sb.from('items').select('*').eq('active', true).order('name');
      if (fresh) items = fresh;
      resetOrder();
      window.dispatchEvent(new Event('orders-changed'));
      toast('Order sent to kitchen');
      showBillModal(data, { title: `Order placed · Bill ${'MB-' + String(data.bill_no).padStart(5, '0')}` });
    } catch (e) { console.error(e); toast('Could not save order: ' + errMsg(e), 'err', 6000); }
    placing = false; renderTotals();
  }
  function resetOrder() {
    cart = []; cash = ''; discType = 'pct'; discVal = num(s().discount_pct); scOn = !!s().service_charge_enabled;
    ['#table', '#cname', '#cphone', '#note'].forEach(id => { $(id).value = ''; });
    $('#dtype').value = 'pct'; $('#dval').value = discVal || ''; $('#sc').checked = scOn;
    refreshAll(); renderPays();
  }

  // ---- events ----
  const R = root;
  $('#q', R).oninput = e => { search = e.target.value.toLowerCase().trim(); renderItems(); };
  $('#chips', R).onclick = e => { const b = e.target.closest('[data-c]'); if (!b) return; activeCat = b.dataset.c; renderChips(); renderItems(); };
  $('#items', R).onclick = e => { const b = e.target.closest('[data-i]'); if (!b) return; pickItem(items.find(i => i.id === b.dataset.i)); };
  $('#typeSeg', R).onclick = e => { const b = e.target.closest('[data-t]'); if (!b) return; orderType = b.dataset.t; $$('#typeSeg button', R).forEach(x => x.classList.toggle('on', x === b)); };
  $('#lines', R).onclick = e => {
    const b = e.target.closest('[data-a]'); if (!b) return;
    const l = cart[+b.dataset.x]; if (!l) return;
    if (b.dataset.a === 'del') cart.splice(+b.dataset.x, 1);
    else if (b.dataset.a === 'dec') { l.qty--; if (l.qty <= 0) cart.splice(+b.dataset.x, 1); }
    else if (b.dataset.a === 'inc') { const it = items.find(i => i.id === l.item_id); if (it && it.track_stock && stockLeft(it) <= 0) return toast('No more stock', 'err'); l.qty++; }
    refreshAll();
  };
  $('#dtype', R).onchange = e => { discType = e.target.value; renderTotals(); };
  $('#dval', R).oninput = e => { discVal = num(e.target.value); renderTotals(); };
  $('#sc', R).onchange = e => { scOn = e.target.checked; renderTotals(); };
  $('#pays', R).onclick = e => { const b = e.target.closest('[data-p]'); if (!b) return; pay = b.dataset.p; renderPays(); };
  $('#cashBox', R).addEventListener('input', e => { if (e.target.id === 'cash') { cash = e.target.value; renderChange(); } });
  $('#cashBox', R).addEventListener('click', e => { const b = e.target.closest('[data-q]'); if (!b) return; cash = String(b.dataset.q); $('#cash').value = cash; renderChange(); });
  $('#place', R).onclick = place;

  const onSettings = () => { $('#sc').parentElement.lastChild.textContent = ` Service charge (${num(s().service_charge_pct)}%)`; renderPays(); renderTotals(); };
  window.addEventListener('settings-changed', onSettings);

  renderChips(); renderItems(); renderLines(); renderPays(); renderTotals();
  return () => window.removeEventListener('settings-changed', onSettings);
}
