// Security helpers: authenticator-code check, and alerts for the admin device.
import { sb } from './sb.js';
import { $, esc, modal, errMsg } from './utils.js';
import { deviceId, getDeviceName, amAdmin } from './device.js';
import { getCashier } from './state.js';

// Ask for the 6-digit code from the authenticator app. Resolves true only when the code is right.
// (If 2-step verification is not turned on there is no code to ask for -> true.)
export async function askAuthCode(title = 'Enter your authenticator code') {
  const { data } = await sb.auth.mfa.listFactors();
  const f = data && data.totp && data.totp[0];
  if (!f) return true;
  return new Promise(resolve => {
    let fin = false; const end = v => { if (!fin) { fin = true; resolve(v); } };
    const m = modal(`<h3>🔐 ${esc(title)}</h3>
      <p class="muted small">Open your authenticator app (Google Authenticator …) and type the 6-digit code.</p>
      <div id="ae"></div>
      <form id="af"><input id="ac" inputmode="numeric" autocomplete="one-time-code" maxlength="6" required style="text-align:center;font-size:22px;letter-spacing:6px" placeholder="••••••">
      <div class="row end" style="margin-top:12px"><button type="button" class="btn ghost" data-c>Cancel</button><button class="btn">Confirm</button></div></form>`, { onClose: () => end(false) });
    $('#ac', m.el).focus();
    $('[data-c]', m.el).onclick = () => m.close();
    $('#af', m.el).onsubmit = async e => {
      e.preventDefault();
      const { error } = await sb.auth.mfa.challengeAndVerify({ factorId: f.id, code: $('#ac', m.el).value.trim() });
      if (error) { $('#ae', m.el).innerHTML = `<div class="err">${esc(errMsg(error))}</div>`; $('#ac', m.el).select(); return; }
      end(true); m.close();
    };
  });
}

// Tell the admin device that another device changed the password / turned 2-step off. (Never blocks the change.)
export async function alertAdmin(kind) {
  if (amAdmin()) return;                           // the admin device itself needs no alert
  try { await sb.from('security_alerts').insert({ kind, device_id: deviceId(), device_name: getDeviceName(), cashier: getCashier() }); }
  catch (e) { console.warn('alert not sent (run sql/update-9.sql)', e); }
}
