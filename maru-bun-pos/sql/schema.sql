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

-- ---------- Update 8: costs & profit ----------
alter table public.inventory add column if not exists cost_per_unit numeric(14,4) not null default 0;   -- average cost of 1 unit (1 kg, 1 pcs ...)
alter table public.items  add column if not exists cost         numeric(10,2) not null default 0;
alter table public.items  add column if not exists cost_manual  boolean       not null default false;   -- true = cost typed by hand, false = from ingredients
alter table public.items  add column if not exists recipe       jsonb         not null default '[]'::jsonb;  -- [{inv_id, qty, unit}]
alter table public.addons add column if not exists cost         numeric(10,2) not null default 0;

create table if not exists public.inventory_purchases (
  id           uuid primary key default gen_random_uuid(),
  inventory_id uuid not null references public.inventory(id) on delete cascade,
  qty          numeric(12,3) not null,
  total_cost   numeric(12,2) not null default 0,
  unit_cost    numeric(14,4) not null default 0,
  by_name      text not null default '',
  created_at   timestamptz not null default now()
);
alter table public.inventory_purchases enable row level security;
drop policy if exists "staff all" on public.inventory_purchases;
create policy "staff all" on public.inventory_purchases for all to authenticated using (true) with check (true);

-- add stock + price paid: quantity goes up, average cost per unit is recalculated
create or replace function public.add_stock(p_id uuid, p_qty numeric, p_total numeric, p_by text default '')
returns public.inventory language plpgsql as $$
declare r public.inventory; base numeric;
begin
  select * into r from public.inventory where id = p_id for update;
  if not found then raise exception 'Ingredient not found'; end if;
  if coalesce(p_qty,0) <= 0 then raise exception 'Quantity must be more than 0'; end if;
  base := greatest(r.qty, 0);
  update public.inventory
     set cost_per_unit = case when cost_per_unit = 0 then round(coalesce(p_total,0) / p_qty, 4)      -- stock that had no price yet: use this purchase's price
                              else round((base * cost_per_unit + coalesce(p_total,0)) / (base + p_qty), 4) end,
         qty = round(qty + p_qty, 2)
   where id = p_id returning * into r;
  insert into public.inventory_purchases (inventory_id, qty, total_cost, unit_cost, by_name)
  values (p_id, p_qty, coalesce(p_total,0), round(coalesce(p_total,0) / p_qty, 4), coalesce(p_by,''));
  return r;
end $$;

-- ---------- Update 9: ingredient use, 4-decimal stock, security alerts ----------
alter table public.inventory alter column qty type numeric(14,4);

create or replace function public.adjust_inventory_bulk(p_changes jsonb)
returns void language plpgsql as $$
declare c jsonb;
begin
  for c in select * from jsonb_array_elements(coalesce(p_changes, '[]'::jsonb)) loop
    update public.inventory set qty = round(qty + (c->>'delta')::numeric, 4) where id = (c->>'id')::uuid;
  end loop;
end $$;

-- add_stock now keeps 4 decimals
create or replace function public.add_stock(p_id uuid, p_qty numeric, p_total numeric, p_by text default '')
returns public.inventory language plpgsql as $$
declare r public.inventory; base numeric;
begin
  select * into r from public.inventory where id = p_id for update;
  if not found then raise exception 'Ingredient not found'; end if;
  if coalesce(p_qty,0) <= 0 then raise exception 'Quantity must be more than 0'; end if;
  base := greatest(r.qty, 0);
  update public.inventory
     set cost_per_unit = case when cost_per_unit = 0 then round(coalesce(p_total,0) / p_qty, 4)
                              else round((base * cost_per_unit + coalesce(p_total,0)) / (base + p_qty), 4) end,
         qty = round(qty + p_qty, 4)
   where id = p_id returning * into r;
  insert into public.inventory_purchases (inventory_id, qty, total_cost, unit_cost, by_name)
  values (p_id, p_qty, coalesce(p_total,0), round(coalesce(p_total,0) / p_qty, 4), coalesce(p_by,''));
  return r;
end $$;

create table if not exists public.security_alerts (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null,                      -- 'password' | 'mfa_off'
  device_id   text not null default '',
  device_name text not null default '',
  cashier     text not null default '',
  seen        boolean not null default false,
  created_at  timestamptz not null default now()
);
alter table public.security_alerts enable row level security;
drop policy if exists "staff all" on public.security_alerts;
create policy "staff all" on public.security_alerts for all to authenticated using (true) with check (true);

-- ---------- Update 10: QR ordering ----------
alter table public.settings add column if not exists qr_open boolean not null default true;      -- "accepting QR orders" switch
alter table public.orders   add column if not exists source   text not null default 'pos';        -- 'pos' | 'qr'
alter table public.orders   add column if not exists qr_code  text not null default '';           -- e.g. Q7 (the code the customer shows)

-- customers' own little accounts (phone + PIN). No policy at all = nobody but the functions below can read it.
create table if not exists public.qr_customers (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  phone        text not null unique,
  salt         text not null,
  pin_hash     text not null,
  token        uuid not null default gen_random_uuid(),
  fails        int  not null default 0,
  locked_until timestamptz,
  created_at   timestamptz not null default now()
);
alter table public.qr_customers enable row level security;

