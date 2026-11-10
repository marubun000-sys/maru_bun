-- ============================================================
-- Update 15: manage QR customers from Settings & Security (edit name/phone, set a new PIN, remove)
-- Safe to run more than once. Run AFTER update-14.sql.
-- The PIN is stored scrambled (hashed), so nobody can read it back - staff set a NEW PIN and tell the customer.
-- ============================================================
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
