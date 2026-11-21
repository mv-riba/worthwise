-- Local test of the security rules (not needed on Neon).
\set ON_ERROR_STOP 1
create or replace function pg_temp.as_user(u text) returns void language sql as $$
  select set_config('app.user_id', u, true)
$$;

-- --- Setup: three users ---
begin; set local role worthwise_app; select pg_temp.as_user('maria');
insert into profiles (user_id, email, name, display_currency) values ('maria', 'm@x', 'Maria', 'EUR');
select invite_code as code from create_household('Home') \gset
commit;

begin; set local role worthwise_app; select pg_temp.as_user('mikko');
insert into profiles (user_id, email, name, display_currency) values ('mikko', 'k@x', 'Mikko', 'GBP');
select join_household(:'code');
commit;

begin; set local role worthwise_app; select pg_temp.as_user('eve');
insert into profiles (user_id, email, name) values ('eve', 'e@x', 'Eve');
commit;

-- rates: 1 EUR = 0.87 GBP (Oct), 0.88 GBP (Nov)
begin; set local role worthwise_app; select pg_temp.as_user('maria');
select save_exchange_rate('2026-10-01','GBP',0.87,true); select save_exchange_rate('2026-11-01','GBP',0.88,true);

-- Maria: individual bank (EUR), fixed savings (GBP); joint property + mortgage
insert into accounts (id, created_by, type, name, currency) values
  ('00000000-0000-0000-0000-000000000001','maria','bank','Maria current','EUR'),
  ('00000000-0000-0000-0000-000000000002','maria','savings','Fixed saver','GBP');
update accounts set is_fixed = true where id = '00000000-0000-0000-0000-000000000002';
insert into accounts (id, created_by, household_id, type, name, currency, is_joint) values
  ('00000000-0000-0000-0000-000000000003','maria', my_household(),'property','London flat','GBP', true);
insert into accounts (id, created_by, household_id, type, name, currency, is_joint, linked_property_id) values
  ('00000000-0000-0000-0000-000000000004','maria', my_household(),'mortgage','Flat mortgage','GBP', true,'00000000-0000-0000-0000-000000000003');
insert into ownership_shares (account_id, user_id, share_pct) values
  ('00000000-0000-0000-0000-000000000001','maria',100),
  ('00000000-0000-0000-0000-000000000002','maria',100),
  ('00000000-0000-0000-0000-000000000003','maria',30),
  ('00000000-0000-0000-0000-000000000003','mikko',30),
  ('00000000-0000-0000-0000-000000000004','maria',50),
  ('00000000-0000-0000-0000-000000000004','mikko',50);
insert into ownership_shares (account_id, external_name, share_pct) values ('00000000-0000-0000-0000-000000000003','Mum',40);
insert into snapshots (account_id, month, balance) values
  ('00000000-0000-0000-0000-000000000001','2026-10-01',10000), ('00000000-0000-0000-0000-000000000001','2026-11-01',9000),
  ('00000000-0000-0000-0000-000000000002','2026-10-01',5000),  ('00000000-0000-0000-0000-000000000002','2026-11-01',5020),
  ('00000000-0000-0000-0000-000000000003','2026-10-01',300000),('00000000-0000-0000-0000-000000000003','2026-11-01',303000),
  ('00000000-0000-0000-0000-000000000004','2026-10-01',-150000),('00000000-0000-0000-0000-000000000004','2026-11-01',-149000);
insert into checkins (user_id, month, income, income_currency) values ('maria','2026-11-01',3000,'EUR');
commit;

-- Mikko: individual pension (EUR)
begin; set local role worthwise_app; select pg_temp.as_user('mikko');
insert into accounts (id, created_by, type, name, currency) values ('00000000-0000-0000-0000-000000000005','mikko','pension','Mikko pension','EUR');
insert into ownership_shares (account_id, user_id, share_pct) values ('00000000-0000-0000-0000-000000000005','mikko',100);
insert into snapshots (account_id, month, balance) values ('00000000-0000-0000-0000-000000000005','2026-11-01',50000);
commit;

-- --- Checks ---
\echo '== Maria sees (expect her 2 + 2 joint, NOT Mikko pension):'
begin; set local role worthwise_app; select pg_temp.as_user('maria');
select name from accounts order by name;
\echo '== Maria sees profiles (expect Maria, Mikko):'
select name from profiles order by name;
commit;

\echo '== Mikko sees (expect 2 joint + his pension, NOT Maria current/Fixed saver):'
begin; set local role worthwise_app; select pg_temp.as_user('mikko');
select name from accounts order by name;
select count(*) as mikko_sees_maria_snapshots from snapshots where account_id = '00000000-0000-0000-0000-000000000001';
commit;

\echo '== Eve sees (expect nothing):'
begin; set local role worthwise_app; select pg_temp.as_user('eve');
select count(*) as accounts from accounts;
select count(*) as profiles_other from profiles where user_id <> 'eve';
select count(*) as summary_rows_other from household_monthly_summary('EUR') where user_id <> 'eve';
commit;

