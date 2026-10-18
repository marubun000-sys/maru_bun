// Device registry: first device = admin, others need the admin's approval.
import { sb, DEMO } from './sb.js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';
import { getCashier } from './state.js';

const ls = { get: k => { try { return localStorage.getItem(k) || ''; } catch { return ''; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } }, del: k => { try { localStorage.removeItem(k); } catch { /* ignore */ } } };

export const deviceId = () => { let id = ls.get('mb_device_id'); if (!id) { id = crypto.randomUUID(); ls.set('mb_device_id', id); } return id; };
export const getDeviceName = () => ls.get('mb_device_name');
export const setDeviceName = n => ls.set('mb_device_name', String(n || '').trim());
export const forgetDevice = () => { ls.del('mb_device_id'); ls.del('mb_device_name'); };
export function guessName() {
  const u = navigator.userAgent;
  return /iPad|Tablet/i.test(u) ? 'Tablet' : /Android/i.test(u) ? 'Android phone' : /iPhone/i.test(u) ? 'iPhone' : /Windows/i.test(u) ? 'Windows computer' : /Mac/i.test(u) ? 'Mac computer' : 'Computer';
}

let me = null;                                   // this device's row (null = registry not available -> everything allowed)
export const myDevice = () => me;
export const isAdminDevice = () => !me || !!me.is_admin;
export const amAdmin = () => !!(me && me.is_admin);          // really the admin device (registry is on)

const asRow = d => (Array.isArray(d) ? d[0] : d) || null;

export async function registerDevice(email) {
  const { data, error } = await sb.rpc('register_device', { p_id: deviceId(), p_name: getDeviceName(), p_cashier: getCashier(), p_email: email || '', p_ua: navigator.userAgent.slice(0, 200) });
  if (error) return { error };
  me = asRow(data); return { row: me };
}
// undefined = could not check (network) · null = this device was removed by the admin
export async function fetchMe() {
  const { data, error } = await sb.from('devices').select('*').eq('id', deviceId()).maybeSingle();
  if (error) return undefined;
  me = data || null; return me;
}
export async function listDevices() {
  const { data, error } = await sb.from('devices').select('*').order('created_at', { ascending: true });
  if (error) throw error; return data || [];
}
const adminOnly = { error: { message: 'Only the admin device can do this' } };
export const approveDevice = async id => (amAdmin() ? sb.from('devices').update({ status: 'approved' }).eq('id', id) : adminOnly);
export const removeDevice = async id => (amAdmin() ? sb.from('devices').delete().eq('id', id) : adminOnly);
// ---- a non-admin device asks the admin to let it into Settings & Security ----
export const requestSettings = () => sb.from('devices').update({ settings_req: 'requested', settings_req_at: new Date().toISOString() }).eq('id', deviceId());
export const clearSettingsRequest = () => sb.from('devices').update({ settings_req: '' }).eq('id', deviceId());
export const answerSettings = (id, v) => (amAdmin() ? sb.from('devices').update({ settings_req: v, settings_req_at: new Date().toISOString() }).eq('id', id) : adminOnly);
export const fresh = d => !!d && !!d.settings_req_at && Date.now() - new Date(d.settings_req_at).getTime() < 3 * 60000;
export const renameDevice = (id, name) => sb.from('devices').update({ name }).eq('id', id);

// keep the cashier name shown in Settings up to date
window.addEventListener('cashier-changed', async () => {
  if (!me) return;
  try { await sb.from('devices').update({ cashier: getCashier(), last_seen: new Date().toISOString() }).eq('id', deviceId()); } catch { /* ignore */ }
});

// ---- Settings & Security lock for non-admin devices (asked EVERY time the page is opened) ----
export async function verifyAdmin(email, password) {
  const { data } = await sb.from('devices').select('email').eq('is_admin', true).limit(1);
  const adminEmail = ((data && data[0] && data[0].email) || '').toLowerCase();
  if (!adminEmail || adminEmail !== String(email).trim().toLowerCase()) return false;
  if (DEMO) return password === 'admin123';
  try {
    const c = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false, storageKey: 'mb-verify' } });
    const { error } = await c.auth.signInWithPassword({ email: adminEmail, password });
    try { await c.auth.signOut({ scope: 'local' }); } catch { /* ignore */ }
    return !error;
  } catch { return false; }
}