create table if not exists public.qr_orders (
  id             uuid primary key default gen_random_uuid(),
  code           text not null,
  day            date not null default ((now() at time zone 'Asia/Colombo')::date),
  customer_id    uuid references public.qr_customers(id) on delete set null,
  customer_name  text not null default '',
  customer_phone text not null default '',
  order_type     text not null default 'takeaway' check (order_type in ('dine_in','takeaway')),
  table_no       text not null default '',
  note           text not null default '',
  items          jsonb not null default '[]'::jsonb,           -- [{item_id,name,unit,qty,addons:[{id,name,price,qty}]}]  (prices come from YOUR menu, not from the phone)
  subtotal       numeric(12,2) not null default 0,
  status         text not null default 'new' check (status in ('new','confirmed','done','rejected','cancelled')),
  order_id       uuid,                                         -- the real bill / kitchen order made when staff confirm
  reason         text not null default '',
  created_at     timestamptz not null default now(),
  confirmed_at   timestamptz,
  done_at        timestamptz,
  unique (day, code)
);
alter table public.qr_orders enable row level security;
drop policy if exists "staff all" on public.qr_orders;
create policy "staff all" on public.qr_orders for all to authenticated using (true) with check (true);
do $$ begin alter publication supabase_realtime add table public.qr_orders; exception when duplicate_object then null; end $$;

-- ---------- helpers ----------
create or replace function public.qr_phone(p text) returns text language sql immutable as $$
  select case when d ~ '^0\d{9}$' then '94' || substr(d, 2) else d end from (select regexp_replace(coalesce(p,''), '\D', '', 'g') d) x
$$;
create or replace function public.qr_hash(p_salt text, p_pin text) returns text language sql immutable as $$
  select encode(sha256(convert_to(p_salt || ':' || p_pin, 'UTF8')), 'hex')
$$;

-- ---------- what the customer page shows: only active items, with how many are left ----------
create or replace function public.qr_menu() returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'open',  coalesce((select qr_open from settings where id = 1), true),
    'shop',  (select jsonb_build_object('name', shop_name, 'tagline', tagline, 'phone', phone) from settings where id = 1),
    'categories', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name) order by sort, name) from categories), '[]'::jsonb),
    'items', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'category_id', category_id, 'name', name, 'price', price,
                'allow_addons', allow_addons, 'track_stock', track_stock, 'stock', greatest(stock, 0)) order by name) from items where active), '[]'::jsonb),
    'addons', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'price', price) order by name) from addons where active), '[]'::jsonb)
  )
$$;

