'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/session';
import { withUser } from '@/lib/db';

function friendly(e: unknown) {
  const msg = e instanceof Error ? e.message : String(e);
  return encodeURIComponent(msg.replace(/^error:\s*/i, ''));
}

export async function createHousehold(fd: FormData) {
  const { userId } = await requireUser();
  try {
    await withUser(userId, (db) => db.query('select create_household($1)', [String(fd.get('name') ?? '')]));
  } catch (e) {
    redirect(`/household?error=${friendly(e)}`);
  }
  revalidatePath('/', 'layout');
  redirect('/household');
}

export async function joinHousehold(fd: FormData) {
  const { userId } = await requireUser();
  try {
    await withUser(userId, (db) => db.query('select join_household($1)', [String(fd.get('code') ?? '')]));
  } catch (e) {
    redirect(`/household?error=${friendly(e)}`);
  }
  revalidatePath('/', 'layout');
  redirect('/household?joined=1');
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
    db.query('update households set name = $1 where id = my_household()', [String(fd.get('name') ?? '').trim() || 'Our household']),
  );
  revalidatePath('/household');
  redirect('/household');
}
