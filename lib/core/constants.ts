// Shared constants and pure helpers (no server-only imports, safe in tests).

export const ACCOUNT_TYPES = [
  'bank', 'savings', 'pension', 'property', 'mortgage', 'credit_card', 'loan', 'crypto', 'other_asset',
] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export const TYPE_LABELS: Record<AccountType, string> = {
  bank: 'Bank account',
  savings: 'Savings account',
  pension: 'Pension',
  property: 'Property',
  mortgage: 'Mortgage',
  credit_card: 'Credit card',
  loan: 'Other debt',
  crypto: 'Crypto',
  other_asset: 'Other asset',
};

export const DEBT_TYPES: AccountType[] = ['mortgage', 'credit_card', 'loan'];
export const isDebt = (t: string) => (DEBT_TYPES as string[]).includes(t);

export type Category = 'Cash' | 'Property' | 'Pensions' | 'Crypto' | 'Other assets' | 'Mortgages' | 'Other debts';
export const CATEGORY_OF: Record<AccountType, Category> = {
  bank: 'Cash',
  savings: 'Cash',
  property: 'Property',
  pension: 'Pensions',
  crypto: 'Crypto',
  other_asset: 'Other assets',
  mortgage: 'Mortgages',
  credit_card: 'Other debts',
  loan: 'Other debts',
};

/** Accounts whose month-on-month change feeds the spending estimate. */
export function isCashForSpending(type: string, isFixed: boolean) {
  return type === 'bank' || type === 'credit_card' || (type === 'savings' && !isFixed);
}

// Currencies published by the European Central Bank (via Frankfurter).
export const CURRENCIES = [
  'EUR', 'GBP', 'USD', 'SEK', 'NOK', 'DKK', 'CHF', 'PLN', 'CZK', 'HUF', 'RON', 'ISK',
  'CAD', 'AUD', 'NZD', 'JPY', 'CNY', 'HKD', 'SGD', 'INR', 'KRW', 'ZAR', 'MXN', 'BRL', 'TRY', 'ILS',
] as const;

export const CRYPTO_COINS: { id: string; label: string }[] = [
  { id: 'bitcoin', label: 'Bitcoin (BTC)' },
  { id: 'ethereum', label: 'Ethereum (ETH)' },
  { id: 'solana', label: 'Solana (SOL)' },
  { id: 'cardano', label: 'Cardano (ADA)' },
  { id: 'ripple', label: 'XRP' },
];

export const VALUATION_SOURCES = [
  { id: 'uk_hpi', label: 'UK House Price Index (HM Land Registry)', country: 'GB' },
  { id: 'fi_apartments', label: 'Statistics Finland – flats in housing companies', country: 'FI' },
  { id: 'fi_houses', label: 'Statistics Finland – detached houses', country: 'FI' },
  { id: 'manual', label: 'I will enter the value myself', country: '' },
] as const;

// ----- months -----
export function monthStart(d = new Date()): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`;
}
export function addMonths(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return monthStart(d);
}
export function parseMonthParam(v: string | undefined | null): string | null {
  if (!v || !/^\d{4}-\d{2}(-01)?$/.test(v)) return null;
  return v.slice(0, 7) + '-01';
}
export function monthLabel(month: string, style: 'short' | 'long' = 'short') {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-GB', {
    month: style === 'short' ? 'short' : 'long', year: style === 'short' ? '2-digit' : 'numeric', timeZone: 'UTC',
  });
}

// ----- money -----
export function formatMoney(value: number | null | undefined, currency: string, opts: { compact?: boolean; sign?: boolean } = {}) {
  if (value === null || value === undefined || Number.isNaN(value)) return '–';
  const abs = Math.abs(value);
  const s = new Intl.NumberFormat('en-GB', {
    style: 'currency', currency,
    maximumFractionDigits: opts.compact && abs >= 10000 ? 0 : abs < 100 ? 2 : 0,
    minimumFractionDigits: 0,
    notation: opts.compact && abs >= 1_000_000 ? 'compact' : 'standard',
  }).format(abs);
  const neg = value < 0;
  if (opts.sign) return (neg ? '−' : value > 0 ? '+' : '') + s;
  return neg ? '−' + s : s;
}

export function toNumber(v: FormDataEntryValue | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  let s = String(v).replace(/[\s ]/g, '');
  // "1234,56" (decimal comma) → "1234.56"; "1,234.56" → "1234.56"
  if (!s.includes('.') && /,\d{1,2}$/.test(s)) s = s.replace(/\.(?=\d{3})/g, '').replace(',', '.');
  s = s.replace(/,/g, '').replace(/[^\d.\-]/g, '');
  if (s === '' || s === '-' || s === '.') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
