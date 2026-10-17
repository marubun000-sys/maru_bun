import { sb, DEMO } from '../sb.js';
import { state, saveSettings } from '../state.js';
import { $, esc, num, toast, ico, confirmBox, errMsg } from '../utils.js';

const METHODS = [['cash', 'Cash'], ['card', 'Card'], ['bank', 'Bank Transfer'], ['qr', 'QR Pay']];

export async function render(root) {
  const s = state.settings;
  root.innerHTML = `
  <div class="cols">
    <div class="card"><h2>Counter / Cashier on duty</h2>
      <label>Name of the person at the counter now<input id="cashier" value="${esc(s.cashier)}" placeholder="e.g. Kasun"></label>
      <p class="muted small">Printed on every bill. You can also change it from the top bar.</p>
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
    if (k === 'cashier') return save({ cashier: $('#cashier', root).value.trim() }, 'Cashier saved');
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
}
