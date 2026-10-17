-- =====================================================================
--  මරු Bun POS  -  Supabase schema
--  Supabase Dashboard -> SQL Editor -> New query -> paste all -> Run
--  Safe to run once on a fresh project.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------- Settings (always exactly one row, id = 1) ----------
create table if not exists settings (
  id int primary key default 1 check (id = 1),
  shop_name text not null default 'මරු Bun',
  tagline text not null default 'The Taste of Something Special.',
  address text not null default 'PVHX+2RG New Bridge Bus Stop, Panadura, Moratuwa',
  phone text not null default '',
  cashier text not null default '',
  service_charge_enabled boolean not null default true,
  service_charge_pct numeric not null default 10,
  discount_presets jsonb not null default '[5,10,15,20]',
  payment_methods jsonb not null default '["Cash","Card","Bank Transfer","QR"]',
  review_url text not null default '',
  review_on_whatsapp boolean not null default true,
  thank_you text not null default 'Thank you! Come again.',
  receipt_footer text not null default 'Thank you! Come again.'
);
insert into settings (id) values (1) on conflict do nothing;

-- ---------- Menu ----------
create table if not exists categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sort int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists inventory (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  unit text not null default 'pcs',
  qty numeric not null default 0,
  low_threshold numeric not null default 10,
  created_at timestamptz not null default now()
);

create table if not exists menu_items (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references categories(id) on delete set null,
  name text not null,
  price numeric not null default 0,
  active boolean not null default true,
  inventory_id uuid references inventory(id) on delete set null,
  uses_qty numeric not null default 1,
  created_at timestamptz not null default now()
);

create table if not exists addons (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  price numeric not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------- Orders / bills ----------
create sequence if not exists bill_seq start 1;

create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  bill_no bigint not null default nextval('bill_seq'),
  created_at timestamptz not null default now(),
  order_type text not null default 'dine-in' check (order_type in ('dine-in','takeaway')),
  customer_name text not null default '',
  customer_phone text not null default '',
  subtotal numeric not null default 0,
  service_charge numeric not null default 0,
  discount numeric not null default 0,
  total numeric not null default 0,
  payment_method text not null default 'Cash',
  cash_received numeric,
  change_given numeric,
  cashier text not null default '',
  note text not null default '',
  status text not null default 'new' check (status in ('new','served')),
  served_at timestamptz
);
create index if not exists orders_created_idx on orders (created_at desc);
create index if not exists orders_status_idx on orders (status);

create table if not exists order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  menu_item_id uuid,
  name text not null,
  qty int not null default 1,
  unit_price numeric not null default 0,
  addons jsonb not null default '[]',
  line_total numeric not null default 0
);
create index if not exists order_items_order_idx on order_items (order_id);

-- ---------- Atomic "place order": bill + items + stock deduction ----------
create or replace function place_order(p jsonb)
returns orders
language plpgsql
as $$
declare
  o orders;
  it jsonb;
begin
  insert into orders (order_type, customer_name, customer_phone, subtotal, service_charge,
                      discount, total, payment_method, cash_received, change_given, cashier, note)
  values (
    coalesce(p->>'order_type','dine-in'),
    coalesce(p->>'customer_name',''),
    coalesce(p->>'customer_phone',''),
    coalesce((p->>'subtotal')::numeric,0),
    coalesce((p->>'service_charge')::numeric,0),
    coalesce((p->>'discount')::numeric,0),
    coalesce((p->>'total')::numeric,0),
    coalesce(p->>'payment_method','Cash'),
    nullif(p->>'cash_received','')::numeric,
    nullif(p->>'change_given','')::numeric,
    coalesce(p->>'cashier',''),
    coalesce(p->>'note','')
  ) returning * into o;

  for it in select * from jsonb_array_elements(p->'items') loop
    insert into order_items (order_id, menu_item_id, name, qty, unit_price, addons, line_total)
    values (
      o.id,
      nullif(it->>'menu_item_id','')::uuid,
      it->>'name',
      (it->>'qty')::int,
      (it->>'unit_price')::numeric,
      coalesce(it->'addons','[]'::jsonb),
      (it->>'line_total')::numeric
    );

    update inventory i
       set qty = greatest(0, i.qty - m.uses_qty * (it->>'qty')::numeric)
      from menu_items m
     where m.id = nullif(it->>'menu_item_id','')::uuid
       and m.inventory_id = i.id;
  end loop;

  return o;
end;
$$;

-- ---------- Security: only logged-in staff who passed 2-step (aal2) ----------
do $$
declare t text;
begin
  foreach t in array array['settings','categories','inventory','menu_items','addons','orders','order_items']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists "staff_aal2_all" on %I', t);
    execute format(
      'create policy "staff_aal2_all" on %I for all to authenticated
         using ((select auth.jwt() ->> ''aal'') = ''aal2'')
         with check ((select auth.jwt() ->> ''aal'') = ''aal2'')', t);
  end loop;
end $$;

grant usage, select on sequence bill_seq to authenticated;

-- ---------- Sample data (edit / delete from the app) ----------
insert into categories (name, sort) values
  ('Hot Buns', 1), ('Combos', 2), ('Sides', 3), ('Drinks', 4)
on conflict do nothing;

insert into inventory (name, unit, qty, low_threshold) values
  ('Buns', 'pcs', 100, 20),
  ('Chicken', 'kg', 10, 3),
  ('Beef', 'kg', 8, 3),
  ('Cheese', 'slices', 80, 20),
  ('Soft drinks', 'bottles', 48, 12);

insert into menu_items (category_id, name, price, inventory_id, uses_qty)
select c.id, v.name, v.price, i.id, 1
from (values
  ('Hot Buns','Chicken Bun',450,'Buns'),
  ('Hot Buns','Beef Bun',500,'Buns'),
  ('Hot Buns','Cheese Bun',550,'Buns'),
  ('Hot Buns','Spicy Bun',480,'Buns'),
  ('Drinks','Soft Drink',200,'Soft drinks')
) as v(cat, name, price, inv)
join categories c on c.name = v.cat
join inventory i on i.name = v.inv;

insert into menu_items (category_id, name, price)
select c.id, v.name, v.price
from (values ('Sides','French Fries',350), ('Drinks','Milk Tea',150)) as v(cat, name, price)
join categories c on c.name = v.cat;

insert into addons (name, price) values
  ('Extra Cheese', 100), ('Extra Sauce', 50), ('Fried Egg', 80), ('Extra Spicy', 0);