-- ---------- register / log in (phone + PIN) ----------
create or replace function public.qr_register(p_name text, p_phone text, p_pin text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare ph text := qr_phone(p_phone); nm text := left(btrim(coalesce(p_name,'')), 60); s text; c qr_customers;
begin
  if nm = '' then raise exception 'Please enter your name'; end if;
  if ph !~ '^\d{9,15}$' then raise exception 'Please enter a valid phone number'; end if;
  if coalesce(p_pin,'') !~ '^\d{4,6}$' then raise exception 'PIN must be 4 to 6 digits'; end if;
  if exists (select 1 from qr_customers where phone = ph) then raise exception 'This number is already registered - please log in'; end if;
  s := gen_random_uuid()::text;
  insert into qr_customers (name, phone, salt, pin_hash) values (nm, ph, s, qr_hash(s, p_pin)) returning * into c;
  return jsonb_build_object('token', c.token, 'name', c.name, 'phone', c.phone);
end $$;

-- NOTE: a wrong PIN is returned as {"error": "..."} (not raised), so the failed-try counter is really saved
create or replace function public.qr_login(p_phone text, p_pin text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare ph text := qr_phone(p_phone); c qr_customers;
begin
  select * into c from qr_customers where phone = ph for update;
  if not found then return jsonb_build_object('error', 'Wrong phone number or PIN'); end if;
  if c.locked_until is not null and c.locked_until > now() then
    return jsonb_build_object('error', 'Too many wrong tries. Please try again in a few minutes'); end if;
  if c.pin_hash <> qr_hash(c.salt, coalesce(p_pin,'')) then
    update qr_customers set locked_until = case when fails + 1 >= 5 then now() + interval '15 minutes' else null end,
                            fails = case when fails + 1 >= 5 then 0 else fails + 1 end
     where id = c.id;
    return jsonb_build_object('error', 'Wrong phone number or PIN');
  end if;
  update qr_customers set fails = 0, locked_until = null where id = c.id;
  return jsonb_build_object('token', c.token, 'name', c.name, 'phone', c.phone);
end $$;

create or replace function public.qr_me(p_token uuid) returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('name', name, 'phone', phone) from qr_customers where token = p_token
$$;

-- ---------- place an order: prices and stock are checked here, against YOUR menu ----------
create or replace function public.qr_place_order(p_token uuid, p_type text, p_table text, p_note text, p_lines jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare c qr_customers; l jsonb; a jsonb; it items; ad addons; r record; q int; aq int; n int; code text; sub numeric := 0;
        out jsonb := '[]'::jsonb; ads jsonb; lt numeric; o qr_orders; today date := (now() at time zone 'Asia/Colombo')::date;
begin
  select * into c from qr_customers where token = p_token;
  if not found then raise exception 'Please log in again'; end if;
  if not coalesce((select qr_open from settings where id = 1), true) then raise exception 'Sorry, we are not taking QR orders right now'; end if;
  if p_type not in ('dine_in','takeaway') then raise exception 'Choose dine-in or takeaway'; end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) not between 1 and 30 then raise exception 'Your order is empty'; end if;
  if (select count(*) from qr_orders where customer_id = c.id and status in ('new','confirmed')) >= 3 then
    raise exception 'You already have 3 orders waiting. Please wait for them to finish'; end if;
  -- enough in stock? (all lines of the same item added together)
  for r in select (x->>'item_id')::uuid id, sum((x->>'qty')::int) q from jsonb_array_elements(p_lines) x group by 1 loop
    select * into it from items where id = r.id and active;
    if not found then raise exception 'One of the items is not available any more'; end if;
    if it.track_stock and it.stock < r.q then
      raise exception '%', case when it.stock <= 0 then 'Sorry, ' || it.name || ' is finished' else 'Sorry, only ' || it.stock || ' left of ' || it.name end;
    end if;
  end loop;
  for l in select * from jsonb_array_elements(p_lines) loop
    q := (l->>'qty')::int; if q < 1 or q > 50 then raise exception 'Invalid quantity'; end if;
    select * into it from items where id = (l->>'item_id')::uuid and active;
    lt := it.price * q; ads := '[]'::jsonb;
    if coalesce(jsonb_array_length(l->'addons'), 0) > 0 then
      if not it.allow_addons or jsonb_array_length(l->'addons') > 10 then raise exception 'Extras are not available for %', it.name; end if;
      for a in select * from jsonb_array_elements(l->'addons') loop
        aq := (a->>'qty')::int; if aq < 1 or aq > 20 then raise exception 'Invalid extra quantity'; end if;
        select * into ad from addons where id = (a->>'id')::uuid and active;
        if not found then raise exception 'One of the extras is not available any more'; end if;
        ads := ads || jsonb_build_object('id', ad.id, 'name', ad.name, 'price', ad.price, 'qty', aq);
        lt := lt + ad.price * aq;
      end loop;
    end if;
    out := out || jsonb_build_object('item_id', it.id, 'name', it.name, 'unit', it.price, 'qty', q, 'addons', ads);
    sub := sub + lt;
  end loop;
  perform pg_advisory_xact_lock(918275);
  select coalesce(max(substr(qo.code, 2)::int), 0) + 1 into n from qr_orders qo where qo.day = today;
  code := 'Q' || n;
  insert into qr_orders (code, day, customer_id, customer_name, customer_phone, order_type, table_no, note, items, subtotal)
  values (code, today, c.id, c.name, c.phone, p_type, left(btrim(coalesce(p_table,'')), 20), left(btrim(coalesce(p_note,'')), 200), out, round(sub, 2))
  returning * into o;
  return jsonb_build_object('id', o.id, 'code', o.code, 'total', o.subtotal, 'status', o.status);
end $$;

-- ---------- the customer's own orders (status shown on their phone) ----------
create or replace function public.qr_my_orders(p_token uuid) returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', q.id, 'code', q.code, 'status', q.status, 'order_type', q.order_type, 'items', q.items,
           'subtotal', q.subtotal, 'created_at', q.created_at, 'reason', q.reason,
           'ready', coalesce((select o.status = 'served' from orders o where o.id = q.order_id), false)) order by q.created_at desc), '[]'::jsonb)
    from (select * from qr_orders where customer_id = (select id from qr_customers where token = p_token) and created_at > now() - interval '2 days'
           order by created_at desc limit 10) q
$$;

create or replace function public.qr_cancel(p_token uuid, p_id uuid) returns boolean language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update qr_orders set status = 'cancelled' where id = p_id and status = 'new' and customer_id = (select id from qr_customers where token = p_token);
  get diagnostics n = row_count; return n > 0;
end $$;

grant execute on function public.qr_menu() to anon, authenticated;
grant execute on function public.qr_register(text, text, text) to anon, authenticated;
grant execute on function public.qr_login(text, text) to anon, authenticated;
grant execute on function public.qr_me(uuid) to anon, authenticated;
grant execute on function public.qr_place_order(uuid, text, text, text, jsonb) to anon, authenticated;
grant execute on function public.qr_my_orders(uuid) to anon, authenticated;
grant execute on function public.qr_cancel(uuid, uuid) to anon, authenticated;

-- ---------- Update 11: QR order history, offers, phone notifications ----------

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

-- ---------- Update 12: orderable offers ----------
alter table public.qr_notices add column if not exists image_url text;
alter table public.qr_notices add column if not exists offer_items jsonb not null default '[]'::jsonb;   -- [{"item_id": "...", "price": 250 or null}]

-- staff can see how many phones are registered for notifications
drop policy if exists "staff read" on public.qr_push;
create policy "staff read" on public.qr_push for select to authenticated using (true);

create or replace function public.qr_notices(p_token uuid) returns jsonb language sql stable security definer set search_path = public as $$
  select case when exists (select 1 from qr_customers where token = p_token) then
    coalesce((select jsonb_agg(jsonb_build_object('id', id, 'title', title, 'body', body, 'created_at', created_at, 'image_url', image_url, 'offer_items', offer_items) order by created_at desc)
              from (select * from qr_notices where active and (expires_at is null or expires_at > now()) order by created_at desc limit 5) n), '[]'::jsonb)
  else '[]'::jsonb end
