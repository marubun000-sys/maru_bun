// Tiny in-browser stand-in for Supabase, used ONLY when no Supabase keys are set.
// It mimics the small part of the API this app uses, so the app can be tried offline.
// Demo 2-step code: 123456

const KEY = 'marubun_demo_v1'
const uid = () => crypto.randomUUID()
const copy = (x) => JSON.parse(JSON.stringify(x))

function seed() {
  const cats = ['Hot Buns', 'Combos', 'Sides', 'Drinks'].map((name, i) => ({ id: uid(), name, sort: i + 1 }))
  const c = (n) => cats.find((x) => x.name === n).id
  const inv = [
    ['Buns', 'pcs', 100, 20], ['Chicken', 'kg', 10, 3], ['Beef', 'kg', 8, 3],
    ['Cheese', 'slices', 80, 20], ['Soft drinks', 'bottles', 48, 12],
  ].map(([name, unit, qty, low_threshold]) => ({ id: uid(), name, unit, qty, low_threshold }))
  const iv = (n) => inv.find((x) => x.name === n).id
  const items = [
    ['Hot Buns', 'Chicken Bun', 450, 'Buns'], ['Hot Buns', 'Beef Bun', 500, 'Buns'],
    ['Hot Buns', 'Cheese Bun', 550, 'Buns'], ['Hot Buns', 'Spicy Bun', 480, 'Buns'],
    ['Drinks', 'Soft Drink', 200, 'Soft drinks'], ['Sides', 'French Fries', 350, null], ['Drinks', 'Milk Tea', 150, null],
  ].map(([cat, name, price, i]) => ({
    id: uid(), category_id: c(cat), name, price, active: true, inventory_id: i ? iv(i) : null, uses_qty: 1,
  }))
  const addons = [['Extra Cheese', 100], ['Extra Sauce', 50], ['Fried Egg', 80], ['Extra Spicy', 0]]
    .map(([name, price]) => ({ id: uid(), name, price, active: true }))
  return {
    seq: 0, categories: cats, inventory: inv, menu_items: items, addons, orders: [], order_items: [],
    settings: [{
      id: 1, shop_name: 'මරු Bun', tagline: 'The Taste of Something Special.',
      address: 'PVHX+2RG New Bridge Bus Stop, Panadura, Moratuwa', phone: '', cashier: '',
      service_charge_enabled: true, service_charge_pct: 10, discount_presets: [5, 10, 15, 20],
      payment_methods: ['Cash', 'Card', 'Bank Transfer', 'QR'], review_url: '', review_on_whatsapp: true,
      thank_you: 'Thank you! Come again.', receipt_footer: 'Thank you! Come again.',
    }],
  }
}

let db
function load() {
  try { const s = localStorage.getItem(KEY); if (s) return JSON.parse(s) } catch { /* ignore */ }
  const d = seed(); try { localStorage.setItem(KEY, JSON.stringify(d)) } catch { /* ignore */ }
  return d
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(db)) } catch { /* ignore */ } }

class Query {
  constructor(t) { this.t = t; this.f = []; this.mode = 'select'; this.cols = '*'; this.ord = null; this.one = false; this.lim = null }
  select(c = '*') { this.cols = c; return this }
  insert(v) { this.mode = 'insert'; this.vals = v; return this }
  update(v) { this.mode = 'update'; this.vals = v; return this }
  delete() { this.mode = 'delete'; return this }
  eq(c, v) { this.f.push(['eq', c, v]); return this }
  neq(c, v) { this.f.push(['neq', c, v]); return this }
  gte(c, v) { this.f.push(['gte', c, v]); return this }
  lt(c, v) { this.f.push(['lt', c, v]); return this }
  in(c, v) { this.f.push(['in', c, v]); return this }
  order(c, o = {}) { this.ord = [c, o.ascending !== false]; return this }
  limit(n) { this.lim = n; return this }
  single() { this.one = true; return this }
  async run() {
    const rows = db[this.t]
    const ok = (r) => this.f.every(([op, c, v]) =>
      op === 'eq' ? r[c] === v : op === 'neq' ? r[c] !== v : op === 'gte' ? r[c] >= v : op === 'lt' ? r[c] < v : v.includes(r[c]))
    let out
    if (this.mode === 'insert') {
      const arr = Array.isArray(this.vals) ? this.vals : [this.vals]
      out = arr.map((v) => { const r = { id: uid(), created_at: new Date().toISOString(), ...copy(v) }; rows.push(r); return r })
    } else if (this.mode === 'update') {
      out = rows.filter(ok).map((r) => Object.assign(r, copy(this.vals)))
    } else if (this.mode === 'delete') {
      const gone = rows.filter(ok).map((r) => r.id)
      db[this.t] = rows.filter((r) => !ok(r))
      if (this.t === 'orders') db.order_items = db.order_items.filter((i) => !gone.includes(i.order_id))
      out = []
    } else out = rows.filter(ok)
    save()
    out = copy(out)
    if (this.ord) { const [c, asc] = this.ord; out.sort((a, b) => (a[c] > b[c] ? 1 : a[c] < b[c] ? -1 : 0) * (asc ? 1 : -1)) }
    if (this.lim) out = out.slice(0, this.lim)
    if (this.t === 'orders' && this.cols.includes('order_items')) out.forEach((o) => { o.order_items = copy(db.order_items.filter((i) => i.order_id === o.id)) })
    if (this.one) { if (!out[0]) return { data: null, error: { message: 'No rows' } }; return { data: out[0], error: null } }
    return { data: out, error: null }
  }
  then(res, rej) { return this.run().then(res, rej) }
}

