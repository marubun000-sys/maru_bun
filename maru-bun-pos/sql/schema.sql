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
