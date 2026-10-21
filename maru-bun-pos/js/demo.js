// DEMO backend: mimics the small part of the Supabase API this app uses, storing data in localStorage.
// Used automatically when js/config.js has no Supabase keys. Handy for trying the app before setting up Supabase.
const KEY = 'mb_demo_v1', AUTH = 'mb_demo_auth';
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Math.random().toString(36).slice(2) + Date.now());
const iso = () => new Date().toISOString();
const bc = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('mb_demo') : null;
const listeners = new Set();
const emit = (ev, local = true) => { listeners.forEach(f => f(ev)); if (local && bc) bc.postMessage(ev); };
if (bc) bc.onmessage = e => emit(e.data, false);

function seed() {
  const cats = [['Hot Buns', 1], ['Drinks', 2], ['Sides', 3]].map(([name, sort]) => ({ id: uid(), name, sort, created_at: iso() }));
  const cid = n => cats.find(c => c.name === n).id;
  const it = (c, name, price, stock) => ({ id: uid(), category_id: cid(c), name, price, allow_addons: true, track_stock: true, stock, low_stock: 5, active: true, created_at: iso() });
  return {
    _seq: 0,
    categories: cats,
    items: [it('Hot Buns', 'Chicken Bun', 450, 50), it('Hot Buns', 'Beef Bun', 550, 50), it('Hot Buns', 'Cheese Bun', 400, 50), it('Hot Buns', 'Egg Bun', 350, 50),
      it('Drinks', 'Tea', 150, 100), it('Drinks', 'Coffee', 250, 100), it('Drinks', 'Milo', 300, 100), it('Sides', 'French Fries', 350, 40)],
    addons: [['Extra Cheese', 100], ['Fried Egg', 80], ['Extra Sauce', 50]].map(([name, price]) => ({ id: uid(), name, price, active: true, created_at: iso() })),
    inventory: [['Bun (raw)', 'pcs', 200, 50], ['Cheese', 'kg', 5, 1], ['Chicken', 'kg', 10, 2], ['Eggs', 'pcs', 60, 12]].map(([name, unit, qty, low_level]) => ({ id: uid(), name, unit, qty, low_level, created_at: iso() })),
    settings: [{ id: 1 }],
    orders: [],
    customers: [],
    devices: [],
  };
}
function load() {
  try { const d = JSON.parse(localStorage.getItem(KEY)); if (d) return d; } catch { /* ignore */ }
  const d = seed(); save(d); return d;
}
const save = d => localStorage.setItem(KEY, JSON.stringify(d));

const DEFAULTS = {
  orders: d => ({ token_no: (() => { const day = x => new Date(new Date(x).getTime() + 19800000).toISOString().slice(0, 10), t = day(Date.now()); return d.orders.filter(o => day(o.created_at) === t).reduce((n, o) => Math.max(n, o.token_no || 0), 0) + 1; })(), bill_no: ++d._seq, order_type: 'dine_in', table_no: '', customer_name: '', customer_phone: '', note: '', items: [], subtotal: 0, discount: 0, discount_label: '', service_pct: 0, service_charge: 0, total: 0, payment_method: 'cash', cash_received: 0, change_given: 0, cashier: '', status: 'pending', served_at: null, refund_total: 0, refunds: [], edits: [] }),
  items: () => ({ cost: 0, cost_manual: false, recipe: [], price: 0, allow_addons: true, track_stock: true, stock: 0, low_stock: 5, active: true, category_id: null }),
  categories: () => ({ sort: 0 }),
  addons: () => ({ price: 0, cost: 0, active: true }),
  security_alerts: () => ({ seen: false }),
  inventory: () => ({ unit: 'pcs', qty: 0, low_level: 0, cost_per_unit: 0 }),
};