$$;

-- placing an order: lines may carry an offer_id; the offer price is checked on the server
create or replace function public.qr_place_order(p_token uuid, p_type text, p_table text, p_note text, p_lines jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare c qr_customers; l jsonb; a jsonb; it items; ad addons; r record; q int; aq int; n int; code text; sub numeric := 0; nt qr_notices; oi jsonb; unit numeric;
        out jsonb := '[]'::jsonb; ads jsonb; lt numeric; o qr_orders; today date := (now() at time zone 'Asia/Colombo')::date;
begin
  select * into c from qr_customers where token = p_token;
  if not found then raise exception 'Please log in again'; end if;
  if not coalesce((select qr_open from settings where id = 1), true) then raise exception 'Sorry, we are not taking QR orders right now'; end if;
  if p_type not in ('dine_in','takeaway') then raise exception 'Choose dine-in or takeaway'; end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) not between 1 and 30 then raise exception 'Your order is empty'; end if;
  if (select count(*) from qr_orders where customer_id = c.id and status in ('new','confirmed')) >= 3 then
    raise exception 'You already have 3 orders waiting. Please wait for them to finish'; end if;
  -- enough in stock? (all lines of the same item added together)
  for r in select (x->>'item_id')::uuid id, sum((x->>'qty')::int) q from jsonb_array_elements(p_lines) x group by 1 loop
    select * into it from items where id = r.id and active;
    if not found then raise exception 'One of the items is not available any more'; end if;
    if it.track_stock and it.stock < r.q then
      raise exception '%', case when it.stock <= 0 then 'Sorry, ' || it.name || ' is finished' else 'Sorry, only ' || it.stock || ' left of ' || it.name end;
    end if;
  end loop;
  for l in select * from jsonb_array_elements(p_lines) loop
    q := (l->>'qty')::int; if q < 1 or q > 50 then raise exception 'Invalid quantity'; end if;
    select * into it from items where id = (l->>'item_id')::uuid and active;
    unit := it.price; oi := null;
    if nullif(l->>'offer_id', '') is not null then
      select * into nt from qr_notices where id = (l->>'offer_id')::uuid and active and (expires_at is null or expires_at > now());
      if not found then raise exception 'Sorry, this offer has ended'; end if;
      select t.e into oi from jsonb_array_elements(nt.offer_items) as t(e) where t.e->>'item_id' = it.id::text limit 1;
      if oi is null then raise exception 'This item is not part of the offer'; end if;
      unit := coalesce(nullif(oi->>'price', '')::numeric, it.price);
    end if;
    lt := unit * q; ads := '[]'::jsonb;
    if coalesce(jsonb_array_length(l->'addons'), 0) > 0 then
      if not it.allow_addons or jsonb_array_length(l->'addons') > 10 then raise exception 'Extras are not available for %', it.name; end if;
      for a in select * from jsonb_array_elements(l->'addons') loop
        aq := (a->>'qty')::int; if aq < 1 or aq > 20 then raise exception 'Invalid extra quantity'; end if;
        select * into ad from addons where id = (a->>'id')::uuid and active;
        if not found then raise exception 'One of the extras is not available any more'; end if;
        ads := ads || jsonb_build_object('id', ad.id, 'name', ad.name, 'price', ad.price, 'qty', aq);
        lt := lt + ad.price * aq;
      end loop;
    end if;
    out := out || jsonb_build_object('item_id', it.id, 'name', it.name, 'unit', unit, 'qty', q, 'addons', ads, 'offer_id', nullif(l->>'offer_id', ''));
    sub := sub + lt;
  end loop;
  perform pg_advisory_xact_lock(918275);
  select coalesce(max(substr(qo.code, 2)::int), 0) + 1 into n from qr_orders qo where qo.day = today;
  code := 'Q' || n;
  insert into qr_orders (code, day, customer_id, customer_name, customer_phone, order_type, table_no, note, items, subtotal)
  values (code, today, c.id, c.name, c.phone, p_type, left(btrim(coalesce(p_table,'')), 20), left(btrim(coalesce(p_note,'')), 200), out, round(sub, 2))
  returning * into o;
  return jsonb_build_object('id', o.id, 'code', o.code, 'total', o.subtotal, 'status', o.status);
end $$;
grant execute on function public.qr_place_order(uuid, text, text, text, jsonb) to anon, authenticated;

-- ---------- Update 13: personal offers / messages ----------
alter table public.qr_notices add column if not exists customer_ids uuid[];      -- null = everybody, otherwise only these QR customers

create or replace function public.qr_notices(p_token uuid) returns jsonb language sql stable security definer set search_path = public as $$
  select case when exists (select 1 from qr_customers where token = p_token) then
    coalesce((select jsonb_agg(jsonb_build_object('id', id, 'title', title, 'body', body, 'created_at', created_at, 'image_url', image_url, 'offer_items', offer_items) order by created_at desc)
              from (select * from qr_notices
                     where active and (expires_at is null or expires_at > now())
                       and (customer_ids is null or (select id from qr_customers where token = p_token) = any(customer_ids))
                     order by created_at desc limit 5) n), '[]'::jsonb)
  else '[]'::jsonb end
$$;

