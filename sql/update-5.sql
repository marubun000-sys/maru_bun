-- ============================================================
-- මරු Bun POS - UPDATE 5  (safe to run more than once)
--   * Other devices must ask the ADMIN to allow them into Settings & Security
-- Supabase > SQL Editor > New query > paste all > Run
-- ============================================================
alter table public.devices add column if not exists settings_req    text not null default '';   -- '' | requested | allowed | denied
alter table public.devices add column if not exists settings_req_at timestamptz;
