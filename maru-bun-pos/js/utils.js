// ---------- small helpers ----------
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const num = v => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
export const r2 = n => Math.round((n + Number.EPSILON) * 100) / 100;
export const fmt = n => r2(num(n)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const money = n => 'LKR ' + fmt(n);
export const billNo = n => 'MB-' + String(n || 0).padStart(5, '0');
export const pad = n => String(n).padStart(2, '0');
// ---------- Sri Lanka time (Asia/Colombo = UTC+5:30, no daylight saving) ----------
// Everything (bill times, "today", "this month", midnight roll-over) uses Sri Lanka time,
// no matter what time zone the phone / computer is set to.
const SL = 5.5 * 3600e3;
const sl = d => new Date(new Date(d).getTime() + SL); // read with getUTC* methods
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const dstr = d => { const x = sl(d); return `${x.getUTCFullYear()}-${pad(x.getUTCMonth() + 1)}-${pad(x.getUTCDate())}`; };
export const tstr = d => { const x = sl(d); let h = x.getUTCHours(); const ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12; return `${h}:${pad(x.getUTCMinutes())} ${ap}`; };
export const dtstr = d => dstr(d) + ' ' + tstr(d);
export const nowLabel = () => { const x = sl(Date.now()); return `${DAYS[x.getUTCDay()]}, ${x.getUTCDate()} ${MONTHS[x.getUTCMonth()]} ${x.getUTCFullYear()} · ${tstr(Date.now())}`; };
export const weekday = d => DAYS[sl(d).getUTCDay()];
export const ymOf = (d = new Date()) => dstr(d).slice(0, 7);
export const dayRangeStr = s => { const [y, m, d] = s.split('-').map(Number); const a = Date.UTC(y, m - 1, d) - SL; return [new Date(a).toISOString(), new Date(a + 864e5).toISOString()]; };
export const dayRange = (d = new Date()) => dayRangeStr(dstr(d));
export const monthRange = ym => { const [y, m] = ym.split('-').map(Number); return [new Date(Date.UTC(y, m - 1, 1) - SL).toISOString(), new Date(Date.UTC(y, m, 1) - SL).toISOString()]; };
// stable key for "order X is in state Y" (used to avoid alerting twice / alerting ourselves)
export const okey = o => `${o.id}:${o.status}${o.status === 'served' && o.served_at ? ':' + new Date(o.served_at).getTime() : ''}`;
// an order saved straight as 'served' (never sent to the kitchen) has served_at == created_at exactly
export const noKitchen = o => !!o.served_at && new Date(o.served_at).getTime() === new Date(o.created_at).getTime();
// one bill line -> {name, qty, unit, total, extras:[{name,qty,unit,total}]}
// New orders keep the bun price in `unit` and every extra has its own qty.
// Old orders stored the extras inside `unit` (per bun) - handled here too so old bills still print right.
export function lineRows(l) {
  const ad = l.addons || [], legacy = ad.some(a => a.qty == null);
  const extras = ad.map(a => { const q = legacy ? num(l.qty) : num(a.qty); return { name: a.name, qty: q, unit: num(a.price), total: r2(q * num(a.price)) }; });
  const unit = legacy ? r2(num(l.unit) - ad.reduce((n, a) => n + num(a.price), 0)) : num(l.unit);
  return { name: l.name, qty: num(l.qty), unit, total: r2(unit * num(l.qty)), extras };
}
export const netTotal = o => r2(num(o.total) - num(o.refund_total));
export const lineTotal = l => { const r = lineRows(l); return r2(r.total + r.extras.reduce((n, e) => n + e.total, 0)); };
// Sri Lankan numbers -> international format for wa.me (0771234567 -> 94771234567)
export function normPhone(p) {
  let d = String(p || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('94') && d.length >= 11) return d;
  if (d.startsWith('0')) return '94' + d.slice(1);
  if (d.length === 9) return '94' + d;
  return d;
}

// ---------- icons ----------
const ICONS = {
  cart: '<circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.7 13.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H6"/>',
  receipt: '<path d="M4 2v20l3-2 3 2 3-2 3 2 3-2V2l-3 2-3-2-3 2-3-2z"/><path d="M8 8h8M8 12h8M8 16h5"/>',
  dashboard: '<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>',
  kitchen: '<path d="M6 13.9V20h12v-6.1"/><path d="M6 14a4 4 0 0 1-1-7.9 4 4 0 0 1 7-1.6 4 4 0 0 1 7 1.6A4 4 0 0 1 18 14"/><path d="M6 17h12"/>',
  menu: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z"/><path d="M4 19.5V21h16v-4"/>',
  inventory: '<path d="M21 8l-9-5-9 5v8l9 5 9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/>',
  star: '<polygon points="12 2 15 9 22 9.5 17 14.5 18.5 22 12 18 5.5 22 7 14.5 2 9.5 9 9"/>',
  settings: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5M21 12H9"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  print: '<path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>',
  whatsapp: '<path d="M3 21l1.7-5A8.5 8.5 0 1 1 8 19.3z"/><path d="M9 9c0 3 3 6 6 6l1-1.5-2-1-1 .7c-.8-.4-1.6-1.2-2-2l.7-1-1-2z"/>',
  check: '<path d="M20 6L9 17l-5-5"/>',
  bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4"/>',
  x: '<path d="M18 6L6 18M6 6l12 12"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
  users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>',
  undo: '<path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-15-6.7L3 13"/>',
};
export const ico = (n, size = 18) => `<svg class="ico" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[n] || ''}</svg>`;

// ---------- toast + sound ----------
export function toast(msg, type = 'ok', ms = 3500, opts = {}) {
  const box = document.getElementById('toasts');
  const t = document.createElement('div');
  t.className = 'toast ' + type;
  const sp = document.createElement('span'); sp.textContent = msg; t.appendChild(sp);
  const gone = () => { t.classList.add('out'); setTimeout(() => t.remove(), 300); if (t._rep) clearTimeout(t._rep); };
  while (box.children.length >= 5) box.firstChild.remove();
  box.appendChild(t);
  if (opts.sticky) {                       // stays until someone taps it; replays the sound once more after 10 s
    t.classList.add('sticky'); t.title = 'Tap to dismiss'; t.onclick = gone;
    if (opts.repeat) t._rep = setTimeout(() => { if (t.isConnected) opts.repeat(); }, 10000);
  } else setTimeout(gone, ms);
  return t;
}
// run fn when something changed anywhere (realtime event or periodic tick) - debounced
export function onLive(fn, wait = 700) {
  let t; const ev = ['orders-changed', 'data-changed'];
  const h = () => { clearTimeout(t); t = setTimeout(fn, wait); };
  ev.forEach(e => window.addEventListener(e, h));
  return () => { clearTimeout(t); ev.forEach(e => window.removeEventListener(e, h)); };
}
let ac;
export function beep(kind = 'new') {
  try {
    ac = ac || new (window.AudioContext || window.webkitAudioContext)();
    if (ac.state === 'suspended') ac.resume();
    const seq = kind === 'new' ? [[880, 0], [1175, 0.2], [880, 0.4], [1175, 0.6]] : [[660, 0], [990, 0.18]];
    seq.forEach(([f, t]) => {
      const o = ac.createOscillator(), g = ac.createGain(), at = ac.currentTime + t;
      o.type = 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(0.7, at + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 0.17);
      o.connect(g); g.connect(ac.destination);
      o.start(at); o.stop(at + 0.2);
    });
  } catch { /* audio not allowed yet */ }
}

// ---------- modals ----------
export function modal(html, { wide = false, onClose, outside = true } = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'modal-wrap';
  wrap.innerHTML = `<div class="modal${wide ? ' wide' : ''}" role="dialog" aria-modal="true"><button class="modal-x" aria-label="Close">${ico('x', 20)}</button>${html}</div>`;
  document.body.appendChild(wrap);
  let closed = false;
  const close = () => { if (closed) return; closed = true; wrap.remove(); onClose && onClose(); };
  if (outside) wrap.addEventListener('mousedown', e => { if (e.target === wrap) close(); });
  wrap.querySelector('.modal-x').onclick = close;
  return { el: wrap.querySelector('.modal'), close };
}

export function promptModal({ title, label, value = '', type = 'text', ok = 'Save', step, placeholder = '' }) {
  return new Promise(resolve => {
    const m = modal(`<h3>${esc(title)}</h3>
      <form id="pmForm"><label>${esc(label)}
        <input id="pmInput" type="${type}" value="${esc(value)}" ${step ? `step="${step}"` : ''} placeholder="${esc(placeholder)}" autocomplete="off">
      </label>
      <div class="row end"><button type="button" class="btn ghost" data-c>Cancel</button><button class="btn">${esc(ok)}</button></div></form>`,
      { onClose: () => resolve(null) });
    const inp = $('#pmInput', m.el); inp.focus(); inp.select();
    $('[data-c]', m.el).onclick = () => m.close();
    $('#pmForm', m.el).onsubmit = e => { e.preventDefault(); resolve(inp.value); m.close(); };
  });
}

export function confirmBox(msg, ok = 'Yes, do it', danger = true) {
  return new Promise(resolve => {
    const m = modal(`<h3>Please confirm</h3><p class="muted">${esc(msg)}</p>
      <div class="row end"><button class="btn ghost" data-c>Cancel</button><button class="btn ${danger ? 'danger' : ''}" data-ok>${esc(ok)}</button></div>`,
      { onClose: () => resolve(false) });
    $('[data-c]', m.el).onclick = () => m.close();
    $('[data-ok]', m.el).onclick = () => { resolve(true); m.close(); };
  });
}

// ---------- data helpers ----------
// Supabase returns max 1000 rows per request, so page through.
export async function fetchOrders(sb, fromISO, toISO) {
  let all = [], p = 0; const size = 1000;
  for (;;) {
    const { data, error } = await sb.from('orders').select('*')
      .gte('created_at', fromISO).lt('created_at', toISO)
      .order('created_at', { ascending: false })
      .range(p * size, p * size + size - 1);
    if (error) throw error;
    all = all.concat(data || []);
    if (!data || data.length < size) break;
    p++;
  }
  return all;
}

export function downloadCSV(filename, rows) {
  const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = '﻿' + rows.map(r => r.map(q).join(',')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = filename; document.body.appendChild(a); a.click(); a.remove();
}

export const errMsg = e => (e && (e.message || e.error_description)) || String(e);