-- the staff list of customers registered on the QR page (no PIN data), used by Customers > Message QR customers
create or replace function public.qr_customer_list() returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Staff only'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'phone', c.phone, 'created_at', c.created_at,
            'orders', (select count(*) from qr_orders o where o.customer_id = c.id),
            'push', exists (select 1 from qr_push p where p.customer_id = c.id)) order by c.created_at desc) from qr_customers c), '[]'::jsonb);
end $$;
revoke all on function public.qr_customer_list() from public, anon;
grant execute on function public.qr_customer_list() to authenticated;

-- a personal offer can only be ordered by the customers it was sent to
create or replace function public.qr_place_order(p_token uuid, p_type text, p_table text, p_note text, p_lines jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare c qr_customers; l jsonb; a jsonb; it items; ad addons; r record; q int; aq int; n int; code text; sub numeric := 0; nt qr_notices; oi jsonb; unit numeric;
        out jsonb := '[]'::jsonb; ads jsonb; lt numeric; o qr_orders; today date := (now() at time zone 'Asia/Colombo')::date;
begin
  select * into c from qr_customers where token = p_token;
  if not found then raise exception 'Please log in again'; end if;
  if not coalesce((select qr_open from settings where id = 1), true) then raise exception 'Sorry, we are not taking QR orders right now'; end if;
  if p_type not in ('dine_in','takeaway') then raise exception 'Choose dine-in or takeaway'; end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) not between 1 and 30 then raise exception 'Your order is empty'; end if;
  if (select count(*) from qr_orders where customer_id = c.id and status in ('new','confirmed')) >= 3 then
    raise exception 'You already have 3 orders waiting. Please wait for them to finish'; end if;
  -- enough in stock? (all lines of the same item added together)
  for r in select (x->>'item_id')::uuid id, sum((x->>'qty')::int) q from jsonb_array_elements(p_lines) x group by 1 loop
    select * into it from items where id = r.id and active;
    if not found then raise exception 'One of the items is not available any more'; end if;
    if it.track_stock and it.stock < r.q then
      raise exception '%', case when it.stock <= 0 then 'Sorry, ' || it.name || ' is finished' else 'Sorry, only ' || it.stock || ' left of ' || it.name end;
    end if;
  end loop;
  for l in select * from jsonb_array_elements(p_lines) loop
    q := (l->>'qty')::int; if q < 1 or q > 50 then raise exception 'Invalid quantity'; end if;
    select * into it from items where id = (l->>'item_id')::uuid and active;
    unit := it.price; oi := null;
    if nullif(l->>'offer_id', '') is not null then
      select * into nt from qr_notices where id = (l->>'offer_id')::uuid and active and (expires_at is null or expires_at > now()) and (customer_ids is null or c.id = any(customer_ids));
      if not found then raise exception 'Sorry, this offer has ended'; end if;
      select t.e into oi from jsonb_array_elements(nt.offer_items) as t(e) where t.e->>'item_id' = it.id::text limit 1;
      if oi is null then raise exception 'This item is not part of the offer'; end if;
      unit := coalesce(nullif(oi->>'price', '')::numeric, it.price);
    end if;
    lt := unit * q; ads := '[]'::jsonb;
    if coalesce(jsonb_array_length(l->'addons'), 0) > 0 then
      if not it.allow_addons or jsonb_array_length(l->'addons') > 10 then raise exception 'Extras are not available for %', it.name; end if;
      for a in select * from jsonb_array_elements(l->'addons') loop
        aq := (a->>'qty')::int; if aq < 1 or aq > 20 then raise exception 'Invalid extra quantity'; end if;
        select * into ad from addons where id = (a->>'id')::uuid and active;
        if not found then raise exception 'One of the extras is not available any more'; end if;
        ads := ads || jsonb_build_object('id', ad.id, 'name', ad.name, 'price', ad.price, 'qty', aq);
        lt := lt + ad.price * aq;
      end loop;
    end if;
    out := out || jsonb_build_object('item_id', it.id, 'name', it.name, 'unit', unit, 'qty', q, 'addons', ads, 'offer_id', nullif(l->>'offer_id', ''));
    sub := sub + lt;
  end loop;
  perform pg_advisory_xact_lock(918275);
  select coalesce(max(substr(qo.code, 2)::int), 0) + 1 into n from qr_orders qo where qo.day = today;
  code := 'Q' || n;
  insert into qr_orders (code, day, customer_id, customer_name, customer_phone, order_type, table_no, note, items, subtotal)
  values (code, today, c.id, c.name, c.phone, p_type, left(btrim(coalesce(p_table,'')), 20), left(btrim(coalesce(p_note,'')), 200), out, round(sub, 2))
  returning * into o;
  return jsonb_build_object('id', o.id, 'code', o.code, 'total', o.subtotal, 'status', o.status);
end $$;
grant execute on function public.qr_place_order(uuid, text, text, text, jsonb) to anon, authenticated;

