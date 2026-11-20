import type { FormShare } from './AccountForm';

/** Groups ownership rows by account id. */
export function groupShares(rows: (FormShare & { account_id: string })[]): Record<string, FormShare[]> {
  const out: Record<string, FormShare[]> = {};
  for (const r of rows) (out[r.account_id] ??= []).push({ user_id: r.user_id, external_name: r.external_name, share_pct: r.share_pct });
  return out;
}
