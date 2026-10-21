-- ============================================================
-- මරු Bun POS - UPDATE 8  (safe to run more than once)
--   * Inventory: price paid for every stock purchase + average cost per unit
--   * Menu items: ingredients per item (e.g. 10 g cheese) -> item cost, profit
--   * Extras: cost
--   * (bills keep the cost of each line at the time of sale, inside orders.items - no new column)
-- Supabase > SQL Editor > New query > paste all > Run
-- ============================================================
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