-- ---------- Update 14: custom offer items ----------
create or replace function public.qr_place_order(p_token uuid, p_type text, p_table text, p_note text, p_lines jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare c qr_customers; nm text; l jsonb; a jsonb; it items; ad addons; r record; q int; aq int; n int; code text; sub numeric := 0; nt qr_notices; oi jsonb; unit numeric;
        out jsonb := '[]'::jsonb; ads jsonb; lt numeric; o qr_orders; today date := (now() at time zone 'Asia/Colombo')::date;
begin
  select * into c from qr_customers where token = p_token;
  if not found then raise exception 'Please log in again'; end if;
  if not coalesce((select qr_open from settings where id = 1), true) then raise exception 'Sorry, we are not taking QR orders right now'; end if;
  if p_type not in ('dine_in','takeaway') then raise exception 'Choose dine-in or takeaway'; end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) not between 1 and 30 then raise exception 'Your order is empty'; end if;
  if (select count(*) from qr_orders where customer_id = c.id and status in ('new','confirmed')) >= 3 then
    raise exception 'You already have 3 orders waiting. Please wait for them to finish'; end if;
  -- enough in stock? (all lines of the same item added together)
  for r in select (x->>'item_id')::uuid id, sum((x->>'qty')::int) q from jsonb_array_elements(p_lines) x where nullif(x->>'item_id', '') is not null group by 1 loop
    select * into it from items where id = r.id and active;
    if not found then raise exception 'One of the items is not available any more'; end if;
    if it.track_stock and it.stock < r.q then
      raise exception '%', case when it.stock <= 0 then 'Sorry, ' || it.name || ' is finished' else 'Sorry, only ' || it.stock || ' left of ' || it.name end;
    end if;
  end loop;
  for l in select * from jsonb_array_elements(p_lines) loop
    q := (l->>'qty')::int; if q < 1 or q > 50 then raise exception 'Invalid quantity'; end if;
    oi := null; nm := null; it := null;
    if nullif(l->>'custom_id', '') is not null then
      -- a custom offer item: the name and the price are set by the shop inside the offer
      if nullif(l->>'offer_id', '') is null then raise exception 'Invalid offer'; end if;
      select * into nt from qr_notices where id = (l->>'offer_id')::uuid and active and (expires_at is null or expires_at > now()) and (customer_ids is null or c.id = any(customer_ids));
      if not found then raise exception 'Sorry, this offer has ended'; end if;
      select t.e into oi from jsonb_array_elements(nt.offer_items) as t(e) where t.e->>'id' = l->>'custom_id' limit 1;
      if oi is null or nullif(oi->>'price', '') is null then raise exception 'This item is not part of the offer'; end if;
      nm := left(coalesce(nullif(btrim(oi->>'name'), ''), 'Offer'), 80);
      unit := (oi->>'price')::numeric;
      if nullif(oi->>'item_id', '') is not null then
        select * into it from items where id = (oi->>'item_id')::uuid and active;
        if not found then raise exception 'One of the items is not available any more'; end if;
        if it.track_stock and it.stock < q then raise exception '%', 'Sorry, only ' || greatest(it.stock, 0) || ' left of ' || it.name; end if;
      end if;
      if coalesce(jsonb_array_length(l->'addons'), 0) > 0 then raise exception 'Extras are not available for this offer'; end if;
    else
    select * into it from items where id = (l->>'item_id')::uuid and active;
    unit := it.price;
    if nullif(l->>'offer_id', '') is not null then
      select * into nt from qr_notices where id = (l->>'offer_id')::uuid and active and (expires_at is null or expires_at > now()) and (customer_ids is null or c.id = any(customer_ids));
      if not found then raise exception 'Sorry, this offer has ended'; end if;
      select t.e into oi from jsonb_array_elements(nt.offer_items) as t(e) where t.e->>'item_id' = it.id::text limit 1;
      if oi is null then raise exception 'This item is not part of the offer'; end if;
      unit := coalesce(nullif(oi->>'price', '')::numeric, it.price);
    end if;
    end if;
    lt := unit * q; ads := '[]'::jsonb;
    if coalesce(jsonb_array_length(l->'addons'), 0) > 0 then
      if not it.allow_addons or jsonb_array_length(l->'addons') > 10 then raise exception 'Extras are not available for %', it.name; end if;
      for a in select * from jsonb_array_elements(l->'addons') loop
        aq := (a->>'qty')::int; if aq < 1 or aq > 20 then raise exception 'Invalid extra quantity'; end if;
        select * into ad from addons where id = (a->>'id')::uuid and active;
        if not found then raise exception 'One of the extras is not available any more'; end if;
        ads := ads || jsonb_build_object('id', ad.id, 'name', ad.name, 'price', ad.price, 'qty', aq);
        lt := lt + ad.price * aq;
      end loop;
    end if;
    out := out || jsonb_build_object('item_id', it.id, 'name', coalesce(nm, it.name), 'unit', unit, 'qty', q, 'addons', ads, 'offer_id', nullif(l->>'offer_id', ''), 'custom_id', nullif(l->>'custom_id', ''));
    sub := sub + lt;
  end loop;
  perform pg_advisory_xact_lock(918275);
  select coalesce(max(substr(qo.code, 2)::int), 0) + 1 into n from qr_orders qo where qo.day = today;
  code := 'Q' || n;
  insert into qr_orders (code, day, customer_id, customer_name, customer_phone, order_type, table_no, note, items, subtotal)
  values (code, today, c.id, c.name, c.phone, p_type, left(btrim(coalesce(p_table,'')), 20), left(btrim(coalesce(p_note,'')), 200), out, round(sub, 2))
  returning * into o;
  return jsonb_build_object('id', o.id, 'code', o.code, 'total', o.subtotal, 'status', o.status);
end $$;
grant execute on function public.qr_place_order(uuid, text, text, text, jsonb) to anon, authenticated;

