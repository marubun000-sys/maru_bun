-- ============================================================
-- මරු Bun POS - UPDATE 4  (safe to run more than once)
--   * Device list: the FIRST device that logs in after this becomes the ADMIN device.
--     Every other device must be approved by the admin. Admin can remove devices.
--   * Cashier name + device name are shown in Settings & Security.
-- Supabase > SQL Editor > New query > paste all > Run
-- IMPORTANT: after running, open the POS FIRST on your own (owner) phone/computer so it becomes the admin.
-- ============================================================
create table if not exists public.devices (
  id          text primary key,                       -- random id kept in that device's browser
  name        text not null default '',               -- e.g. "Counter 1", "Kitchen tablet"
  cashier     text not null default '',               -- cashier on duty on that device
  email       text not null default '',               -- account the device logged in with
  user_agent  text not null default '',
  is_admin    boolean not null default false,
  status      text not null default 'pending' check (status in ('pending','approved')),
  created_at  timestamptz not null default now(),
  last_seen   timestamptz not null default now()
);

create or replace function public.register_device(p_id text, p_name text, p_cashier text, p_email text, p_ua text)
returns public.devices language plpgsql as $$
declare d public.devices; has_admin boolean;
begin
  perform pg_advisory_xact_lock(918274);
  select * into d from public.devices where id = p_id;
  if found then
    update public.devices set last_seen = now(),
           name    = case when coalesce(p_name,'') <> '' then p_name else name end,
           cashier = coalesce(p_cashier,''),
           email   = coalesce(nullif(p_email,''), email),
           user_agent = coalesce(p_ua,'')
     where id = p_id returning * into d;
    return d;
  end if;
  select exists(select 1 from public.devices where is_admin) into has_admin;
  insert into public.devices (id, name, cashier, email, user_agent, is_admin, status)
  values (p_id, coalesce(p_name,''), coalesce(p_cashier,''), coalesce(p_email,''), coalesce(p_ua,''),
          not has_admin, case when has_admin then 'pending' else 'approved' end)
  returning * into d;
  return d;
end $$;

alter table public.devices enable row level security;
drop policy if exists "staff all" on public.devices;
create policy "staff all" on public.devices for all to authenticated using (true) with check (true);

do $$ begin
  alter publication supabase_realtime add table public.devices;
exception when duplicate_object then null; end $$;

-- Lost the admin phone? Run this to start fresh (next device that logs in becomes admin):
--   delete from public.devices;