class Q {
  constructor(t) { this.t = t; this.f = []; this.op = 'select'; this.ord = []; this.lim = null; this.rng = null; this.one = null; this.ret = false; }
  select() { if (this.op !== 'select') this.ret = true; return this; }
  insert(r) { this.op = 'insert'; this.pl = r; return this; }
  update(r) { this.op = 'update'; this.pl = r; return this; }
  upsert(r) { this.op = 'upsert'; this.pl = r; return this; }
  delete() { this.op = 'delete'; return this; }
  eq(c, v) { this.f.push(r => r[c] === v); return this; }
  neq(c, v) { this.f.push(r => r[c] !== v); return this; }
  gt(c, v) { this.f.push(r => r[c] > v); return this; }
  gte(c, v) { this.f.push(r => r[c] >= v); return this; }
  lt(c, v) { this.f.push(r => r[c] < v); return this; }
  lte(c, v) { this.f.push(r => r[c] <= v); return this; }
  in(c, a) { this.f.push(r => a.includes(r[c])); return this; }
  order(c, o = {}) { this.ord.push([c, o.ascending !== false]); return this; }
  limit(n) { this.lim = n; return this; }
  range(a, b) { this.rng = [a, b]; return this; }
  single() { this.one = 'single'; return this; }
  maybeSingle() { this.one = 'maybe'; return this; }
  then(a, b) { return this.run().then(a, b); }
  async run() {
    const d = load(); const t = this.t;
    d[t] = d[t] || [];
    const match = () => d[t].filter(r => this.f.every(fn => fn(r)));
    let out; const events = [];
    if (this.op === 'select') {
      out = match().map(r => ({ ...r }));
    } else if (this.op === 'insert') {
      const arr = Array.isArray(this.pl) ? this.pl : [this.pl];
      out = arr.map(r => { const o = { id: uid(), created_at: iso(), ...(DEFAULTS[t] ? DEFAULTS[t](d) : {}), ...structuredClone(r) }; d[t].push(o); events.push({ eventType: 'INSERT', table: t, new: { ...o }, old: {} }); return { ...o }; });
    } else if (this.op === 'upsert') {
      const arr = Array.isArray(this.pl) ? this.pl : [this.pl];
      out = arr.map(r => {
        const ex = r.id != null ? d[t].find(x => x.id === r.id) : null;
        if (ex) { const old = { ...ex }; Object.assign(ex, structuredClone(r)); events.push({ eventType: 'UPDATE', table: t, new: { ...ex }, old }); return { ...ex }; }
        const o = { id: uid(), created_at: iso(), ...(DEFAULTS[t] ? DEFAULTS[t](d) : {}), ...structuredClone(r) }; d[t].push(o); events.push({ eventType: 'INSERT', table: t, new: { ...o }, old: {} }); return { ...o };
      });
    } else if (this.op === 'update') {
      out = match().map(r => { const old = { ...r }; Object.assign(r, structuredClone(this.pl)); events.push({ eventType: 'UPDATE', table: t, new: { ...r }, old }); return { ...r }; });
    } else if (this.op === 'delete') {
      const del = match(); d[t] = d[t].filter(r => !del.includes(r));
      del.forEach(r => events.push({ eventType: 'DELETE', table: t, new: {}, old: { ...r } })); out = del.map(r => ({ ...r }));
    }
    if (this.op !== 'select') { save(d); events.forEach(e => emit(e)); }
    if (this.op === 'select' || this.ret) {
      this.ord.slice().reverse().forEach(([c, asc]) => out.sort((a, b) => (a[c] > b[c] ? 1 : a[c] < b[c] ? -1 : 0) * (asc ? 1 : -1)));
      if (this.rng) out = out.slice(this.rng[0], this.rng[1] + 1);
      if (this.lim != null) out = out.slice(0, this.lim);
    } else out = null;
    if (this.one) {
      if (!out || !out.length) return this.one === 'maybe' ? { data: null, error: null } : { data: null, error: { message: 'No rows found' } };
      return { data: out[0], error: null };
    }
    return { data: out, error: null };
  }
}

const readAuth = () => { try { return JSON.parse(localStorage.getItem(AUTH)); } catch { return null; } };

