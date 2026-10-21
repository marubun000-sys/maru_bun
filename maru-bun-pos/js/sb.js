import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';
import { createDemo } from './demo.js';

// opened from a "reset password" email? (must be read before supabase-js clears the link from the address bar)
export const RECOVERY_LINK = /type=recovery/.test(location.hash);
export const DEMO = !SUPABASE_URL || !SUPABASE_ANON_KEY;

async function waitForLib() {
  for (let i = 0; i < 60; i++) { if (window.supabase && window.supabase.createClient) return true; await new Promise(r => setTimeout(r, 100)); }
  return false;
}

let client;
if (DEMO) client = createDemo();
else {
  if (!(await waitForLib())) {
    document.body.innerHTML = '<p style="padding:24px;font-family:sans-serif;color:#fff;background:#111">Could not load the Supabase library (internet problem?). Please refresh.</p>';
    throw new Error('supabase-js not loaded');
  }
  client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true } });
}
export const sb = client;
