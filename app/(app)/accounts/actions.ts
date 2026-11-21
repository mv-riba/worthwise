'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/session';
import { withUser, type Db } from '@/lib/db';
import { getMembers } from '@/lib/data';
import { cryptoQuote, ensureRatesForMonth } from '@/lib/external';
import { ACCOUNT_TYPES, CURRENCIES, PROPERTY_KINDS, coinSymbol, isDebt, monthStart, toNumber, type AccountType } from '@/lib/core/constants';
import { validateShares } from '@/lib/core/calc';

export type FormState = { error: string } | null;

type ShareInput = { user_id: string | null; external_name: string | null; pct: number };

function readShares(fd: FormData, type: AccountType, userId: string, memberIds: string[]): ShareInput[] | string {
  const shares: ShareInput[] = [];
  const readExternals = (who: string) => {
    for (let i = 0; i < 3; i++) {
      const name = String(fd.get(`ext_name_${i}`) ?? '').trim().slice(0, 120);
      const pct = toNumber(fd.get(`ext_pct_${i}`));
      if (name && pct && pct > 0) shares.push({ user_id: null, external_name: name, pct });
      else if (name || pct) return `Each ${who} outside the app needs both a name and a percentage.`;
    }
    return null;
  };

  // Mortgages: "just me" by default; when shared, the user chooses who holds
  // which share. Holders can be household members and/or people outside the app,
  // and don't have to match the property's owners.
  if (type === 'mortgage') {
    if (fd.get('owner_mode') !== 'joint') return [{ user_id: userId, external_name: null, pct: 100 }];
    for (const id of memberIds) {
      const pct = toNumber(fd.get(`share:${id}`));
      if (pct && pct > 0) shares.push({ user_id: id, external_name: null, pct });
    }
    const extErr = readExternals('mortgage holder');
    if (extErr) return extErr;
    if (!shares.some((s) => s.user_id)) return 'At least one holder of the mortgage needs to be you or someone in your household.';
    return validateShares(shares.map((s) => ({ pct: s.pct })), true) ?? shares;
  }

  const joint = fd.get('owner_mode') === 'joint' && memberIds.length > 1;
  if (joint) {
    for (const id of memberIds) {
      const pct = toNumber(fd.get(`share:${id}`));
      if (pct && pct > 0) shares.push({ user_id: id, external_name: null, pct });
    }
    if (!shares.some((s) => s.user_id === userId)) return 'Include yourself as one of the owners of a joint account.';
  } else {
    const pct = type === 'property' ? toNumber(fd.get(`share:${userId}`)) ?? 100 : 100;
    shares.push({ user_id: userId, external_name: null, pct });
  }
  if (type === 'property') {
    const extErr = readExternals('co-owner');
    if (extErr) return extErr;
  }
  const err = validateShares(shares.map((s) => ({ pct: s.pct })), true);
  return err ?? shares;
}

async function writeShares(db: Db, accountId: string, shares: ShareInput[]) {
  await db.query('delete from ownership_shares where account_id = $1', [accountId]);
  for (const s of shares) {
    await db.query(
      'insert into ownership_shares (account_id, user_id, external_name, share_pct) values ($1, $2, $3, $4)',
      [accountId, s.user_id, s.external_name, s.pct],
    );
  }
}

async function recordBalance(db: Db, userId: string, accountId: string, type: string, month: string, balance: number) {
  await db.query(
    `insert into snapshots (account_id, month, balance, recorded_by) values ($1, $2, $3, $4)
     on conflict (account_id, month) do update set balance = excluded.balance, recorded_by = excluded.recorded_by, recorded_at = now()`,
    [accountId, month, balance, userId],
  );
  if (type === 'property') {
    await db.query(
      `insert into property_values (account_id, month, value, source) values ($1, $2, $3, 'manual')
       on conflict (account_id, month) do update set value = excluded.value, source = 'manual', index_value = null, index_period = null`,
      [accountId, month, Math.abs(balance)],
    );
  }
}

