import { sb } from '../sb.js';
import { state, getCashier, setCashier } from '../state.js';
import { $, $$, esc, fmt, money, num, r2, toast, modal, ico, errMsg, onLive, lineTotal, normPhone, promptModal, itemCost, invMapOf, recipeUse, useDeltas } from '../utils.js';
import { payLabel, showBillModal, printHTML, billHTML, kotHTML } from '../bill.js';

export async function render(root) {
  const [rc, ri, ra] = await Promise.all([
    sb.from('categories').select('*').order('sort').order('name'),
    sb.from('items').select('*').eq('active', true).order('name'),
    sb.from('addons').select('*').eq('active', true).order('name'),
  ]);
  if (rc.error) throw rc.error; if (ri.error) throw ri.error; if (ra.error) throw ra.error;
  let cats = rc.data || []; let items = ri.data || []; const addons = ra.data || [];
  const s = () => state.settings;

  // ---- order state ----
  const PK = 'mb_pos_prefs';
  let prefs = { kitchen: true, kot: false, bill: false };
  try { prefs = { ...prefs, ...JSON.parse(localStorage.getItem(PK) || '{}') }; } catch { /* ignore */ }
  const savePrefs = () => { try { localStorage.setItem(PK, JSON.stringify(prefs)); } catch { /* ignore */ } };
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
      <div class="two"><input id="table" placeholder="Table no. (optional)"><input id="cname" placeholder="Customer name"></div>
      <input id="cphone" inputmode="tel" placeholder="Customer WhatsApp (07XXXXXXXX)">
      <div class="lines" id="lines"></div>
      <input id="note" placeholder="Kitchen note (optional)">
      <div class="disc"><select id="dtype"><option value="pct">Discount %</option><option value="amt">Discount LKR</option></select><input id="dval" type="number" min="0" step="any" value="${discVal || ''}" placeholder="0"></div>
      <label class="check"><input type="checkbox" id="sc" ${scOn ? 'checked' : ''}> Service charge (${num(s().service_charge_pct)}%)</label>
      <div class="opts">
        <label class="check"><input type="checkbox" id="oKitchen" ${prefs.kitchen ? 'checked' : ''}> Send to kitchen</label>
        <label class="check"><input type="checkbox" id="oKot" ${prefs.kot ? 'checked' : ''}> Print kitchen slip</label>
        <label class="check"><input type="checkbox" id="oBill" ${prefs.bill ? 'checked' : ''}> Print customer bill</label>
      </div>
      <div class="totals" id="totals"></div>
      <div class="pays" id="pays"></div>
      <div id="cashBox"></div>
      <button class="btn big" id="place">Place Order</button>
    </aside>
  </div>`;

  let uidn = 0;
  // ---- unsent order is kept (even if you open another tab or refresh) until Place Order ----
  const DK = 'mb_pos_draft';
  const saveDraft = () => {
    try {
      if (!cart.length && !['#table', '#cname', '#cphone', '#note'].some(i => $(i) && $(i).value.trim())) return localStorage.removeItem(DK);
      localStorage.setItem(DK, JSON.stringify({ cart, orderType, discType, discVal, scOn, pay, cash, table: $('#table').value, cname: $('#cname').value, cphone: $('#cphone').value, note: $('#note').value }));
    } catch { /* ignore */ }
  };
  const clearDraft = () => { try { localStorage.removeItem(DK); } catch { /* ignore */ } };
  const lineKey = (it, ads) => ads.length ? it.id + '|x' + (++uidn) : it.id; // lines with extras never merge
  const qtyInCart = id => cart.filter(l => l.item_id === id).reduce((n, l) => n + l.qty, 0);
  const stockLeft = it => (it.track_stock ? it.stock - qtyInCart(it.id) : Infinity);

  // ---- calculations ----
  function calc() {
    const sub = r2(cart.reduce((n, l) => n + lineTotal(l), 0));
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
        <div class="qty"><button data-a="dec" data-x="${idx}" aria-label="less">${ico('minus', 14)}</button><b>${l.qty}</b><button data-a="inc" data-x="${idx}" aria-label="more">${ico('plus', 14)}</button>
        <span class="muted small">${fmt(l.unit)} each</span><button class="del" data-a="del" data-x="${idx}" aria-label="remove" style="background:none;border:0;width:auto">${ico('trash', 16)}</button></div>
        ${l.addons.map((a, j) => `<div class="xrow"><span class="xn">+ ${esc(a.name)} <span class="muted small">${fmt(a.price)}</span></span>
          <span class="qty xq"><button data-a="xdec" data-x="${idx}" data-j="${j}" aria-label="less">${ico('minus', 12)}</button><b>${a.qty}</b><button data-a="xinc" data-x="${idx}" data-j="${j}" aria-label="more">${ico('plus', 12)}</button></span>
          <span class="xp">${fmt(a.price * a.qty)}</span></div>`).join('')}
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
    else cart.push({ key, item_id: it.id, name: it.name, unit: num(it.price), qty, addons: ads.map(a => ({ id: a.id, name: a.name, price: num(a.price), qty: a.qty || 1 })) });
    refreshAll(); return true;
  }
  function pickItem(it) {
    if (it.track_stock && stockLeft(it) <= 0) return toast(`${it.name} is out of stock`, 'err');
    if (!it.allow_addons || !addons.length) return addLine(it, []);
    let q = 1;
    const m = modal(`<h3>${esc(it.name)} <span class="muted">· ${money(it.price)}</span></h3>
      <div class="muted small" style="margin-bottom:8px">Extras</div>
      <div class="addon-list">${addons.map(a => `<div class="arow"><span>${esc(a.name)} <span class="muted small">+ ${fmt(a.price)}</span></span>
        <span class="qty" style="margin:0"><button data-ax="-" data-id="${a.id}" aria-label="less">${ico('minus', 14)}</button><b id="ax-${a.id}">0</b><button data-ax="+" data-id="${a.id}" aria-label="more">${ico('plus', 14)}</button></span></div>`).join('')}</div>
      <div class="row" style="margin-top:10px"><span class="muted">Quantity</span><div class="spacer"></div>
        <div class="qty" style="margin:0"><button id="qm">${ico('minus', 14)}</button><b id="qv">1</b><button id="qp">${ico('plus', 14)}</button></div></div>
      <div class="row end"><button class="btn ghost" id="cx">Cancel</button><button class="btn" id="ok">Add to order</button></div>`);
    const xq = {};
    m.el.querySelectorAll('[data-ax]').forEach(b => b.onclick = () => {
      const id = b.dataset.id; xq[id] = Math.max(0, (xq[id] || 0) + (b.dataset.ax === '+' ? 1 : -1));
      $('#ax-' + id, m.el).textContent = xq[id];
    });
    $('#qm', m.el).onclick = () => { q = Math.max(1, q - 1); $('#qv', m.el).textContent = q; };
    $('#qp', m.el).onclick = () => { q++; $('#qv', m.el).textContent = q; };
    $('#cx', m.el).onclick = () => m.close();
    $('#ok', m.el).onclick = () => {
      const ads = addons.filter(a => xq[a.id] > 0).map(a => ({ ...a, qty: xq[a.id] }));
      if (addLine(it, ads, q)) m.close();
    };
  }
  function refreshAll() { renderItems(); renderLines(); renderTotals(); saveDraft(); }

  // ---- place order ----
  async function place() {
    if (placing || !cart.length) return;
    if (!getCashier()) {   // every bill must show who served the customer
      const v = await promptModal({ title: 'Cashier name', label: 'Who is at the counter? (printed on the bill)', value: '' });
      if (!v || !v.trim()) return toast('Enter the cashier name to place the order', 'err');
      setCashier(v);
    }
    const c = calc(), got = num(cash);
    if (pay === 'cash' && cash !== '' && got < c.total) return toast(`Cash received is less than the total (short ${money(c.total - got)})`, 'err');
    placing = true; $('#place').disabled = true;
    // remember what each line cost us today, so the profit on this bill never changes later
    let invm = null; try { const ri = await sb.from('inventory').select('*'); if (!ri.error) invm = invMapOf(ri.data); } catch { /* sale still goes through, just without cost */ }
    const withCost = l => ({ item_id: l.item_id, name: l.name, qty: l.qty, unit: l.unit,
      ...(invm ? { cost: itemCost(items.find(x => x.id === l.item_id) || {}, invm), use: recipeUse(items.find(x => x.id === l.item_id), invm) } : {}),
      addons: l.addons.map(a => ({ ...a, ...(invm ? { cost: num((addons.find(x => x.id === a.id) || {}).cost) } : {}) })) });
    const order = {
      id: crypto.randomUUID(),
      order_type: orderType, table_no: $('#table').value.trim(), customer_name: $('#cname').value.trim(), customer_phone: $('#cphone').value.trim(),
      note: $('#note').value.trim(),
      items: cart.map(withCost),
      subtotal: c.sub, discount: c.disc, discount_label: c.disc > 0 ? (discType === 'pct' ? `${discVal}%` : 'LKR') : '',
      service_pct: c.pct, service_charge: c.sc, total: c.total, payment_method: pay,
      cash_received: pay === 'cash' ? got : 0, change_given: pay === 'cash' && got > c.total ? r2(got - c.total) : 0,
      cashier: getCashier(), status: prefs.kitchen ? 'pending' : 'served', served_at: prefs.kitchen ? null : new Date().toISOString(),
    };
    if (!prefs.kitchen) order.created_at = order.served_at; // same instant = "saved straight as served" (no kitchen alerts)
    try {
      state.own.add(prefs.kitchen ? `${order.id}:pending` : `${order.id}:served:${new Date(order.served_at).getTime()}`); // set before saving so we don't alert ourselves
      const { data, error } = await sb.from('orders').insert(order).select().single();
      if (error) { state.own.clear(); throw error; }
      // remember the customer (phone number) in the database - never blocks the sale
      if (normPhone(order.customer_phone)) {
        try { await sb.rpc('upsert_customer', { p_phone: normPhone(order.customer_phone), p_name: order.customer_name, p_total: order.total }); } catch (e) { console.warn('customer not saved', e); }
      }
      // reduce stock
      const used = {};
      cart.forEach(l => { used[l.item_id] = (used[l.item_id] || 0) + l.qty; });
      await Promise.all(Object.entries(used).map(([id, q]) => sb.rpc('adjust_stock', { p_item: id, p_delta: -q })));
      // ingredients used (from each item's recipe: pcs / kg / g ...) come out of the inventory - never blocks the sale
      try {
        const ch = useDeltas(order.items.map(l => ({ use: l.use, times: l.qty })), -1);
        if (ch.length) { const { error: ie } = await sb.rpc('adjust_inventory_bulk', { p_changes: ch }); if (ie) console.warn('inventory not reduced (run sql/update-9.sql)', ie); }
      } catch (e) { console.warn('inventory not reduced', e); }
      const { data: fresh } = await sb.from('items').select('*').eq('active', true).order('name');
      if (fresh) items = fresh;
      resetOrder();
      window.dispatchEvent(new Event('orders-changed'));
      toast(prefs.kitchen ? 'Order sent to kitchen' : 'Order saved');
      const slips = [];
      if (prefs.kot) slips.push(kotHTML(data));
      if (prefs.bill) slips.push(billHTML(data));
      if (slips.length) printHTML(...slips);
      showBillModal(data, { title: `Order placed · Bill ${'MB-' + String(data.bill_no).padStart(5, '0')}`, keep: true });
    } catch (e) { console.error(e); toast('Could not save order: ' + errMsg(e), 'err', 6000); }
    placing = false; renderTotals();
  }
  function resetOrder() {
    clearDraft(); cart = []; cash = ''; discType = 'pct'; discVal = num(s().discount_pct); scOn = !!s().service_charge_enabled;
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
    if (b.dataset.a === 'xinc' || b.dataset.a === 'xdec') {
      const a = l.addons[+b.dataset.j]; if (!a) return;
      a.qty += b.dataset.a === 'xinc' ? 1 : -1;
      if (a.qty <= 0) l.addons.splice(+b.dataset.j, 1);
      return refreshAll();
    }
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
  $('#oKitchen', R).onchange = e => { prefs.kitchen = e.target.checked; savePrefs(); };
  $('#oKot', R).onchange = e => { prefs.kot = e.target.checked; savePrefs(); };
  $('#oBill', R).onchange = e => { prefs.bill = e.target.checked; savePrefs(); };
  $('#place', R).onclick = place;
  // returning customer? fill the name from the saved customers
  $('#cphone', R).onchange = async e => {
    const p = normPhone(e.target.value); if (!p) return;
    try {
      const { data } = await sb.from('customers').select('*').eq('phone', p).maybeSingle();
      if (data) { if (!$('#cname').value.trim() && data.name) $('#cname').value = data.name; toast(`Returning customer: ${data.name || e.target.value} (${data.visits} visits)`); }
    } catch { /* table may not exist yet */ }
  };

  const onSettings = () => { $('#sc').parentElement.lastChild.textContent = ` Service charge (${num(s().service_charge_pct)}%)`; renderPays(); renderTotals(); };
  window.addEventListener('settings-changed', onSettings);

  // menu / stock changed on another device (or after another counter's sale) -> refresh the item list, keep the cart
  async function reloadCatalog() {
    if (placing) return;
    const [a, b, c] = await Promise.all([
      sb.from('categories').select('*').order('sort').order('name'),
      sb.from('items').select('*').eq('active', true).order('name'),
      sb.from('addons').select('*').eq('active', true).order('name'),
    ]);
    if (a.error || b.error || c.error) return;
    cats = a.data || []; items = b.data || []; addons.length = 0; (c.data || []).forEach(x => addons.push(x));
    if (activeCat !== 'all' && !cats.some(x => x.id === activeCat)) activeCat = 'all';
    renderChips(); renderItems(); renderTotals();
  }
  const offLive = onLive(reloadCatalog, 1200);

  // bring back an unfinished order
  try {
    const d = JSON.parse(localStorage.getItem(DK) || 'null');
    if (d) {
      cart = (d.cart || []).filter(l => items.some(i => i.id === l.item_id));
      cart.forEach(l => { if (l.key && l.key.includes('|x')) uidn = Math.max(uidn, parseInt(l.key.split('|x')[1], 10) || 0); });
      orderType = d.orderType || 'dine_in'; discType = d.discType || 'pct'; discVal = num(d.discVal); scOn = !!d.scOn; pay = d.pay || pay; cash = d.cash || '';
      $('#table').value = d.table || ''; $('#cname').value = d.cname || ''; $('#cphone').value = d.cphone || ''; $('#note').value = d.note || '';
      $('#dtype').value = discType; $('#dval').value = discVal || ''; $('#sc').checked = scOn;
      $$('#typeSeg button', R).forEach(x => x.classList.toggle('on', x.dataset.t === orderType));
    }
  } catch { /* ignore */ }
  ['#table', '#cname', '#cphone', '#note'].forEach(i => $(i, R).addEventListener('input', saveDraft));
  $('#dval', R).addEventListener('input', saveDraft); $('#dtype', R).addEventListener('change', saveDraft); $('#sc', R).addEventListener('change', saveDraft);
  $('#typeSeg', R).addEventListener('click', saveDraft); $('#pays', R).addEventListener('click', saveDraft);
  $('#cashBox', R).addEventListener('input', saveDraft);

  renderChips(); renderItems(); renderLines(); renderPays(); renderTotals();
  return () => { window.removeEventListener('settings-changed', onSettings); offLive(); };
}