-- ---------- Update 15: manage QR customers ----------
create or replace function public.qr_customer_list() returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Staff only'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'phone', c.phone, 'created_at', c.created_at,
            'locked', coalesce(c.locked_until > now(), false),
            'orders', (select count(*) from qr_orders o where o.customer_id = c.id),
            'push', exists (select 1 from qr_push p where p.customer_id = c.id)) order by c.created_at desc) from qr_customers c), '[]'::jsonb);
end $$;

create or replace function public.qr_admin_update(p_id uuid, p_name text, p_phone text) returns jsonb language plpgsql security definer set search_path = public as $$
declare ph text := qr_phone(p_phone); nm text := left(btrim(coalesce(p_name, '')), 60);
begin
  if auth.uid() is null then raise exception 'Staff only'; end if;
  if nm = '' then raise exception 'Please enter the name'; end if;
  if ph !~ '^\d{9,15}$' then raise exception 'Please enter a valid phone number'; end if;
  if exists (select 1 from qr_customers where phone = ph and id <> p_id) then raise exception 'This phone number is already used by another QR customer'; end if;
  update qr_customers set name = nm, phone = ph where id = p_id;
  if not found then raise exception 'Customer not found'; end if;
  return jsonb_build_object('name', nm, 'phone', ph);
end $$;

-- sets a NEW PIN; the customer is logged out on all phones and any lock is cleared
create or replace function public.qr_admin_set_pin(p_id uuid, p_pin text) returns boolean language plpgsql security definer set search_path = public as $$
declare s text := gen_random_uuid()::text;
begin
  if auth.uid() is null then raise exception 'Staff only'; end if;
  if coalesce(p_pin, '') !~ '^\d{4,6}$' then raise exception 'PIN must be 4 to 6 digits'; end if;
  update qr_customers set salt = s, pin_hash = qr_hash(s, p_pin), token = gen_random_uuid(), fails = 0, locked_until = null where id = p_id;
  if not found then raise exception 'Customer not found'; end if;
  return true;
end $$;

-- removes the customer (their old orders stay in the records; their phone notifications are removed too)
create or replace function public.qr_admin_delete(p_id uuid) returns boolean language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Staff only'; end if;
  delete from qr_customers where id = p_id;
  return true;
end $$;

revoke all on function public.qr_customer_list() from public, anon;
revoke all on function public.qr_admin_update(uuid, text, text) from public, anon;
revoke all on function public.qr_admin_set_pin(uuid, text) from public, anon;
revoke all on function public.qr_admin_delete(uuid) from public, anon;
grant execute on function public.qr_customer_list() to authenticated;
grant execute on function public.qr_admin_update(uuid, text, text) to authenticated;
grant execute on function public.qr_admin_set_pin(uuid, text) to authenticated;
grant execute on function public.qr_admin_delete(uuid) to authenticated;

-- ---------- Update 16: offers to chosen customers incl. WhatsApp-only ----------
alter table public.qr_notices add column if not exists phones text[];

create or replace function public.qr_notices(p_token uuid) returns jsonb language sql stable security definer set search_path = public as $$
  select case when exists (select 1 from qr_customers where token = p_token) then
    coalesce((select jsonb_agg(jsonb_build_object('id', id, 'title', title, 'body', body, 'created_at', created_at, 'image_url', image_url, 'offer_items', offer_items) order by created_at desc)
              from (select n.* from qr_notices n, (select * from qr_customers where token = p_token) c
                     where n.active and (n.expires_at is null or n.expires_at > now())
                       and (n.customer_ids is null and n.phones is null or c.id = any(coalesce(n.customer_ids, '{}')) or c.phone = any(coalesce(n.phones, '{}')))
                     order by n.created_at desc limit 5) n), '[]'::jsonb)
  else '[]'::jsonb end
$$;

