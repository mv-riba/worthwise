import type { Db } from '@/lib/db';
import { estimateFromIndex } from '@/lib/core/calc';
import { fetchPriceIndex } from '@/lib/external';
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
 * line with the price index that fits its country, area and type. Returns null
 * if no index is available (value entered by hand, or the source is unreachable).
 */
export async function estimatePropertyValue(account: AccountRow, history: PropertyValueRow[], month: string): Promise<PropertyEstimate | null> {
  if (!account.valuation_source || account.valuation_source === 'manual') return null;
  const before = history.filter((h) => h.month <= month).sort((a, b) => a.month.localeCompare(b.month));
  // Prefer the latest value the user typed in; otherwise the latest estimate.
  const manual = [...before].reverse().find((h) => h.source === 'manual');
  const latestAny = before[before.length - 1];
  const base = latestAny && manual && latestAny.month > manual.month ? latestAny : manual ?? latestAny;
  if (!base) return null;

  const idx = await fetchPriceIndex({ country: account.property_country, area: account.valuation_area, kind: account.property_kind });
  if (!idx) return null;
  // Only reuse a stored index value if it came from the same series (country/area/type unchanged).
  const sameSeries = base.source === 'index' && base.note === idx.label;
  const est = estimateFromIndex({ month: base.month, value: base.value, indexValue: sameSeries ? base.index_value : null }, idx.series);
  if (!est) return null;
  return {
    estimate: est.estimate,
    latestIndex: est.latestIndex,
    latestPeriod: est.latestPeriod,
    ratio: est.ratio,
    sourceName: idx.label,
    baseline: { month: base.month, value: base.value },
  };
}

export async function saveIndexValue(
  db: Db, accountId: string, month: string, value: number,
  est: { latestIndex: number; latestPeriod: string; sourceName: string } | null,
) {
  await db.query(
    `insert into property_values (account_id, month, value, source, index_value, index_period, note)
     values ($1, $2, $3, $4, $5, $6, $7)
     on conflict (account_id, month) do update
       set value = excluded.value, source = excluded.source, index_value = excluded.index_value,
           index_period = excluded.index_period, note = excluded.note`,
    [accountId, month, value, est ? 'index' : 'manual', est?.latestIndex ?? null, est?.latestPeriod ?? null, est?.sourceName ?? null],
  );
}
