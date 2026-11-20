import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/session';
import { withUser } from '@/lib/db';
import { getAccounts, getMembers, getPropertyValues, getShares } from '@/lib/data';
import { formatMoney, monthLabel } from '@/lib/core/constants';
import { LineChart } from '@/components/Charts';
import { AccountForm } from '../AccountForm';
import { archiveAccount, deleteAccount } from '../actions';

export default async function EditAccountPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ confirmDelete?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const { userId, profile } = await requireUser();
  const data = await withUser(userId, async (db) => {
    const accounts = await getAccounts(db, userId, { includeArchived: true });
    const account = accounts.find((a) => a.id === id);
    if (!account) return null;
    const [shares, members, values, history] = await Promise.all([
      getShares(db, [id]),
      getMembers(db),
      account.type === 'property' ? getPropertyValues(db, [id]) : Promise.resolve([]),
      db.query<{ month: string; balance: number }>('select month, balance from snapshots where account_id = $1 order by month', [id]),
    ]);
    return { account, accounts, shares, members, values, history: history.rows };
  });
  if (!data) notFound();
  const { account: a } = data;

  return (
    <div>
      <p className="small"><Link href="/accounts">← Accounts</Link></p>
      <h1>{a.name}</h1>
      <div className="grid grid-2" style={{ alignItems: 'start' }}>
        <AccountForm
          account={a}
          shares={data.shares}
          me={{ id: userId, name: profile.name || 'Me' }}
          partners={data.members.filter((m) => m.user_id !== userId).map((m) => ({ id: m.user_id, name: m.name || m.email || 'Partner' }))}
          properties={data.accounts.filter((x) => x.type === 'property' && x.id !== a.id).map((x) => ({ id: x.id, name: x.name }))}
          defaultCurrency={profile.display_currency}
        />
        <div className="stack">
          <div className="card">
            <h2>{a.type === 'property' ? 'Market value history' : 'Balance history'}</h2>
            <LineChart
              months={data.history.map((h) => h.month)}
              series={[{ name: a.name, color: '#7c85f0', values: data.history.map((h) => h.balance), fill: true }]}
              currency={a.currency}
              height={200}
            />
            {a.type === 'property' && data.values.length > 0 && (
              <table className="table small" style={{ marginTop: 10 }}>
                <thead><tr><th>Month</th><th>Value</th><th>Source</th></tr></thead>
                <tbody>
                  {[...data.values].reverse().slice(0, 12).map((v) => (
                    <tr key={v.month}>
                      <td>{monthLabel(v.month)}</td>
                      <td className="num">{formatMoney(v.value, a.currency)}</td>
                      <td className="muted">{v.source === 'manual' ? 'Entered by you' : `Index ${v.index_period ?? ''}`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <div className="card">
            <h3>Close or delete</h3>
            <p className="small muted">Closing keeps its history in your trend and sets the balance to zero from this month. Deleting removes it and all its history.</p>
            <div className="row">
              {!a.archived && (
                <form action={archiveAccount}><input type="hidden" name="id" value={a.id} /><button className="btn secondary small">Close account</button></form>
              )}
              <form action={deleteAccount}>
                <input type="hidden" name="id" value={a.id} />
                {sp.confirmDelete && <input type="hidden" name="confirm" value="yes" />}
                <button className="btn coral small">{sp.confirmDelete ? 'Yes, delete it for good' : 'Delete'}</button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