export async function saveAccount(_prev: FormState, fd: FormData): Promise<FormState> {
  const { userId, profile } = await requireUser();
  const id = String(fd.get('id') ?? '') || null;
  const type = String(fd.get('type') ?? '') as AccountType;
  const name = String(fd.get('name') ?? '').trim();
  const currency = String(fd.get('currency') ?? '').toUpperCase();
  if (!(ACCOUNT_TYPES as readonly string[]).includes(type)) return { error: 'Please choose an account type.' };
  if (!name) return { error: 'Please give the account a name.' };
  if (name.length > 120) return { error: 'Please use a shorter name (up to 120 characters).' };
  if (String(fd.get('notes') ?? '').length > 1000) return { error: 'Notes can be up to 1,000 characters.' };
  if (!(CURRENCIES as readonly string[]).includes(currency)) return { error: 'Please choose a currency.' };

  const amount = toNumber(fd.get('balance'));
  const units = type === 'crypto' ? toNumber(fd.get('crypto_units')) : null;
  const coin = type === 'crypto' ? coinSymbol(String(fd.get('crypto_coin') ?? '')) : null;
  const kind = String(fd.get('property_kind') ?? '');
  const fields = {
    is_fixed: type === 'savings' && fd.get('is_fixed') === 'on',
    interest_rate: toNumber(fd.get('interest_rate')),
    linked_property_id: type === 'mortgage' ? String(fd.get('linked_property_id') ?? '') || null : null,
    crypto_coin: coin,
    crypto_units: units,
    property_country: type === 'property' && /^[A-Za-z]{2}$/.test(String(fd.get('property_country') ?? '')) ? String(fd.get('property_country')).toUpperCase() : null,
    valuation_source: type === 'property' ? (fd.get('valuation_auto') === 'on' ? 'auto' : 'manual') : null,
    property_kind: type === 'property' && PROPERTY_KINDS.some((k) => k.id === kind) ? kind : null,
    valuation_area: type === 'property' ? String(fd.get('valuation_area') ?? '').trim().slice(0, 120) || null : null,
    notes: String(fd.get('notes') ?? '').trim() || null,
  };

  try {
    await withUser(userId, async (db) => {
      const members = (await getMembers(db)).map((m) => m.user_id);
      const shares = readShares(fd, type, userId, members);
      if (typeof shares === 'string') throw new UserError(shares);
      const appHolders = shares.filter((s) => s.user_id);
      // Shared within the household if more than one app user holds it, or if it is held by a partner rather than you.
      const isJoint = appHolders.length > 1 || appHolders.some((s) => s.user_id !== userId);
      const householdId = isJoint ? profile.household_id : null;

      let accountId = id;
      if (accountId) {
        // Changing the type: keep history, but fix up anything that depends on it.
        const prev = await db.query<{ type: AccountType }>('select type from accounts where id = $1', [accountId]);
        const oldType = prev.rows[0]?.type;
        if (oldType && oldType !== type) {
          if (isDebt(oldType) !== isDebt(type)) {
            // debts are stored as negative balances, assets as positive
            await db.query('update snapshots set balance = -balance where account_id = $1', [accountId]);
          }
          if (oldType === 'property') {
            await db.query('update accounts set linked_property_id = null where linked_property_id = $1', [accountId]);
            await db.query('delete from property_values where account_id = $1', [accountId]);
          }
          if (type === 'property') {
            await db.query(
              `insert into property_values (account_id, month, value, source)
               select account_id, month, abs(balance), 'manual' from snapshots where account_id = $1
               on conflict (account_id, month) do nothing`,
              [accountId],
            );
          }
          await db.query('update accounts set type = $2 where id = $1', [accountId, type]);
        }
        const r = await db.query(
          `update accounts set name = $2, currency = $3, is_joint = $4, household_id = $5, is_fixed = $6, interest_rate = $7,
             linked_property_id = $8, crypto_coin = $9, crypto_units = $10, property_country = $11, valuation_source = $12,
             valuation_area = $13, notes = $14, property_kind = $15, updated_at = now()
           where id = $1 returning id`,
          [accountId, name, currency, isJoint, householdId, fields.is_fixed, fields.interest_rate, fields.linked_property_id,
           fields.crypto_coin, fields.crypto_units, fields.property_country, fields.valuation_source, fields.valuation_area, fields.notes,
           fields.property_kind],
        );
        if (!r.rowCount) throw new UserError('That account was not found.');
      } else {
        const r = await db.query<{ id: string }>(
          `insert into accounts (created_by, household_id, type, name, currency, is_joint, is_fixed, interest_rate, linked_property_id,
             crypto_coin, crypto_units, property_country, valuation_source, valuation_area, notes, property_kind)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16) returning id`,
          [userId, householdId, type, name, currency, isJoint, fields.is_fixed, fields.interest_rate, fields.linked_property_id,
           fields.crypto_coin, fields.crypto_units, fields.property_country, fields.valuation_source, fields.valuation_area, fields.notes,
           fields.property_kind],
        );
        accountId = r.rows[0].id;
      }
      await writeShares(db, accountId!, shares);

      let value = amount;
      let unitPrice: number | null = null;
      let priceSource: string | null = null;
      if (type === 'crypto' && units) {
        const [p, src] = String(fd.get('crypto_price') ?? '').split('|');
        if (toNumber(p)) { unitPrice = toNumber(p); priceSource = src || null; }
        if (value === null && coin) {
          const q = await cryptoQuote(coin, currency);
          if (q) { unitPrice = q.price; priceSource = q.source; value = Math.round(q.price * units * 100) / 100; }
        }
      }
      if (value !== null) {
        const month = monthStart();
        await ensureRatesForMonth(db, month, [currency, profile.display_currency]);
        await recordBalance(db, userId, accountId!, type, month, isDebt(type) ? -Math.abs(value) : value);
        if (unitPrice) {
          await db.query('update snapshots set units = $3, unit_price = $4, price_source = $5 where account_id = $1 and month = $2', [accountId, month, units, unitPrice, priceSource]);
        }
      }
    });
    revalidatePath('/', 'layout');
    if (fd.get('next') === 'checkin') redirect('/check-in');
  } catch (e) {
    if (e instanceof UserError) return { error: e.message };
    throw e;
  }
  redirect('/accounts');
}

