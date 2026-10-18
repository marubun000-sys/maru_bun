-- ============================================================
-- මරු Bun POS - UPDATE 6  (safe to run more than once)
--   * Customers > "Send promotion" (message + photo to all saved WhatsApp numbers)
--   * opt_out column (customers who asked to stop getting promotions)
--   * public photo storage bucket "promos" (the photo link is added to the WhatsApp message)
-- Supabase > SQL Editor > New query > paste all > Run
-- ============================================================
alter table public.customers add column if not exists opt_out boolean not null default false;

insert into storage.buckets (id, name, public)
values ('promos', 'promos', true)
on conflict (id) do nothing;

drop policy if exists "promos staff upload" on storage.objects;
create policy "promos staff upload" on storage.objects for insert to authenticated with check (bucket_id = 'promos');
drop policy if exists "promos staff read" on storage.objects;
create policy "promos staff read" on storage.objects for select to authenticated using (bucket_id = 'promos');
drop policy if exists "promos staff delete" on storage.objects;
create policy "promos staff delete" on storage.objects for delete to authenticated using (bucket_id = 'promos');
