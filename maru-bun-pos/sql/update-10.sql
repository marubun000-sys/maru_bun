-- ============================================================
-- මරු Bun POS - UPDATE 10  (safe to run more than once)
--   QR ordering: customers scan a QR, register / log in on their phone and send an order.
--   The order lands on the POS "QR Ordering" page, staff confirm it (-> kitchen) and later make the bill.
--   Customers never touch your tables directly: they can only call the small qr_* functions below.
-- Supabase > SQL Editor > New query > paste all > Run
-- ============================================================
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
