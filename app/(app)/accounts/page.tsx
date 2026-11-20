import Link from 'next/link';
import { requireUser } from '@/lib/session';
import { withUser } from '@/lib/db';
import { getAccounts, getShares } from '@/lib/data';
import { CATEGORY_OF, TYPE_LABELS, formatMoney, monthLabel, type Category } from '@/lib/core/constants';
import { restoreAccount } from './actions';

const ORDER: Category[] = ['Cash', 'Investments', 'Property', 'Pensions', 'Crypto', 'Other assets', 'Mortgages', 'Other debts'];

export default async function AccountsPage({ searchParams }: { searchParams: Promise<{ deleted?: string }> }) {
  const sp = await searchParams;
  const { userId } = await requireUser();
  const { accounts, shares } = await withUser(userId, async (db) => {
    const accounts = await getAccounts(db, userId, { includeArchived: true });
    return { accounts, shares: await getShares(db, accounts.map((a) => a.id)) };
  });
  const active = accounts.filter((a) => !a.archived);
  const archived = accounts.filter((a) => a.archived);

  return (
    <div>
      <div className="row between" style={{ marginBottom: 16 }}>
        <h1>Accounts</h1>
        <Link className="btn" href="/accounts/new">+ Add account</Link>
      </div>
      {sp.deleted && <p className="notice">The account was deleted.</p>}
      {active.length === 0 && (
        <div className="card">
          <h2>Let’s add your first account</h2>
          <p className="muted">Start with what you have: bank accounts, savings, pensions, property and its mortgage, credit cards, crypto. You can always add more later.</p>
          <Link className="btn" href="/accounts/new">Add an account</Link>
        </div>
      )}
      <div className="grid grid-2">
        {ORDER.map((cat) => {
          const list = active.filter((a) => CATEGORY_OF[a.type] === cat);
          if (!list.length) return null;
          return (
            <div className="card" key={cat}>
              <h2>{cat}</h2>
              <ul className="list">
                {list.map((a) => {
                  const others = shares.filter((s) => s.account_id === a.id && s.user_id !== userId);
                  return (
                    <li key={a.id}>
                      <div>
                        <Link href={`/accounts/${a.id}`}><strong>{a.name}</strong></Link>{' '}
                        {a.is_joint && <span className="tag joint">Joint</span>}{' '}
                        {a.is_fixed && <span className="tag peri">Fixed</span>}
                        <div className="tiny muted">
                          {TYPE_LABELS[a.type]} · {a.currency}
                          {a.my_share < 100 && ` · your share ${a.my_share}%`}
                          {others.length > 0 && ` · with ${others.map((o) => `${o.name ?? o.external_name} ${o.share_pct}%`).join(', ')}`}
                        </div>
                      </div>
                      <div className="right">
                        <div className="num"><strong>{formatMoney(a.latest_balance, a.currency)}</strong></div>
                        <div className="tiny muted">{a.latest_month ? monthLabel(a.latest_month) : 'no balance yet'}</div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
      {archived.length > 0 && (
        <div className="card" style={{ marginTop: 18 }}>
          <h2>Closed accounts</h2>
          <ul className="list">
            {archived.map((a) => (
              <li key={a.id}>
                <span className="muted">{a.name} · {TYPE_LABELS[a.type]}</span>
                <form action={restoreAccount}><input type="hidden" name="id" value={a.id} /><button className="linkbtn small">Reopen</button></form>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
