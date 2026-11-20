import Link from 'next/link';
import { requireUser } from '@/lib/session';
import { withUser } from '@/lib/db';
import { getSummary } from '@/lib/data';
import { formatMoney, monthLabel } from '@/lib/core/constants';
import { deleteCheckin } from './actions';
import { ConfirmButton } from '@/components/ConfirmButton';

export default async function HistoryPage({ searchParams }: { searchParams: Promise<{ deleted?: string }> }) {
  const sp = await searchParams;
  const { userId, profile } = await requireUser();
  const display = profile.display_currency;

  const d = await withUser(userId, async (db) => {
    const summary = (await getSummary(db, display)).filter((r) => r.is_me);
    const checkins = await db.query<{ month: string }>('select month from checkins where user_id = $1', [userId]);
    const counts = await db.query<{ month: string; n: number }>(
      'select month, count(*)::int as n from snapshots where recorded_by = $1 group by month',
      [userId],
    );
    return { summary, checkins: new Set(checkins.rows.map((r) => r.month)), counts: new Map(counts.rows.map((r) => [r.month, r.n])) };
  });

  const months = [...new Set([...d.checkins, ...d.counts.keys()])].sort().reverse();
  const byMonth = new Map(d.summary.map((r) => [r.month, r]));

  return (
    <div style={{ maxWidth: 900 }}>
      <h1>History</h1>
      <p className="muted">Every month you’ve checked in. To correct something, open that month, change the figures and save again – the new figures replace the old ones.</p>
      {sp.deleted && <p className="notice">The {monthLabel(sp.deleted + '-01', 'long')} check-in was deleted.</p>}

      {months.length === 0 ? (
        <div className="card"><p>No check-ins yet.</p><Link className="btn" href="/check-in">Do your first check-in</Link></div>
      ) : (
        <div className="card">
          <table className="table">
            <thead>
              <tr><th>Month</th><th className="right">Net worth</th><th className="right">Income</th><th className="right">Est. spending</th><th className="right">Balances you entered</th><th></th></tr>
            </thead>
            <tbody>
              {months.map((m) => {
                const r = byMonth.get(m);
                return (
                  <tr key={m}>
                    <td><strong>{monthLabel(m, 'long')}</strong></td>
                    <td className="right num">{formatMoney(r?.net_worth ?? null, display)}</td>
                    <td className="right num">{d.checkins.has(m) ? formatMoney(r?.income ?? null, display) : '–'}</td>
                    <td className="right num">{formatMoney(r?.spending ?? null, display)}</td>
                    <td className="right num">{d.counts.get(m) ?? 0}</td>
                    <td className="right">
                      <div className="row" style={{ justifyContent: 'flex-end', gap: 8 }}>
                        <Link className="btn secondary small" href={`/check-in?month=${m.slice(0, 7)}`}>Edit</Link>
                        <ConfirmButton
                          action={deleteCheckin} fields={{ month: m }} tone="ghost"
                          label="Delete" confirmLabel="Yes, delete" question="Delete this month?"
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="tiny muted" style={{ marginTop: 10, marginBottom: 0 }}>
            Deleting a month removes your income and the balances you entered for that month. Balances your partner entered for joint accounts are kept.
          </p>
        </div>
      )}
    </div>
  );
}