export async function archiveAccount(fd: FormData) {
  const { userId } = await requireUser();
  const id = String(fd.get('id'));
  await withUser(userId, async (db) => {
    const r = await db.query<{ type: string }>('update accounts set archived = true, updated_at = now() where id = $1 returning type', [id]);
    if (r.rows[0]) {
      await db.query(
        `insert into snapshots (account_id, month, balance, recorded_by) values ($1, $2, 0, $3)
         on conflict (account_id, month) do update set balance = 0`,
        [id, monthStart(), userId],
      );
    }
  });
  revalidatePath('/', 'layout');
  redirect('/accounts');
}

export async function restoreAccount(fd: FormData) {
  const { userId } = await requireUser();
  await withUser(userId, (db) => db.query('update accounts set archived = false where id = $1', [String(fd.get('id'))]));
  revalidatePath('/', 'layout');
  redirect('/accounts');
}

export async function deleteAccount(fd: FormData): Promise<{ error: string } | void> {
  const { userId } = await requireUser();
  const id = String(fd.get('id') ?? '');
  let deleted = 0;
  try {
    deleted = await withUser(userId, async (db) => {
      // Mortgages linked to this account keep their history but lose the link.
      await db.query('update accounts set linked_property_id = null where linked_property_id = $1', [id]);
      const r = await db.query('delete from accounts where id = $1', [id]);
      return r.rowCount ?? 0;
    });
  } catch (e) {
    console.error('deleteAccount failed', e);
    return { error: 'The account could not be deleted. Please try again.' };
  }
  if (!deleted) return { error: 'That account was not found, or you don’t have permission to delete it.' };
  revalidatePath('/', 'layout');
  redirect('/accounts?deleted=1');
}

class UserError extends Error {}
