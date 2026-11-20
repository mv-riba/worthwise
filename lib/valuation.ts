import type { Db } from '@/lib/db';
import { estimateFromIndex } from '@/lib/core/calc';
import { fetchPriceIndex, SOURCE_NAMES } from '@/lib/external';
import type { AccountRow, PropertyValueRow } from '@/lib/data';

export type PropertyEstimate = {
  estimate: number;
  latestIndex: number;
  latestPeriod: string;
  ratio: number;
  sourceName: string;
  baseline: { month: string; value: number };
};

/**
 * Estimate a property's value for `month` by moving its last known value in
 * line with the official price index for its area. Returns null if no index is
 * available (manual properties, or the data source could not be reached).
 */
export async function estimatePropertyValue(account: AccountRow, history: PropertyValueRow[], month: string): Promise<PropertyEstimate | null> {
  if (!account.valuation_source || account.valuation_source === 'manual') return null;
  const before = history.filter((h) => h.month <= month).sort((a, b) => a.month.localeCompare(b.month));
  // Prefer the latest value the user typed in; otherwise the latest estimate.
  const manual = [...before].reverse().find((h) => h.source === 'manual');
  const latestAny = before[before.length - 1];
  const base = latestAny && manual && latestAny.month > manual.month ? latestAny : manual ?? latestAny;
  if (!base) return null;
  const series = await fetchPriceIndex(account.valuation_source, account.valuation_area);
  if (!series) return null;
  const est = estimateFromIndex({ month: base.month, value: base.value, indexValue: base.source === 'index' ? base.index_value : null }, series);
  if (!est) return null;
  return {
    estimate: est.estimate,
    latestIndex: est.latestIndex,
    latestPeriod: est.latestPeriod,
    ratio: est.ratio,
    sourceName: `${SOURCE_NAMES[account.valuation_source] ?? account.valuation_source}${account.valuation_area ? ` · ${account.valuation_area}` : ''}`,
    baseline: { month: base.month, value: base.value },
  };
}

export async function saveIndexValue(db: Db, accountId: string, month: string, value: number, est: { latestIndex: number; latestPeriod: string } | null) {
  await db.query(
    `insert into property_values (account_id, month, value, source, index_value, index_period)
     values ($1, $2, $3, $4, $5, $6)
     on conflict (account_id, month) do update
       set value = excluded.value, source = excluded.source, index_value = excluded.index_value, index_period = excluded.index_period`,
    [accountId, month, value, est ? 'index' : 'manual', est?.latestIndex ?? null, est?.latestPeriod ?? null],
  );
}
