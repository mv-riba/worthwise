import { cache } from 'react';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth/server';
import { withUser } from '@/lib/db';

export type Profile = {
  user_id: string;
  email: string | null;
  name: string;
  display_currency: string;
  household_id: string | null;
};

/** The signed-in user's id, or null. */
export const getUserId = cache(async (): Promise<string | null> => {
  const { data } = await auth.getSession();
  return (data?.user?.id as string | undefined) ?? null;
});

/** Signed-in user + profile; creates the profile on first visit. Redirects to sign-in if needed. */
export const requireUser = cache(async (): Promise<{ userId: string; profile: Profile }> => {
  const { data } = await auth.getSession();
  const user = data?.user as { id: string; email?: string | null; name?: string | null } | undefined;
  if (!user?.id) redirect('/auth/sign-in');

  const profile = await withUser(user.id, async (db) => {
    const found = await db.query<Profile>('select * from profiles where user_id = $1', [user.id]);
    if (found.rows[0]) return found.rows[0];
    await db.query(
      'insert into profiles (user_id, email, name) values ($1, $2, $3) on conflict (user_id) do nothing',
      [user.id, user.email ?? null, user.name ?? ''],
    );
    const again = await db.query<Profile>('select * from profiles where user_id = $1', [user.id]);
    return again.rows[0];
  });
  return { userId: user.id, profile };
});
