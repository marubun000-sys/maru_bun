import { sb } from '../sb.js';
import { state } from '../state.js';
import { $, esc, fmt, dtstr, toast, ico, errMsg, onLive, downloadCSV, modal, promptModal, confirmBox } from '../utils.js';
import { newOffer, offerFormHTML, bindOfferForm, offerRow } from '../offerform.js';
import { qrPush } from '../push.js';
import { orderUrl } from './qr.js';
import { normPhone } from '../utils.js';
const MSG = newOffer();   // the personal message form keeps what you typed, even after a refresh or closing the window
const PICK = new Set();    // chosen QR customers (ids)
let VIA = { qr: true, wa: true };

const PK = 'mb_promo';   // an unfinished promotion (so you can continue after a refresh)
const loadCamp = () => { try { return JSON.parse(localStorage.getItem(PK) || 'null'); } catch { return null; } };
const saveCamp = c => { try { c ? localStorage.setItem(PK, JSON.stringify(c)) : localStorage.removeItem(PK); } catch { /* ignore */ } };
const personal = (t, name) => String(t).replace(/\{name\}/gi, (name || '').trim().split(/\s+/)[0] || 'friend');

// shrink the photo (phones make huge pictures) -> JPEG blob
function shrink(file, max = 1280) {
  return new Promise((res, rej) => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url); c.toBlob(b => (b ? res(b) : rej(new Error('Could not read the photo'))), 'image/jpeg', 0.85);
    };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('Could not read the photo')); };
    img.src = url;
  });
}

