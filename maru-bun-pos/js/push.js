// POS side: ask the Edge Function "qr-push" to send a phone notification to QR customers (never blocks or breaks the POS).
import { sb } from './sb.js';
export async function qrPush(body) {
  try { const r = await sb.functions.invoke('qr-push', { body }); return r && r.data; } catch (e) { console.warn('qr-push', e); return null; }
}
