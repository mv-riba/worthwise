import { createHash } from 'node:crypto';
import { headers } from 'next/headers';
import { isMissingFunction, withAnon } from '@/lib/db';

/** Emails and IP addresses are stored only as one-way hashes. */
const hash = (v: string) => createHash('sha256').update(v.trim().toLowerCase()).digest('hex').slice(0, 32);

export async function clientIp(): Promise<string> {
  const h = await headers();
  // Vercel sets these to the real visitor's address.
  return h.get('x-real-ip') ?? h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
}

type Rule = { key: string; max: number; minutes: number };

/**
 * Counts one attempt against each rule and returns false if any limit is
 * exceeded. Every rule is counted even when an earlier one fails.
 */
export async function allowAttempt(action: string, rules: Rule[]): Promise<boolean> {
  try {
    return await withAnon(async (db) => {
      let ok = true;
      for (const r of rules) {
        const res = await db.query<{ ok: boolean }>(
          'select rate_limit_hit($1, $2, make_interval(mins => $3)) as ok',
          [`${action}:${hash(r.key)}`, r.max, r.minutes],
        );
        if (!res.rows[0]?.ok) ok = false;
      }
      return ok;
    });
  } catch (e) {
    // Only while the database hasn't been updated yet (`npm run db:setup`).
    if (isMissingFunction(e)) {
      console.warn('Rate limiting is not active yet: run `npm run db:setup`.');
      return true;
    }
    throw e;
  }
}

export const TOO_MANY = 'Too many attempts. For your security, please wait 15 minutes and try again.';
