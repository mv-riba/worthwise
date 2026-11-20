'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/session';
import { withUser } from '@/lib/db';
import { parseMonthParam } from '@/lib/core/constants';

/**
 * Deletes one month's check-in: your income for that month and the balances you
 * entered that month. Balances your partner entered for joint accounts are kept.
 */
export async function deleteCheckin(fd: FormData): Promise<{ error: string } | void> {
  const { userId } = await requireUser();
  const month = parseMonthParam(String(fd.get('month') ?? ''));
  if (!month) return { error: 'Unknown month.' };
  try {
  await withUser(userId, async (db) => {
    await db.query(
      `delete from property_values pv using snapshots s
        where pv.account_id = s.account_id and pv.month = s.month and s.month = $1 and s.recorded_by = $2`,
      [month, userId],
    );
    await db.query('delete from snapshots where month = $1 and recorded_by = $2', [month, userId]);
    await db.query('delete from checkins where month = $1 and user_id = $2', [month, userId]);
  });
  } catch (e) {
    console.error('deleteCheckin failed', e);
    return { error: 'That month could not be deleted. Please try again.' };
  }
  revalidatePath('/', 'layout');
  redirect(`/history?deleted=${month.slice(0, 7)}`);
}
