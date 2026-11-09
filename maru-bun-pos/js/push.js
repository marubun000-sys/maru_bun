// POS side: ask the Edge Function "qr-push" to send a phone notification to QR customers (never blocks or breaks the POS).
// Returns { sent, removed } or { error: 'why it failed' }.
import { sb } from './sb.js';
export async function qrPush(body) {
  try {
    const r = await sb.functions.invoke('qr-push', { body });
    if (r && r.error) {
      let msg = r.error.message || 'failed';
      try { const j = await r.error.context.json(); if (j && j.error) msg = j.error; } catch { /* keep message */ }
      if (/not found|404|relay|failed to send|fetch/i.test(msg)) msg = 'the qr-push function is not deployed in Supabase yet';
      return { error: msg };
    }
    return r && r.data ? r.data : null;
  } catch (e) { console.warn('qr-push', e); return { error: (e && e.message) || 'failed' }; }
}
