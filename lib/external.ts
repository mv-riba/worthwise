// Calls to free public data sources. Every function fails softly (returns null)
// so the app keeps working if a source is down.
import type { Db } from '@/lib/db';
import { addMonths, monthStart } from '@/lib/core/constants';
import { periodToMonth, type IndexPoint } from '@/lib/core/calc';

async function getJson(url: string, init?: RequestInit & { revalidate?: number }): Promise<any | null> {
  const { revalidate = 3600, ...rest } = init ?? {};
  try {
    const res = await fetch(url, {
      ...rest,
      headers: { accept: 'application/json', ...((rest.headers as Record<string, string>) ?? {}) },
      signal: AbortSignal.timeout(8000),
      next: { revalidate },
    } as RequestInit);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------
// Exchange rates – Frankfurter (European Central Bank reference rates)
// ---------------------------------------------------------------------
const FRANKFURTER = 'https://api.frankfurter.dev/v1';

function lastDayOfMonth(month: string) {
  const next = new Date(addMonths(month, 1) + 'T00:00:00Z');
  next.setUTCDate(0);
  return next.toISOString().slice(0, 10);
}

/** Makes sure rates for `month` are stored for each currency. Returns the rates map (per EUR). */
export async function ensureRatesForMonth(db: Db, month: string, currencies: string[]) {
  const wanted = [...new Set(currencies.filter((c) => c && c !== 'EUR'))];
  const have = await db.query<{ currency: string; per_eur: number }>(
    'select currency, per_eur from exchange_rates where month = $1 and currency = any($2)',
    [month, wanted],
  );
  const rates: Record<string, number> = { EUR: 1 };
  for (const r of have.rows) rates[r.currency] = r.per_eur;
  const missing = wanted.filter((c) => !(c in rates));
  const isCurrent = month === monthStart();
  if (missing.length || isCurrent) {
    const date = isCurrent ? 'latest' : lastDayOfMonth(month);
    const data = await getJson(`${FRANKFURTER}/${date}?symbols=${(isCurrent ? wanted : missing).join(',')}`, {
      revalidate: isCurrent ? 3600 * 6 : 86400 * 30,
    });
    if (data?.rates) {
      for (const [cur, val] of Object.entries<number>(data.rates)) {
        rates[cur] = val;
        await db.query(
          `insert into exchange_rates (month, currency, per_eur) values ($1, $2, $3)
           on conflict (month, currency) do update set per_eur = excluded.per_eur, fetched_at = now()`,
          [month, cur, val],
        );
      }
    }
  }
  return rates;
}

/** Fills in any months (from `fromMonth` to now) that have no stored rate for the given currencies. */
export async function backfillRates(db: Db, fromMonth: string, currencies: string[]) {
  const wanted = [...new Set(currencies.filter((c) => c && c !== 'EUR'))];
  if (!wanted.length) return;
  const gaps = await db.query<{ n: number }>(
    `select count(*)::int as n
       from generate_series($1::date, date_trunc('month', now())::date, interval '1 month') m(month)
       cross join unnest($2::text[]) c(currency)
      where not exists (select 1 from exchange_rates r where r.month = m.month::date and r.currency = c.currency)`,
    [fromMonth, wanted],
  );
  if (!gaps.rows[0]?.n) return;
  const data = await getJson(`${FRANKFURTER}/${fromMonth}..?symbols=${wanted.join(',')}`, { revalidate: 86400 });
  if (!data?.rates) return;
  // keep the last available day of each month
  const perMonth = new Map<string, Record<string, number>>();
  for (const day of Object.keys(data.rates).sort()) perMonth.set(day.slice(0, 7) + '-01', data.rates[day]);
  for (const [month, rates] of perMonth) {
    for (const [cur, val] of Object.entries(rates)) {
      await db.query(
        `insert into exchange_rates (month, currency, per_eur) values ($1, $2, $3) on conflict (month, currency) do nothing`,
        [month, cur, val],
      );
    }
  }
}

export async function latestRates(db: Db): Promise<Record<string, number>> {
  const r = await db.query<{ currency: string; per_eur: number }>(
    'select distinct on (currency) currency, per_eur from exchange_rates order by currency, month desc',
  );
  const rates: Record<string, number> = { EUR: 1 };
  for (const row of r.rows) rates[row.currency] = row.per_eur;
  return rates;
}

// ---------------------------------------------------------------------
// Crypto prices – CoinGecko (free, no key)
// ---------------------------------------------------------------------
export async function cryptoPrice(coinId: string, currency: string): Promise<number | null> {
  const c = currency.toLowerCase();
  const data = await getJson(
    `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(coinId)}&vs_currencies=${c}`,
    { revalidate: 900 },
  );
  const v = data?.[coinId]?.[c];
  return typeof v === 'number' ? v : null;
}

// ---------------------------------------------------------------------
// Property price indices
// ---------------------------------------------------------------------

/** UK House Price Index (HM Land Registry linked data). `area` is a region slug, e.g. "london". */
async function ukHpi(area: string): Promise<IndexPoint[] | null> {
  const slug = area.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'united-kingdom';
  const from = addMonths(monthStart(), -36);
  const url =
    `https://landregistry.data.gov.uk/data/ukhpi/region/${slug}.json` +
    `?_pageSize=100&_view=basic&_properties=housePriceIndex,refMonth&min-refPeriodStart=${from}`;
  const data = await getJson(url, { revalidate: 86400 });
  const items: any[] = data?.result?.items ?? [];
  const pts: IndexPoint[] = [];
  for (const it of items) {
    const raw = typeof it.refMonth === 'object' ? it.refMonth?._value : it.refMonth;
    const idx = typeof it.housePriceIndex === 'object' ? Number(it.housePriceIndex?._value) : Number(it.housePriceIndex);
    const month = raw ? periodToMonth(String(raw)) : null;
    if (month && Number.isFinite(idx)) pts.push({ month, value: idx, period: String(raw).slice(0, 7) });
  }
  return pts.length ? pts : null;
}

/**
 * Statistics Finland PxWeb tables. Reads the table's own description first, then
 * picks the price index measure, the area that matches `area` (e.g. "Helsinki";
 * falls back to the whole country) and all time periods.
 */
async function statFin(table: string, area: string): Promise<IndexPoint[] | null> {
  const url = `https://pxdata.stat.fi/PxWeb/api/v1/en/${table}`;
  const meta = await getJson(url, { revalidate: 86400 * 7 });
  const vars: { code: string; text: string; values: string[]; valueTexts: string[]; time?: boolean }[] = meta?.variables ?? [];
  if (!vars.length) return null;

  const wantedArea = area.trim().toLowerCase();
  const timeVar =
    vars.find((v) => v.time) ??
    vars.find((v) => /month|quarter|kuukausi|neljännes/i.test(v.text)) ??
    vars.find((v) => /^(year|vuosi)$/i.test(v.text));
  const timeCode = timeVar?.code ?? '';
  const query: any[] = [];
  for (const v of vars) {
    const texts = v.valueTexts.map((t) => t.toLowerCase());
    const pick = (i: number) => (i >= 0 ? v.values[i] : v.values[0]);
    if (v.code === timeCode) {
      query.push({ code: v.code, selection: { filter: 'all', values: ['*'] } });
    } else if (/area|region|alue|municipality|kunta|postal/i.test(v.text)) {
      let i = texts.findIndex((t) => t === wantedArea);
      if (i < 0 && wantedArea) i = texts.findIndex((t) => t.startsWith(wantedArea) || t.includes(wantedArea));
      if (i < 0) i = texts.findIndex((t) => /whole country|koko maa/.test(t));
      query.push({ code: v.code, selection: { filter: 'item', values: [pick(i)] } });
    } else if (/information|tiedot|data/i.test(v.text) || texts.some((t) => t.includes('index'))) {
      let i = texts.findIndex((t) => t.includes('price index') && !t.includes('real') && !t.includes('change'));
      if (i < 0) i = texts.findIndex((t) => t.includes('index') && !t.includes('change'));
      query.push({ code: v.code, selection: { filter: 'item', values: [pick(i)] } });
    } else {
      const i = texts.findIndex((t) => /total|yhteensä|all/.test(t));
      query.push({ code: v.code, selection: { filter: 'item', values: [pick(i)] } });
    }
  }
  if (!timeCode) return null;

  const data = await getJson(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query, response: { format: 'json' } }),
    revalidate: 86400,
  });
  const cols: { code: string }[] = data?.columns ?? [];
  const timePos = cols.findIndex((c) => c.code === timeCode);
  const keyCols = cols.filter((c: any) => c.type !== 'c');
  const keyTimePos = keyCols.findIndex((c) => c.code === timeCode);
  const pts: IndexPoint[] = [];
  for (const row of data?.data ?? []) {
    const period = String(row.key?.[keyTimePos >= 0 ? keyTimePos : timePos] ?? '');
    const value = Number(String(row.values?.[0] ?? '').replace(',', '.'));
    const month = periodToMonth(period);
    if (month && Number.isFinite(value) && value > 0) pts.push({ month, value, period });
  }
  return pts.length ? pts : null;
}

export async function fetchPriceIndex(source: string | null, area: string | null): Promise<IndexPoint[] | null> {
  switch (source) {
    case 'uk_hpi':
      return ukHpi(area || 'united-kingdom');
    case 'fi_apartments':
      return statFin(process.env.FI_APARTMENTS_TABLE || 'StatFin/ashi/15iq.px', area || '');
    case 'fi_houses':
      return statFin(process.env.FI_HOUSES_TABLE || 'StatFin/kihi/15hx.px', area || '');
    default:
      // A paid valuation API (e.g. a per-address AVM) could be added here per country.
      return null;
  }
}

export const SOURCE_NAMES: Record<string, string> = {
  uk_hpi: 'UK House Price Index',
  fi_apartments: 'Statistics Finland (flats)',
  fi_houses: 'Statistics Finland (houses)',
};
