import { sb, DEMO } from './sb.js';
import { state, loadSettings, saveSettings } from './state.js';
import { $, $$, esc, ico, toast, beep, billNo, promptModal, errMsg, nowLabel, dstr, okey, noKitchen } from './utils.js';
import { initI18n, setLang, getLang } from './i18n.js';
import * as pos from './pages/pos.js';
import * as orders from './pages/orders.js';
import * as customers from './pages/customers.js';
import * as dashboard from './pages/dashboard.js';
import * as kitchen from './pages/kitchen.js';
import * as menu from './pages/menu.js';
import * as inventory from './pages/inventory.js';
import * as review from './pages/review.js';
import * as settings from './pages/settings.js';

const PAGES = [
  { id: 'pos', label: 'POS', icon: 'cart', mod: pos },
  { id: 'orders', label: 'Orders & Billing', icon: 'receipt', mod: orders },
  { id: 'customers', label: 'Customers', icon: 'users', mod: customers },
  { id: 'dashboard', label: 'Dashboard', icon: 'dashboard', mod: dashboard },
  { id: 'kitchen', label: 'Kitchen Display', icon: 'kitchen', mod: kitchen },
  { id: 'menu', label: 'Menu Management', icon: 'menu', mod: menu },
  { id: 'inventory', label: 'Inventory', icon: 'inventory', mod: inventory },
  { id: 'review', label: 'Google Review', icon: 'star', mod: review },
  { id: 'settings', label: 'Settings & Security', icon: 'settings', mod: settings },
];

const app = $('#app');
let cleanup = null, chan = null, chan2 = null, routeToken = 0, timers = [];
const store = { get: (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } } };

// =====================================================================
//  Theme (dark / light) + language buttons
// =====================================================================
const themeNow = () => document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
function setTheme(t) {
  document.documentElement.dataset.theme = t; store.set('mb_theme', t);
  const m = document.querySelector('meta[name=theme-color]'); if (m) m.content = t === 'light' ? '#f4f4f6' : '#0b0b0c';
  paintCtl();
}
function ctlHTML() {
  return `<span class="ctls"><button class="ctl" data-ctl="theme" title="Dark / Light"></button><button class="ctl" data-ctl="lang" data-noi18n title="English / සිංහල"></button></span>`;
}
function paintCtl() {
  $$('[data-ctl=theme]').forEach(b => { b.innerHTML = themeNow() === 'dark' ? ico('sun', 17) : ico('moon', 17); });
  $$('[data-ctl=lang]').forEach(b => { b.textContent = getLang() === 'si' ? 'English' : 'සිංහල'; });
}
document.addEventListener('click', e => {
  const b = e.target.closest('[data-ctl]'); if (!b) return;
  if (b.dataset.ctl === 'theme') setTheme(themeNow() === 'dark' ? 'light' : 'dark');
  else { setLang(getLang() === 'si' ? 'en' : 'si'); paintCtl(); }
});

// =====================================================================
//  Login (+ 2-step verification)
// =====================================================================
function loginShell(inner) {
  app.innerHTML = `<div class="login-wrap"><div class="login-ctl">${ctlHTML()}</div><div class="login">
    <img src="assets/logo.jpg" alt="logo"><h1>${esc(state.settings.shop_name)}</h1>
    <div class="tag">${esc(state.settings.tagline)}</div>${inner}
    ${DEMO ? `<div class="demo-note">DEMO MODE (no Supabase keys yet)<br>Login: <b>admin@demo.lk</b> / <b>admin123</b></div>` : ''}
  </div></div>`;
  paintCtl();
}

function showLogin() {
  stopLive();
  loginShell(`<div id="err"></div>
    <form id="lf">
      <label>Email<input type="email" id="em" autocomplete="username" required></label>
      <label>Password<input type="password" id="pw" autocomplete="current-password" required></label>
      <button class="btn big" id="lb">Sign in</button>
    </form>`);
  $('#lf').onsubmit = async e => {
    e.preventDefault();
    const btn = $('#lb'); btn.disabled = true;
    const { error } = await sb.auth.signInWithPassword({ email: $('#em').value.trim(), password: $('#pw').value });
    btn.disabled = false;
    if (error) { $('#err').innerHTML = `<div class="err">${esc(error.message)}</div>`; return; }
    boot();
  };
}

