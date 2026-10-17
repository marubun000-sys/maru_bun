import { createClient } from '@supabase/supabase-js'
import { createDemoClient } from './demoClient'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

// No Supabase keys -> runs in DEMO mode (data stays in this browser only).
export const DEMO = !url || !key
export const supabase = DEMO ? createDemoClient() : createClient(url, key)
