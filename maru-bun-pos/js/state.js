import { sb } from './sb.js';

export const DEFAULT_SETTINGS = {
  id: 1,
  shop_name: 'මරු Bun',
  tagline: 'The Taste of Something Special.',
  address: 'PVHX+2RG New Bridge Bus Stop, Panadura, Moratuwa',
  phone: '',
  whatsapp: '',
  review_link: '',
  service_charge_enabled: false,
  service_charge_pct: 10,
  discount_pct: 0,
  cashier: '',
  payment_methods: ['cash', 'card', 'bank', 'qr'],
  bill_footer: 'Thank you! Come again.',
};

export const state = {
  user: null,
  settings: { ...DEFAULT_SETTINGS },
  own: new Set(), // "orderId:status" keys created by this device (so we don't alert ourselves)
};

export async function loadSettings() {
  const { data } = await sb.from('settings').select('*').eq('id', 1).maybeSingle();
  state.settings = { ...DEFAULT_SETTINGS, ...(data || {}) };
  return state.settings;
}

export async function saveSettings(patch) {
  const next = { ...state.settings, ...patch, id: 1 };
  const { error } = await sb.from('settings').upsert(next);
  if (error) throw error;
  state.settings = next;
  window.dispatchEvent(new Event('settings-changed'));
}
