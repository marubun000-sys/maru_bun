-- ============================================================
-- Update 14: custom offer items (your own name + price, e.g. a combo) in offers
-- Safe to run more than once. Run AFTER update-13.sql.
-- offer_items entries are now either {"item_id","price"} (a menu item at a special price)
-- or {"id","name","price","item_id"|null} (a custom item; item_id = menu item whose stock goes down, optional)
-- ============================================================
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