function placeOrder(p) {
  const n = (x) => (x === '' || x == null ? null : Number(x))
  const o = {
    id: uid(), bill_no: ++db.seq, created_at: new Date().toISOString(),
    order_type: p.order_type || 'dine-in', customer_name: p.customer_name || '', customer_phone: p.customer_phone || '',
    subtotal: n(p.subtotal) || 0, service_charge: n(p.service_charge) || 0, discount: n(p.discount) || 0, total: n(p.total) || 0,
    payment_method: p.payment_method || 'Cash', cash_received: n(p.cash_received), change_given: n(p.change_given),
    cashier: p.cashier || '', note: p.note || '', status: 'new', served_at: null,
  }
  db.orders.push(o)
  for (const it of p.items || []) {
    db.order_items.push({
      id: uid(), order_id: o.id, menu_item_id: it.menu_item_id || null, name: it.name, qty: Number(it.qty),
      unit_price: Number(it.unit_price), addons: it.addons || [], line_total: Number(it.line_total),
    })
    const m = db.menu_items.find((x) => x.id === it.menu_item_id)
    const inv = m && db.inventory.find((x) => x.id === m.inventory_id)
    if (inv) inv.qty = Math.max(0, inv.qty - m.uses_qty * Number(it.qty))
  }
  save()
  return copy(o)
}

export function createDemoClient() {
  db = load()
  const factor = () => localStorage.getItem('demo_factor') === '1'
  return {
    from: (t) => new Query(t),
    async rpc(name, args) {
      if (name === 'place_order') return { data: placeOrder(args.p), error: null }
      return { data: null, error: { message: 'Unknown rpc ' + name } }
    },
    auth: {
      async getSession() {
        const e = sessionStorage.getItem('demo_session')
        return { data: { session: e ? { user: { email: e } } : null } }
      },
      async signInWithPassword({ email, password }) {
        if (!email || !password) return { error: { message: 'Enter email and password' } }
        sessionStorage.setItem('demo_session', email); sessionStorage.setItem('demo_aal', 'aal1')
        return { data: {}, error: null }
      },
      async signOut() { sessionStorage.removeItem('demo_session'); sessionStorage.removeItem('demo_aal'); return { error: null } },
      async updateUser() { return { error: null } },
      mfa: {
        async getAuthenticatorAssuranceLevel() {
          return { data: { currentLevel: sessionStorage.getItem('demo_aal') || 'aal1', nextLevel: factor() ? 'aal2' : 'aal1' } }
        },
        async listFactors() {
          const t = factor() ? [{ id: 'demo', status: 'verified' }] : []
          return { data: { totp: t, all: t } }
        },
        async enroll() { return { data: { id: 'demo', totp: { qr_code: '', secret: 'DEMO-SECRET-123456', uri: '' } }, error: null } },
        async challengeAndVerify({ code }) {
          if (code !== '123456') return { error: { message: 'Wrong code (demo code is 123456)' } }
          localStorage.setItem('demo_factor', '1'); sessionStorage.setItem('demo_aal', 'aal2')
          return { data: {}, error: null }
        },
        async unenroll() { localStorage.removeItem('demo_factor'); sessionStorage.setItem('demo_aal', 'aal1'); return { error: null } },
      },
    },
  }
}