async function showMfa() {
  loginShell(`<div id="err"></div>
    <p class="muted" style="text-align:center">2-step verification<br>Enter the 6-digit code from your authenticator app</p>
    <form id="mf"><label>Code<input id="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" required style="text-align:center;font-size:22px;letter-spacing:6px"></label>
    <button class="btn big">Verify</button></form>
    <p style="text-align:center"><a href="#" id="so" class="muted">Sign out</a></p>`);
  $('#code').focus();
  $('#so').onclick = async e => { e.preventDefault(); await sb.auth.signOut(); showLogin(); };
  $('#mf').onsubmit = async e => {
    e.preventDefault();
    const { data: f } = await sb.auth.mfa.listFactors();
    const factor = (f && f.totp && f.totp[0]) || null;
    if (!factor) { $('#err').innerHTML = '<div class="err">No authenticator found.</div>'; return; }
    const { error } = await sb.auth.mfa.challengeAndVerify({ factorId: factor.id, code: $('#code').value.trim() });
    if (error) { $('#err').innerHTML = `<div class="err">${esc(error.message)}</div>`; $('#code').select(); return; }
    boot();
  };
}

// =====================================================================
//  Boot
// =====================================================================
async function boot() {
  const { data } = await sb.auth.getSession();
  const session = data && data.session;
  if (!session) { try { await loadSettings(); } catch { /* not allowed before login */ } return showLogin(); }
  const { data: aal } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal && aal.nextLevel === 'aal2' && aal.currentLevel !== 'aal2') return showMfa();
  state.user = session.user;
  await loadSettings();
  startApp();
}

// =====================================================================
//  Shell
// =====================================================================
const role = () => store.get('mb_role', 'both');

function startApp() {
  app.innerHTML = `<div class="shell">
    <aside class="side">
      <div class="brand"><img src="assets/logo.jpg" alt=""><div><b id="brandName"></b><span>POS System</span></div></div>
      <nav class="nav">${PAGES.map(p => `<a data-p="${p.id}" href="#/${p.id}">${ico(p.icon)}<span>${p.label}</span>${p.id === 'kitchen' ? '<em class="badge" id="kBadge" hidden>0</em>' : ''}</a>`).join('')}</nav>
      <div class="side-foot">${esc(state.user.email || '')}<br><a href="#" id="logout" style="color:var(--gold)">Sign out</a></div>
    </aside>
    <main class="main">
      <div class="soundbar" id="soundbar" hidden>${ico('bell', 16)} Tap here to turn on sound alerts</div>
      <div class="topbar"><b id="pageTitle"></b><div class="spacer"></div>
        <span class="clock" id="clock" data-noi18n></span>
        <label class="devsel">Device: <select id="role"><option value="both">Both</option><option value="counter">Counter</option><option value="kitchen">Kitchen</option></select></label>
        <div class="cashier" id="cashier" title="Change cashier on duty">${ico('edit', 14)} Cashier: <b id="cashierName"></b></div>
        ${ctlHTML()}
      </div>
      <div class="page" id="page"></div>
    </main></div>`;
  applyBranding(); paintCtl();
  $('#role').value = role(); $('#role').onchange = e => store.set('mb_role', e.target.value);
  $('#logout').onclick = async e => { e.preventDefault(); stopLive(); await sb.auth.signOut(); location.hash = ''; showLogin(); };
  $('#cashier').onclick = async () => {
    const v = await promptModal({ title: 'Cashier on duty', label: 'Name of the person at the counter now', value: state.settings.cashier || '' });
    if (v === null) return;
    try { await saveSettings({ cashier: v.trim() }); toast('Cashier updated'); } catch (e) { toast(errMsg(e), 'err'); }
  };
  const sbar = $('#soundbar');
  if (navigator.userActivation && !navigator.userActivation.hasBeenActive) {
    sbar.hidden = false;
    const hide = () => { sbar.hidden = true; beep('done'); };
    sbar.onclick = hide; document.addEventListener('pointerdown', () => { sbar.hidden = true; }, { once: true });
  }
  window.removeEventListener('settings-changed', applyBranding); window.addEventListener('settings-changed', applyBranding);
  startLive();
  if (!location.hash.startsWith('#/')) location.hash = '#/pos';
  route();
}
function applyBranding() {
  const s = state.settings;
  const bn = $('#brandName'); if (bn) bn.textContent = s.shop_name;
  const cn = $('#cashierName'); if (cn) cn.textContent = s.cashier || 'not set';
  document.title = `${s.shop_name} POS`;
}

