import { sb } from '../sb.js';
import { $, $$, esc, fmt, money, dstr, ymOf, monthRange, dayRangeStr, weekday, fetchOrders, onLive, lineTotal, netTotal, orderCost, hasCost, r2 } from '../utils.js';

export async function render(root) {
  let range = 'month', lastSig = '', busy = false, dead = false;
  let refDay = null, calOpen = false, calMonth = null;      // refDay null = "today" (rolls over at Colombo midnight)

  async function paint() {
    if (busy || dead) return; busy = true;
    try {
      const now = Date.now(), today = dstr(now);
      const [mFrom, mTo] = monthRange(ymOf());
      const weekStart = dayRangeStr(dstr(now - 6 * 864e5))[0];
      const from = weekStart < mFrom ? weekStart : mFrom;

      const [orders, ri, rinv, rrf] = await Promise.all([
        fetchOrders(sb, from, mTo),
        sb.from('items').select('*').order('name'),
        sb.from('inventory').select('*').order('name'),
        sb.from('orders').select('*').gt('refund_total', 0).order('created_at', { ascending: false }).limit(1000),   // refunds of any age
      ]);
      if (rrf.error) throw rrf.error;
      if (ri.error) throw ri.error;
      const items = ri.data || [], inv = rinv.data || [];
      // skip repainting when nothing changed (auto-refresh every few seconds on every device)
      const sig = [today, orders.length, orders.reduce((n, o) => n + netTotal(o) + (o.status === 'pending' ? 1 : 0), 0),
        items.map(i => i.id + i.stock + i.price).join(), inv.map(i => i.id + i.qty).join(),
        (rrf.data || []).map(o => o.id + ':' + o.refund_total + ':' + (o.refunds || []).length + ':' + (o.refunds || []).map(r => r.restock ? 1 : 0).join('')).join()].join('|');
      if (sig === lastSig) { busy = false; return; }
      lastSig = sig;

      const monthOrders = orders.filter(o => o.created_at >= mFrom);
      const todayOrders = orders.filter(o => dstr(o.created_at) === today);
      const sum = a => a.reduce((n, o) => n + netTotal(o), 0);
      const split = list => ['dine_in', 'takeaway'].map(t => { const l = list.filter(o => o.order_type === t); return { n: l.length, t: sum(l) }; });
      const [tDine, tTake] = split(todayOrders), [mDine, mTake] = split(monthOrders);

      // profit = sales (after refunds) - what the items cost us when they were sold. Bills from before costs existed are left out.
      const profitCard = (label, list) => {
        const known = list.filter(hasCost), rev = sum(known), cost = r2(known.reduce((n, o) => n + orderCost(o), 0)), p = r2(rev - cost), old = list.length - known.length;
        return `<div class="stat ${p < 0 ? '' : 'gold'}"><div class="k">${label}</div><div class="v" style="color:var(--${p < 0 ? 'bad' : 'ok'})">${money(p)}</div>
          <div class="s">${rev ? Math.round(p / rev * 100) + '% of sales' : 'no sales yet'}${old ? ` · ${old} old bill${old > 1 ? 's' : ''} not counted` : ''}</div></div>`;
      };
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

      // refunded items, grouped by the Colombo day the refund was made (any order age)
      const byDay = {};
      (rrf.data || []).forEach(o => (o.refunds || []).forEach(rf => {
        const k = dstr(rf.at), d = (byDay[k] = byDay[k] || { n: 0, total: 0, rows: [] });
        d.n++; d.total += Number(rf.amount) || 0;
        (rf.items || []).forEach(it => d.rows.push({ at: rf.at, name: it.name, qty: Number(it.qty) || 0, amt: Number(it.amount) || 0, back: !!rf.restock, why: rf.reason || '', by: rf.by || '', tok: o.token_no }));
      }));
      Object.values(byDay).forEach(d => d.rows.sort((a, b) => (a.at < b.at ? 1 : -1)));
      const nice = k => { const [y, m, d] = k.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }); };
      const calHTML = sel => {
        const [y, m] = calMonth.split('-').map(Number), first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay(), n = new Date(Date.UTC(y, m, 0)).getUTCDate();
        const cells = [...Array(first)].map(() => '<span></span>');
        for (let d = 1; d <= n; d++) {
          const k = `${calMonth}-${String(d).padStart(2, '0')}`;
          cells.push(`<button data-d="${k}" class="${byDay[k] ? 'has' : ''} ${k === sel ? 'sel' : ''} ${k === today ? 'tod' : ''}" title="${byDay[k] ? byDay[k].n + ' refund(s)' : ''}">${d}</button>`);
        }
        return `<div class="cal"><div class="row" style="margin-bottom:6px"><button class="btn sm" data-m="-1">‹</button><div class="spacer" style="text-align:center"><b data-noi18n>${new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })}</b></div><button class="btn sm" data-m="1">›</button></div>
          <div class="cal-g">${['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(x => `<em data-noi18n>${x}</em>`).join('')}${cells.join('')}</div>
          <div class="muted small" style="margin-top:6px"><span class="cal-dot"></span> Days with refunds</div></div>`;
      };
      const renderRef = () => {
        const sel = refDay || today, isToday = sel === today, d = byDay[sel] || { n: 0, total: 0, rows: [] };
        if (!calMonth) calMonth = sel.slice(0, 7);
        const lost = d.rows.filter(x => !x.back).length;
        $('#refs').innerHTML = `<div class="row wrap" style="margin-bottom:10px;gap:8px"><h2 style="margin:0">Refunded items</h2><div class="spacer"></div>
            ${isToday ? '' : '<button class="btn sm" id="refToday">Back to today</button>'}
            <button class="btn sm" id="refCal">📅 <span data-noi18n>${isToday ? 'Today · ' : ''}${nice(sel)}</span></button></div>
          ${calOpen ? calHTML(sel) : ''}
          ${d.n ? `<div class="row wrap" style="margin-bottom:8px"><span class="pill bad">${d.n} refund${d.n > 1 ? 's' : ''}</span><span class="pill bad">${money(d.total)} refunded</span>${lost ? `<span class="pill bad">✖ ${lost} not added back</span>` : ''}</div>
          <div class="tbl-wrap"><table><thead><tr><th>Item</th><th class="r">Qty refunded</th><th class="r">Amount</th><th>Stock</th><th>Reason</th></tr></thead><tbody>
          ${d.rows.map(x => `<tr${x.back ? '' : ' style="background:rgba(255,90,90,.12);color:var(--bad)"'}><td><b>${esc(x.name)}</b>${x.tok ? ` <span class="muted small">#${esc(x.tok)}</span>` : ''}<div class="muted small">${esc(new Date(x.at).toLocaleString('en-GB', { timeZone: 'Asia/Colombo', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }))}${x.by ? ' · ' + esc(x.by) : ''}</div></td><td class="r">${x.qty}</td><td class="r">${fmt(x.amt)}</td><td>${x.back ? '<span class="pill ok">✔ Added back</span>' : '<span class="pill bad">✖ Not added back</span>'}</td><td>${x.why ? esc(x.why) : '<span class="muted small">—</span>'}</td></tr>`).join('')}
          </tbody></table></div>` : `<div class="empty">${isToday ? 'No refunds today 👍' : 'No refunds on this day'}</div>`}`;
        const box = $('#refs');
        $('#refCal', box).onclick = () => { calOpen = !calOpen; calMonth = sel.slice(0, 7); renderRef(); };
        const bt = $('#refToday', box); if (bt) bt.onclick = () => { refDay = null; calMonth = today.slice(0, 7); renderRef(); };
        box.querySelectorAll('[data-m]').forEach(b => b.onclick = () => {
          let [y, m] = calMonth.split('-').map(Number); m += Number(b.dataset.m); if (m < 1) { m = 12; y--; } if (m > 12) { m = 1; y++; }
          calMonth = `${y}-${String(m).padStart(2, '0')}`; renderRef();
        });
        box.querySelectorAll('[data-d]').forEach(b => b.onclick = () => { refDay = b.dataset.d === today ? null : b.dataset.d; calOpen = false; renderRef(); });
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
          ${profitCard("Today's profit", todayOrders)}
          ${profitCard("This month's profit", monthOrders)}
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

        <div class="card" style="margin-bottom:14px"><div id="refs"></div></div>

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

      renderRef();
      $('#rng', root).onclick = e => {
        const b = e.target.closest('[data-r]'); if (!b) return;
        range = b.dataset.r; $$('#rng button', root).forEach(x => x.classList.toggle('on', x === b)); $('#top').innerHTML = topTable();
      };
    } finally { busy = false; }
  }

  await paint();
  const offLive = onLive(() => paint().catch(console.error), 1500);
  return () => { dead = true; offLive(); };
}
