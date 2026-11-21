// Shared constants and pure helpers (no server-only imports, safe in tests).

export const ACCOUNT_TYPES = [
  'bank', 'savings', 'investment', 'pension', 'property', 'mortgage', 'credit_card', 'loan', 'crypto', 'other_asset',
] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export const TYPE_LABELS: Record<AccountType, string> = {
  bank: 'Bank account',
  savings: 'Savings account',
  investment: 'Investment account',
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

export type Category = 'Cash' | 'Investments' | 'Property' | 'Pensions' | 'Crypto' | 'Other assets' | 'Mortgages' | 'Other debts';
export const CATEGORY_OF: Record<AccountType, Category> = {
  bank: 'Cash',
  savings: 'Cash',
  investment: 'Investments',
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

/** Popular coins; any other ticker symbol can be typed in. */
export const CRYPTO_COINS: { symbol: string; label: string }[] = [
  { symbol: 'BTC', label: 'Bitcoin (BTC)' },
  { symbol: 'ETH', label: 'Ethereum (ETH)' },
  { symbol: 'SOL', label: 'Solana (SOL)' },
  { symbol: 'XRP', label: 'XRP' },
  { symbol: 'ADA', label: 'Cardano (ADA)' },
  { symbol: 'DOGE', label: 'Dogecoin (DOGE)' },
  { symbol: 'LTC', label: 'Litecoin (LTC)' },
  { symbol: 'DOT', label: 'Polkadot (DOT)' },
];

/** Older records stored CoinGecko ids; map them to ticker symbols. */
const LEGACY_COIN_IDS: Record<string, string> = {
  bitcoin: 'BTC', ethereum: 'ETH', solana: 'SOL', cardano: 'ADA', ripple: 'XRP', dogecoin: 'DOGE', litecoin: 'LTC', polkadot: 'DOT',
};
export function coinSymbol(v: string | null | undefined): string | null {
  if (!v) return null;
  const t = v.trim();
  return LEGACY_COIN_IDS[t.toLowerCase()] ?? (/^[A-Za-z0-9]{2,10}$/.test(t) ? t.toUpperCase() : null);
}

// ----- property -----
export const PROPERTY_KINDS = [
  { id: 'flat', label: 'Flat / apartment' },
  { id: 'terraced', label: 'Terraced or town house' },
  { id: 'house', label: 'Detached or semi-detached house' },
] as const;
export type PropertyKind = (typeof PROPERTY_KINDS)[number]['id'];

/** Countries covered by Eurostat's national house price index. Eurostat uses EL for Greece. */
export const EUROSTAT_COUNTRIES: Record<string, string> = {
  AT: 'AT', BE: 'BE', BG: 'BG', HR: 'HR', CY: 'CY', CZ: 'CZ', DK: 'DK', EE: 'EE', FI: 'FI', FR: 'FR', DE: 'DE', GR: 'EL',
  HU: 'HU', IE: 'IE', IT: 'IT', LV: 'LV', LT: 'LT', LU: 'LU', MT: 'MT', NL: 'NL', PL: 'PL', PT: 'PT', RO: 'RO', SK: 'SK',
  SI: 'SI', ES: 'ES', SE: 'SE', IS: 'IS', NO: 'NO', CH: 'CH', TR: 'TR',
};

/** Country choices for properties. */
export const COUNTRY_CODES = [
  'GB', 'FI', 'IE', 'SE', 'NO', 'DK', 'IS', 'EE', 'LV', 'LT', 'PL', 'DE', 'NL', 'BE', 'LU', 'FR', 'ES', 'PT', 'IT', 'MT',
  'GR', 'CY', 'AT', 'CH', 'CZ', 'SK', 'HU', 'SI', 'HR', 'RO', 'BG', 'TR', 'US', 'CA', 'AU', 'NZ', 'JP', 'SG', 'HK', 'AE', 'ZA', 'BR', 'MX', 'IN',
];

export type ValuationSource = 'uk_hpi' | 'fi_apartments' | 'fi_houses' | 'eurostat' | 'none';
export type ValuationPlan = { source: ValuationSource; label: string; areaHint: string | null };

/**
 * Picks the best free price index for what was entered: area-level official
 * statistics where available (UK, Finland), otherwise Eurostat's national index,
 * otherwise none (the value is entered by hand). Add more countries here.
 */
export function planValuation(country: string | null | undefined, kind: string | null | undefined): ValuationPlan {
  const c = (country ?? '').toUpperCase();
  if (c === 'GB') return { source: 'uk_hpi', label: 'UK House Price Index (HM Land Registry), by area', areaHint: 'e.g. London, Manchester, City of Edinburgh' };
  if (c === 'FI') {
    return kind === 'house'
      ? { source: 'fi_houses', label: 'Statistics Finland – one-dwelling houses, by region', areaHint: 'e.g. Greater Helsinki, Southern Finland' }
      : { source: 'fi_apartments', label: 'Statistics Finland – housing-company dwellings, by city', areaHint: 'e.g. Helsinki, Espoo, Tampere' };
  }
  if (EUROSTAT_COUNTRIES[c]) return { source: 'eurostat', label: 'Eurostat national house price index (whole country)', areaHint: null };
  return { source: 'none', label: 'No free price index for this country yet – you’ll enter the value yourself', areaHint: null };
}

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
    month: style === 'short' ? 'short' : 'long', year: 'numeric', timeZone: 'UTC',
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
