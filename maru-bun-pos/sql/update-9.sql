-- ============================================================
-- මරු Bun POS - UPDATE 9  (safe to run more than once)
--   * Selling an item takes its ingredients (pcs / kg / g ...) out of the inventory automatically
--   * Inventory quantities keep 4 decimals (10 g of cheese = 0.01 kg)
--   * Security alerts for the admin (another device changed the password / turned 2-step off)
-- Supabase > SQL Editor > New query > paste all > Run
-- ============================================================
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
