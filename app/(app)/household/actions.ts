'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/session';
import { withUser } from '@/lib/db';

// Only short codes go in the address bar; the page turns them into messages.
// (Never put raw database errors or free text in the URL.)
const KNOWN: Record<string, string> = {
  'You are already in a household': 'already_in_household',
};
function errorCode(e: unknown) {
  const msg = e instanceof Error ? e.message : '';
  if (!KNOWN[msg]) console.error('household action failed', e);
  return KNOWN[msg] ?? 'failed';
}

export async function createHousehold(fd: FormData) {
  const { userId } = await requireUser();
  const name = String(fd.get('name') ?? '').trim().slice(0, 120);
  try {
    await withUser(userId, (db) => db.query('select create_household($1)', [name]));
  } catch (e) {
    redirect(`/household?error=${errorCode(e)}`);
  }
  revalidatePath('/', 'layout');
  redirect('/household');
}

export async function joinHousehold(fd: FormData) {
  const { userId } = await requireUser();
  const code = String(fd.get('code') ?? '').slice(0, 40);
  let status = 'failed';
  try {
    const r = await withUser(userId, (db) => db.query<{ s: string }>('select join_household($1) as s', [code]));
    status = String(r.rows[0]?.s ?? 'failed');
  } catch (e) {
    status = errorCode(e);
  }
  // Older database (before `npm run db:setup`) returned the household row instead of a status.
  if (status !== 'joined' && status.startsWith('(')) status = 'joined';
  if (status !== 'joined') redirect(`/household?error=${encodeURIComponent(status)}`);
  revalidatePath('/', 'layout');
  redirect('/household?joined=1');
}

export async function regenerateInviteCode() {
  const { userId } = await requireUser();
  await withUser(userId, (db) => db.query('select regenerate_invite_code()'));
  revalidatePath('/household');
  redirect('/household?newcode=1');
}

export async function leaveHousehold() {
  const { userId } = await requireUser();
  await withUser(userId, (db) => db.query('select leave_household()'));
  revalidatePath('/', 'layout');
  redirect('/household');
}

export async function renameHousehold(fd: FormData) {
  const { userId } = await requireUser();
  await withUser(userId, (db) =>
    db.query('update households set name = $1 where id = my_household()', [String(fd.get('name') ?? '').trim().slice(0, 120) || 'Our household']),
  );
  revalidatePath('/household');
  redirect('/household');
}
