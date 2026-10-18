import { sb } from '../sb.js';
import { state } from '../state.js';
import { $, esc, fmt, dtstr, toast, ico, errMsg, onLive, downloadCSV, modal, promptModal } from '../utils.js';

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
      <button class="btn ghost sm" id="csv">${ico('download', 14)} Export CSV</button></div>
    <p class="muted small" style="margin-top:-6px">Every customer WhatsApp number typed in POS is saved here automatically.</p>
    <input id="cq" type="search" placeholder="Search name / phone" style="max-width:340px;margin-bottom:10px">
    <div id="err"></div>
    <div class="tbl-wrap"><table><thead><tr><th>Name</th><th>Phone</th><th class="r">Visits</th><th class="r">Total spent (LKR)</th><th>Last visit</th><th>Promos</th><th></th></tr></thead><tbody id="rows"></tbody></table></div>`;

  const list = () => rows.filter(r => !q || (r.name || '').toLowerCase().includes(q) || r.phone.includes(q.replace(/\D/g, '') || '\u0000'));
  function draw() {
    const l = list();
    $('#cnt', root).textContent = `${rows.length} customers`;
    $('#rows', root).innerHTML = l.length ? l.map(r => `<tr><td><b>${esc(r.name || '—')}</b></td><td>+${esc(r.phone)}</td><td class="r">${r.visits}</td><td class="r">${fmt(r.total_spent)}</td><td>${dtstr(r.last_visit)}</td>
      <td><button class="pill ${r.opt_out ? 'bad' : 'ok'}" data-a="opt" data-p="${esc(r.phone)}" title="Tap to change">${r.opt_out ? 'Stopped' : 'Receives'}</button></td>
      <td class="r" style="white-space:nowrap"><a class="btn ghost sm" target="_blank" rel="noopener" href="https://wa.me/${esc(r.phone)}">WhatsApp</a> <button class="btn ghost sm" data-a="edit" data-p="${esc(r.phone)}">${ico('edit', 14)}</button></td></tr>`).join('') : '<tr><td colspan="7" class="empty">No customers yet</td></tr>';
  }
  async function load() {
    const { data, error } = await sb.from('customers').select('*').order('last_visit', { ascending: false });
    if (error) { $('#err', root).innerHTML = `<div class="err">${esc(errMsg(error))}<br><small>Run sql/update-3.sql in the Supabase SQL Editor first.</small></div>`; return; }
    $('#err', root).innerHTML = ''; rows = data || []; draw();
  }

  // ---------------- send promotion ----------------
  function openComposer() {
    const s = state.settings, saved = loadCamp(), resume = saved && saved.i < saved.list.length;
    let imageUrl = '', busy = false;
    const m = modal(`<h3>📣 Send promotion</h3>
      ${resume ? `<div class="card" style="margin-bottom:10px"><b>Unfinished promotion</b> · ${saved.i} of ${saved.list.length} done<div class="row" style="margin-top:8px"><button class="btn sm" id="pResume">Continue</button><button class="btn ghost sm" id="pDrop">Discard</button></div></div>` : ''}
      <label>Message<textarea id="pText" rows="6">Hi {name}! 🍞 Fresh hot buns are waiting for you at ${esc(s.shop_name)}.\nCome visit us today!\n📍 ${esc(s.address)}</textarea></label>
      <div class="muted small" style="margin:-4px 0 8px">{name} is replaced with each customer's first name.</div>
      <label>Photo / poster (optional)<input type="file" id="pFile" accept="image/*"></label>
      <div id="pPrev" class="muted small"></div>
      <div class="muted small" style="margin-top:8px">Send to</div>
      <label class="check"><input type="radio" name="pw" value="all" checked> All customers</label>
      <label class="check"><input type="radio" name="pw" value="recent"> Visited in the last <input id="pDays" type="number" min="1" value="30" style="width:80px;display:inline-block"> days</label>
      <label class="check"><input type="radio" name="pw" value="loyal"> At least <input id="pVis" type="number" min="1" value="2" style="width:80px;display:inline-block"> visits</label>
      <div style="margin:8px 0"><span class="pill info" id="pCount"></span></div>
      <p class="muted small">WhatsApp does not allow apps to send to many people automatically. Next you tap one button per customer and press Send in WhatsApp. People marked <b>Stopped</b> are skipped.</p>
      <div class="row end"><button class="btn ghost" id="pCancel">Cancel</button><button class="btn" id="pGo">Start sending</button></div>`, { wide: true });

    const pick = () => {
      const w = (m.el.querySelector('input[name=pw]:checked') || {}).value;
      const days = Number($('#pDays', m.el).value) || 30, vis = Number($('#pVis', m.el).value) || 2;
      return rows.filter(r => !r.opt_out && (w === 'all' || (w === 'recent' && Date.now() - new Date(r.last_visit) <= days * 864e5) || (w === 'loyal' && r.visits >= vis)));
    };
    const count = () => { $('#pCount', m.el).textContent = `${pick().length} customers will get it`; };
    m.el.addEventListener('input', count); m.el.addEventListener('change', count); count();

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
        $('#pPrev', m.el).innerHTML = `<img src="${URL.createObjectURL(blob)}" alt="" style="max-width:100%;max-height:200px;border-radius:10px;display:block;margin-top:6px"><span class="pill ok">Photo ready – its link is added to the message</span>`;
      } catch (err) {
        $('#pPrev', m.el).innerHTML = `<div class="err">${esc(errMsg(err))}<br><small>Run sql/update-6.sql in the Supabase SQL Editor first.</small></div>`; e.target.value = '';
      }
      busy = false; $('#pGo', m.el).disabled = false;
    };
    $('#pGo', m.el).onclick = () => {
      if (busy) return;
      const text = $('#pText', m.el).value.trim(); if (!text) return toast('Write a message first', 'err');
      const l = pick().map(r => ({ phone: r.phone, name: r.name || '' }));
      if (!l.length) return toast('No customers match', 'err');
      saveCamp({ text: text + (imageUrl ? '\n\n' + imageUrl : ''), list: l, i: 0 });
      m.close(); openSender();
    };
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
