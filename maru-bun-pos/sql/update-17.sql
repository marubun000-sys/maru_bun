-- Update 17: customers' order history shows only the CURRENT month (Sri Lanka time). Run once (safe to re-run).
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
