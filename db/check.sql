-- Worthwise – run this in the Neon SQL Editor after schema.sql.
-- You should see 8 rows below, every one with rls_on = true and policies > 0.
select c.relname as table_name,
       c.relrowsecurity as rls_on,
       (select count(*) from pg_policies p where p.tablename = c.relname) as policies
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('households','profiles','accounts','ownership_shares',
                    'checkins','snapshots','property_values','exchange_rates')
order by 1;

-- Quick security test: pretend to be a user nobody knows. Should return 0.
begin;
set local role worthwise_app;
select set_config('app.user_id', 'nobody-at-all', true);
select count(*) as accounts_visible_to_a_stranger from accounts;
rollback;
