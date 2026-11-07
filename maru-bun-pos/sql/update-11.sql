-- ============================================================
-- Update 11: QR page – order history, offers/alerts, phone notifications
-- Safe to run more than once. Run AFTER update-10.sql.
-- ============================================================

-- Offers / alerts the shop sends to everybody who is logged in on the QR page
create table if not exists public.qr_notices (
  id uuid primary key default gen_random_uuid(),
  title text not null default '',
  body text not null default '',
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  active boolean not null default true
);
alter table public.qr_notices enable row level security;
drop policy if exists "staff all" on public.qr_notices;
create policy "staff all" on public.qr_notices for all to authenticated using (true) with check (true);

-- Phones that allowed notifications (only the Edge Function qr-push reads this; customers cannot)
create table if not exists public.qr_push (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.qr_customers(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
alter table public.qr_push enable row level security;
create index if not exists qr_push_customer_idx on public.qr_push(customer_id);

-- offers that are still running (only for a logged-in customer)
create or replace function public.qr_notices(p_token uuid) returns jsonb language sql stable security definer set search_path = public as $$
  select case when exists (select 1 from qr_customers where token = p_token) then
    coalesce((select jsonb_agg(jsonb_build_object('id', id, 'title', title, 'body', body, 'created_at', created_at) order by created_at desc)
              from (select * from qr_notices where active and (expires_at is null or expires_at > now()) order by created_at desc limit 5) n), '[]'::jsonb)
  else '[]'::jsonb end
$$;

-- the customer's whole order history (newest first)
create or replace function public.qr_history(p_token uuid) returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', q.id, 'code', q.code, 'status', q.status, 'order_type', q.order_type, 'table_no', q.table_no, 'items', q.items,
           'subtotal', q.subtotal, 'created_at', q.created_at, 'reason', q.reason,
           'total', (select o.total from orders o where o.id = q.order_id and q.status = 'done')) order by q.created_at desc), '[]'::jsonb)
    from (select * from qr_orders where customer_id = (select id from qr_customers where token = p_token) order by created_at desc limit 100) q
$$;

create or replace function public.qr_push_save(p_token uuid, p_endpoint text, p_p256dh text, p_auth text) returns boolean language plpgsql security definer set search_path = public as $$
declare c uuid;
begin
  select id into c from qr_customers where token = p_token;
  if c is null or coalesce(p_endpoint, '') = '' or length(p_endpoint) > 1000 then return false; end if;
  insert into qr_push(customer_id, endpoint, p256dh, auth) values (c, p_endpoint, p_p256dh, p_auth)
    on conflict (endpoint) do update set customer_id = excluded.customer_id, p256dh = excluded.p256dh, auth = excluded.auth;
  return true;
end $$;

create or replace function public.qr_push_remove(p_token uuid, p_endpoint text) returns boolean language plpgsql security definer set search_path = public as $$
begin
  delete from qr_push where endpoint = p_endpoint and customer_id = (select id from qr_customers where token = p_token);
  return true;
end $$;

grant execute on function public.qr_notices(uuid) to anon, authenticated;
grant execute on function public.qr_history(uuid) to anon, authenticated;
grant execute on function public.qr_push_save(uuid, text, text, text) to anon, authenticated;
grant execute on function public.qr_push_remove(uuid, text) to anon, authenticated;
