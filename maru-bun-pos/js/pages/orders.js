import { sb } from '../sb.js';
import { $, $$, esc, fmt, money, billNo, dstr, tstr, dtstr, dayRangeStr, monthRange, ymOf, fetchOrders, downloadCSV, toast, errMsg, onLive, lineRows, netTotal, orderCost, hasCost, r2 } from '../utils.js';
import { showBillModal, typeLabel, payLabel } from '../bill.js';
import { openEdit, openRefund } from '../refund.js';

export async function render(root) {
  let mode = 'today', ym = ymOf(), day = dstr(new Date()), search = '', ftype = '', fpay = '';
  let view = [], cur = [];

  root.innerHTML = `
    <div class="grid-cards" id="cards"></div>
    <div class="toolbar">
      <div class="seg" id="seg"><button data-m="today" class="on">Today</button><button data-m="month">Month</button><button data-m="date">Pick date</button></div>
      <input type="month" id="ym" value="${ym}" hidden>
      <input type="date" id="dt" value="${day}" hidden>
      <input id="s" placeholder="Search bill no / name / phone">
      <select id="ft"><option value="">All types</option><option value="dine_in">Dine-in</option><option value="takeaway">Takeaway</option></select>
      <select id="fp"><option value="">All payments</option><option value="cash">Cash</option><option value="card">Card</option><option value="bank">Bank Transfer</option><option value="qr">QR Pay</option></select>
      <div class="spacer"></div>
      <button class="btn ghost" id="csv">Export CSV</button>
    </div>
    <div id="daily"></div>
    <div class="tbl-wrap"><table><thead><tr><th>Token</th><th>Bill</th><th>Date & time</th><th>Customer</th><th>Type</th><th>Payment</th><th>Status</th><th class="r">Total (LKR)</th></tr></thead><tbody id="rows"></tbody></table></div>`;

  const sum = arr => arr.reduce((n, o) => n + netTotal(o), 0);
  const profitOf = o => (hasCost(o) ? r2(netTotal(o) - orderCost(o)) : null);        // null = old bill saved before costs existed
  const noCostSet = o => hasCost(o) && o.items.some(l => !Number(l.cost));          // an item on it has no cost typed / worked out

  async function load() {
    $('#rows').innerHTML = '<tr><td colspan="8" class="empty">Loading…</td></tr>';
    try {
      const nowYm = ymOf();
      cur = await fetchOrders(sb, ...monthRange(nowYm));
      if (mode === 'month' && ym === nowYm) view = cur;
      else if (mode === 'today') view = cur.filter(o => dstr(o.created_at) === dstr(new Date()));
      else if (mode === 'month') view = await fetchOrders(sb, ...monthRange(ym));
      else view = await fetchOrders(sb, ...dayRangeStr(day));
    } catch (e) { $('#rows').innerHTML = `<tr><td colspan="8"><div class="err">${esc(errMsg(e))}</div></td></tr>`; return; }
    draw();
  }

  function filtered() {
    const q = search.toLowerCase();
    return view.filter(o => (!ftype || o.order_type === ftype) && (!fpay || o.payment_method === fpay) &&
      (!q || billNo(o.bill_no).toLowerCase().includes(q) || String(o.bill_no) === q || (o.token_no && String(o.token_no) === q) || (o.customer_name || '').toLowerCase().includes(q) || (o.customer_phone || '').includes(q)));
  }

  function draw() {
    const todayList = cur.filter(o => dstr(o.created_at) === dstr(new Date()));
    const list = filtered();
    const known = list.filter(hasCost);
    const profitCard = { rev: sum(known), cost: r2(known.reduce((n, o) => n + orderCost(o), 0)), old: list.length - known.length, nc: list.filter(noCostSet).length };
    profitCard.p = r2(profitCard.rev - profitCard.cost);
    const scope = [mode === 'today' ? 'Today' : mode === 'month' ? ym : day, ftype ? typeLabel(ftype) : '', fpay ? payLabel(fpay) : '', search ? `"${search}"` : ''].filter(Boolean).join(' · ');
    $('#cards').innerHTML = `
      <div class="stat gold"><div class="k">Today's sale</div><div class="v">${money(sum(todayList))}</div><div class="s">${todayList.length} bills</div></div>
      <div class="stat gold"><div class="k">This month's sale</div><div class="v">${money(sum(cur))}</div><div class="s">${cur.length} bills</div></div>
      <div class="stat"><div class="k">Bills in the list below</div><div class="v">${money(sum(list))}</div><div class="s">${list.length} bills${list.length ? ' · average per bill ' + fmt(sum(list) / list.length) : ''}</div><div class="s" data-noi18n>${esc(scope)}</div></div>
      <div class="stat ${profitCard.p < 0 ? '' : 'gold'}"><div class="k">Profit from these bills</div><div class="v" style="color:var(--${profitCard.p < 0 ? 'bad' : 'ok'})">${money(profitCard.p)}</div>
        <div class="s">${profitCard.rev ? Math.round(profitCard.p / profitCard.rev * 100) + '% of sales · ' : ''}sales ${fmt(profitCard.rev)} − cost ${fmt(profitCard.cost)}</div>
        ${profitCard.old ? `<div class="s">${profitCard.old} older bill${profitCard.old > 1 ? 's' : ''} without cost are not counted</div>` : ''}${profitCard.nc ? `<div class="s" style="color:var(--gold)">⚠ ${profitCard.nc} bill${profitCard.nc > 1 ? 's have' : ' has'} items with no cost set</div>` : ''}</div>
      <div class="stat"><div class="k">Dine-in / Takeaway</div><div class="v">${list.filter(o => o.order_type === 'dine_in').length} / ${list.filter(o => o.order_type === 'takeaway').length}</div><div class="s">in this view</div></div>`;

    // daily breakdown for month view
    if (mode === 'month') {
      const by = {};
      view.forEach(o => { const k = dstr(o.created_at); (by[k] = by[k] || { n: 0, t: 0 }); by[k].n++; by[k].t += netTotal(o); });
      const days = Object.keys(by).sort().reverse();
      $('#daily').innerHTML = days.length ? `<details class="card" style="margin-bottom:12px"><summary style="cursor:pointer;font-weight:600">Daily sales for ${ym} (${days.length} days)</summary>
        <div class="tbl-wrap" style="margin-top:10px"><table><thead><tr><th>Date</th><th class="r">Bills</th><th class="r">Sales (LKR)</th></tr></thead><tbody>
        ${days.map(d => `<tr><td>${d}</td><td class="r">${by[d].n}</td><td class="r">${fmt(by[d].t)}</td></tr>`).join('')}</tbody></table></div></details>` : '';
    } else $('#daily').innerHTML = '';

    $('#rows').innerHTML = list.length ? list.map(o => `<tr class="click" data-id="${o.id}">
      <td>${o.token_no ? '<b>#' + o.token_no + '</b>' : '—'}</td><td><b>${billNo(o.bill_no)}</b></td><td>${dtstr(o.created_at)}</td>
      <td>${esc(o.customer_name || '—')}${o.customer_phone ? `<div class="muted small">${esc(o.customer_phone)}</div>` : ''}</td>
      <td><span class="pill ${o.order_type === 'takeaway' ? 'info' : ''}">${typeLabel(o.order_type)}</span></td>
      <td>${payLabel(o.payment_method)}</td>
      <td><span class="pill ${o.status === 'served' ? 'ok' : 'warn'}">${o.status === 'served' ? 'Served' : 'In kitchen'}</span>${Number(o.refund_total) > 0 ? ` <span class="pill bad">${netTotal(o) <= 0 ? 'Refunded' : 'Part refund'}</span>` : ''}${(o.edits || []).length ? ` <span class="pill info" title="${esc(o.edits.map(e => (e.by || '') + ': ' + e.text).join(' | '))}">Edited</span>` : ''}</td>
      <td class="r"><b>${fmt(netTotal(o))}</b>${profitOf(o) === null ? '' : `<div class="small" style="color:var(--${profitOf(o) < 0 ? 'bad' : 'ok'})">profit ${fmt(profitOf(o))}</div>`}${Number(o.refund_total) > 0 ? `<div class="muted small">bill ${fmt(o.total)} · refund -${fmt(o.refund_total)}</div>` : ''}</td></tr>`).join('') : '<tr><td colspan="8" class="empty">No bills found</td></tr>';
  }

  const manage = { edit: x => openEdit(x, reopen), refund: x => openRefund(x, reopen) };
  const openBill = x => showBillModal(x, { manage });
  async function reopen(id) {                         // after a change: refresh the list and show the updated bill again
    load();
    const { data } = await sb.from('orders').select('*').eq('id', id).maybeSingle();
    if (data) openBill(data);
  }

  $('#seg', root).onclick = e => {
    const b = e.target.closest('[data-m]'); if (!b) return;
    mode = b.dataset.m; $$('#seg button', root).forEach(x => x.classList.toggle('on', x === b));
    $('#ym').hidden = mode !== 'month'; $('#dt').hidden = mode !== 'date'; load();
  };
  $('#ym', root).onchange = e => { if (e.target.value) { ym = e.target.value; load(); } };
  $('#dt', root).onchange = e => { if (e.target.value) { day = e.target.value; load(); } };
  $('#s', root).oninput = e => { search = e.target.value.trim(); draw(); };
  $('#ft', root).onchange = e => { ftype = e.target.value; draw(); };
  $('#fp', root).onchange = e => { fpay = e.target.value; draw(); };
  $('#rows', root).onclick = e => { const tr = e.target.closest('tr[data-id]'); if (!tr) return; const o = view.find(x => x.id === tr.dataset.id); if (o) openBill(o); };
  $('#csv', root).onclick = () => {
    const list = filtered(); if (!list.length) return toast('Nothing to export', 'err');
    downloadCSV(`bills-${mode === 'month' ? ym : mode === 'date' ? day : dstr(new Date())}.csv`, [
      ['Token', 'Bill', 'Date', 'Time', 'Customer', 'Phone', 'Type', 'Table', 'Payment', 'Subtotal', 'Discount', 'Service charge', 'Total', 'Refunded', 'Cost', 'Profit', 'Cashier', 'Status', 'Items'],
      ...list.map(o => [o.token_no || '', billNo(o.bill_no), dstr(o.created_at), tstr(o.created_at), o.customer_name, o.customer_phone, typeLabel(o.order_type), o.table_no, payLabel(o.payment_method), o.subtotal, o.discount, o.service_charge, o.total, o.refund_total || 0, hasCost(o) ? orderCost(o) : '', profitOf(o) === null ? '' : profitOf(o), o.cashier, o.status, (o.items || []).map(i => { const r = lineRows(i); return `${r.qty}x ${r.name} @${r.unit}` + r.extras.map(e => ` +${e.qty}x ${e.name}`).join(''); }).join('; ')]),
    ]);
  };

  const offLive = onLive(() => load(), 1000);
  await load();
  return () => offLive();
}