async function route() {
  const id = (location.hash.match(/^#\/(\w+)/) || [])[1] || 'pos';
  const pg = PAGES.find(p => p.id === id) || PAGES[0];
  const token = ++routeToken;
  if (typeof cleanup === 'function') { try { cleanup(); } catch { /* ignore */ } }
  cleanup = null;
  $$('.nav a').forEach(a => a.classList.toggle('on', a.dataset.p === pg.id));
  $('#pageTitle').textContent = pg.label;
  const root = $('#page'); root.innerHTML = '<div class="empty">Loading…</div>';
  try {
    const c = await pg.mod.render(root);
    if (token !== routeToken) { if (typeof c === 'function') c(); return; }
    cleanup = c;
  } catch (e) {
    console.error(e);
    root.innerHTML = `<div class="card"><h2>Something went wrong</h2><div class="err">${esc(errMsg(e))}</div><p class="muted">If this says a table does not exist, run <b>sql/schema.sql</b> in Supabase SQL Editor.</p></div>`;
  }
}
window.addEventListener('hashchange', () => { if (state.user) route(); });

// =====================================================================
//  Live: realtime + polling -> alerts, kitchen badge, auto-refresh on every device
// =====================================================================
const seen = new Set(); let primed = false;
const buzz = p => { try { navigator.vibrate && navigator.vibrate(p); } catch { /* ignore */ } };
function handleOrder(o) {
  if (!o || !o.id) return;
  const k = okey(o);
  if (seen.has(k)) return;
  seen.add(k);
  if (!primed || state.own.has(k)) return;
  if (o.status === 'pending') {
    if (role() === 'counter') return;                       // counter devices don't need kitchen alerts
    toast(`New order ${billNo(o.bill_no)} · ${o.order_type === 'takeaway' ? 'Takeaway' : 'Dine-in'}`, 'info', 0, { sticky: true, repeat: () => beep('new') });
    beep('new'); buzz([300, 150, 300]);
  } else if (o.status === 'served') {
    if (role() === 'kitchen') return;                       // kitchen devices don't need "served" alerts
    if (noKitchen(o)) return;                                // saved straight as served (not sent to kitchen)
    toast(`Order ${billNo(o.bill_no)} is served ✓`, 'ok', 12000);
    beep('done'); buzz([200, 100, 200]);
  }
}
function setBadge(n) { const b = $('#kBadge'); if (!b) return; b.textContent = n; b.hidden = !n; }

async function poll() {
  if (!state.user) return;
  try {
    const since = new Date(Date.now() - 12 * 3600e3).toISOString();
    const { data, error } = await sb.from('orders').select('*').gte('created_at', since).order('created_at', { ascending: true });
    if (error || !data) return;
    const before = seen.size;
    data.forEach(handleOrder);
    primed = true;
    setBadge(data.filter(o => o.status === 'pending').length);
    if (seen.size !== before) window.dispatchEvent(new Event('orders-changed'));
  } catch { /* offline - try again next tick */ }
}
async function refreshSettings() {
  try {
    const old = JSON.stringify(state.settings);
    await loadSettings();
    if (JSON.stringify(state.settings) !== old) window.dispatchEvent(new Event('settings-changed'));
  } catch { /* ignore */ }
}

let lastDay = dstr(Date.now());
function clockTick() {
  const c = $('#clock'); if (c) c.textContent = nowLabel();
  const d = dstr(Date.now());
  if (d !== lastDay) {                                       // midnight in Sri Lanka -> a new day starts
    lastDay = d;
    toast('New day started: screens refreshed', 'info', 6000);
    refreshSettings(); route();
  }
}
const onVisible = () => { if (!document.hidden && state.user) { poll(); window.dispatchEvent(new Event('data-changed')); clockTick(); } };

function startLive() {
  stopLive();
  try {
    chan = sb.channel('orders-live').on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, p => {
      if (p.new && p.new.id) handleOrder(p.new);
      window.dispatchEvent(new Event('orders-changed'));
      poll();
    }).subscribe();
  } catch (e) { console.warn('realtime unavailable', e); }
  try {                                                      // menu / stock / settings changed on another device
    chan2 = sb.channel('catalog-live');
    ['items', 'categories', 'addons', 'inventory', 'settings', 'customers'].forEach(t => chan2.on('postgres_changes', { event: '*', schema: 'public', table: t }, () => {
      window.dispatchEvent(new Event('data-changed'));
      if (t === 'settings') refreshSettings();
    }));
    chan2.subscribe();
  } catch (e) { console.warn('realtime (catalog) unavailable', e); }
  lastDay = dstr(Date.now()); clockTick();
  poll();
  timers = [
    setInterval(poll, 10000),
    setInterval(clockTick, 15000),
    setInterval(() => { if (!document.hidden) { refreshSettings(); window.dispatchEvent(new Event('data-changed')); } }, 20000), // safety net if realtime is off
  ];
  document.addEventListener('visibilitychange', onVisible);
}
function stopLive() {
  timers.forEach(clearInterval); timers = []; primed = false; seen.clear();
  document.removeEventListener('visibilitychange', onVisible);
  [chan, chan2].forEach(c => { if (c) { try { sb.removeChannel(c); } catch { /* ignore */ } } });
  chan = chan2 = null;
  if (typeof cleanup === 'function') { try { cleanup(); } catch { /* ignore */ } cleanup = null; }
}

// ---- go ----
{ const th = store.get('mb_theme', 'dark'); document.documentElement.dataset.theme = th === 'light' ? 'light' : 'dark'; }
initI18n();
boot();