export function createDemo() {
  const aal = () => sessionStorage.getItem('mb_aal') || 'aal1';
  const qr = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160"><rect width="160" height="160" fill="white"/><text x="80" y="70" text-anchor="middle" font-size="14" font-family="sans-serif">DEMO QR</text><text x="80" y="95" text-anchor="middle" font-size="12" font-family="sans-serif">code: 123456</text></svg>');
  return {
    isDemo: true,
    from: t => new Q(t),
    async rpc(name, a) {
      if (name === 'adjust_stock') {
        const d = load(); const r = d.items.find(x => x.id === a.p_item);
        if (r && r.track_stock) { r.stock += a.p_delta; save(d); }
      }
      if (name === 'add_stock') {
        const d = load(); const r = d.inventory.find(x => x.id === a.p_id);
        if (!r) return { data: null, error: { message: 'Ingredient not found' } };
        if (!(a.p_qty > 0)) return { data: null, error: { message: 'Quantity must be more than 0' } };
        const base = Math.max(+r.qty || 0, 0), tot = +a.p_total || 0;
        r.cost_per_unit = (+r.cost_per_unit || 0) === 0 ? Math.round(tot / a.p_qty * 1e4) / 1e4 : Math.round(((base * r.cost_per_unit + tot) / (base + a.p_qty)) * 1e4) / 1e4;
        r.qty = Math.round((+r.qty + a.p_qty) * 100) / 100;
        d.inventory_purchases = d.inventory_purchases || [];
        d.inventory_purchases.push({ id: uid(), inventory_id: r.id, qty: a.p_qty, total_cost: tot, unit_cost: Math.round(tot / a.p_qty * 1e4) / 1e4, by_name: a.p_by || '', created_at: iso() });
        save(d); emit({ eventType: 'UPDATE', table: 'inventory', new: { ...r }, old: {} });
        return { data: { ...r }, error: null };
      }
      if (name === 'adjust_inventory_bulk') {
        const d = load();
        (a.p_changes || []).forEach(c => { const r = d.inventory.find(x => x.id === c.id); if (r) r.qty = Math.round((+r.qty + +c.delta) * 10000) / 10000; });
        save(d); emit({ eventType: 'UPDATE', table: 'inventory', new: {}, old: {} });
        return { data: null, error: null };
      }
      if (name === 'register_device') {
        const d = load(); d.devices = d.devices || []; const now = iso();
        let r = d.devices.find(x => x.id === a.p_id);
        if (r) { Object.assign(r, { last_seen: now, cashier: a.p_cashier || '', email: a.p_email || r.email }); if (a.p_name) r.name = a.p_name; }
        else { const adm = d.devices.some(x => x.is_admin); r = { id: a.p_id, name: a.p_name || '', cashier: a.p_cashier || '', email: a.p_email || '', user_agent: '', is_admin: !adm, status: adm ? 'pending' : 'approved', created_at: now, last_seen: now }; d.devices.push(r); }
        save(d); emit({ eventType: 'UPDATE', table: 'devices', new: { ...r }, old: {} });
        return { data: { ...r }, error: null };
      }
      if (name === 'upsert_customer') {
        const d = load(); d.customers = d.customers || [];
        let c = d.customers.find(x => x.phone === a.p_phone); const now = iso();
        if (c) { if (a.p_name) c.name = a.p_name; c.visits++; c.total_spent = +(c.total_spent + (a.p_total || 0)).toFixed(2); c.last_visit = now; emit({ eventType: 'UPDATE', table: 'customers', new: { ...c }, old: {} }); }
        else { c = { id: a.p_phone, phone: a.p_phone, name: a.p_name || '', visits: 1, total_spent: a.p_total || 0, first_visit: now, last_visit: now, created_at: now }; d.customers.push(c); emit({ eventType: 'INSERT', table: 'customers', new: { ...c }, old: {} }); }
        save(d);
      }
      return { data: null, error: null };
    },
    channel() {
      const cbs = []; const ch = {};
      ch.on = (_t, filter, cb) => { cbs.push({ filter, cb }); return ch; };
      ch.subscribe = () => { ch._fn = ev => cbs.forEach(c => { if (!c.filter.table || c.filter.table === ev.table) c.cb(ev); }); listeners.add(ch._fn); return ch; };
      ch.unsubscribe = () => listeners.delete(ch._fn);
      return ch;
    },
    functions: { async invoke(_n, { body }) {
      if (body.ping) return { data: { configured: true }, error: null };
      return { data: { results: (body.recipients || []).map(r => (r.phone.endsWith('0') ? { phone: r.phone, ok: false, error: 'Recipient not on WhatsApp' } : { phone: r.phone, ok: true, id: 'demo' })) }, error: null };
    } },
    storage: { from: bucket => ({
      async upload(path) { return { data: { path }, error: null }; },
      getPublicUrl(path) { return { data: { publicUrl: `https://demo.invalid/storage/v1/object/public/${bucket}/${path}` } }; },
    }) },
    removeChannel(ch) { ch && ch.unsubscribe && ch.unsubscribe(); },
    auth: {
      async getSession() { const s = readAuth(); return { data: { session: s ? { user: { email: s.email } } : null }, error: null }; },
      async signInWithPassword({ email, password }) {
        if (email && password === 'admin123') { localStorage.setItem(AUTH, JSON.stringify({ email })); sessionStorage.setItem('mb_aal', 'aal1'); return { data: { session: { user: { email } } }, error: null }; }
        return { data: null, error: { message: 'Invalid login credentials (demo: password is admin123)' } };
      },
      async signOut(_o) { localStorage.removeItem(AUTH); sessionStorage.removeItem('mb_aal'); return { error: null }; },
      async updateUser() { return { data: {}, error: null }; },
      async resetPasswordForEmail() { return { data: {}, error: null }; },
      mfa: {
        async getAuthenticatorAssuranceLevel() { const d = load(); const f = d._mfa; return { data: { currentLevel: aal(), nextLevel: f && f.verified ? 'aal2' : 'aal1' }, error: null }; },
        async listFactors() { const f = load()._mfa; return { data: { all: f ? [f] : [], totp: f && f.verified ? [f] : [] }, error: null }; },
        async enroll() { const d = load(); d._mfa = { id: uid(), factor_type: 'totp', status: 'unverified', verified: false }; save(d); return { data: { id: d._mfa.id, type: 'totp', totp: { qr_code: qr, secret: 'DEMOSECRET123', uri: '' } }, error: null }; },
        async challengeAndVerify({ code }) {
          if (String(code).trim() !== '123456') return { data: null, error: { message: 'Invalid TOTP code (demo code is 123456)' } };
          const d = load(); if (d._mfa) { d._mfa.verified = true; d._mfa.status = 'verified'; save(d); } sessionStorage.setItem('mb_aal', 'aal2'); return { data: {}, error: null };
        },
        async unenroll() { const d = load(); delete d._mfa; save(d); sessionStorage.setItem('mb_aal', 'aal1'); return { data: {}, error: null }; },
      },
    },
  };
}
