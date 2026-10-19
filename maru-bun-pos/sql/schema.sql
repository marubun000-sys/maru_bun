-- ==========================================================
--  මරු Bun POS  -  Supabase schema
--  Supabase Dashboard > SQL Editor > New query > paste all > RUN
-- ==========================================================

-- ---------- Tables ----------
create table if not exists public.categories (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  sort        int  not null default 0,
  created_at  timestamptz not null default now()
);

create table if not exists public.items (
  id           uuid primary key default gen_random_uuid(),
  category_id  uuid references public.categories(id) on delete set null,
  name         text not null,
  price        numeric(10,2) not null default 0,
  allow_addons boolean not null default true,
  track_stock  boolean not null default true,
  stock        int not null default 0,
  low_stock    int not null default 5,
  active       boolean not null default true,
  created_at   timestamptz not null default now()
);

-- Extras that can be added to any bun (cheese, egg ...)
create table if not exists public.addons (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  price       numeric(10,2) not null default 0,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

create table if not exists public.inventory (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  unit        text not null default 'pcs',
  qty         numeric(12,2) not null default 0,
  low_level   numeric(12,2) not null default 0,
  created_at  timestamptz not null default now()
);

-- single row (id = 1)
create table if not exists public.settings (
  id                      int primary key default 1 check (id = 1),
  shop_name               text    not null default 'මරු Bun',
  tagline                 text    not null default 'The Taste of Something Special.',
  address                 text    not null default 'PVHX+2RG New Bridge Bus Stop, Panadura, Moratuwa',
  phone                   text    not null default '',
  whatsapp                text    not null default '',
  review_link             text    not null default '',
  service_charge_enabled  boolean not null default false,
  service_charge_pct      numeric(5,2) not null default 10,
  discount_pct            numeric(5,2) not null default 0,
  cashier                 text    not null default '',
  payment_methods         text[]  not null default '{cash,card,bank,qr}',
  bill_footer             text    not null default 'Thank you! Come again.'
);
insert into public.settings (id) values (1) on conflict (id) do nothing;

create table if not exists public.orders (
  id               uuid primary key default gen_random_uuid(),
  bill_no          bigint generated always as identity,
  order_type       text not null default 'dine_in' check (order_type in ('dine_in','takeaway')),
  table_no         text not null default '',
  customer_name    text not null default '',
  customer_phone   text not null default '',
  note             text not null default '',
  items            jsonb not null default '[]'::jsonb,
  subtotal         numeric(12,2) not null default 0,
  discount         numeric(12,2) not null default 0,
  discount_label   text not null default '',
  service_pct      numeric(5,2)  not null default 0,
  service_charge   numeric(12,2) not null default 0,
  total            numeric(12,2) not null default 0,
  payment_method   text not null default 'cash',
  cash_received    numeric(12,2) not null default 0,
  change_given     numeric(12,2) not null default 0,
  cashier          text not null default '',
  status           text not null default 'pending' check (status in ('pending','served')),
  created_at       timestamptz not null default now(),
  served_at        timestamptz
);
create index if not exists orders_created_idx on public.orders (created_at desc);
create index if not exists orders_status_idx  on public.orders (status);

-- ---------- Stock helper ----------
create or replace function public.adjust_stock(p_item uuid, p_delta int)
returns void language sql as $$
  update public.items set stock = stock + p_delta where id = p_item and track_stock;
$$;

-- ---------- Security (only logged-in staff can read/write) ----------
do $$
declare t text;
begin
  foreach t in array array['categories','items','addons','inventory','settings','orders'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "staff all" on public.%I', t);
    execute format('create policy "staff all" on public.%I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;

-- OPTIONAL (strict): after you enable 2-step verification for your account, you can force
-- every request to be 2-step verified (aal2). Replace the policies above with e.g.:
--   create policy "staff all" on public.orders for all to authenticated
--     using ((auth.jwt() ->> 'aal') = 'aal2') with check ((auth.jwt() ->> 'aal') = 'aal2');

-- ---------- Live updates: Kitchen Display + every device refreshes by itself ----------
do $$
declare t text;
begin
  foreach t in array array['orders','items','addons','categories','inventory','settings'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;

-- ======== Update 3: token numbers + customers ========

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

-- ======== Update 4: devices ========
create table if not exists public.devices (
  id          text primary key,                       -- random id kept in that device's browser
  name        text not null default '',               -- e.g. "Counter 1", "Kitchen tablet"
  cashier     text not null default '',               -- cashier on duty on that device
  email       text not null default '',               -- account the device logged in with
  user_agent  text not null default '',
  is_admin    boolean not null default false,
  status      text not null default 'pending' check (status in ('pending','approved')),
  created_at  timestamptz not null default now(),
  last_seen   timestamptz not null default now(),
  settings_req    text not null default '',
  settings_req_at timestamptz
);
alter table public.devices add column if not exists settings_req    text not null default '';
alter table public.devices add column if not exists settings_req_at timestamptz;

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

-- ======== Update 6: promotions ========
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

-- ======== Update 7: refunds ========
alter table public.orders add column if not exists refund_total numeric(12,2) not null default 0;   -- total money refunded
alter table public.orders add column if not exists refunds      jsonb         not null default '[]'; -- list of refunds (items, amount, reason, who, when)
alter table public.orders add column if not exists edits        jsonb         not null default '[]'; -- who changed type / payment, and when

-- ---------- Sample menu (edit / delete from Menu Management) ----------
insert into public.categories (name, sort)
select * from (values ('Hot Buns',1),('Drinks',2),('Sides',3)) v(name,sort)
where not exists (select 1 from public.categories);

insert into public.items (category_id, name, price, stock)
select c.id, v.name, v.price, v.stock
from (values
  ('Hot Buns','Chicken Bun',450,50),
  ('Hot Buns','Beef Bun',550,50),
  ('Hot Buns','Cheese Bun',400,50),
  ('Hot Buns','Egg Bun',350,50),
  ('Drinks','Tea',150,100),
  ('Drinks','Coffee',250,100),
  ('Drinks','Milo',300,100),
  ('Sides','French Fries',350,40)
) v(cat,name,price,stock)
join public.categories c on c.name = v.cat
where not exists (select 1 from public.items);

insert into public.addons (name, price)
select * from (values ('Extra Cheese',100),('Fried Egg',80),('Extra Sauce',50)) v(name,price)
where not exists (select 1 from public.addons);

insert into public.inventory (name, unit, qty, low_level)
select * from (values ('Bun (raw)','pcs',200,50),('Cheese','kg',5,1),('Chicken','kg',10,2),('Eggs','pcs',60,12)) v(name,unit,qty,low_level)
where not exists (select 1 from public.inventory);
