import type { Db } from '@/lib/db';
import type { AccountType } from '@/lib/core/constants';

export type AccountRow = {
  id: string;
  created_by: string;
  household_id: string | null;
  type: AccountType;
  name: string;
  currency: string;
  is_joint: boolean;
  is_fixed: boolean;
  interest_rate: number | null;
  linked_property_id: string | null;
  crypto_coin: string | null;
  crypto_units: number | null;
  property_country: string | null;
  valuation_source: string | null;
  valuation_area: string | null;
  notes: string | null;
  archived: boolean;
  my_share: number;
  latest_balance: number | null;
  latest_month: string | null;
};

export type ShareRow = { id: string; account_id: string; user_id: string | null; external_name: string | null; share_pct: number; name: string | null };
export type Member = { user_id: string; name: string; email: string | null; display_currency: string };

export type SummaryRow = {
  user_id: string;
  name: string;
  is_me: boolean;
  month: string;
  net_worth: number | null;
  cash_change: number | null;
  other_change: number | null;
  income: number | null;
  spending: number | null;
};

export async function getMembers(db: Db): Promise<Member[]> {
  const r = await db.query<Member>(
    `select user_id, name, email, display_currency from profiles
      where user_id = app_uid() or (household_id is not null and household_id = my_household())
      order by (user_id = app_uid()) desc, name`,
  );
  return r.rows;
}

export async function getAccounts(db: Db, userId: string, opts: { includeArchived?: boolean } = {}): Promise<AccountRow[]> {
  const r = await db.query<AccountRow>(
    `select a.*,
        coalesce(
          (select s.share_pct from ownership_shares s where s.account_id = a.id and s.user_id = $1),
          case when a.created_by = $1 and not exists (select 1 from ownership_shares s where s.account_id = a.id) then 100 else 0 end
        ) as my_share,
        ls.balance as latest_balance, ls.month as latest_month
       from accounts a
       left join lateral (
         select balance, month from snapshots s where s.account_id = a.id order by month desc limit 1
       ) ls on true
      where ($2 or not a.archived)
      order by a.archived, array_position(array['bank','savings','pension','property','mortgage','credit_card','loan','crypto','other_asset']::text[], a.type), a.name`,
    [userId, !!opts.includeArchived],
  );
  return r.rows;
}

export async function getShares(db: Db, accountIds: string[]): Promise<ShareRow[]> {
  if (!accountIds.length) return [];
  const r = await db.query<ShareRow>(
    `select s.*, p.name from ownership_shares s left join profiles p on p.user_id = s.user_id
      where s.account_id = any($1) order by s.share_pct desc`,
    [accountIds],
  );
  return r.rows;
}

export async function getSummary(db: Db, display: string): Promise<SummaryRow[]> {
  const r = await db.query<SummaryRow>('select * from household_monthly_summary($1)', [display]);
  return r.rows;
}

export async function getSnapshotsForMonth(db: Db, month: string) {
  const r = await db.query<{ account_id: string; balance: number }>(
    'select account_id, balance from snapshots where month = $1',
    [month],
  );
  return new Map(r.rows.map((x) => [x.account_id, x.balance]));
}

export async function getPreviousBalances(db: Db, month: string) {
  const r = await db.query<{ account_id: string; balance: number; month: string }>(
    `select distinct on (account_id) account_id, balance, month from snapshots
      where month < $1 order by account_id, month desc`,
    [month],
  );
  return new Map(r.rows.map((x) => [x.account_id, x]));
}

export type PropertyValueRow = {
  account_id: string; month: string; value: number; source: string; index_value: number | null; index_period: string | null;
};

export async function getPropertyValues(db: Db, accountIds: string[]): Promise<PropertyValueRow[]> {
  if (!accountIds.length) return [];
  const r = await db.query<PropertyValueRow>(
    'select * from property_values where account_id = any($1) order by month',
    [accountIds],
  );
  return r.rows;
}

export async function getCheckin(db: Db, month: string) {
  const r = await db.query<{ month: string; income: number; income_currency: string; estimated_spending: number | null }>(
    'select * from checkins where user_id = app_uid() and month = $1',
    [month],
  );
  return r.rows[0] ?? null;
}

export async function firstSnapshotMonth(db: Db): Promise<string | null> {
  const r = await db.query<{ m: string | null }>('select min(month) as m from snapshots');
  return r.rows[0]?.m ?? null;
}
