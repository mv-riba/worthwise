'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/session';
import { withUser } from '@/lib/db';
import { getAccounts } from '@/lib/data';
import { cryptoQuote, ensureRatesForMonth } from '@/lib/external';
import { saveIndexValue } from '@/lib/valuation';
import { CURRENCIES, isDebt, monthStart, parseMonthParam, toNumber } from '@/lib/core/constants';

export async function saveCheckin(fd: FormData) {
  const { userId, profile } = await requireUser();
  const month = parseMonthParam(String(fd.get('month') ?? '')) ?? monthStart();
  if (month > monthStart()) redirect('/check-in?error=' + encodeURIComponent('You can’t check in for a future month.'));
  const income = toNumber(fd.get('income')); // empty = not entered
  const incomeCurrency = String(fd.get('income_currency') ?? profile.display_currency);
  if (!(CURRENCIES as readonly string[]).includes(incomeCurrency)) redirect('/check-in?error=Unknown%20currency');

  await withUser(userId, async (db) => {
    const accounts = await getAccounts(db, userId);
    await ensureRatesForMonth(db, month, [...accounts.map((a) => a.currency), incomeCurrency, profile.display_currency]);

    for (const a of accounts) {
      let value = toNumber(fd.get(`bal:${a.id}`));

      // crypto: remember the coins held and the price used for this month
      let units: number | null = null;
      let unitPrice: number | null = null;
      let priceSource: string | null = null;
      if (a.type === 'crypto' && fd.has(`units:${a.id}`)) {
        units = toNumber(fd.get(`units:${a.id}`));
        if (units !== a.crypto_units) {
          await db.query('update accounts set crypto_units = $2, updated_at = now() where id = $1', [a.id, units]);
        }
        const [p, src] = String(fd.get(`price:${a.id}`) ?? '').split('|');
        if (toNumber(p)) { unitPrice = toNumber(p); priceSource = src || null; }
        if (value === null && units && a.crypto_coin) {
          const q = await cryptoQuote(a.crypto_coin, a.currency);
          if (q) { unitPrice = q.price; priceSource = q.source; value = Math.round(q.price * units * 100) / 100; }
        }
      }
      if (value === null) continue;

      const balance = isDebt(a.type) ? -Math.abs(value) : value;
      await db.query(
        `insert into snapshots (account_id, month, balance, units, unit_price, price_source, recorded_by) values ($1, $2, $3, $4, $5, $6, $7)
         on conflict (account_id, month) do update set balance = excluded.balance, units = excluded.units, unit_price = excluded.unit_price,
           price_source = excluded.price_source, recorded_by = excluded.recorded_by, recorded_at = now()`,
        [a.id, month, balance, units, unitPrice, priceSource, userId],
      );

      if (a.type === 'property') {
        const est = toNumber(fd.get(`est:${a.id}`));
        const usedEstimate = est !== null && Math.abs(est - value) < 1;
        await saveIndexValue(db, a.id, month, Math.abs(value), usedEstimate
          ? { latestIndex: toNumber(fd.get(`idx:${a.id}`)) ?? 0, latestPeriod: String(fd.get(`per:${a.id}`) ?? ''), sourceName: String(fd.get(`src:${a.id}`) ?? '') }
          : null);
      }
    }

    await db.query(
      `insert into checkins (user_id, month, income, income_currency) values ($1, $2, $3, $4)
       on conflict (user_id, month) do update set income = excluded.income, income_currency = excluded.income_currency, completed_at = now()`,
      [userId, month, income, incomeCurrency],
    );
    // Store this month's spending estimate (in the income currency) alongside the check-in.
    const s = await db.query<{ spending: number | null }>(
      'select spending from household_monthly_summary($1) where is_me and month = $2',
      [incomeCurrency, month],
    );
    await db.query('update checkins set estimated_spending = $3 where user_id = $1 and month = $2', [userId, month, s.rows[0]?.spending ?? null]);
  });

  revalidatePath('/', 'layout');
  redirect('/dashboard');
}
