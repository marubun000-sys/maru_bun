import { sb, DEMO } from '../sb.js';
import { state, saveSettings, getCashier, setCashier } from '../state.js';
import { $, esc, num, toast, ico, confirmBox, errMsg, promptModal, onLive, dtstr } from '../utils.js';
import { isAdminDevice, isUnlocked, setUnlocked, verifyAdmin, listDevices, approveDevice, removeDevice, renameDevice, deviceId, myDevice, setDeviceName } from '../device.js';

const METHODS = [['cash', 'Cash'], ['card', 'Card'], ['bank', 'Bank Transfer'], ['qr', 'QR Pay']];

// Other devices must type the ADMIN's email + password to open this page
export async function render(root) {
  let inner = null;
  const open = async () => { inner = await renderInner(root); };
  if (!isAdminDevice() && !isUnlocked()) {
    root.innerHTML = `<div class="card" style="max-width:420px;margin:30px auto"><h2>${ico('shield')} Admin only</h2>
      <p class="muted small">Enter the admin's email and password to open Settings &amp; Security on this device.</p>
      <div id="ue"></div>
      <form id="uf"><label>Admin email<input type="email" id="ue1" autocomplete="off" required></label>
      <label>Admin password<input type="password" id="up" autocomplete="off" required></label>
      <button class="btn big" id="ub">Unlock</button></form></div>`;
    $('#uf', root).onsubmit = async e => {
      e.preventDefault(); const b = $('#ub', root); b.disabled = true;
      const ok = await verifyAdmin($('#ue1', root).value, $('#up', root).value);
      b.disabled = false;
      if (!ok) { $('#ue', root).innerHTML = '<div class="err">Wrong admin email or password</div>'; $('#up', root).value = ''; return; }
      setUnlocked(); root.innerHTML = ''; await open();
    };
  } else await open();
  return () => { if (typeof inner === 'function') inner(); };
}

