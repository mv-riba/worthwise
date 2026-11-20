// Turns database rows into what the dashboard shows. Pure, no I/O.
import { convert, propertyEquity, breakdown, type Holding, type Rates } from './core/calc.ts';
import { buildSuggestions, type Suggestion } from './core/suggestions.ts';
import type { AccountRow, SummaryRow } from './data.ts';

export type View = 'me' | 'partner' | 'us';

export type Series = {
  months: string[];
  netWorth: (number | null)[];
  cashChange: (number | null)[];
  otherChange: (number | null)[];
  income: (number | null)[];
  spending: (number | null)[];
};

function sumOrNull(xs: (number | null)[]) {
  const v = xs.filter((x): x is number => typeof x === 'number');
  return v.length ? Math.round(v.reduce((a, b) => a + b, 0) * 100) / 100 : null;
}

export function buildSeries(rows: SummaryRow[], view: View): Series {
  const pick = rows.filter((r) => (view === 'me' ? r.is_me : view === 'partner' ? !r.is_me : true));
  const months = [...new Set(pick.map((r) => r.month))].sort();
  const by = (m: string) => pick.filter((r) => r.month === m);
  return {
    months,
    netWorth: months.map((m) => sumOrNull(by(m).map((r) => r.net_worth))),
    cashChange: months.map((m) => sumOrNull(by(m).map((r) => r.cash_change))),
    otherChange: months.map((m) => sumOrNull(by(m).map((r) => r.other_change))),
    income: months.map((m) => sumOrNull(by(m).map((r) => r.income))),
    spending: months.map((m) => sumOrNull(by(m).map((r) => r.spending))),
  };
}

export function toHolding(a: AccountRow): Holding {
  return {
    id: a.id,
    type: a.type,
    name: a.name,
    currency: a.currency,
    balance: a.latest_balance,
    myShare: a.my_share,
    isFixed: a.is_fixed,
    interestRate: a.interest_rate,
    linkedPropertyId: a.linked_property_id,
    isJoint: a.is_joint,
  };
}

/** Holding with its balance converted to the display currency. */
function inDisplay(h: Holding, display: string, rates: Rates): Holding {
  const b = h.balance === null ? null : convert(h.balance, h.currency, display, rates);
  return { ...h, balance: b, currency: display };
}

export function propertyCards(accounts: AccountRow[], display: string, rates: Rates) {
  const hs = accounts.map(toHolding).map((h) => inDisplay(h, display, rates));
  const mortgages = hs.filter((h) => h.type === 'mortgage');
  return hs
    .filter((h) => h.type === 'property')
    .map((p) => ({ id: p.id, name: p.name, myShare: p.myShare, ...propertyEquity(p, mortgages) }));
}

export function categoryBreakdown(accounts: AccountRow[], display: string, rates: Rates) {
  return breakdown(accounts.map(toHolding), display, rates);
}

export function suggestionsFor(accounts: AccountRow[], series: Series, display: string, rates: Rates): Suggestion[] {
  const val = (a: AccountRow) => (a.latest_balance === null ? 0 : convert(a.latest_balance * (a.my_share / 100), a.currency, display, rates) ?? 0);
  const mine = accounts.filter((a) => a.my_share > 0);
  const easy = mine.filter((a) => a.type === 'bank' || (a.type === 'savings' && !a.is_fixed));
  const values = mine.map(val);
  const recent = (xs: (number | null)[]) => [...xs].reverse();
  const savingsRates = mine.filter((a) => a.type === 'savings' && a.interest_rate !== null).map((a) => a.interest_rate as number);
  return buildSuggestions({
    currency: display,
    netWorth: values.reduce((s, v) => s + v, 0),
    easyAccessCash: easy.reduce((s, a) => s + val(a), 0),
    lowInterestCash: easy.filter((a) => a.interest_rate === null || a.interest_rate < 2).reduce((s, a) => s + val(a), 0),
    fixedSavings: mine.filter((a) => a.type === 'savings' && a.is_fixed).reduce((s, a) => s + val(a), 0),
    cardDebts: mine
      .filter((a) => a.type === 'credit_card' || a.type === 'loan')
      .map((a) => ({ name: a.name, amount: Math.abs(Math.min(0, val(a))), rate: a.interest_rate }))
      .filter((d) => d.amount > 0),
    bestSavingsRate: savingsRates.length ? Math.max(...savingsRates) : null,
    cryptoValue: mine.filter((a) => a.type === 'crypto').reduce((s, a) => s + Math.max(0, val(a)), 0),
    grossAssets: values.filter((v) => v > 0).reduce((s, v) => s + v, 0),
    hasPension: mine.some((a) => a.type === 'pension'),
    recentSpending: recent(series.spending),
    recentIncome: recent(series.income),
    recentGrowth: recent(series.otherChange),
  });
}
