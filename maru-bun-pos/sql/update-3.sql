-- ============================================================
-- මරු Bun POS - UPDATE 3  (safe to run more than once)
--   * Token number for every order (1,2,3... restarts every day at 12 midnight, Sri Lanka time)
--   * Customers table (phone numbers saved in the database)
-- Supabase > SQL Editor > New query > paste all > Run
-- ============================================================

-- ---------- Token number ----------
alter table public.orders add column if not exists token_no int not null default 0;

create or replace function public.assign_token() returns trigger language plpgsql as $$
begin
  perform pg_advisory_xact_lock(918273);   -- two counters can never get the same token
  select coalesce(max(token_no), 0) + 1 into new.token_no
    from public.orders
   where (created_at at time zone 'Asia/Colombo')::date = (coalesce(new.created_at, now()) at time zone 'Asia/Colombo')::date;
  return new;
end $$;

drop trigger if exists orders_token on public.orders;
create trigger orders_token before insert on public.orders
  for each row execute function public.assign_token();

-- give old orders a token too (numbered per day in the order they were made)
update public.orders o set token_no = x.rn
  from (select id, row_number() over (partition by (created_at at time zone 'Asia/Colombo')::date order by created_at, bill_no) rn from public.orders) x
 where o.id = x.id and o.token_no = 0;

-- ---------- Customers ----------
create table if not exists public.customers (
  phone       text primary key,                 -- normalised: 94771234567
  name        text not null default '',
  visits      int  not null default 0,
  total_spent numeric(12,2) not null default 0,
  first_visit timestamptz not null default now(),
  last_visit  timestamptz not null default now(),
  created_at  timestamptz not null default now()
);

create or replace function public.upsert_customer(p_phone text, p_name text, p_total numeric)
returns void language sql as $$
  insert into public.customers (phone, name, visits, total_spent)
  values (p_phone, coalesce(p_name, ''), 1, coalesce(p_total, 0))
  on conflict (phone) do update set
    name        = case when coalesce(excluded.name, '') <> '' then excluded.name else public.customers.name end,
    visits      = public.customers.visits + 1,
    total_spent = public.customers.total_spent + excluded.total_spent,
    last_visit  = now();
$$;

-- fill customers from the bills you already have
insert into public.customers (phone, name, visits, total_spent, first_visit, last_visit)
select p, (array_agg(customer_name order by created_at desc) filter (where customer_name <> ''))[1],
       count(*), sum(total), min(created_at), max(created_at)
  from (select case when regexp_replace(customer_phone,'\D','','g') ~ '^0' then '94' || substr(regexp_replace(customer_phone,'\D','','g'), 2)
                    else regexp_replace(customer_phone,'\D','','g') end p, customer_name, total, created_at
          from public.orders where regexp_replace(customer_phone,'\D','','g') <> '') s
 where length(p) >= 9
 group by p
on conflict (phone) do nothing;
update public.customers set name = '' where name is null;

alter table public.customers enable row level security;
drop policy if exists "staff all" on public.customers;
create policy "staff all" on public.customers for all to authenticated using (true) with check (true);

do $$ begin
  alter publication supabase_realtime add table public.customers;
exception when duplicate_object then null; end $$;