-- placing an order: personal offers are checked by customer id or phone number
create or replace function public.qr_place_order(p_token uuid, p_type text, p_table text, p_note text, p_lines jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare c qr_customers; nm text; l jsonb; a jsonb; it items; ad addons; r record; q int; aq int; n int; code text; sub numeric := 0; nt qr_notices; oi jsonb; unit numeric;
        out jsonb := '[]'::jsonb; ads jsonb; lt numeric; o qr_orders; today date := (now() at time zone 'Asia/Colombo')::date;
begin
  select * into c from qr_customers where token = p_token;
  if not found then raise exception 'Please log in again'; end if;
  if not coalesce((select qr_open from settings where id = 1), true) then raise exception 'Sorry, we are not taking QR orders right now'; end if;
  if p_type not in ('dine_in','takeaway') then raise exception 'Choose dine-in or takeaway'; end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) not between 1 and 30 then raise exception 'Your order is empty'; end if;
  if (select count(*) from qr_orders where customer_id = c.id and status in ('new','confirmed')) >= 3 then
    raise exception 'You already have 3 orders waiting. Please wait for them to finish'; end if;
  -- enough in stock? (all lines of the same item added together)
  for r in select (x->>'item_id')::uuid id, sum((x->>'qty')::int) q from jsonb_array_elements(p_lines) x where nullif(x->>'item_id', '') is not null group by 1 loop
    select * into it from items where id = r.id and active;
    if not found then raise exception 'One of the items is not available any more'; end if;
    if it.track_stock and it.stock < r.q then
      raise exception '%', case when it.stock <= 0 then 'Sorry, ' || it.name || ' is finished' else 'Sorry, only ' || it.stock || ' left of ' || it.name end;
    end if;
  end loop;
  for l in select * from jsonb_array_elements(p_lines) loop
    q := (l->>'qty')::int; if q < 1 or q > 50 then raise exception 'Invalid quantity'; end if;
    oi := null; nm := null; it := null;
    if nullif(l->>'custom_id', '') is not null then
      -- a custom offer item: the name and the price are set by the shop inside the offer
      if nullif(l->>'offer_id', '') is null then raise exception 'Invalid offer'; end if;
      select * into nt from qr_notices where id = (l->>'offer_id')::uuid and active and (expires_at is null or expires_at > now()) and (customer_ids is null and phones is null or c.id = any(coalesce(customer_ids, '{}')) or c.phone = any(coalesce(phones, '{}')));
      if not found then raise exception 'Sorry, this offer has ended'; end if;
      select t.e into oi from jsonb_array_elements(nt.offer_items) as t(e) where t.e->>'id' = l->>'custom_id' limit 1;
      if oi is null or nullif(oi->>'price', '') is null then raise exception 'This item is not part of the offer'; end if;
      nm := left(coalesce(nullif(btrim(oi->>'name'), ''), 'Offer'), 80);
      unit := (oi->>'price')::numeric;
      if nullif(oi->>'item_id', '') is not null then
        select * into it from items where id = (oi->>'item_id')::uuid and active;
        if not found then raise exception 'One of the items is not available any more'; end if;
        if it.track_stock and it.stock < q then raise exception '%', 'Sorry, only ' || greatest(it.stock, 0) || ' left of ' || it.name; end if;
      end if;
      if coalesce(jsonb_array_length(l->'addons'), 0) > 0 then raise exception 'Extras are not available for this offer'; end if;
    else
    select * into it from items where id = (l->>'item_id')::uuid and active;
    unit := it.price;
    if nullif(l->>'offer_id', '') is not null then
      select * into nt from qr_notices where id = (l->>'offer_id')::uuid and active and (expires_at is null or expires_at > now()) and (customer_ids is null and phones is null or c.id = any(coalesce(customer_ids, '{}')) or c.phone = any(coalesce(phones, '{}')));
      if not found then raise exception 'Sorry, this offer has ended'; end if;
      select t.e into oi from jsonb_array_elements(nt.offer_items) as t(e) where t.e->>'item_id' = it.id::text limit 1;
      if oi is null then raise exception 'This item is not part of the offer'; end if;
      unit := coalesce(nullif(oi->>'price', '')::numeric, it.price);
    end if;
    end if;
    lt := unit * q; ads := '[]'::jsonb;
    if coalesce(jsonb_array_length(l->'addons'), 0) > 0 then
      if not it.allow_addons or jsonb_array_length(l->'addons') > 10 then raise exception 'Extras are not available for %', it.name; end if;
      for a in select * from jsonb_array_elements(l->'addons') loop
        aq := (a->>'qty')::int; if aq < 1 or aq > 20 then raise exception 'Invalid extra quantity'; end if;
        select * into ad from addons where id = (a->>'id')::uuid and active;
        if not found then raise exception 'One of the extras is not available any more'; end if;
        ads := ads || jsonb_build_object('id', ad.id, 'name', ad.name, 'price', ad.price, 'qty', aq);
        lt := lt + ad.price * aq;
      end loop;
    end if;
    out := out || jsonb_build_object('item_id', it.id, 'name', coalesce(nm, it.name), 'unit', unit, 'qty', q, 'addons', ads, 'offer_id', nullif(l->>'offer_id', ''), 'custom_id', nullif(l->>'custom_id', ''));
    sub := sub + lt;
  end loop;
  perform pg_advisory_xact_lock(918275);
  select coalesce(max(substr(qo.code, 2)::int), 0) + 1 into n from qr_orders qo where qo.day = today;
  code := 'Q' || n;
  insert into qr_orders (code, day, customer_id, customer_name, customer_phone, order_type, table_no, note, items, subtotal)
  values (code, today, c.id, c.name, c.phone, p_type, left(btrim(coalesce(p_table,'')), 20), left(btrim(coalesce(p_note,'')), 200), out, round(sub, 2))
  returning * into o;
  return jsonb_build_object('id', o.id, 'code', o.code, 'total', o.subtotal, 'status', o.status);
end $$;
grant execute on function public.qr_place_order(uuid, text, text, text, jsonb) to anon, authenticated;


-- ===== Update 17: order history = current month only =====
create or replace function public.qr_history(p_token uuid) returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', q.id, 'code', q.code, 'status', q.status, 'order_type', q.order_type, 'table_no', q.table_no, 'items', q.items,
           'subtotal', q.subtotal, 'created_at', q.created_at, 'reason', q.reason,
           'total', (select o.total from orders o where o.id = q.order_id and q.status = 'done')) order by q.created_at desc), '[]'::jsonb)
    from (select * from qr_orders
           where customer_id = (select id from qr_customers where token = p_token)
             and created_at >= (date_trunc('month', now() at time zone 'Asia/Colombo') at time zone 'Asia/Colombo')
           order by created_at desc limit 200) q
$$;
grant execute on function public.qr_history(uuid) to anon, authenticated;
