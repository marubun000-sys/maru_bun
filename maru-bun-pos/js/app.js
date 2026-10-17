import { sb, DEMO } from './sb.js';
import { state, loadSettings, saveSettings } from './state.js';
import { $, $$, esc, ico, toast, beep, billNo, promptModal, errMsg } from './utils.js';
import * as pos from './pages/pos.js';
import * as orders from './pages/orders.js';
import * as dashboard from './pages/dashboard.js';
import * as kitchen from './pages/kitchen.js';
import * as menu from './pages/menu.js';
import * as inventory from './pages/inventory.js';
import * as review from './pages/review.js';
import * as settings from './pages/settings.js';

const PAGES = [
  { id: 'pos', label: 'POS', icon: 'cart', mod: pos },
  { id: 'orders', label: 'Orders & Billing', icon: 'receipt', mod: orders },
  { id: 'dashboard', label: 'Dashboard', icon: 'dashboard', mod: dashboard },
  { id: 'kitchen', label: 'Kitchen Display', icon: 'kitchen', mod: kitchen },
  { id: 'menu', label: 'Menu Management', icon: 'menu', mod: menu },
  { id: 'inventory', label: 'Inventory', icon: 'inventory', mod: inventory },
  { id: 'review', label: 'Google Review', icon: 'star', mod: review },
  { id: 'settings', label: 'Settings & Security', icon: 'settings', mod: settings },
];

const app = $('#app');
let cleanup = null, pollTimer = null, chan = null, routeToken = 0;

// =====================================================================
//  Login (+ 2-step verification)
// =====================================================================
function loginShell(inner) {
  app.innerHTML = `<div class="login-wrap"><div class="login">
    <img src="assets/logo.jpg" alt="logo"><h1>${esc(state.settings.shop_name)}</h1>
    <div class="tag">${esc(state.settings.tagline)}</div>${inner}
    ${DEMO ? `<div class="demo-note">DEMO MODE (no Supabase keys yet)<br>Login: <b>admin@demo.lk</b> / <b>admin123</b></div>` : ''}
  </div></div>`;
}

function showLogin() {
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
function startApp() {
  app.innerHTML = `<div class="shell">
    <aside class="side">
      <div class="brand"><img src="assets/logo.jpg" alt=""><div><b id="brandName"></b><span>POS System</span></div></div>
      <nav class="nav">${PAGES.map(p => `<a data-p="${p.id}" href="#/${p.id}">${ico(p.icon)}<span>${p.label}</span>${p.id === 'kitchen' ? '<em class="badge" id="kBadge" hidden>0</em>' : ''}</a>`).join('')}</nav>
      <div class="side-foot">${esc(state.user.email || '')}<br><a href="#" id="logout" style="color:var(--gold)">Sign out</a></div>
    </aside>
    <main class="main">
      <div class="topbar"><b id="pageTitle"></b><div class="spacer"></div>
        <div class="cashier" id="cashier" title="Change cashier on duty">${ico('edit', 14)} Cashier: <b id="cashierName"></b></div>
      </div>
      <div class="page" id="page"></div>
    </main></div>`;
  applyBranding();
  $('#logout').onclick = async e => { e.preventDefault(); stopLive(); await sb.auth.signOut(); location.hash = ''; showLogin(); };
  $('#cashier').onclick = async () => {
    const v = await promptModal({ title: 'Cashier on duty', label: 'Name of the person at the counter now', value: state.settings.cashier || '' });
    if (v === null) return;
    try { await saveSettings({ cashier: v.trim() }); toast('Cashier updated'); } catch (e) { toast(errMsg(e), 'err'); }
  };
  window.addEventListener('settings-changed', applyBranding);
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
// browsers only allow sound after a click, so wake the audio engine silently on the first one
document.addEventListener('click', () => { try { const C = window.AudioContext || window.webkitAudioContext; const c = new C(); c.resume(); c.close(); } catch { /* ignore */ } }, { once: true });

// =====================================================================
//  Live orders: realtime + polling fallback -> alerts + kitchen badge
// =====================================================================
const seen = new Set(); let primed = false;
function handleOrder(o) {
  if (!o || !o.id) return;
  const k = `${o.id}:${o.status}`;
  if (seen.has(k)) return;
  seen.add(k);
  if (!primed || state.own.has(k)) return;
  if (o.status === 'pending') { toast(`New order ${billNo(o.bill_no)} · ${o.order_type === 'takeaway' ? 'Takeaway' : 'Dine-in'}`, 'info', 6000); beep('new'); }
  else if (o.status === 'served') { toast(`Order ${billNo(o.bill_no)} is served ✓`, 'ok', 6000); beep('done'); }
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
function startLive() {
  stopLive();
  try {
    chan = sb.channel('orders-live').on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, p => {
      if (p.new && p.new.id) handleOrder(p.new);
      window.dispatchEvent(new Event('orders-changed'));
      poll();
    }).subscribe();
  } catch (e) { console.warn('realtime unavailable', e); }
  poll(); pollTimer = setInterval(poll, 10000);
  window.addEventListener('orders-changed', poll0);
}
const poll0 = () => setTimeout(poll, 300);
function stopLive() {
  clearInterval(pollTimer); pollTimer = null; primed = false; seen.clear();
  window.removeEventListener('orders-changed', poll0);
  if (chan) { try { sb.removeChannel(chan); } catch { /* ignore */ } chan = null; }
  if (typeof cleanup === 'function') { try { cleanup(); } catch { /* ignore */ } cleanup = null; }
}

boot();
