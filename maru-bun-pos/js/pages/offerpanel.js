// "📣 Send offer / alert" panel on the Customers page.
// Everyone on the QR menu, or chosen customers in two groups:
//   📱 QR menu customers (registered on the QR menu)  and  💬 WhatsApp customers (numbers saved from POS, not registered yet).
// A WhatsApp customer who registers on the QR menu moves to the QR group automatically (the group is decided by the phone number).
import { sb } from '../sb.js';
import { state } from '../state.js';
import { $, esc, dtstr, toast, errMsg, modal, normPhone } from '../utils.js';
import { newOffer, offerFormHTML, bindOfferForm, itemsHTML, offerRow, offerFromNotice } from '../offerform.js';
import { qrPush } from '../push.js';
import { orderUrl } from './qr.js';

const F = newOffer();                                   // the form keeps what you typed (even after a refresh)
const S = { mode: 'chosen', pick: new Set(), qr: true, wa: true };   // pick = chosen phone numbers (94…)
const personal = (t, name) => String(t).replace(/\{name\}/gi, (name || '').trim().split(/\s+/)[0] || 'friend');

export function mountOfferPanel(host) {
  let qrList = [], waList = [], items = [], notices = [], pushCount = null, qrErr = '', fq = '', itemSig = '';
  host.innerHTML = `<div class="card" id="op" style="margin-bottom:14px" hidden>
    <div class="row" style="gap:8px"><h2 style="margin:0">📣 Send offer / alert</h2><div class="spacer"></div><button class="btn ghost sm" id="opx">✕ Close</button></div>
    <div class="muted small" style="margin:4px 0 10px">Send a message or an offer (photo, items, prices) to everyone on the QR menu, or only to the customers you choose.</div>
    <div class="seg" id="opmode"><button data-m="all">🌍 Everyone on the QR menu</button><button data-m="chosen">👥 Choose customers</button></div>
    <div id="opwho" style="margin:10px 0"></div>
    <div id="opform">${offerFormHTML(F, items, 'o')}</div>
    <div id="opvia" style="margin-top:10px"></div>
    <div class="row wrap" style="gap:10px;align-items:center;margin-top:10px"><button class="btn" id="opsend">📣 Send now</button><span class="small" id="oppc"></span></div>
    <div id="opnl"></div></div>`;
  const root = host, panel = $('#op', root);
  const busy = b => { $('#opsend', root).disabled = b; };
  bindOfferForm($('#opform', root), F, 'o', busy, () => items);

  const rowHTML = (p, sub) => `<label class="row" style="gap:8px;padding:5px 0;margin:0;border-bottom:1px solid var(--line)"><input type="checkbox" data-pk="${esc(p.phone)}" ${S.pick.has(p.phone) ? 'checked' : ''}><b data-noi18n>${esc(p.name || '—')}</b><span class="muted small">+${esc(p.phone)}</span><div class="spacer"></div><span class="muted small">${sub}</span></label>`;
  const shown = l => l.filter(p => !fq || (p.name || '').toLowerCase().includes(fq) || p.phone.includes(fq.replace(/\D/g, '') || '\u0000'));
  function paintWho() {
    const w = $('#opwho', root);
    $('#opmode', root).querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.m === S.mode));
    if (S.mode === 'all') { w.innerHTML = '<div class="muted small">Every customer who is logged in on the QR menu will see it and get a phone notification (including people who register while the offer is running).</div>'; return; }
    const q = shown(qrList), wa = shown(waList), all = [...q, ...wa];
    w.innerHTML = `<div class="row wrap" style="gap:10px;margin-bottom:6px"><input id="opq" type="search" placeholder="Search name / phone" value="${esc(fq)}" style="max-width:240px"><label class="check" style="margin:0"><input type="checkbox" id="opall" ${all.length && all.every(p => S.pick.has(p.phone)) ? 'checked' : ''}> <b>Select all customers</b></label><span class="pill info" id="opn"></span></div>
      <div class="op-groups">
        <div class="op-g"><div class="row" style="gap:8px"><b>📱 QR menu customers</b><span class="muted small">(${qrList.length})</span><div class="spacer"></div><label class="check" style="margin:0"><input type="checkbox" id="opaq" ${q.length && q.every(p => S.pick.has(p.phone)) ? 'checked' : ''}> Select all</label></div>
          <div class="op-list">${qrErr ? `<div class="err">${esc(qrErr)}<br><small>Run sql/update-13.sql … update-16.sql in Supabase first.</small></div>` : q.map(p => rowHTML(p, `${p.orders} order${p.orders === 1 ? '' : 's'}${p.push ? ' · 🔔' : ''}`)).join('') || '<div class="muted small" style="padding:8px">Nobody here yet</div>'}</div></div>
        <div class="op-g"><div class="row" style="gap:8px"><b>💬 WhatsApp customers</b><span class="muted small">(${waList.length})</span><div class="spacer"></div><label class="check" style="margin:0"><input type="checkbox" id="opaw" ${wa.length && wa.every(p => S.pick.has(p.phone)) ? 'checked' : ''}> Select all</label></div>
          <div class="op-list">${wa.map(p => rowHTML(p, `${p.visits || 0} visit${p.visits === 1 ? '' : 's'}`)).join('') || '<div class="muted small" style="padding:8px">Nobody here yet</div>'}</div>
          <div class="muted small" style="margin-top:4px">Saved from POS orders (who have not stopped promos). When they register on the QR menu they move to the QR list.</div></div>
      </div>`;
    $('#opn', root).textContent = `${S.pick.size} selected`;
  }
  function paintVia() {
    $('#opvia', root).innerHTML = S.mode === 'all' ? '<div class="muted small">Sent to the QR menu + as a phone notification.</div>' : `<b>Send by</b>
      <label class="check"><input type="checkbox" id="vq" ${S.qr ? 'checked' : ''}> 📱 QR menu + phone notification <span class="muted small">(for the QR menu customers you chose)</span></label>
      <label class="check"><input type="checkbox" id="vw" ${S.wa ? 'checked' : ''}> 💬 WhatsApp <span class="muted small">(opens WhatsApp for each customer with the message and the offer link – WhatsApp customers always get this)</span></label>`;
  }
  function paintMisc() {
    const sig = JSON.stringify(items.map(i => [i.id, i.name, i.price]));
    if (sig !== itemSig) { itemSig = sig; $('#oitems', root).innerHTML = itemsHTML(F, items, 'o'); }
    $('#oppc', root).innerHTML = pushCount == null ? '' : `<span class="${pushCount ? 'muted' : ''}" ${pushCount ? '' : 'style="color:var(--bad)"'}>📱 ${pushCount} phone${pushCount === 1 ? '' : 's'} can get notifications${pushCount ? '' : ' – customers must tap “Turn on notifications” first'}</span>`;
    $('#opnl', root).innerHTML = notices.length ? `<div style="margin-top:12px"><div class="muted small">Showing now:</div>${notices.map(n => `<div class="row wrap" style="gap:8px;padding:6px 0;border-top:1px solid var(--line)">${n.image_url ? `<img src="${esc(n.image_url)}" alt="" style="width:44px;height:44px;object-fit:cover;border-radius:8px">` : ''}<div style="flex:1;min-width:180px"><b data-noi18n>${esc(n.title || '')}</b>${(n.offer_items || []).length ? ` <span class="pill ok">🎁 ${n.offer_items.length} item${n.offer_items.length > 1 ? 's' : ''}</span>` : ''}${n.phones ? ` <span class="pill info">👤 ${n.phones.length} customer${n.phones.length > 1 ? 's' : ''}</span>` : ' <span class="pill info">🌍 everyone</span>'} <span data-noi18n>${esc(n.body)}</span><div class="muted small">${dtstr(n.created_at)}${n.expires_at ? ' · until ' + dtstr(n.expires_at) : ''}</div></div><button class="btn ghost sm" data-editn="${n.id}">✏️ Edit</button><button class="btn ghost sm" data-stopn="${n.id}">Stop showing</button></div>`).join('')}</div>` : '';
  }
  const paintAll = () => { paintWho(); paintVia(); paintMisc(); };

  async function load() {
    const [cr, cu, ir, nr, pc] = await Promise.all([
      sb.rpc('qr_customer_list'),
      sb.from('customers').select('phone,name,visits,total_spent,opt_out').order('visits', { ascending: false }),
      sb.from('items').select('id,name,price').eq('active', true).order('name'),
      sb.from('qr_notices').select('*').eq('active', true).order('created_at', { ascending: false }).limit(20),
      sb.from('qr_push').select('id', { count: 'exact', head: true }),
    ]);
    qrErr = cr.error ? errMsg(cr.error) : '';
    qrList = (cr.data || []).map(p => ({ ...p, phone: normPhone(p.phone) })).sort((a, b) => (b.orders - a.orders) || (a.created_at < b.created_at ? 1 : -1));   // most QR orders first
    const qrPhones = new Set(qrList.map(p => p.phone));
    waList = (cu.data || []).map(r => ({ ...r, phone: normPhone(r.phone) })).filter(r => r.phone && !r.opt_out && !qrPhones.has(r.phone));
    items = ir.data || [];
    notices = nr.error ? [] : (nr.data || []).filter(n => !n.expires_at || n.expires_at > new Date().toISOString());
    pushCount = pc.error ? null : (pc.count ?? 0);
    paintAll();
  }

  // ---------- events ----------
  $('#opx', root).onclick = () => { panel.hidden = true; };
  $('#opmode', root).onclick = e => { const b = e.target.closest('[data-m]'); if (!b) return; S.mode = b.dataset.m; paintAll(); };
  $('#opwho', root).oninput = e => { if (e.target.id === 'opq') { fq = e.target.value.toLowerCase().trim(); const pos = e.target.selectionStart; paintWho(); const i = $('#opq', root); i.focus(); i.setSelectionRange(pos, pos); } };
  $('#opwho', root).onchange = e => {
    const t = e.target;
    if (t.dataset.pk) { if (t.checked) S.pick.add(t.dataset.pk); else S.pick.delete(t.dataset.pk); paintWho(); return; }
    const set = l => l.forEach(p => (t.checked ? S.pick.add(p.phone) : S.pick.delete(p.phone)));
    if (t.id === 'opall') { set(shown(qrList)); set(shown(waList)); } else if (t.id === 'opaq') set(shown(qrList)); else if (t.id === 'opaw') set(shown(waList)); else return;
    paintWho();
  };
  $('#opvia', root).onchange = e => { if (e.target.id === 'vq') S.qr = e.target.checked; if (e.target.id === 'vw') S.wa = e.target.checked; };
  function editNotice(n) {
    const E = offerFromNotice(n), m = modal(`<h3>✏️ Edit offer</h3><div id="ef">${offerFormHTML(E, items, 'e')}</div>
      <label class="check"><input type="checkbox" id="enot"> 🔔 Send a phone notification again <span class="muted small">(customers who can see this offer)</span></label>
      <div class="row end" style="gap:8px;margin-top:10px"><button class="btn ghost" id="ecx">Cancel</button><button class="btn" id="esv">Save changes</button></div>`, { wide: true, outside: false });
    const sv = $('#esv', m.el); bindOfferForm($('#ef', m.el), E, 'e', b => { sv.disabled = b; }, () => items);
    $('#ecx', m.el).onclick = () => m.close();
    sv.onclick = async () => {
      try {
        sv.disabled = true; const row = offerRow(E);
        const { error } = await sb.from('qr_notices').update(row).eq('id', n.id); if (error) throw error;
        if ($('#enot', m.el).checked) {
          const r = await qrPush({ kind: 'notice', title: row.title || state.settings.shop_name, body: row.body, image: row.image_url || undefined, offer_id: n.id, ...(n.customer_ids ? { customer_ids: n.customer_ids } : {}) });
          if (r && r.error) toast(`Saved, but phone notification failed: ${r.error}`, 'err', 8000);
        }
        m.close(); toast('Offer updated ✓'); load();
      } catch (err) { toast(errMsg(err), 'err', 6000); sv.disabled = false; }
    };
  }
  $('#opnl', root).onclick = async e => { const ed = e.target.closest('[data-editn]'); if (ed) { const n = notices.find(x => x.id === ed.dataset.editn); if (n) editNotice(n); return; } const b = e.target.closest('[data-stopn]'); if (!b) return; await sb.from('qr_notices').update({ active: false }).eq('id', b.dataset.stopn); toast('Stopped'); load(); };

  function waOneByOne(list, text) {
    let i = 0; const m = modal('<div id="wb"></div>', { outside: false });
    const draw = () => {
      const box = $('#wb', m.el);
      if (i >= list.length) { box.innerHTML = '<h3>All done ✓</h3><p class="muted">WhatsApp was opened for every chosen customer.</p><div class="row end"><button class="btn" id="wx">Close</button></div>'; $('#wx', m.el).onclick = () => m.close(); return; }
      const p = list[i];
      box.innerHTML = `<h3>💬 WhatsApp · ${i + 1} of ${list.length}</h3><p><b data-noi18n>${esc(p.name || '—')}</b> · +${esc(p.phone)}</p>
        <div class="card" style="white-space:pre-wrap;font-size:13px" data-noi18n>${esc(personal(text, p.name))}</div>
        <div class="row end" style="gap:8px;margin-top:10px"><button class="btn ghost" id="wk">Skip</button><button class="btn ghost" id="ws">Stop</button><button class="btn" id="wo">Open WhatsApp</button></div>`;
      $('#wo', m.el).onclick = () => { window.open(`https://wa.me/${p.phone}?text=${encodeURIComponent(personal(text, p.name))}`, '_blank', 'noopener'); i++; draw(); };
      $('#wk', m.el).onclick = () => { i++; draw(); };
      $('#ws', m.el).onclick = () => m.close();
    };
    draw();
  }

  $('#opsend', root).onclick = async () => {
    const btn = $('#opsend', root);
    try {
      const row = offerRow(F), title = row.title || state.settings.shop_name;
      if (S.mode === 'all') {
        btn.disabled = true;
        const { data, error } = await sb.from('qr_notices').insert(row).select().single();
        if (error) throw new Error(errMsg(error) + ' (run sql/update-11.sql … update-16.sql)');
        const r = await qrPush({ kind: 'notice', title, body: row.body, image: row.image_url || undefined, offer_id: data && data.id });
        if (r && r.error) toast(`Offer is showing on the QR menu, but phone notifications failed: ${r.error}`, 'err', 9000);
        else toast(r && r.sent != null ? `Offer sent · ${r.sent} phone${r.sent === 1 ? '' : 's'} notified` : 'Offer is now showing on the QR menu');
      } else {
        const qrSel = qrList.filter(p => S.pick.has(p.phone)), waSel = waList.filter(p => S.pick.has(p.phone));
        if (!qrSel.length && !waSel.length) return toast('Choose at least one customer', 'err');
        if (!S.qr && !S.wa) return toast('Choose how to send (QR menu or WhatsApp)', 'err');
        btn.disabled = true;
        const { data, error } = await sb.from('qr_notices').insert({ ...row, customer_ids: qrSel.map(p => p.id), phones: [...qrSel, ...waSel].map(p => p.phone) }).select().single();
        if (error) throw new Error(errMsg(error) + ' (run sql/update-16.sql)');
        if (S.qr && qrSel.length) {
          const r = await qrPush({ kind: 'notice', title, body: row.body, image: row.image_url || undefined, offer_id: data.id, customer_ids: qrSel.map(p => p.id) });
          if (r && r.error) toast(`Saved in the QR menu, but phone notification failed: ${r.error}`, 'err', 8000);
          else toast(r && r.sent != null ? `Sent in the QR menu · ${r.sent} phone${r.sent === 1 ? '' : 's'} notified` : 'Sent in the QR menu');
        }
        const wa = [...waSel, ...(S.wa ? qrSel : [])];
        const text = [row.title && `*${row.title}*`, row.body, `🍞 ${orderUrl()}?offer=${data.id}`].filter(Boolean).join('\n');
        if (wa.length) waOneByOne(wa, text); else toast('Done ✓');
      }
      Object.assign(F, newOffer()); S.pick.clear(); itemSig = '';
      $('#opform', root).innerHTML = offerFormHTML(F, items, 'o'); bindOfferForm($('#opform', root), F, 'o', busy, () => items);
      await load();
    } catch (e) { toast(errMsg(e), 'err', 6000); } finally { btn.disabled = false; }
  };

  load();
  return {
    toggle() { panel.hidden = !panel.hidden; if (!panel.hidden) { load(); panel.scrollIntoView({ behavior: 'smooth', block: 'start' }); } },
    openFor(phone) { S.mode = 'chosen'; S.pick.clear(); S.pick.add(normPhone(phone)); fq = ''; panel.hidden = false; load().then(() => panel.scrollIntoView({ behavior: 'smooth', block: 'start' })); },
  };
}
