import { sb } from '../sb.js';
import { $, $$, esc, fmt, money, dstr, ymOf, monthRange, dayRangeStr, weekday, fetchOrders, onLive, lineTotal, netTotal } from '../utils.js';

export async function render(root) {
  let range = 'month', lastSig = '', busy = false, dead = false;

  async function paint() {
    if (busy || dead) return; busy = true;
    try {
      const now = Date.now(), today = dstr(now);
      const [mFrom, mTo] = monthRange(ymOf());
      const weekStart = dayRangeStr(dstr(now - 6 * 864e5))[0];
      const from = weekStart < mFrom ? weekStart : mFrom;

      const [orders, ri, rinv] = await Promise.all([
        fetchOrders(sb, from, mTo),
        sb.from('items').select('*').order('name'),
        sb.from('inventory').select('*').order('name'),
      ]);
      if (ri.error) throw ri.error;
      const items = ri.data || [], inv = rinv.data || [];
      // skip repainting when nothing changed (auto-refresh every few seconds on every device)
      const sig = [today, orders.length, orders.reduce((n, o) => n + netTotal(o) + (o.status === 'pending' ? 1 : 0), 0),
        items.map(i => i.id + i.stock + i.price).join(), inv.map(i => i.id + i.qty).join()].join('|');
      if (sig === lastSig) { busy = false; return; }
      lastSig = sig;

      const monthOrders = orders.filter(o => o.created_at >= mFrom);
      const todayOrders = orders.filter(o => dstr(o.created_at) === today);
      const sum = a => a.reduce((n, o) => n + netTotal(o), 0);
      const split = list => ['dine_in', 'takeaway'].map(t => { const l = list.filter(o => o.order_type === t); return { n: l.length, t: sum(l) }; });
      const [tDine, tTake] = split(todayOrders), [mDine, mTake] = split(monthOrders);

      const days = [...Array(7)].map((_, i) => { const d = now - (6 - i) * 864e5; return { k: dstr(d), l: weekday(d), t: 0 }; });
      orders.forEach(o => { const d = days.find(x => x.k === dstr(o.created_at)); if (d) d.t += netTotal(o); });
      const maxDay = Math.max(1, ...days.map(d => d.t));

      const sold = list => {
        const m = {};
        list.forEach(o => {
          (o.items || []).forEach(l => { const k = l.item_id || l.name; (m[k] = m[k] || { name: l.name, qty: 0, rev: 0, id: l.item_id }); m[k].qty += l.qty; m[k].rev += lineTotal(l); });
          (o.refunds || []).forEach(rf => (rf.items || []).forEach(it => {            // refunded items are not "sold"
            if (!/^i\d+$/.test(it.key)) return;
            const l = (o.items || [])[Number(it.key.slice(1))], k = l && (l.item_id || l.name);
            if (k && m[k]) { m[k].qty -= it.qty; m[k].rev -= it.amount; }
          }));
        });
        return m;
      };
      const soldToday = sold(todayOrders), soldMonth = sold(monthOrders);

      // refunded items (by the day the refund was made)
      const refunded = since => {
        const m = {}; let total = 0, n = 0;
        orders.forEach(o => (o.refunds || []).forEach(rf => {
          if (!since(rf.at)) return;
          n++; total += Number(rf.amount) || 0;
          (rf.items || []).forEach(it => { const r = (m[it.name] = m[it.name] || { name: it.name, qty: 0, amt: 0, back: false }); r.qty += Number(it.qty) || 0; r.amt += Number(it.amount) || 0; if (rf.restock) r.back = true; });
        }));
        return { rows: Object.values(m).sort((a, b) => b.qty - a.qty), total, n };
      };
      const refToday = refunded(at => dstr(at) === today), refMonth = refunded(at => at >= mFrom);
      const refTable = () => {
        const r = range === 'today' ? refToday : refMonth;
        return r.n ? `<div class="row wrap" style="margin-bottom:8px"><span class="pill bad">${r.n} refund${r.n > 1 ? 's' : ''}</span><span class="pill bad">${money(r.total)} refunded</span></div>
          <div class="tbl-wrap"><table><thead><tr><th>Item</th><th class="r">Qty refunded</th><th class="r">Amount</th><th>Stock</th></tr></thead><tbody>
          ${r.rows.map(x => `<tr><td><b>${esc(x.name)}</b></td><td class="r">${x.qty}</td><td class="r">${fmt(x.amt)}</td><td>${x.back ? '<span class="pill ok">Added back</span>' : '<span class="muted small">not added</span>'}</td></tr>`).join('')}
          </tbody></table></div>` : '<div class="empty">No refunds 👍</div>';
      };

      const topTable = () => {
        const src = range === 'today' ? soldToday : soldMonth;
        const rows = Object.values(src).sort((a, b) => b.qty - a.qty).slice(0, 10);
        const max = Math.max(1, ...rows.map(r => r.qty));
        return rows.length ? `<div class="tbl-wrap"><table><thead><tr><th>#</th><th>Item</th><th></th><th class="r">Sold</th><th class="r">Revenue</th><th class="r">Stock left</th></tr></thead><tbody>
          ${rows.map((r, i) => { const it = items.find(x => x.id === r.id); const st = it ? (it.track_stock ? it.stock : '—') : '—';
            return `<tr><td>${i + 1}</td><td><b>${esc(r.name)}</b></td><td style="width:120px"><div class="hbar"><i style="width:${r.qty / max * 100}%"></i></div></td><td class="r">${r.qty}</td><td class="r">${fmt(r.rev)}</td><td class="r">${st}</td></tr>`; }).join('')}
          </tbody></table></div>` : '<div class="empty">No sales yet</div>';
      };

      const stockRows = items.filter(i => i.track_stock).sort((a, b) => a.stock - b.stock);
      const lowInv = inv.filter(i => Number(i.qty) <= Number(i.low_level));
      const keep = $('#page') ? $('#page').scrollTop : 0;

      root.innerHTML = `
        <div class="grid-cards">
          <div class="stat gold"><div class="k">Today's sale</div><div class="v">${money(sum(todayOrders))}</div><div class="s">${todayOrders.length} orders</div></div>
          <div class="stat gold"><div class="k">This month</div><div class="v">${money(sum(monthOrders))}</div><div class="s">${monthOrders.length} orders</div></div>
          <div class="stat"><div class="k">Average bill (today)</div><div class="v">${money(todayOrders.length ? sum(todayOrders) / todayOrders.length : 0)}</div></div>
          <div class="stat"><div class="k">Pending in kitchen</div><div class="v">${orders.filter(o => o.status === 'pending').length}</div></div>
        </div>

        <div class="cols">
          <div class="card"><h2>Dine-in vs Takeaway</h2>
            <div class="tbl-wrap"><table><thead><tr><th></th><th class="r">Today orders</th><th class="r">Today sales</th><th class="r">Month orders</th><th class="r">Month sales</th></tr></thead><tbody>
              <tr><td><b>Dine-in</b></td><td class="r">${tDine.n}</td><td class="r">${fmt(tDine.t)}</td><td class="r">${mDine.n}</td><td class="r">${fmt(mDine.t)}</td></tr>
              <tr><td><b>Takeaway</b></td><td class="r">${tTake.n}</td><td class="r">${fmt(tTake.t)}</td><td class="r">${mTake.n}</td><td class="r">${fmt(mTake.t)}</td></tr>
            </tbody></table></div>
          </div>
          <div class="card"><h2>Last 7 days</h2>
            <div class="bars">${days.map(d => `<div class="bar" title="${d.k}: ${money(d.t)}"><em>${d.t ? fmt(d.t).replace(/\.00$/, '') : ''}</em><i style="height:${Math.max(2, Math.round(d.t / maxDay * 96))}px"></i><span data-noi18n>${d.l}</span></div>`).join('')}</div>
          </div>
        </div>

        <div class="card" style="margin-bottom:14px">
          <div class="row wrap" style="margin-bottom:10px"><h2 style="margin:0">Best selling items</h2><div class="spacer"></div>
            <div class="seg" id="rng"><button data-r="today" class="${range === 'today' ? 'on' : ''}">Today</button><button data-r="month" class="${range === 'month' ? 'on' : ''}">This month</button></div></div>
          <div id="top">${topTable()}</div>
        </div>

        <div class="card" style="margin-bottom:14px"><h2>Refunded items</h2><div id="refs">${refTable()}</div></div>

        <div class="cols">
          <div class="card"><h2>Item stock</h2>
            ${stockRows.length ? `<div class="tbl-wrap" style="max-height:340px"><table><thead><tr><th>Item</th><th class="r">In stock</th><th>Status</th></tr></thead><tbody>
              ${stockRows.map(i => `<tr><td>${esc(i.name)}</td><td class="r">${i.stock}</td><td>${i.stock <= 0 ? '<span class="pill bad">Out</span>' : i.stock <= i.low_stock ? '<span class="pill warn">Low</span>' : '<span class="pill ok">OK</span>'}</td></tr>`).join('')}
              </tbody></table></div>` : '<div class="empty">No items with stock tracking</div>'}
          </div>
          <div class="card"><h2>Inventory alerts</h2>
            ${lowInv.length ? `<div class="tbl-wrap"><table><thead><tr><th>Ingredient</th><th class="r">Left</th><th class="r">Alert level</th></tr></thead><tbody>
              ${lowInv.map(i => `<tr><td>${esc(i.name)}</td><td class="r"><span class="pill bad">${i.qty} ${esc(i.unit)}</span></td><td class="r">${i.low_level} ${esc(i.unit)}</td></tr>`).join('')}
              </tbody></table></div>` : '<div class="empty">All ingredients are above the alert level 👍</div>'}
          </div>
        </div>`;
      const pg = $('#page'); if (pg) pg.scrollTop = keep;

      $('#rng', root).onclick = e => {
        const b = e.target.closest('[data-r]'); if (!b) return;
        range = b.dataset.r; $$('#rng button', root).forEach(x => x.classList.toggle('on', x === b)); $('#top').innerHTML = topTable(); $('#refs').innerHTML = refTable();
      };
    } finally { busy = false; }
  }

  await paint();
  const offLive = onLive(() => paint().catch(console.error), 1500);
  return () => { dead = true; offLive(); };
}
