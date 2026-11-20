-- =====================================================================
--  Worthwise – database setup for Neon (Postgres 16/17)
--  Paste this whole file into the Neon SQL Editor and press "Run".
--  It is safe to run again later: it only adds what is missing and
--  refreshes the security rules and functions.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. The "app role"
--    Every request from the web app switches to this role before it
--    touches any data. Row-level security applies to this role, so a
--    bug in the app still cannot show one person another person's data.
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'worthwise_app') then
    create role worthwise_app nologin;
  end if;
end $$;

-- Let the login role from your connection string switch into it.
grant worthwise_app to current_user;

grant usage on schema public to worthwise_app;

-- ---------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------

-- Households: groups partners so totals can be combined.
create table if not exists households (
  id           uuid primary key default gen_random_uuid(),
  name         text not null default 'Our household',
  invite_code  text not null unique default upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8)),
  created_by   text not null,
  created_at   timestamptz not null default now()
);

-- Profiles: one row per person (user_id is the Neon Auth user id).
create table if not exists profiles (
  user_id           text primary key,
  email             text,
  name              text not null default '',
  display_currency  char(3) not null default 'EUR',
  household_id      uuid references households(id) on delete set null,
  created_at        timestamptz not null default now()
);

-- Accounts: every account or asset. Debts are stored as negative balances.
create table if not exists accounts (
  id                  uuid primary key default gen_random_uuid(),
  created_by          text not null references profiles(user_id) on delete cascade,
  household_id        uuid references households(id) on delete set null,
  type                text not null check (type in (
                        'bank', 'savings', 'investment', 'pension', 'property', 'mortgage',
                        'credit_card', 'loan', 'crypto', 'other_asset')),
  name                text not null,
  currency            char(3) not null,
  is_joint            boolean not null default false,
  is_fixed            boolean not null default false,      -- savings: no deposits/withdrawals
  interest_rate       numeric(6,3),                        -- % per year (optional)
  linked_property_id  uuid references accounts(id) on delete set null,  -- mortgages
  crypto_coin         text,                                -- ticker, e.g. 'BTC'
  crypto_units        numeric(30,10),
  property_country    char(2),                             -- 'GB', 'FI', ...
  valuation_source    text check (valuation_source in ('auto', 'manual', 'uk_hpi', 'fi_apartments', 'fi_houses')),
  valuation_area      text,                                -- e.g. 'London' or 'Helsinki'
  property_kind       text check (property_kind in ('flat', 'terraced', 'house')),
  notes               text,
  archived            boolean not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index if not exists accounts_household_idx on accounts(household_id);
create index if not exists accounts_created_by_idx on accounts(created_by);

-- Ownership shares: who owns what percentage of an account.
-- Individual accounts have one row (100%). Joint accounts have one row per
-- partner (default 50/50). Properties can also list co-owners who are not
-- app users (external_name), e.g. a family member holding 40%.
create table if not exists ownership_shares (
  id             uuid primary key default gen_random_uuid(),
  account_id     uuid not null references accounts(id) on delete cascade,
  user_id        text references profiles(user_id) on delete cascade,
  external_name  text,
  share_pct      numeric(5,2) not null check (share_pct > 0 and share_pct <= 100),
  check ((user_id is null) <> (external_name is null)),
  unique (account_id, user_id)
);
create index if not exists ownership_user_idx on ownership_shares(user_id);

-- Check-ins: one per person per month, with that month's income and the
-- estimated spending worked out when the check-in was saved.
create table if not exists checkins (
  user_id             text not null references profiles(user_id) on delete cascade,
  month               date not null check (month = date_trunc('month', month)::date),
  income              numeric(14,2),                       -- empty = not entered (no spending estimate)
  income_currency     char(3) not null,
  estimated_spending  numeric(14,2),
  completed_at        timestamptz not null default now(),
  primary key (user_id, month)
);

-- Snapshots: one balance per account per month (in the account's currency).
create table if not exists snapshots (
  account_id   uuid not null references accounts(id) on delete cascade,
  month        date not null check (month = date_trunc('month', month)::date),
  balance      numeric(16,2) not null,
  units        numeric(30,10),                 -- crypto: coins held at the time
  unit_price   numeric(24,8),                  -- crypto: price per coin used
  price_source text,
  recorded_by  text,
  recorded_at  timestamptz not null default now(),
  primary key (account_id, month)
);

-- Property values: monthly market value per property (estimate or override).
create table if not exists property_values (
  account_id    uuid not null references accounts(id) on delete cascade,
  month         date not null check (month = date_trunc('month', month)::date),
  value         numeric(16,2) not null check (value >= 0),
  source        text not null check (source in ('manual', 'index', 'api')),
  index_value   numeric(14,4),
  index_period  text,
  note          text,
  primary key (account_id, month)
);

-- Exchange rates: how many units of each currency one euro bought that
-- month. Any pair (e.g. GBP→EUR, EUR→USD) is worked out from these.
create table if not exists exchange_rates (
  month       date not null check (month = date_trunc('month', month)::date),
  currency    char(3) not null,
  per_eur     numeric(18,8) not null check (per_eur > 0),
  source      text not null default 'frankfurter',
  fetched_at  timestamptz not null default now(),
  primary key (month, currency)
);

-- ---------------------------------------------------------------------
-- 1b. Updates for databases created with an earlier version of this file
-- ---------------------------------------------------------------------
alter table accounts add column if not exists property_kind text;
alter table accounts drop constraint if exists accounts_type_check;
alter table accounts add constraint accounts_type_check check (type in (
  'bank', 'savings', 'investment', 'pension', 'property', 'mortgage', 'credit_card', 'loan', 'crypto', 'other_asset'));
alter table accounts drop constraint if exists accounts_valuation_source_check;
alter table accounts add constraint accounts_valuation_source_check
  check (valuation_source in ('auto', 'manual', 'uk_hpi', 'fi_apartments', 'fi_houses'));
alter table accounts drop constraint if exists accounts_property_kind_check;
alter table accounts add constraint accounts_property_kind_check check (property_kind in ('flat', 'terraced', 'house'));
alter table snapshots add column if not exists units numeric(30,10);
alter table snapshots add column if not exists unit_price numeric(24,8);
alter table snapshots add column if not exists price_source text;
alter table checkins alter column income drop not null;
alter table checkins alter column income drop default;

-- ---------------------------------------------------------------------
-- 2. Helper functions used by the security rules
-- ---------------------------------------------------------------------

-- The signed-in user, set by the app at the start of every request.
create or replace function app_uid() returns text
language sql stable as $$
  select nullif(current_setting('app.user_id', true), '')
$$;

create or replace function my_household() returns uuid
language sql stable security definer set search_path = public as $$
  select household_id from profiles where user_id = app_uid()
$$;

create or replace function is_household_member(p_user text) returns boolean
language sql stable security definer set search_path = public as $$
  select p_user = app_uid() or exists (
    select 1 from profiles
    where user_id = p_user and household_id is not null and household_id = my_household())
$$;

-- You can see (and edit) an account if you created it, own a share of it,
-- or it is a joint account in your household.
create or replace function can_see_account(p_account uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from accounts a
    where a.id = p_account and (
      a.created_by = app_uid()
      or exists (select 1 from ownership_shares s where s.account_id = a.id and s.user_id = app_uid())
      or (a.is_joint and a.household_id is not null and a.household_id = my_household())
    ))
$$;

-- Euro rate for a currency in a given month (latest known on or before it,
-- otherwise the earliest we have).
create or replace function rate_per_eur(p_currency char(3), p_month date) returns numeric
language sql stable as $$
  select case when p_currency = 'EUR' then 1::numeric else coalesce(
    (select per_eur from exchange_rates where currency = p_currency and month <= p_month order by month desc limit 1),
    (select per_eur from exchange_rates where currency = p_currency order by month asc limit 1)
  ) end
$$;

create or replace function fx(p_amount numeric, p_from char(3), p_to char(3), p_month date) returns numeric
language sql stable as $$
  select case
    when p_amount is null then null
    when p_from = p_to then p_amount
    else p_amount / rate_per_eur(p_from, p_month) * rate_per_eur(p_to, p_month)
  end
$$;

-- ---------------------------------------------------------------------
-- 3. Household actions (run with elevated rights, but only ever act on
--    the signed-in user's own profile)
-- ---------------------------------------------------------------------
create or replace function create_household(p_name text) returns households
language plpgsql security definer set search_path = public as $$
declare h households;
begin
  if app_uid() is null then raise exception 'not signed in'; end if;
  if my_household() is not null then raise exception 'You are already in a household'; end if;
  insert into households (name, created_by) values (coalesce(nullif(trim(p_name), ''), 'Our household'), app_uid())
  returning * into h;
  update profiles set household_id = h.id where user_id = app_uid();
  return h;
end $$;

create or replace function join_household(p_code text) returns households
language plpgsql security definer set search_path = public as $$
declare h households;
begin
  if app_uid() is null then raise exception 'not signed in'; end if;
  if my_household() is not null then raise exception 'You are already in a household'; end if;
  select * into h from households where invite_code = upper(trim(p_code));
  if h.id is null then raise exception 'That invite code was not found'; end if;
  update profiles set household_id = h.id where user_id = app_uid();
  return h;
end $$;

create or replace function leave_household() returns void
language plpgsql security definer set search_path = public as $$
begin
  update profiles set household_id = null where user_id = app_uid();
end $$;

-- ---------------------------------------------------------------------
-- 4. Monthly totals for you and your household.
--    This is how partners see each other's TOTAL without seeing any
--    individual account: the function adds things up and only returns
--    one number per person per month.
--    Joint accounts are split by ownership share, so the combined total
--    never counts them twice.
-- ---------------------------------------------------------------------
drop function if exists household_monthly_summary(char);
create or replace function household_monthly_summary(p_display char(3))
returns table (
  user_id        text,
  name           text,
  is_me          boolean,
  month          date,
  net_worth      numeric,
  cash_change    numeric,
  other_change   numeric,
  income         numeric,
  spending       numeric
)
language sql stable security definer set search_path = public as $$
  with members as (
    select p.user_id, p.name from profiles p
    where app_uid() is not null
      and (p.user_id = app_uid() or (p.household_id is not null and p.household_id = my_household()))
  ),
  shares as (
    select o.user_id, o.account_id, o.share_pct / 100.0 as frac
    from ownership_shares o join members m on m.user_id = o.user_id
    union all
    -- accounts without any ownership rows belong 100% to their creator
    select a.created_by, a.id, 1.0
    from accounts a join members m on m.user_id = a.created_by
    where not exists (select 1 from ownership_shares o where o.account_id = a.id)
  ),
  holdings as (
    select sh.user_id, sh.account_id, sh.frac, a.type, a.currency, a.is_fixed
    from shares sh join accounts a on a.id = sh.account_id
  ),
  months as (
    select generate_series(
      (select min(s.month) from snapshots s join holdings h on h.account_id = s.account_id),
      date_trunc('month', now())::date,
      interval '1 month')::date as month
  ),
  bal as (
    select h.*, mo.month,
      (select s.balance from snapshots s
        where s.account_id = h.account_id and s.month <= mo.month
        order by s.month desc limit 1) as balance,
      (select s.balance from snapshots s
        where s.account_id = h.account_id and s.month < mo.month
        order by s.month desc limit 1) as prev_balance
    from holdings h cross join months mo
  ),
  valued as (
    select b.user_id, b.month, b.type, b.is_fixed,
      fx(b.balance * b.frac, b.currency, p_display, b.month) as v,
      -- change in the account's own currency, converted at this month's rate,
      -- so currency swings are not mistaken for spending or saving
      case when b.prev_balance is null then null
           else fx((b.balance - b.prev_balance) * b.frac, b.currency, p_display, b.month) end as dv
    from bal b
    where b.balance is not null
  ),
  totals as (
    select v.user_id, v.month,
      sum(v.v) as net_worth,
      bool_or(v.dv is not null) as has_prev,
      coalesce(sum(v.dv) filter (where v.type in ('bank', 'credit_card') or (v.type = 'savings' and not v.is_fixed)), 0) as cash_change,
      coalesce(sum(v.dv) filter (where not (v.type in ('bank', 'credit_card') or (v.type = 'savings' and not v.is_fixed))), 0) as other_change
    from valued v
    group by v.user_id, v.month
  )
  select t.user_id, m.name, t.user_id = app_uid(), t.month,
    round(t.net_worth, 2),
    case when t.has_prev then round(t.cash_change, 2) end,
    case when t.has_prev then round(t.other_change, 2) end,
    round(fx(c.income, c.income_currency, p_display, t.month), 2),
    case when t.has_prev and c.income is not null
         then round(fx(c.income, c.income_currency, p_display, t.month) - t.cash_change, 2) end
  from totals t
  join members m on m.user_id = t.user_id
  left join checkins c on c.user_id = t.user_id and c.month = t.month
  order by t.month, t.user_id
$$;

-- Currencies used anywhere in your household (so totals can always be
-- converted). Reveals nothing else about a partner's accounts.
create or replace function household_currencies() returns setof text
language sql stable security definer set search_path = public as $$
  select distinct a.currency::text from accounts a
  where a.created_by in (
      select p.user_id from profiles p
      where p.user_id = app_uid() or (p.household_id is not null and p.household_id = my_household()))
     or exists (select 1 from ownership_shares s where s.account_id = a.id and s.user_id = app_uid())
$$;

-- ---------------------------------------------------------------------
-- 5. Row-level security
-- ---------------------------------------------------------------------
alter table households       enable row level security;
alter table profiles         enable row level security;
alter table accounts         enable row level security;
alter table ownership_shares enable row level security;
alter table checkins         enable row level security;
alter table snapshots        enable row level security;
alter table property_values  enable row level security;
alter table exchange_rates   enable row level security;

-- Households: you see only your own; changes go through the functions above.
drop policy if exists households_select on households;
create policy households_select on households for select to worthwise_app
  using (id = my_household());
drop policy if exists households_update on households;
create policy households_update on households for update to worthwise_app
  using (id = my_household()) with check (id = my_household());

-- Profiles: your own row, plus the names of people in your household.
drop policy if exists profiles_select on profiles;
create policy profiles_select on profiles for select to worthwise_app
  using (user_id = app_uid() or (household_id is not null and household_id = my_household()));
drop policy if exists profiles_insert on profiles;
create policy profiles_insert on profiles for insert to worthwise_app
  with check (user_id = app_uid() and household_id is null);
drop policy if exists profiles_update on profiles;
create policy profiles_update on profiles for update to worthwise_app
  using (user_id = app_uid()) with check (user_id = app_uid());

-- Accounts: yours, ones you hold a share of, and joint household ones.
-- A partner's individual accounts are never visible.
drop policy if exists accounts_select on accounts;
create policy accounts_select on accounts for select to worthwise_app
  using (created_by = app_uid()
         or (is_joint and household_id is not null and household_id = my_household())
         or can_see_account(id));
drop policy if exists accounts_insert on accounts;
create policy accounts_insert on accounts for insert to worthwise_app
  with check (created_by = app_uid() and (household_id is null or household_id = my_household()));
drop policy if exists accounts_update on accounts;
create policy accounts_update on accounts for update to worthwise_app
  using (created_by = app_uid() or can_see_account(id))
  with check (household_id is null or household_id = my_household());
drop policy if exists accounts_delete on accounts;
create policy accounts_delete on accounts for delete to worthwise_app
  using (can_see_account(id));

-- Ownership shares: visible/editable on accounts you can see; app users
-- named as owners must be you or someone in your household.
drop policy if exists shares_select on ownership_shares;
create policy shares_select on ownership_shares for select to worthwise_app
  using (can_see_account(account_id));
drop policy if exists shares_write on ownership_shares;
create policy shares_write on ownership_shares for all to worthwise_app
  using (can_see_account(account_id))
  with check (can_see_account(account_id) and (user_id is null or is_household_member(user_id)));

-- Check-ins: your own only.
drop policy if exists checkins_all on checkins;
create policy checkins_all on checkins for all to worthwise_app
  using (user_id = app_uid()) with check (user_id = app_uid());

-- Snapshots and property values follow the account they belong to.
drop policy if exists snapshots_all on snapshots;
create policy snapshots_all on snapshots for all to worthwise_app
  using (can_see_account(account_id)) with check (can_see_account(account_id));
drop policy if exists property_values_all on property_values;
create policy property_values_all on property_values for all to worthwise_app
  using (can_see_account(account_id)) with check (can_see_account(account_id));

-- Exchange rates are public reference data, shared by everyone.
drop policy if exists rates_read on exchange_rates;
create policy rates_read on exchange_rates for select to worthwise_app using (true);
drop policy if exists rates_write on exchange_rates;
create policy rates_write on exchange_rates for insert to worthwise_app with check (true);
drop policy if exists rates_update on exchange_rates;
create policy rates_update on exchange_rates for update to worthwise_app using (true) with check (true);

-- ---------------------------------------------------------------------
-- 6. Permissions for the app role
-- ---------------------------------------------------------------------
grant select on households to worthwise_app;
grant update (name) on households to worthwise_app;

grant select, insert on profiles to worthwise_app;
revoke update on profiles from worthwise_app;
grant update (name, email, display_currency) on profiles to worthwise_app;  -- not household_id

grant select, insert, update, delete on accounts, ownership_shares, checkins, snapshots, property_values to worthwise_app;
grant select, insert, update on exchange_rates to worthwise_app;

revoke execute on function my_household(), is_household_member(text), can_see_account(uuid),
  create_household(text), join_household(text), leave_household(), household_monthly_summary(char),
  household_currencies() from public;
grant execute on function app_uid(), my_household(), is_household_member(text), can_see_account(uuid),
  rate_per_eur(char, date), fx(numeric, char, char, date),
  create_household(text), join_household(text), leave_household(), household_monthly_summary(char),
  household_currencies()
  to worthwise_app;

-- Done! Run db/check.sql to confirm everything is in place.