async function renderInner(root) {
  const s = state.settings;
  root.innerHTML = `
  <div class="card" id="devCard"><h2>${ico('shield')} Devices &amp; cashiers</h2>
    <p class="muted small">Every phone / computer that signs in appears here with the cashier on duty. New devices cannot use the POS until you approve them. <b>Admin</b> = the first device.</p>
    <div class="tbl-wrap"><table><thead><tr><th>Device</th><th>Cashier on duty</th><th>Status</th><th>Last seen</th><th></th></tr></thead><tbody id="devRows"><tr><td colspan="5" class="empty">Loading…</td></tr></tbody></table></div>
  </div>

  <div class="cols">
    <div class="card"><h2>Counter / Cashier on duty</h2>
      <label>Name of the person at the counter now<input id="cashier" value="${esc(getCashier())}" placeholder="e.g. Kasun"></label>
      <p class="muted small">Printed on every bill made on THIS device. Each phone / counter has its own cashier name, so other devices keep their own. You can also change it from the top bar.</p>
      <button class="btn" data-save="cashier">Save cashier</button>
    </div>

    <div class="card"><h2>Billing</h2>
      <label class="check"><input type="checkbox" id="scOn" ${s.service_charge_enabled ? 'checked' : ''}> Add service charge to new bills by default</label>
      <div class="two"><label>Service charge %<input id="scPct" type="number" min="0" max="100" step="any" value="${num(s.service_charge_pct)}"></label>
      <label>Default discount %<input id="dPct" type="number" min="0" max="100" step="any" value="${num(s.discount_pct)}"></label></div>
      <div class="muted small" style="margin-bottom:6px">Payment methods</div>
      ${METHODS.map(([k, l]) => `<label class="check"><input type="checkbox" data-pm="${k}" ${(s.payment_methods || []).includes(k) ? 'checked' : ''}> ${l}</label>`).join('')}
      <p class="muted small">Cashier can still change service charge / discount on every bill in POS.</p>
      <button class="btn" data-save="billing">Save billing</button>
    </div>
  </div>

  <div class="cols">
    <div class="card"><h2>Shop details (printed on bills)</h2>
      <label>Shop name<input id="shop" value="${esc(s.shop_name)}"></label>
      <label>Tagline<input id="tag" value="${esc(s.tagline)}"></label>
      <label>Address<input id="addr" value="${esc(s.address)}"></label>
      <div class="two"><label>Shop phone<input id="phone" inputmode="tel" value="${esc(s.phone)}"></label>
      <label>Shop WhatsApp<input id="wa" inputmode="tel" value="${esc(s.whatsapp)}"></label></div>
      <label>Bill footer message<input id="foot" value="${esc(s.bill_footer)}"></label>
      <button class="btn" data-save="shop">Save shop details</button>
    </div>

    <div class="card" id="secCard"><h2>${ico('shield')} Security</h2><div id="mfa"><div class="muted">Loading…</div></div>
      <hr style="border:0;border-top:1px solid var(--line);margin:16px 0">
      <h3>Change password</h3>
      <div class="two"><label>New password<input id="np" type="password" autocomplete="new-password" minlength="8"></label>
      <label>Repeat<input id="np2" type="password" autocomplete="new-password"></label></div>
      <button class="btn ghost" id="chpw">Change password</button>
    </div>
  </div>`;

  // ---------- save handlers ----------
  const save = async (patch, msg = 'Saved') => { try { await saveSettings(patch); toast(msg); } catch (e) { toast(errMsg(e), 'err', 6000); } };
  root.querySelectorAll('[data-save]').forEach(b => b.onclick = () => {
    const k = b.dataset.save;
    if (k === 'cashier') { setCashier($('#cashier', root).value); return toast('Cashier saved for this device'); }
    if (k === 'billing') {
      const pm = [...root.querySelectorAll('[data-pm]')].filter(c => c.checked).map(c => c.dataset.pm);
      if (!pm.length) return toast('Select at least one payment method', 'err');
      const sc = num($('#scPct', root).value), dp = num($('#dPct', root).value);
      if (sc < 0 || sc > 100 || dp < 0 || dp > 100) return toast('Percentages must be between 0 and 100', 'err');
      return save({ service_charge_enabled: $('#scOn', root).checked, service_charge_pct: sc, discount_pct: dp, payment_methods: pm }, 'Billing settings saved');
    }
    if (k === 'shop') {
      const name = $('#shop', root).value.trim(); if (!name) return toast('Shop name is required', 'err');
      return save({ shop_name: name, tagline: $('#tag', root).value.trim(), address: $('#addr', root).value.trim(), phone: $('#phone', root).value.trim(), whatsapp: $('#wa', root).value.trim(), bill_footer: $('#foot', root).value.trim() }, 'Shop details saved');
    }
  });

  // ---------- password ----------
  $('#chpw', root).onclick = async () => {
    const a = $('#np', root).value, b = $('#np2', root).value;
    if (a.length < 8) return toast('Password must be at least 8 characters', 'err');
    if (a !== b) return toast('Passwords do not match', 'err');
    const { error } = await sb.auth.updateUser({ password: a });
    if (error) return toast(errMsg(error), 'err', 6000);
    $('#np', root).value = ''; $('#np2', root).value = ''; toast('Password changed');
  };

  // ---------- 2-step verification (TOTP authenticator app) ----------
  const box = $('#mfa', root);
  async function drawMfa() {
    const { data, error } = await sb.auth.mfa.listFactors();
    if (error) { box.innerHTML = `<div class="err">${esc(errMsg(error))}</div>`; return; }
    const verified = (data.totp || [])[0];
    if (verified) {
      box.innerHTML = `<div class="row wrap"><span class="pill ok">2-step verification is ON</span><div class="spacer"></div><button class="btn ghost sm" id="mfaOff">Turn off</button></div>
        <p class="muted small">Every login asks for a 6-digit code from your authenticator app (Google Authenticator, Microsoft Authenticator, Authy…).</p>`;
      $('#mfaOff', box).onclick = async () => {
        if (!await confirmBox('Turn off 2-step verification? Your account will be less secure.', 'Turn off')) return;
        const { error: e } = await sb.auth.mfa.unenroll({ factorId: verified.id });
        if (e) return toast(errMsg(e), 'err', 6000);
        toast('2-step verification turned off'); drawMfa();
      };
    } else {
      box.innerHTML = `<div class="row wrap"><span class="pill warn">2-step verification is OFF</span><div class="spacer"></div><button class="btn sm" id="mfaOn">Turn on</button></div>
        <p class="muted small">Adds a second lock: password + a code from your phone.</p><div id="enroll"></div>`;
      $('#mfaOn', box).onclick = startEnroll;
    }
  }
  async function startEnroll() {
    // remove half-finished attempts first
    const { data: all } = await sb.auth.mfa.listFactors();
    for (const f of (all && all.all) || []) if (f.status !== 'verified' && !f.verified) await sb.auth.mfa.unenroll({ factorId: f.id });
    const { data, error } = await sb.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'MaruBun-' + Date.now() });
    if (error) return toast(errMsg(error) + (/not enabled|disabled/i.test(errMsg(error)) ? ' — enable TOTP in Supabase: Authentication > Multi-Factor' : ''), 'err', 8000);
    $('#mfaOn', box).hidden = true;
    $('#enroll', box).innerHTML = `<div style="background:#fff;border-radius:12px;padding:10px;width:200px;margin:10px 0"><img src="${data.totp.qr_code}" alt="QR" width="180" height="180"></div>
      <p class="muted small">1. Open your authenticator app → add account → scan this QR.<br>No camera? Enter this key: <code style="color:var(--gold);word-break:break-all">${esc(data.totp.secret)}</code></p>
      <form id="vf" class="row"><input id="vc" inputmode="numeric" maxlength="6" placeholder="6-digit code" required style="max-width:160px"><button class="btn">Verify & turn on</button></form>`;
    $('#vf', box).onsubmit = async e => {
      e.preventDefault();
      const { error: ve } = await sb.auth.mfa.challengeAndVerify({ factorId: data.id, code: $('#vc', box).value.trim() });
      if (ve) return toast(errMsg(ve), 'err', 6000);
      toast('2-step verification is now ON'); drawMfa();
    };
  }
  await drawMfa();

  // ---------- devices ----------
  let devs = [];
  async function drawDevs() {
    try { devs = await listDevices(); } catch (e) { $('#devRows', root).innerHTML = `<tr><td colspan="5"><div class="err">${esc(errMsg(e))}<br><small>Run sql/update-4.sql in the Supabase SQL Editor.</small></div></td></tr>`; return; }
    const meId = deviceId();
    $('#devRows', root).innerHTML = devs.map(d => `<tr>
      <td><b>${esc(d.name || 'Unnamed')}</b> ${d.id === meId ? '<span class="pill info">This device</span>' : ''} ${d.is_admin ? '<span class="pill ok">Admin</span>' : ''}<br><span class="muted small">${esc(d.email || '')}</span></td>
      <td>${d.cashier ? '<b>' + esc(d.cashier) + '</b>' : '<span class="muted">not set</span>'}</td>
      <td>${d.status === 'approved' ? '<span class="pill ok">Approved</span>' : '<span class="pill warn">Waiting</span>'}</td>
      <td class="muted small">${dtstr(d.last_seen)}</td>
      <td class="r" style="white-space:nowrap">${d.status === 'pending' ? `<button class="btn sm" data-dv="ok" data-id="${esc(d.id)}">Approve</button> ` : ''}
        ${d.id === meId ? `<button class="btn ghost sm" data-dv="ren" data-id="${esc(d.id)}">${ico('edit', 14)}</button>` : ''}
        ${d.is_admin ? '' : `<button class="btn ghost sm" data-dv="del" data-id="${esc(d.id)}">${ico('trash', 14)} Remove</button>`}</td></tr>`).join('') || '<tr><td colspan="5" class="empty">No devices yet</td></tr>';
  }
  $('#devCard', root).onclick = async e => {
    const b = e.target.closest('[data-dv]'); if (!b) return;
    const d = devs.find(x => x.id === b.dataset.id); if (!d) return;
    try {
      if (b.dataset.dv === 'ok') { const { error } = await approveDevice(d.id); if (error) throw error; toast(`${d.name || 'Device'} approved`); }
      if (b.dataset.dv === 'del') { if (!await confirmBox(`Remove "${d.name || 'this device'}"? It will be signed out and must be approved again.`, 'Remove')) return; const { error } = await removeDevice(d.id); if (error) throw error; toast('Device removed'); }
      if (b.dataset.dv === 'ren') { const v = await promptModal({ title: 'Device name', label: 'Name of this device', value: d.name || '' }); if (!v || !v.trim()) return; const { error } = await renameDevice(d.id, v.trim()); if (error) throw error; setDeviceName(v); }
    } catch (err) { return toast(errMsg(err), 'err', 6000); }
    drawDevs();
  };
  const offDev = onLive(drawDevs, 400);
  await drawDevs();
  return () => offDev();
}
