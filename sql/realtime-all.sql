-- Run this ONCE in Supabase > SQL Editor if you created the database with the first version of schema.sql.
-- It makes menu / stock / inventory / settings changes appear instantly on every device.
-- (The app still refreshes by itself every ~20 seconds even without this.)
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
