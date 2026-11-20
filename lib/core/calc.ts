// Pure calculation helpers (unit-tested in tests/calc.test.ts).
import { CATEGORY_OF, type AccountType, type Category } from './constants.ts';

/** rates: units of currency per 1 EUR. */
export type Rates = Record<string, number>;

export function convert(amount: number, from: string, to: string, rates: Rates): number | null {
  if (from === to) return amount;
  const rf = from === 'EUR' ? 1 : rates[from];
  const rt = to === 'EUR' ? 1 : rates[to];
  if (!rf || !rt) return null;
  return (amount / rf) * rt;
}

export type Holding = {
  id: string;
  type: AccountType;
  name: string;
  currency: string;
  balance: number | null; // signed, account currency (debts negative)
  myShare: number; // 0..100
  isFixed?: boolean;
  interestRate?: number | null;
  linkedPropertyId?: string | null;
  isJoint?: boolean;
};

export function myValue(h: Holding, display: string, rates: Rates): number | null {
  if (h.balance === null) return null;
  return convert(h.balance * (h.myShare / 100), h.currency, display, rates);
}

export function breakdown(holdings: Holding[], display: string, rates: Rates) {
  const out = new Map<Category, number>();
  for (const h of holdings) {
    const v = myValue(h, display, rates);
    if (v === null || v === 0) continue;
    const c = CATEGORY_OF[h.type];
    out.set(c, (out.get(c) ?? 0) + v);
  }
  return [...out.entries()].map(([category, value]) => ({ category, value })).sort((a, b) => b.value - a.value);
}

/**
 * Equity for one property from the point of view of one user:
 * their % of the property's value minus their share of each mortgage linked to it.
 */
export function propertyEquity(property: Holding, mortgages: Holding[]) {
  const value = property.balance ?? 0;
  const myPropertyValue = value * (property.myShare / 100);
  const linked = mortgages.filter((m) => m.linkedPropertyId === property.id);
  // mortgage balances are negative; convert to the property's currency is the caller's job
  const myMortgage = linked.reduce((s, m) => s + Math.abs(m.balance ?? 0) * (m.myShare / 100), 0);
  const totalMortgage = linked.reduce((s, m) => s + Math.abs(m.balance ?? 0), 0);
  return {
    value,
    myPropertyValue,
    myMortgage,
    myEquity: myPropertyValue - myMortgage,
    totalEquity: value - totalMortgage,
  };
}

// ----- property value index -----
export type IndexPoint = { month: string; value: number; period: string }; // month = first month of period

/** Index value that applies to a month: the latest period starting on or before it. */
export function indexAt(series: IndexPoint[], month: string): IndexPoint | null {
  const sorted = [...series].sort((a, b) => a.month.localeCompare(b.month));
  let found: IndexPoint | null = null;
  for (const p of sorted) if (p.month <= month) found = p;
  return found;
}

/**
 * New estimate = last known value × (latest index ÷ index when that value was set).
 */
export function estimateFromIndex(baseline: { month: string; value: number; indexValue?: number | null }, series: IndexPoint[]) {
  if (!series.length) return null;
  const sorted = [...series].sort((a, b) => a.month.localeCompare(b.month));
  const latest = sorted[sorted.length - 1];
  const baseIndex = baseline.indexValue ?? indexAt(sorted, baseline.month)?.value ?? null;
  if (!baseIndex || !latest.value) return null;
  const ratio = latest.value / baseIndex;
  return {
    estimate: Math.round(baseline.value * ratio),
    ratio,
    baseIndex,
    latestIndex: latest.value,
    latestPeriod: latest.period,
  };
}

/** Parses "2026M10", "2026Q3", "2026-10", "2026" into the first month of that period. */
export function periodToMonth(period: string): string | null {
  let m = /^(\d{4})M(\d{2})$/.exec(period);
  if (m) return `${m[1]}-${m[2]}-01`;
  m = /^(\d{4})Q([1-4])$/.exec(period);
  if (m) return `${m[1]}-${String((Number(m[2]) - 1) * 3 + 1).padStart(2, '0')}-01`;
  m = /^(\d{4})-(\d{2})/.exec(period);
  if (m) return `${m[1]}-${m[2]}-01`;
  m = /^(\d{4})$/.exec(period);
  if (m) return `${m[1]}-01-01`;
  return null;
}

/** Validate ownership percentages. */
export function validateShares(shares: { pct: number }[], requireFull: boolean): string | null {
  if (!shares.length) return 'Add at least one owner.';
  if (shares.some((s) => !(s.pct > 0) || s.pct > 100)) return 'Each share must be between 0 and 100%.';
  const total = shares.reduce((s, x) => s + x.pct, 0);
  if (total > 100.001) return `Shares add up to ${total}% – they can't be more than 100%.`;
  if (requireFull && Math.abs(total - 100) > 0.001) return `Shares add up to ${total}% – they need to add up to 100%.`;
  return null;
}
