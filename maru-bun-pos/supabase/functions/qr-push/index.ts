// Supabase Edge Function: qr-push
// Sends a phone notification (Web Push) to customers of the QR ordering page, even when their page is closed.
// Called by the POS when: an order is confirmed / rejected / ready, or when you send an offer.
// Secrets (Supabase > Edge Functions > Secrets):
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY   (see README Update 16)
//   VAPID_SUBJECT                         (optional, e.g. mailto:you@example.com)
// SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase automatically.
import webpush from 'npm:web-push@3.6.7';

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const env = (k: string) => Deno.env.get(k) || '';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const base = env('SUPABASE_URL'), svc = env('SUPABASE_SERVICE_ROLE_KEY');

  // only a signed-in staff user may send (the public anon key alone is not enough)
  const u = await fetch(`${base}/auth/v1/user`, { headers: { Authorization: req.headers.get('Authorization') || '', apikey: env('SUPABASE_ANON_KEY') } });
  if (!u.ok) return json({ error: 'Not signed in' }, 401);

  let b: Record<string, string> = {};
  try { b = await req.json(); } catch { /* empty */ }
  if (!env('VAPID_PUBLIC_KEY') || !env('VAPID_PRIVATE_KEY')) return json({ error: 'VAPID keys are not set (Edge Functions > Secrets)' }, 400);
  if (b.ping) return json({ configured: true });
  webpush.setVapidDetails(env('VAPID_SUBJECT') || 'mailto:admin@example.com', env('VAPID_PUBLIC_KEY'), env('VAPID_PRIVATE_KEY'));

  const rest = (path: string) => fetch(`${base}/rest/v1/${path}`, { headers: { apikey: svc, Authorization: `Bearer ${svc}` } }).then((r) => r.json());
  const uuid = /^[0-9a-f-]{36}$/i;
  let subs: { id: string; endpoint: string; p256dh: string; auth: string }[] = [];
  let payload: Record<string, string> = {};

  if (b.kind === 'notice') {
    subs = await rest('qr_push?select=id,endpoint,p256dh,auth&limit=2000');
    payload = { kind: 'notice', title: String(b.title || 'මරු Bun').slice(0, 80), body: String(b.body || '').slice(0, 300), tag: 'mb-notice' };
  } else if (['confirmed', 'rejected', 'ready'].includes(b.kind)) {
    const key = b.qr_id ? `id=eq.${b.qr_id}` : `order_id=eq.${b.order_id}`;
    if (!uuid.test(b.qr_id || b.order_id || '')) return json({ error: 'Bad id' }, 400);
    const q = (await rest(`qr_orders?select=code,customer_id,reason&${key}&limit=1`))[0];
    if (!q) return json({ sent: 0 });
    subs = await rest(`qr_push?select=id,endpoint,p256dh,auth&customer_id=eq.${q.customer_id}`);
    const t = ({
      confirmed: ['Order confirmed 👨‍🍳', `Your order ${q.code} is being prepared.`],
      ready: ['Your order is ready! 🔔', `Order ${q.code} is ready. Please come to the counter.`],
      rejected: ['Sorry, order not accepted', `Order ${q.code} could not be accepted.${q.reason ? ' ' + q.reason : ''}`],
    } as Record<string, string[]>)[b.kind];
    payload = { kind: b.kind, title: t[0], body: t[1], tag: 'mb-' + q.code };
  } else return json({ error: 'Unknown kind' }, 400);

  let sent = 0; const dead: string[] = [];
  await Promise.all(subs.map(async (s) => {
    try { await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify({ ...payload, url: 'order.html' }), { TTL: 3600 }); sent++; }
    catch (e) { const code = (e as { statusCode?: number }).statusCode; if (code === 404 || code === 410) dead.push(s.id); }
  }));
  if (dead.length) await fetch(`${base}/rest/v1/qr_push?id=in.(${dead.join(',')})`, { method: 'DELETE', headers: { apikey: svc, Authorization: `Bearer ${svc}` } });
  return json({ sent, removed: dead.length });
});
