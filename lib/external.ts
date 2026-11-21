// Calls to free public data sources. Every function fails softly (returns null)
// so the app keeps working if a source is down.
import { isMissingFunction, type Db } from '@/lib/db';
import { EUROSTAT_COUNTRIES, addMonths, coinSymbol, monthStart, planValuation } from '@/lib/core/constants';
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


/**
 * Saves one rate through the database's checked function. A rejected value is
 * skipped (inside a savepoint) so it can't break the rest of the request.
 */
async function saveRate(db: Db, month: string, currency: string, perEur: number, overwrite: boolean) {
  await db.query('savepoint save_rate');
  try {
    await db.query('select save_exchange_rate($1, $2, $3, $4)', [month, currency, perEur, overwrite]);
    await db.query('release savepoint save_rate');
  } catch (e) {
    await db.query('rollback to savepoint save_rate');
    if (isMissingFunction(e)) {
      // database not updated yet (run `npm run db:setup`): fall back to the old direct write
      await db.query(
        `insert into exchange_rates (month, currency, per_eur) values ($1, $2, $3)
         on conflict (month, currency) do ${overwrite ? 'update set per_eur = excluded.per_eur, fetched_at = now()' : 'nothing'}`,
        [month, currency, perEur],
      ).catch(() => {});
    } else {
      console.warn(`Exchange rate ${currency} ${month} rejected`, (e as Error).message);
    }
  }
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
        await saveRate(db, month, cur, val, true);
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
      await saveRate(db, month, cur, val, false);
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
// Crypto prices – Coinbase spot price (free, no key), CoinGecko as backup
// ---------------------------------------------------------------------
export type CryptoQuote = { price: number; source: string; at: string };

const COINGECKO_IDS: Record<string, string> = {
  BTC: 'bitcoin', ETH: 'ethereum', SOL: 'solana', XRP: 'ripple', ADA: 'cardano', DOGE: 'dogecoin', LTC: 'litecoin', DOT: 'polkadot',
};

/** Live price of one coin in `currency`. `coin` is a ticker such as "BTC" (old CoinGecko ids also work). */
export async function cryptoQuote(coin: string, currency: string): Promise<CryptoQuote | null> {
  const symbol = coinSymbol(coin);
  if (!symbol) return null;
  const cur = currency.toUpperCase();
  const at = new Date().toISOString();

  const cb = await getJson(`https://api.coinbase.com/v2/prices/${symbol}-${cur}/spot`, { revalidate: 60 });
  const cbPrice = Number(cb?.data?.amount);
  if (Number.isFinite(cbPrice) && cbPrice > 0) return { price: cbPrice, source: 'Coinbase', at };

  const id = COINGECKO_IDS[symbol];
  if (id) {
    const cg = await getJson(`https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=${cur.toLowerCase()}`, { revalidate: 60 });
    const cgPrice = Number(cg?.[id]?.[cur.toLowerCase()]);
    if (Number.isFinite(cgPrice) && cgPrice > 0) return { price: cgPrice, source: 'CoinGecko', at };
  }
  return null;
}

// ---------------------------------------------------------------------
// Property price indices
// ---------------------------------------------------------------------

const UK_INDEX_FIELD: Record<string, string> = {
  flat: 'housePriceIndexFlatMaisonette',
  terraced: 'housePriceIndexTerraced',
  house: 'housePriceIndex', // all property types (semi-detached and detached vary a lot by area)
};

/** UK House Price Index (HM Land Registry linked data). `area` is a region name, e.g. "London" → "london". */
async function ukHpi(area: string, kind: string | null): Promise<IndexPoint[] | null> {
  const field = UK_INDEX_FIELD[kind ?? ''] ?? 'housePriceIndex';
  const load = async (slug: string) => {
    const from = addMonths(monthStart(), -36);
    const url =
      `https://landregistry.data.gov.uk/data/ukhpi/region/${slug}.json` +
      `?_pageSize=100&_view=basic&_properties=${field},housePriceIndex,refMonth&min-refPeriodStart=${from}`;
    const data = await getJson(url, { revalidate: 86400 });
    const items: any[] = data?.result?.items ?? [];
    const pts: IndexPoint[] = [];
    const num = (v: any) => Number(typeof v === 'object' && v !== null ? v._value : v);
    for (const it of items) {
      const raw = typeof it.refMonth === 'object' ? it.refMonth?._value : it.refMonth;
      let idx = num(it[field]);
      if (!Number.isFinite(idx)) idx = num(it.housePriceIndex);
      const month = raw ? periodToMonth(String(raw)) : null;
      if (month && Number.isFinite(idx)) pts.push({ month, value: idx, period: String(raw).slice(0, 7) });
    }
    return pts.length ? pts : null;
  };
  const slug = area.trim().toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return (slug ? await load(slug) : null) ?? (await load('united-kingdom'));
}

const FI_BUILDING_TYPE: Record<string, RegExp> = {
  flat: /blocks of flats|kerrostalo/,
  terraced: /terraced|rivitalo/,
};

/**
 * Statistics Finland PxWeb tables. Reads the table's own description first, then
 * picks the price index measure, the area that best matches `area` (falls back
 * to the whole country), the building type and all time periods.
 */
async function statFin(table: string, area: string, kind: string | null): Promise<IndexPoint[] | null> {
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
    const texts = v.valueTexts.map((t) => t.toLowerCase().replace(/\*$/, ''));
    const pick = (i: number) => (i >= 0 ? v.values[i] : v.values[0]);
    if (v.code === timeCode) {
      query.push({ code: v.code, selection: { filter: 'all', values: ['*'] } });
    } else if (/area|region|alue|municipality|kunta|postal/i.test(v.text)) {
      let i = texts.findIndex((t) => t === wantedArea);
      if (i < 0 && wantedArea) i = texts.findIndex((t) => t.startsWith(wantedArea));
      if (i < 0 && wantedArea) i = texts.findIndex((t) => t.includes(wantedArea) && !t.includes('excluding'));
      if (i < 0) i = texts.findIndex((t) => /whole country|koko maa/.test(t));
      query.push({ code: v.code, selection: { filter: 'item', values: [pick(i)] } });
    } else if (/information|tiedot|data/i.test(v.text) || texts.some((t) => t.includes('index'))) {
      let i = texts.findIndex((t) => t.includes('price index') && !t.includes('real') && !t.includes('change'));
      if (i < 0) i = texts.findIndex((t) => t.includes('index') && !t.includes('change') && !t.includes('real'));
      query.push({ code: v.code, selection: { filter: 'item', values: [pick(i)] } });
    } else {
      const wanted = FI_BUILDING_TYPE[kind ?? ''];
      let i = wanted ? texts.findIndex((t) => wanted.test(t)) : -1;
      if (i < 0) i = texts.findIndex((t) => /total|yhteensä|all/.test(t));
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
  const cols: { code: string; type?: string }[] = data?.columns ?? [];
  const keyCols = cols.filter((c) => c.type !== 'c');
  const keyTimePos = keyCols.findIndex((c) => c.code === timeCode);
  const pts: IndexPoint[] = [];
  for (const row of data?.data ?? []) {
    const period = String(row.key?.[keyTimePos] ?? '');
    const value = Number(String(row.values?.[0] ?? '').replace(',', '.'));
    const month = periodToMonth(period);
    if (month && Number.isFinite(value) && value > 0) pts.push({ month, value, period });
  }
  return pts.length ? pts : null;
}

/** Eurostat quarterly house price index (2015 = 100), whole country, all dwellings. */
async function eurostat(country: string): Promise<IndexPoint[] | null> {
  const geo = EUROSTAT_COUNTRIES[country.toUpperCase()];
  if (!geo) return null;
  const since = addMonths(monthStart(), -48).slice(0, 4);
  const data = await getJson(
    `https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/prc_hpi_q?geo=${geo}&purchase=TOTAL&unit=I15_Q&sinceTimePeriod=${since}-Q1`,
    { revalidate: 86400 },
  );
  const index: Record<string, number> = data?.dimension?.time?.category?.index ?? {};
  const values: Record<string, number> = data?.value ?? {};
  const pts: IndexPoint[] = [];
  for (const [period, pos] of Object.entries(index)) {
    const value = Number(values[String(pos)]);
    const month = periodToMonth(period);
    if (month && Number.isFinite(value) && value > 0) pts.push({ month, value, period });
  }
  return pts.length ? pts : null;
}

/** The price index series for a property, chosen from its country, area and type. */
export async function fetchPriceIndex(p: { country: string | null; area: string | null; kind: string | null }): Promise<{ series: IndexPoint[]; label: string } | null> {
  const plan = planValuation(p.country, p.kind);
  let series: IndexPoint[] | null = null;
  switch (plan.source) {
    case 'uk_hpi':
      series = await ukHpi(p.area ?? '', p.kind);
      break;
    case 'fi_apartments':
      series = await statFin(process.env.FI_APARTMENTS_TABLE || 'StatFin/ashi/15iq.px', p.area ?? '', p.kind);
      break;
    case 'fi_houses':
      series = await statFin(process.env.FI_HOUSES_TABLE || 'StatFin/kihi/15hx.px', p.area ?? '', p.kind);
      break;
    case 'eurostat':
      series = await eurostat(p.country ?? '');
      break;
    default:
      // A paid per-address valuation API could be plugged in here for specific countries.
      return null;
  }
  return series ? { series, label: plan.label + (p.area && plan.areaHint ? ` · ${p.area}` : '') } : null;
}