\echo '== Eve tries to set her household directly (expect permission denied):'
begin; set local role worthwise_app; select pg_temp.as_user('eve');
\set ON_ERROR_STOP 0
update profiles set household_id = (select id from households limit 1) where user_id = 'eve';
rollback;
\echo '== Eve tries to give herself a share of Maria account (expect RLS violation):'
begin; set local role worthwise_app; select pg_temp.as_user('eve');
insert into ownership_shares (account_id, user_id, share_pct) values ('00000000-0000-0000-0000-000000000001','eve',100);
rollback;
\echo '== Maria tries to add Eve (not in household) as owner (expect RLS violation):'
begin; set local role worthwise_app; select pg_temp.as_user('maria');
insert into ownership_shares (account_id, user_id, share_pct) values ('00000000-0000-0000-0000-000000000002','eve',10);
rollback;
\echo '== No user set (expect nothing):'
begin; set local role worthwise_app;
select count(*) as anon_accounts from accounts;
rollback;
\set ON_ERROR_STOP 1

\echo '== Summary in EUR, seen by Maria:'
begin; set local role worthwise_app; select pg_temp.as_user('maria');
select name, is_me, month, net_worth, cash_change, other_change, income, spending from household_monthly_summary('EUR');
commit;
\echo '== Summary seen by Mikko in GBP:'
begin; set local role worthwise_app; select pg_temp.as_user('mikko');
select name, is_me, month, net_worth, cash_change, income, spending from household_monthly_summary('GBP');
commit;

\echo '== App write patterns (expect no errors):'
begin; set local role worthwise_app; select pg_temp.as_user('mikko');
insert into profiles (user_id, email, name) values ('mikko', 'k@x', 'Mikko') on conflict (user_id) do nothing;
insert into accounts (created_by, household_id, type, name, currency, is_joint) values ('mikko', my_household(), 'bank', 'Joint current', 'EUR', true) returning name;
insert into snapshots (account_id, month, balance, recorded_by) values ('00000000-0000-0000-0000-000000000003', '2026-11-01', 305000, 'mikko')
  on conflict (account_id, month) do update set balance = excluded.balance, recorded_by = excluded.recorded_by, recorded_at = now();
insert into property_values (account_id, month, value, source, index_value, index_period) values ('00000000-0000-0000-0000-000000000003', '2026-11-01', 305000, 'index', 102.5, '2026M09')
  on conflict (account_id, month) do update set value = excluded.value, source = excluded.source;
insert into checkins (user_id, month, income, income_currency) values ('mikko', '2026-11-01', 2500, 'GBP')
  on conflict (user_id, month) do update set income = excluded.income;
update checkins set estimated_spending = (select spending from household_monthly_summary('GBP') where is_me and month = '2026-11-01') where user_id = 'mikko' and month = '2026-11-01';
select income, estimated_spending from checkins;
select save_exchange_rate('2026-11-01','USD',1.08,true);
update profiles set name = 'Mikko K', display_currency = 'GBP' where user_id = 'mikko';
rollback;

\set ON_ERROR_STOP 0
\echo '== Security v3 checks'
\echo '-- direct write to exchange rates (expect permission denied):'
begin; set local role worthwise_app; select pg_temp.as_user('eve');
insert into exchange_rates (month, currency, per_eur) values ('2026-11-01','GBP',5);
rollback;
\echo '-- implausible rate via function (expect implausible rate):'
begin; set local role worthwise_app; select pg_temp.as_user('eve');
select save_exchange_rate('2026-11-01','GBP',5,true);
rollback;
\echo '-- not signed in (expect not signed in):'
begin; set local role worthwise_app;
select save_exchange_rate('2026-11-01','GBP',0.88,true);
rollback;
\echo '-- rate limit table not readable (expect permission denied):'
begin; set local role worthwise_app; select pg_temp.as_user('eve');
select count(*) from rate_limit_events;
rollback;
\echo '-- household full: eve tries the current code (expect already full):'
begin; set local role worthwise_app; select pg_temp.as_user('maria');
select invite_code as code2 from households where id = my_household() \gset
commit;
begin; set local role worthwise_app; select pg_temp.as_user('eve');
select join_household(:'code2');
rollback;
\echo '-- old code was rotated after Mikko joined (expect codes differ):'
select :'code' <> :'code2' as rotated;
\echo '-- guessing: 6th wrong code within an hour (expect Too many attempts on the last one):'
begin; set local role worthwise_app; select pg_temp.as_user('eve'); select join_household('WRONG1') as result; commit;
begin; set local role worthwise_app; select pg_temp.as_user('eve'); select join_household('WRONG2') as result; commit;
begin; set local role worthwise_app; select pg_temp.as_user('eve'); select join_household('WRONG3') as result; commit;
begin; set local role worthwise_app; select pg_temp.as_user('eve'); select join_household('WRONG4') as result; commit;
begin; set local role worthwise_app; select pg_temp.as_user('eve'); select join_household('WRONG5') as result; commit;
begin; set local role worthwise_app; select pg_temp.as_user('eve'); select join_household('WRONG6') as result; commit;
begin; set local role worthwise_app; select pg_temp.as_user('eve'); select join_household('WRONG7') as result; commit;
