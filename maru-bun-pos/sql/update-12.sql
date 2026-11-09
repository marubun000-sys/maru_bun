-- ============================================================
-- Update 12: orderable offers (photo + offer items/prices), notification diagnostics
-- Safe to run more than once. Run AFTER update-11.sql.
-- ============================================================
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
