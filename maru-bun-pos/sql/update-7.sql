-- ============================================================
-- මරු Bun POS - UPDATE 7  (safe to run more than once)
--   * Refunds + "Change type / payment" history on bills
-- Supabase > SQL Editor > New query > paste all > Run
-- ============================================================
alter table public.orders add column if not exists refund_total numeric(12,2) not null default 0;   -- total money refunded
alter table public.orders add column if not exists refunds      jsonb         not null default '[]'; -- list of refunds (items, amount, reason, who, when)
alter table public.orders add column if not exists edits        jsonb         not null default '[]'; -- who changed type / payment, and when
