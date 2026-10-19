// Supabase Edge Function: send-promo
// Sends a WhatsApp *template* message (optionally with a photo header) to many customers using the
// official WhatsApp Business Cloud API. Secrets (set in Supabase > Edge Functions > Secrets):
//   WA_TOKEN    = permanent access token from Meta
//   WA_PHONE_ID = WhatsApp "Phone number ID" from Meta

type Env = Record<string, string | undefined>;
type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;

interface Recipient { phone?: string; name?: string }
interface Body {
  ping?: boolean;
  template?: string;
  lang?: string;
  imageUrl?: string;
  useName?: boolean;
  recipients?: Recipient[];
}
interface Result { phone: string; ok: boolean; id?: string; error?: string }

const GRAPH = 'https://graph.facebook.com/v21.0';
const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (o: unknown, status = 200): Response =>
  new Response(JSON.stringify(o), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
const msgOf = (e: unknown): string => (e instanceof Error ? e.message : String(e));

export async function handle(req: Request, env: Env, fetchImpl: FetchFn = fetch, pause = 150): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  // only a signed-in staff user may use this (the public anon key alone is not enough)
  const u = await fetchImpl(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: { Authorization: req.headers.get('Authorization') || '', apikey: env.SUPABASE_ANON_KEY || '' },
  });
  if (!u.ok) return json({ error: 'Not signed in' }, 401);

  let body: Body = {};
  try { body = (await req.json()) as Body; } catch { /* empty body */ }

  const configured = !!(env.WA_TOKEN && env.WA_PHONE_ID);
  if (body.ping) return json({ configured });
  if (!configured) return json({ error: 'WhatsApp API is not set up yet (secrets WA_TOKEN and WA_PHONE_ID are missing)' }, 400);

  const template = String(body.template || '').trim();
  const lang = String(body.lang || 'en').trim();
  if (!/^[a-z0-9_]{1,512}$/.test(template)) return json({ error: 'Template name must be lowercase letters, numbers and _ only' }, 400);
  if (!/^[a-z]{2,3}(_[A-Z]{2})?$/.test(lang)) return json({ error: 'Language code looks wrong (example: en, si, en_US)' }, 400);

  const list: Recipient[] = Array.isArray(body.recipients) ? body.recipients : [];
  if (!list.length || list.length > 50) return json({ error: 'Send 1 to 50 customers per request' }, 400);
  const image = body.imageUrl ? String(body.imageUrl) : '';
  if (image && !/^https:\/\//.test(image)) return json({ error: 'Photo link must be https' }, 400);

  const results: Result[] = [];
  for (const r of list) {
    const phone = String(r.phone || '').replace(/\D/g, '');
    if (phone.length < 9 || phone.length > 15) { results.push({ phone, ok: false, error: 'Bad phone number' }); continue; }

    const components: unknown[] = [];
    if (image) components.push({ type: 'header', parameters: [{ type: 'image', image: { link: image } }] });
    if (body.useName) {
      const first = String(r.name || '').trim().split(/\s+/)[0] || 'friend';
      components.push({ type: 'body', parameters: [{ type: 'text', text: first.replace(/[\r\n\t]+/g, ' ').slice(0, 60) }] });
    }

    try {
      const res = await fetchImpl(`${GRAPH}/${env.WA_PHONE_ID}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.WA_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: phone,
          type: 'template',
          template: { name: template, language: { code: lang }, components },
        }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        messages?: { id?: string }[];
        error?: { message?: string; error_user_msg?: string };
      };
      if (res.ok) results.push({ phone, ok: true, id: j.messages?.[0]?.id || '' });
      else results.push({ phone, ok: false, error: j.error?.error_user_msg || j.error?.message || `HTTP ${res.status}` });
    } catch (e) {
      results.push({ phone, ok: false, error: msgOf(e) });
    }
    await sleep(pause);
  }
  return json({ results });
}

// Supabase / Deno runtime entry point
const deno = (globalThis as unknown as { Deno?: { serve: (h: (r: Request) => Promise<Response>) => void; env: { toObject: () => Env } } }).Deno;
if (deno) deno.serve((req) => handle(req, deno.env.toObject()));