export async function render(root) {
  let rows = [], q = '';
  root.innerHTML = `<div class="page-head"><h1>Customers</h1><span class="pill info" id="cnt"></span><div class="spacer"></div>
      <button class="btn" id="promo">📣 Send promotion</button>
      <button class="btn" id="qmsg">💬 Message QR customers</button>
      <button class="btn ghost sm" id="csv">${ico('download', 14)} Export CSV</button></div>
    <p class="muted small" style="margin-top:-6px">Every customer WhatsApp number typed in POS is saved here automatically.</p>
    <input id="cq" type="search" placeholder="Search name / phone" style="max-width:340px;margin-bottom:10px">
    <div id="err"></div>
    <div class="tbl-wrap"><table><thead><tr><th>Name</th><th>Phone</th><th class="r">Visits</th><th class="r">Total spent (LKR)</th><th>Last visit</th><th>Promos</th><th></th></tr></thead><tbody id="rows"></tbody></table></div>`;

  let qrByPhone = {};   // phone -> QR customer (people who registered on the QR menu)
  const list = () => rows.filter(r => !q || (r.name || '').toLowerCase().includes(q) || r.phone.includes(q.replace(/\D/g, '') || '\u0000'));
  function draw() {
    const l = list();
    $('#cnt', root).textContent = `${rows.length} customers`;
    $('#rows', root).innerHTML = l.length ? l.map(r => `<tr><td><b>${esc(r.name || '—')}</b></td><td>+${esc(r.phone)}</td><td class="r">${r.visits}</td><td class="r">${fmt(r.total_spent)}</td><td>${dtstr(r.last_visit)}</td>
      <td><button class="pill ${r.opt_out ? 'bad' : 'ok'}" data-a="opt" data-p="${esc(r.phone)}" title="Tap to change">${r.opt_out ? 'Stopped' : 'Receives'}</button></td>
      <td class="r" style="white-space:nowrap"><a class="btn ghost sm" target="_blank" rel="noopener" href="https://wa.me/${esc(r.phone)}">WhatsApp</a> ${qrByPhone[normPhone(r.phone)] ? `<button class="btn ghost sm" data-a="qrmsg" data-p="${esc(normPhone(r.phone))}" title="Send an offer / message to this customer's QR menu">📱 QR</button> ` : ''}<button class="btn ghost sm" data-a="edit" data-p="${esc(r.phone)}">${ico('edit', 14)}</button></td></tr>`).join('') : '<tr><td colspan="7" class="empty">No customers yet</td></tr>';
  }
  async function load() {
    const { data, error } = await sb.from('customers').select('*').order('last_visit', { ascending: false });
    if (error) { $('#err', root).innerHTML = `<div class="err">${esc(errMsg(error))}<br><small>Run sql/update-3.sql in the Supabase SQL Editor first.</small></div>`; return; }
    $('#err', root).innerHTML = ''; rows = data || [];
    try { const q = await sb.rpc('qr_customer_list'); qrByPhone = {}; (q.data || []).forEach(p => { qrByPhone[normPhone(p.phone)] = p; }); } catch { /* QR not set up */ }
    draw();
  }

  // ---------------- send promotion ----------------
  const TK = 'mb_wa_tpl';
  const tpl = () => { try { return { name: '', lang: 'en', useName: true, ...JSON.parse(localStorage.getItem(TK) || '{}') }; } catch { return { name: '', lang: 'en', useName: true }; } };
  async function callApi(body) {
    const { data, error } = await sb.functions.invoke('send-promo', { body });
    if (error) {
      let msg = error.message || 'Could not reach the sending service';
      try { const j = await error.context.json(); if (j && j.error) msg = j.error; } catch { /* ignore */ }
      throw new Error(msg);
    }
    return data;
  }

  function openComposer() {
    const s = state.settings, saved = loadCamp(), resume = saved && saved.i < saved.list.length;
    const t0 = tpl();
    let imageUrl = '', busy = false, apiReady = false;
    const m = modal(`<h3>📣 Send promotion</h3>
      ${resume ? `<div class="card" style="margin-bottom:10px"><b>Unfinished promotion</b> · ${saved.i} of ${saved.list.length} done<div class="row" style="margin-top:8px"><button class="btn sm" id="pResume">Continue</button><button class="btn ghost sm" id="pDrop">Discard</button></div></div>` : ''}

      <div class="step-h">1 · How to send</div>
      <label class="opt" id="optAuto"><input type="radio" name="pm" value="auto"><span><b>Send to everyone automatically</b><small id="autoNote">Checking…</small></span></label>
      <label class="opt"><input type="radio" name="pm" value="manual" checked><span><b>Send one by one</b><small>Works with your normal WhatsApp. You tap once per customer, then press Send in WhatsApp.</small></span></label>

      <div class="step-h">2 · Message</div>
      <div id="pManual"><textarea id="pText" rows="5">Hi {name}! 🍞 Fresh hot buns are waiting for you at ${esc(s.shop_name)}.\nCome visit us today!\n📍 ${esc(s.address)}</textarea>
        <div class="muted small" style="margin-top:4px">{name} is replaced with each customer's first name.</div></div>
      <div id="pAuto" hidden>
        <div style="display:grid;grid-template-columns:1fr 110px;gap:10px"><label>Template name<input id="tName" placeholder="e.g. hot_bun_promo" value="${esc(t0.name)}" autocapitalize="off"></label>
        <label>Language<input id="tLang" placeholder="en" value="${esc(t0.lang)}"></label></div>
        <label class="check"><input type="checkbox" id="tUseName" ${t0.useName ? 'checked' : ''}> My template has <b>{{1}}</b> = customer's first name</label>
        <div class="muted small">WhatsApp only allows an <b>approved template</b> for messages to many people. Create it once in Meta (see README → WhatsApp automatic sending). The text is written inside the template.</div></div>

      <div class="step-h">3 · Photo / poster (optional)</div>
      <input type="file" id="pFile" accept="image/*"><div id="pPrev" class="muted small"></div>

      <div class="step-h">4 · Who gets it</div>
      <label class="opt"><input type="radio" name="pw" value="all" checked><span><b>Everyone</b><small>All saved customers</small></span></label>
      <label class="opt"><input type="radio" name="pw" value="recent"><span><b>Recent customers</b><small>Visited in the last <input id="pDays" type="number" min="1" value="30"> days</small></span></label>
      <label class="opt"><input type="radio" name="pw" value="loyal"><span><b>Regular customers</b><small>At least <input id="pVis" type="number" min="1" value="2"> visits</small></span></label>
      <div style="margin:10px 0 4px"><span class="pill info" id="pCount"></span> <span class="muted small">(customers marked <b>Stopped</b> are never included)</span></div>

      <div class="row end" style="margin-top:12px"><button class="btn ghost" id="pCancel">Cancel</button><button class="btn" id="pGo">Start sending</button></div>`, { wide: true });

    const mode = () => (m.el.querySelector('input[name=pm]:checked') || {}).value;
    const paint = () => { const auto = mode() === 'auto'; $('#pManual', m.el).hidden = auto; $('#pAuto', m.el).hidden = !auto; };
    const pick = () => {
      const w = (m.el.querySelector('input[name=pw]:checked') || {}).value;
      const days = Number($('#pDays', m.el).value) || 30, vis = Number($('#pVis', m.el).value) || 2;
      return rows.filter(r => !r.opt_out && (w === 'all' || (w === 'recent' && Date.now() - new Date(r.last_visit) <= days * 864e5) || (w === 'loyal' && r.visits >= vis)));
    };
    const count = () => { $('#pCount', m.el).textContent = `${pick().length} customers will get it`; };
    m.el.addEventListener('input', count); m.el.addEventListener('change', e => { count(); if (e.target.name === 'pm') paint(); });
    count(); paint();

    // is the automatic sender set up?
    (async () => {
      const note = $('#autoNote', m.el), radio = m.el.querySelector('input[value=auto]');
      let why = '';
      try { const r = await callApi({ ping: true }); apiReady = !!(r && r.configured); if (!apiReady) why = 'The <b>send-promo</b> function is deployed, but the secrets <b>WA_TOKEN</b> and <b>WA_PHONE_ID</b> are missing (Supabase → Edge Functions → Secrets).'; }
      catch (e) { apiReady = false; why = /not found|404|relay|failed to send|fetch/i.test(e.message) ? 'The <b>send-promo</b> function is not deployed in Supabase yet (Edge Functions → Deploy new function).' : esc(e.message); }
      if (apiReady) { note.textContent = 'Uses your WhatsApp Business account · all customers in one go · photo included'; radio.checked = true; paint(); }
      else { note.innerHTML = `Not available yet. ${why} Steps: README → WhatsApp automatic sending. Until then use <i>Send one by one</i>.`; radio.disabled = true; $('#optAuto', m.el).classList.add('off'); }
    })();

    $('#pCancel', m.el).onclick = () => m.close();
    if (resume) {
      $('#pResume', m.el).onclick = () => { m.close(); openSender(); };
      $('#pDrop', m.el).onclick = () => { saveCamp(null); m.close(); openComposer(); };
    }
    $('#pFile', m.el).onchange = async e => {
      const f = e.target.files[0]; imageUrl = ''; $('#pPrev', m.el).textContent = '';
      if (!f) return;
      busy = true; $('#pGo', m.el).disabled = true; $('#pPrev', m.el).textContent = 'Uploading photo…';
      try {
        const blob = await shrink(f);
        const path = `promo-${Date.now()}.jpg`;
        const { error } = await sb.storage.from('promos').upload(path, blob, { contentType: 'image/jpeg', upsert: false });
        if (error) throw error;
        imageUrl = sb.storage.from('promos').getPublicUrl(path).data.publicUrl;
        $('#pPrev', m.el).innerHTML = `<img src="${URL.createObjectURL(blob)}" alt="" style="max-width:100%;max-height:200px;border-radius:10px;display:block;margin:6px 0"><span class="pill ok">Photo ready</span>`;
      } catch (err) {
        $('#pPrev', m.el).innerHTML = `<div class="err">${esc(errMsg(err))}<br><small>Run sql/update-6.sql in the Supabase SQL Editor first.</small></div>`; e.target.value = '';
      }
      busy = false; $('#pGo', m.el).disabled = false;
    };
    $('#pGo', m.el).onclick = async () => {
      if (busy) return;
      const l = pick().map(r => ({ phone: r.phone, name: r.name || '' }));
      if (!l.length) return toast('No customers match', 'err');
      if (mode() === 'auto') {
        const name = $('#tName', m.el).value.trim(), lang = $('#tLang', m.el).value.trim() || 'en', useName = $('#tUseName', m.el).checked;
        if (!/^[a-z0-9_]+$/.test(name)) return toast('Template name: lowercase letters, numbers and _ only', 'err', 5000);
        try { localStorage.setItem(TK, JSON.stringify({ name, lang, useName })); } catch { /* ignore */ }
        if (!await confirmBox(`Send the "${name}" message${imageUrl ? ' with your photo' : ''} to ${l.length} customers now? WhatsApp may charge your business account for each message.`, `Send to ${l.length}`, false)) return;
        m.close(); return openAutoSender({ template: name, lang, useName, imageUrl, list: l });
      }
      const text = $('#pText', m.el).value.trim(); if (!text) return toast('Write a message first', 'err');
      saveCamp({ text: text + (imageUrl ? '\n\n' + imageUrl : ''), list: l, i: 0 });
      m.close(); openSender();
    };
  }

  // automatic sending through the Edge Function (WhatsApp Business Cloud API)
  function openAutoSender(job) {
    const m = modal('<div id="as"></div>', { wide: true });
    let todo = job.list.slice(), sent = 0, failed = [], running = false, stop = false;
    const box = () => $('#as', m.el);
    function draw(final = false) {
      const total = job.list.length, done = sent + failed.length;
      box().innerHTML = `<h3>${final ? (failed.length ? 'Finished with problems' : 'All sent ✓') : '📣 Sending…'}</h3>
        <div style="height:8px;border-radius:8px;background:var(--panel2);overflow:hidden;margin:8px 0"><div style="height:100%;width:${Math.round(done / total * 100)}%;background:var(--gold)"></div></div>
        <div class="row"><span class="pill ok">${sent} sent</span><span class="pill ${failed.length ? 'bad' : ''}">${failed.length} failed</span><span class="muted small">${done} of ${total}</span></div>
        ${failed.length && final ? `<div class="card" style="margin-top:10px;max-height:180px;overflow:auto"><b>Not sent</b>${failed.map(f => `<div class="small">+${esc(f.phone)} — <span class="muted">${esc(f.error)}</span></div>`).join('')}</div>` : ''}
        <div class="row end" style="margin-top:12px">${final && failed.length ? '<button class="btn" id="aRetry">Retry failed</button>' : ''}${final ? '' : '<button class="btn ghost" id="aStop">Stop</button>'}<button class="btn ghost" id="aClose">Close</button></div>`;
      $('#aClose', m.el).onclick = () => { stop = true; m.close(); };
      if ($('#aStop', m.el)) $('#aStop', m.el).onclick = () => { stop = true; };
      if ($('#aRetry', m.el)) $('#aRetry', m.el).onclick = () => { todo = failed.map(f => ({ phone: f.phone, name: (job.list.find(x => x.phone === f.phone) || {}).name || '' })); failed = []; run(); };
    }
    async function run() {
      if (running) return; running = true; stop = false; draw();
      while (todo.length && !stop) {
        const chunk = todo.splice(0, 20);
        try {
          const r = await callApi({ template: job.template, lang: job.lang, useName: job.useName, imageUrl: job.imageUrl, recipients: chunk });
          (r.results || []).forEach(x => (x.ok ? sent++ : failed.push(x)));
        } catch (e) { chunk.forEach(c => failed.push({ phone: c.phone, error: e.message })); if (/not set up|Not signed in/i.test(e.message)) { todo = []; } }
        draw();
      }
      running = false; draw(true);
    }
    run();
  }

  function openSender() {
    const c = loadCamp(); if (!c) return;
    const m = modal('<div id="sd"></div>', { wide: true });
    const draw = () => {
      const box = $('#sd', m.el);
      if (c.i >= c.list.length) { saveCamp(null); box.innerHTML = `<h3>All done ✓</h3><p class="muted">The promotion was opened for ${c.list.length} customers.</p><div class="row end"><button class="btn" id="sx">Close</button></div>`; $('#sx', m.el).onclick = () => m.close(); return; }
      const p = c.list[c.i];
      box.innerHTML = `<h3>📣 Sending promotion</h3>
        <div class="row"><div class="grow"><b>${c.i + 1}</b> of ${c.list.length}</div><div class="muted small">${c.i} done</div></div>
        <div style="height:6px;border-radius:6px;background:var(--panel2);overflow:hidden;margin:6px 0 12px"><div style="height:100%;width:${Math.round(c.i / c.list.length * 100)}%;background:var(--gold)"></div></div>
        <div class="card" style="margin-bottom:10px"><b>${esc(p.name || 'Customer')}</b> · +${esc(p.phone)}<pre style="white-space:pre-wrap;font:inherit;margin:8px 0 0;word-break:break-word">${esc(personal(c.text, p.name))}</pre></div>
        <div class="row wrap"><button class="btn big" id="sGo" style="flex:1">Open WhatsApp for ${esc((p.name || '+' + p.phone).split(' ')[0])}</button></div>
        <div class="row" style="margin-top:8px"><button class="btn ghost" id="sSkip">Skip</button><button class="btn ghost" id="sStop">Stop (continue later)</button></div>`;
      $('#sGo', m.el).onclick = () => { window.open(`https://wa.me/${p.phone}?text=${encodeURIComponent(personal(c.text, p.name))}`, '_blank', 'noopener'); c.i++; saveCamp(c); draw(); };
      $('#sSkip', m.el).onclick = () => { c.i++; saveCamp(c); draw(); };
      $('#sStop', m.el).onclick = () => m.close();
    };
    draw();
  }

  // ---------------- personal message / offer to customers registered on the QR menu ----------------
  async function openQrMessage(onlyPhone) {
    const [cr, ir] = await Promise.all([sb.rpc('qr_customer_list'), sb.from('items').select('id,name,price').eq('active', true).order('name')]);
    if (cr.error) return toast(errMsg(cr.error) + ' (run sql/update-13.sql)', 'err', 7000);
    let people = (cr.data || []).slice().sort((a, b) => (b.orders - a.orders) || (a.created_at < b.created_at ? 1 : -1)), items = ir.data || [];   // most QR orders first
    const one = onlyPhone ? people.find(p => normPhone(p.phone) === onlyPhone) : null;
    if (onlyPhone && !one) return toast('This customer is not registered on the QR menu', 'err');
    if (one) { people = [one]; PICK.clear(); PICK.add(one.id); }
    if (!people.length) return toast('Nobody has registered on the QR menu yet', 'err');
    let fq = '';
    const m = modal(`<h3>💬 ${one ? 'Message ' + esc(one.name) : 'Message QR customers'}</h3>
      <p class="muted small" style="margin-top:-4px">${one ? `+${esc(one.phone)} · ${one.orders} QR order${one.orders === 1 ? '' : 's'}` : 'Customers who registered on your QR menu, the ones with the most QR orders first. Send a personal message or offer to the ones you choose.'}</p>
      <div class="row wrap" style="gap:10px;margin-bottom:6px" ${one ? 'hidden' : ''}><input id="mq" type="search" placeholder="Search name / phone" style="max-width:240px"><label class="check" style="margin:0"><input type="checkbox" id="mall"> Select all shown</label><span class="pill info" id="mn"></span></div>
      <div id="ml" style="max-height:190px;overflow:auto;border:1px solid var(--line);border-radius:10px;padding:4px 10px" ${one ? 'hidden' : ''}></div>
      <div style="margin-top:12px">${offerFormHTML(MSG, items, 'm')}</div>
      <div style="margin:10px 0 2px"><b>Send by</b></div>
      <label class="check"><input type="checkbox" id="vq" ${VIA.qr ? 'checked' : ''}> 📱 QR menu + phone notification <span class="muted small">(only the chosen customers see it)</span></label>
      <label class="check"><input type="checkbox" id="vw" ${VIA.wa ? 'checked' : ''}> 💬 WhatsApp <span class="muted small">(opens WhatsApp for each customer with the message and the menu link)</span></label>
      <div class="row end" style="margin-top:12px;gap:8px"><button class="btn ghost" id="mc">Close</button><button class="btn" id="mgo">Send</button></div>`, { wide: true, outside: false });
    const shown = () => people.filter(p => !fq || (p.name || '').toLowerCase().includes(fq) || p.phone.includes(fq.replace(/\D/g, '') || '\u0000'));
    const paint = () => {
      $('#ml', m.el).innerHTML = shown().map(p => `<label class="row" style="gap:8px;padding:5px 0;margin:0;border-bottom:1px solid var(--line)"><input type="checkbox" data-pid="${p.id}" ${PICK.has(p.id) ? 'checked' : ''}><b data-noi18n>${esc(p.name)}</b><span class="muted small">+${esc(p.phone)}</span><div class="spacer"></div><span class="muted small">${p.orders} order${p.orders === 1 ? '' : 's'}</span>${p.push ? '<span title="Can get phone notifications">🔔</span>' : ''}</label>`).join('') || '<div class="muted small" style="padding:8px">No match</div>';
      $('#mn', m.el).textContent = `${PICK.size} selected`;
    };
    paint();
    $('#mq', m.el).oninput = e => { fq = e.target.value.toLowerCase().trim(); paint(); };
    $('#mall', m.el).onchange = e => { shown().forEach(p => (e.target.checked ? PICK.add(p.id) : PICK.delete(p.id))); paint(); };
    $('#ml', m.el).onchange = e => { const b = e.target.closest('[data-pid]'); if (!b) return; if (b.checked) PICK.add(b.dataset.pid); else PICK.delete(b.dataset.pid); $('#mn', m.el).textContent = `${PICK.size} selected`; };
    $('#vq', m.el).onchange = e => { VIA.qr = e.target.checked; }; $('#vw', m.el).onchange = e => { VIA.wa = e.target.checked; };
    const go = $('#mgo', m.el);
    bindOfferForm(m.el, MSG, 'm', b => { go.disabled = b; }, () => items);
    $('#mc', m.el).onclick = () => m.close();
    go.onclick = async () => {
      try {
        const chosen = people.filter(p => PICK.has(p.id)); if (!chosen.length) return toast('Choose at least one customer', 'err');
        const row = offerRow(MSG), hasOffer = row.offer_items.length > 0;
        const viaQr = VIA.qr || hasOffer, viaWa = VIA.wa;
        if (!viaQr && !viaWa) return toast('Choose how to send (QR menu or WhatsApp)', 'err');
        go.disabled = true; let noticeId = '';
        if (viaQr) {
          const { data, error } = await sb.from('qr_notices').insert({ ...row, customer_ids: chosen.map(p => p.id) }).select().single();
          if (error) throw new Error(errMsg(error) + ' (run sql/update-13.sql)');
          noticeId = data.id;
          const r = await qrPush({ kind: 'notice', title: row.title || state.settings.shop_name, body: row.body, image: row.image_url || undefined, offer_id: noticeId, customer_ids: chosen.map(p => p.id) });
          if (r && r.error) toast(`Saved in the QR menu, but phone notification failed: ${r.error}`, 'err', 8000);
          else toast(r && r.sent != null ? `Sent in the QR menu · ${r.sent} phone${r.sent === 1 ? '' : 's'} notified` : 'Sent in the QR menu');
        }
        const text = [row.title && `*${row.title}*`, row.body, `🍞 ${orderUrl()}${noticeId ? '?offer=' + noticeId : ''}`].filter(Boolean).join('\n');
        Object.assign(MSG, newOffer()); PICK.clear();
        m.close();
        if (viaWa) waOneByOne(chosen, text); else toast('Done ✓');
      } catch (e) { toast(errMsg(e), 'err', 6000); go.disabled = false; }
    };
  }
  // WhatsApp cannot be sent in bulk from a normal number: open one chat at a time, you press Send in WhatsApp
  function waOneByOne(list, text) {
    let i = 0;
    const m = modal('<div id="wb"></div>', { outside: false });
    const draw = () => {
      const box = $('#wb', m.el);
      if (i >= list.length) { box.innerHTML = '<h3>All done ✓</h3><p class="muted">WhatsApp was opened for every chosen customer.</p><div class="row end"><button class="btn" id="wx">Close</button></div>'; $('#wx', m.el).onclick = () => m.close(); return; }
      const p = list[i];
      box.innerHTML = `<h3>💬 WhatsApp · ${i + 1} of ${list.length}</h3><p><b data-noi18n>${esc(p.name)}</b> · +${esc(p.phone)}</p>
        <div class="card" style="white-space:pre-wrap;font-size:13px" data-noi18n>${esc(personal(text, p.name))}</div>
        <div class="row end" style="gap:8px;margin-top:10px"><button class="btn ghost" id="wk">Skip</button><button class="btn ghost" id="ws">Stop</button><button class="btn" id="wo">Open WhatsApp</button></div>`;
      $('#wo', m.el).onclick = () => { window.open(`https://wa.me/${p.phone}?text=${encodeURIComponent(personal(text, p.name))}`, '_blank', 'noopener'); i++; draw(); };
      $('#wk', m.el).onclick = () => { i++; draw(); };
      $('#ws', m.el).onclick = () => m.close();
    };
    draw();
  }
  $('#qmsg', root).onclick = () => openQrMessage().catch(e => toast(errMsg(e), 'err'));
  root.addEventListener('click', e => { const b = e.target.closest('[data-a=qrmsg]'); if (b) openQrMessage(b.dataset.p).catch(err => toast(errMsg(err), 'err')); });
  $('#promo', root).onclick = () => { if (!rows.length) return toast('No customers saved yet', 'err'); openComposer(); };
  $('#cq', root).oninput = e => { q = e.target.value.toLowerCase().trim(); draw(); };
  $('#csv', root).onclick = () => downloadCSV('customers.csv', [['Name', 'Phone', 'Visits', 'Total spent', 'Last visit', 'Promos'], ...rows.map(r => [r.name, '+' + r.phone, r.visits, r.total_spent, r.last_visit, r.opt_out ? 'stopped' : 'receives'])]);
  root.onclick = async e => {
    const b = e.target.closest('[data-a]'); if (!b) return;
    const r = rows.find(x => x.phone === b.dataset.p); if (!r) return;
    if (b.dataset.a === 'edit') {
      const name = await promptModal({ title: 'Customer name', label: 'Name', value: r.name || '' }); if (name === null) return;
      const { error } = await sb.from('customers').update({ name: name.trim() }).eq('phone', r.phone);
      if (error) return toast(errMsg(error), 'err'); toast('Saved');
    } else if (b.dataset.a === 'opt') {
      const { error } = await sb.from('customers').update({ opt_out: !r.opt_out }).eq('phone', r.phone);
      if (error) return toast(errMsg(error) + ' (run sql/update-6.sql)', 'err', 6000);
    }
    load();
  };
  const off = onLive(load, 500);
  await load();
  return () => { off(); root.onclick = null; };
}
