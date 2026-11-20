import { test } from 'node:test';
import assert from 'node:assert/strict';
import { convert, estimateFromIndex, periodToMonth, propertyEquity, validateShares, breakdown } from '../lib/core/calc.ts';
import { toNumber, addMonths, formatMoney } from '../lib/core/constants.ts';
import { buildSuggestions } from '../lib/core/suggestions.ts';
import { buildSeries } from '../lib/dashboard.ts';

test('currency conversion via EUR base', () => {
  const rates = { GBP: 0.88, USD: 1.1 };
  assert.equal(convert(100, 'EUR', 'EUR', rates), 100);
  assert.equal(Math.round(convert(88, 'GBP', 'EUR', rates)!), 100);
  assert.equal(Math.round(convert(88, 'GBP', 'USD', rates)!), 110);
  assert.equal(convert(10, 'SEK', 'EUR', rates), null);
});

test('equity: 30% of property minus 50% of mortgage', () => {
  const p = { id: 'p', type: 'property' as const, name: 'Flat', currency: 'GBP', balance: 300000, myShare: 30 };
  const m = { id: 'm', type: 'mortgage' as const, name: 'Mortgage', currency: 'GBP', balance: -150000, myShare: 50, linkedPropertyId: 'p' };
  const e = propertyEquity(p, [m]);
  assert.equal(e.myPropertyValue, 90000);
  assert.equal(e.myMortgage, 75000);
  assert.equal(e.myEquity, 15000);
  assert.equal(e.totalEquity, 150000);
});

test('index-based property estimate', () => {
  const series = [
    { month: '2026-07-01', value: 100, period: '2026M07' },
    { month: '2026-08-01', value: 101, period: '2026M08' },
    { month: '2026-09-01', value: 102.5, period: '2026M09' },
  ];
  // value entered in Aug (index 101), latest index 102.5
  const r = estimateFromIndex({ month: '2026-08-01', value: 300000 }, series)!;
  assert.equal(r.estimate, Math.round((300000 * 102.5) / 101));
  // index published with a lag: a value entered in Nov uses the Sep index → no change yet
  assert.equal(estimateFromIndex({ month: '2026-11-01', value: 300000 }, series)!.estimate, 300000);
  // stored index value is used when present
  assert.equal(estimateFromIndex({ month: '2026-09-01', value: 300000, indexValue: 100 }, series)!.estimate, 307500);
});

test('period parsing', () => {
  assert.equal(periodToMonth('2026M10'), '2026-10-01');
  assert.equal(periodToMonth('2026Q3'), '2026-07-01');
  assert.equal(periodToMonth('2026-04'), '2026-04-01');
  assert.equal(periodToMonth('nope'), null);
});

test('ownership share validation', () => {
  assert.equal(validateShares([{ pct: 30 }, { pct: 30 }, { pct: 40 }], true), null);
  assert.match(validateShares([{ pct: 60 }, { pct: 50 }], true)!, /110/);
  assert.match(validateShares([{ pct: 50 }], true)!, /100%/);
});

test('number parsing handles decimal commas and thousands', () => {
  assert.equal(toNumber('1 234,56'), 1234.56);
  assert.equal(toNumber('1,234.56'), 1234.56);
  assert.equal(toNumber('€250,000'), 250000);
  assert.equal(toNumber(''), null);
  assert.equal(toNumber('-12.5'), -12.5);
});

test('month arithmetic', () => {
  assert.equal(addMonths('2026-01-01', -1), '2025-12-01');
  assert.equal(addMonths('2026-11-01', 2), '2027-01-01');
});

test('formatting', () => {
  assert.equal(formatMoney(-1500, 'EUR'), '−€1,500');
  assert.equal(formatMoney(1500, 'GBP', { sign: true }), '+£1,500');
});

test('breakdown counts only my share', () => {
  const b = breakdown(
    [
      { id: '1', type: 'bank', name: 'a', currency: 'EUR', balance: 1000, myShare: 100 },
      { id: '2', type: 'property', name: 'b', currency: 'EUR', balance: 200000, myShare: 50 },
      { id: '3', type: 'mortgage', name: 'c', currency: 'EUR', balance: -100000, myShare: 50 },
    ],
    'EUR',
    {},
  );
  assert.deepEqual(b.map((x) => [x.category, x.value]), [['Property', 100000], ['Cash', 1000], ['Mortgages', -50000]]);
});

test('combined series never double counts (sums each member’s share)', () => {
  const rows = [
    { user_id: 'a', name: 'A', is_me: true, month: '2026-10-01', net_worth: 100, cash_change: null, other_change: null, income: null, spending: null },
    { user_id: 'b', name: 'B', is_me: false, month: '2026-10-01', net_worth: 50, cash_change: null, other_change: null, income: null, spending: null },
    { user_id: 'a', name: 'A', is_me: true, month: '2026-11-01', net_worth: 120, cash_change: -10, other_change: 30, income: 1000, spending: 1010 },
  ];
  assert.deepEqual(buildSeries(rows, 'us').netWorth, [150, 120]);
  assert.deepEqual(buildSeries(rows, 'partner').months, ['2026-10-01']);
  assert.deepEqual(buildSeries(rows, 'me').spending, [null, 1010]);
});

test('suggestions fire on the right conditions', () => {
  const base = {
    currency: 'EUR', netWorth: 100000, easyAccessCash: 40000, lowInterestCash: 40000, fixedSavings: 0,
    cardDebts: [], bestSavingsRate: null, cryptoValue: 0, grossAssets: 100000, hasPension: true,
    recentSpending: [2000, 2000, 2000], recentIncome: [3000, 3000, 3000], recentGrowth: [100, 100, 100],
  };
  const ids = (x: Parameters<typeof buildSuggestions>[0]) => buildSuggestions(x).map((s) => s.id);
  assert.ok(ids(base).includes('idle-cash'));
  assert.ok(!ids(base).includes('buffer'));
  assert.ok(ids({ ...base, easyAccessCash: 3000, lowInterestCash: 3000 }).includes('buffer'));
  assert.ok(ids({ ...base, cardDebts: [{ name: 'Card', amount: 2000, rate: 21.9 }] }).includes('debt-vs-savings'));
  assert.ok(ids({ ...base, cryptoValue: 20000 }).includes('crypto-share'));
  assert.ok(ids({ ...base, recentSpending: [4000, 4000, 4000] }).includes('overspend'));
  assert.ok(ids({ ...base, recentGrowth: [3000, 3000, 3000] }).includes('growth'));
  assert.ok(ids({ ...base, hasPension: false }).includes('pension'));
});
