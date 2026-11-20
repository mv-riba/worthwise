import Link from 'next/link';
import { requireUser } from '@/lib/session';
import { withUser } from '@/lib/db';
import { getAccounts, getCheckin, getMembers, getPreviousBalances, getPropertyValues, getSnapshotsForMonth } from '@/lib/data';
import { estimatePropertyValue, type PropertyEstimate } from '@/lib/valuation';
import { CURRENCIES, TYPE_LABELS, addMonths, coinSymbol, formatMoney, isDebt, monthLabel, monthStart, parseMonthParam } from '@/lib/core/constants';
import { saveCheckin } from './actions';
import { CryptoFields } from '@/components/CryptoFields';

export default async function CheckinPage({ searchParams }: { searchParams: Promise<{ month?: string; error?: string }> }) {
  const sp = await searchParams;
  const { userId, profile } = await requireUser();
  const current = monthStart();
  const month = parseMonthParam(sp.month) ?? current;
  const safeMonth = month > current ? current : month;

  const d = await withUser(userId, async (db) => {
    const accounts = await getAccounts(db, userId);
    const [snaps, prev, checkin, members, values] = await Promise.all([
      getSnapshotsForMonth(db, safeMonth),
      getPreviousBalances(db, safeMonth),
      getCheckin(db, safeMonth),
      getMembers(db),
      getPropertyValues(db, accounts.filter((a) => a.type === 'property').map((a) => a.id)),
    ]);
    return { accounts, snaps, prev, checkin, members, values };
  });

  // Look up property estimates and crypto prices in parallel (outside the DB transaction).
  const estimates = new Map<string, PropertyEstimate | null>();
  await Promise.all(
    d.accounts.filter((a) => a.type === 'property').map(async (a) => {
      estimates.set(a.id, await estimatePropertyValue(a, d.values.filter((v) => v.account_id === a.id), safeMonth));
    }),
  );

  const partnerNames = d.members.filter((m) => m.user_id !== userId).map((m) => m.name).join(' & ');
  const show = (v: number | null | undefined, debt: boolean) => (v === null || v === undefined ? '' : String(debt ? Math.abs(v) : v));

  return (
    <div>
      <div className="row between" style={{ marginBottom: 12 }}>
        <div>
          <h1>{monthLabel(safeMonth, 'long')} check-in</h1>
          <p className="muted" style={{ marginBottom: 0 }}>Update each balance as it is today. Anything you leave unchanged carries over from last month.</p>
        </div>
        <form className="row small" action="/check-in">
          <label htmlFor="month" style={{ margin: 0 }}>Month</label>
          <input id="month" type="month" name="month" defaultValue={safeMonth.slice(0, 7)} max={current.slice(0, 7)} style={{ width: 170 }} />
          <button className="btn secondary small">Open</button>
        </form>
      </div>
      {safeMonth !== current && (
        <p className="notice small">You’re filling in a past month. It will be saved with that month’s exchange rates, so your trend can start from the real beginning.</p>
      )}
      {sp.error && <p className="error">{sp.error}</p>}

      {d.accounts.length === 0 ? (
        <div className="card">
          <p>You have no accounts yet.</p>
          <Link href="/accounts/new" className="btn">Add your first account</Link>
        </div>
      ) : (
        <form action={saveCheckin} className="stack">
          <input type="hidden" name="month" value={safeMonth} />
          <div className="card">
            <h2>Income this month</h2>
            <p className="small muted">Your take-home pay plus any other money that came in this month (after tax).</p>
            <details className="small" style={{ marginBottom: 12 }}>
              <summary style={{ cursor: 'pointer', fontWeight: 700, color: 'var(--peri-deep)' }}>Why does Worthwise need my income?</summary>
              <p style={{ marginTop: 8 }}>
                Your balances show <em>how much</em> your cash changed, but not <em>why</em>. If your bank and savings went up by €500,
                you might have earned €3,000 and spent €2,500 – or earned €5,000 and spent €4,500. Income is the missing piece:
              </p>
              <p style={{ margin: '0 0 8px', padding: '8px 12px', background: 'var(--cream)', borderRadius: 12 }}>
                <strong>Spending ≈ income − change in cash</strong><br />€3,000 income − €500 more in the bank = about <strong>€2,500 spent</strong>
              </p>
              <p style={{ marginBottom: 0 }}>
                That’s how Worthwise can estimate your monthly spending without connecting to your bank. Leave it empty if you’d rather not –
                everything else still works, you just won’t see a spending estimate.
              </p>
            </details>
            <div className="row">
              <input name="income" type="text" inputMode="decimal" defaultValue={d.checkin?.income ?? ''} placeholder="0" style={{ maxWidth: 220 }} aria-label="Income" />
              <select name="income_currency" defaultValue={d.checkin?.income_currency ?? profile.display_currency} style={{ maxWidth: 110 }} aria-label="Income currency">
                {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
          </div>

          <div className="card">
            <h2>Balances</h2>
            <table className="table">
              <thead>
                <tr><th>Account</th><th className="right">Last time</th><th style={{ width: 260 }}>This month</th></tr>
              </thead>
              <tbody>
                {d.accounts.map((a) => {
                  const debt = isDebt(a.type);
                  const prev = d.prev.get(a.id);
                  const saved = d.snaps.get(a.id);
                  const est = estimates.get(a.id) ?? null;
                  const def = saved ?? (a.type === 'property' ? est?.estimate : null) ?? prev?.balance ?? null;
                  const liveCrypto = a.type === 'crypto' && safeMonth === current;
                  return (
                    <tr key={a.id}>
                      <td>
                        <strong>{a.name}</strong> {a.is_joint && <span className="tag joint">Joint{partnerNames ? ` with ${partnerNames}` : ''}</span>}
                        <div className="tiny muted">{TYPE_LABELS[a.type]} · {a.currency}{debt ? ' · amount owed' : ''}{a.is_fixed ? ' · fixed' : ''}</div>
                        {a.type === 'property' && (
                          <div className="tiny" style={{ marginTop: 4 }}>
                            {est ? (
                              <>
                                Estimate <strong>{formatMoney(est.estimate, a.currency)}</strong> from {est.sourceName} (index {est.latestPeriod}, {est.ratio >= 1 ? '+' : ''}{((est.ratio - 1) * 100).toFixed(1)}% since {monthLabel(est.baseline.month)}).
                                <input type="hidden" name={`est:${a.id}`} value={est.estimate} />
                                <input type="hidden" name={`idx:${a.id}`} value={est.latestIndex} />
                                <input type="hidden" name={`per:${a.id}`} value={est.latestPeriod} />
                                <input type="hidden" name={`src:${a.id}`} value={est.sourceName} />
                              </>
                            ) : (
                              <span className="muted">{a.valuation_source && a.valuation_source !== 'manual' ? 'No index estimate available right now – enter a value if it has changed.' : 'Enter the value yourself.'}</span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="right num small muted">{prev ? <>{formatMoney(debt ? Math.abs(prev.balance) : prev.balance, a.currency)}<br />{monthLabel(prev.month)}</> : '–'}</td>
                      <td>
                        {liveCrypto ? (
                          <CryptoFields
                            compact coin={coinSymbol(a.crypto_coin)} currency={a.currency}
                            unitsName={`units:${a.id}`} valueName={`bal:${a.id}`} priceName={`price:${a.id}`}
                            defaultUnits={a.crypto_units} defaultValue={saved ?? prev?.balance ?? null}
                          />
                        ) : (
                          <input name={`bal:${a.id}`} type="text" inputMode="decimal" defaultValue={show(def, debt)} placeholder="0" aria-label={`${a.name} balance`} />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="tiny muted">Joint accounts only need updating by one of you. Property values from an index are an estimate – type over them if you know better. Crypto values update from the live price as you type the number of coins, and that price is saved with this month.</p>
          </div>

          <div className="row">
            <button className="btn" type="submit">Save {monthLabel(safeMonth, 'long')} check-in</button>
            {safeMonth === current && <Link className="btn ghost" href={`/check-in?month=${addMonths(current, -1).slice(0, 7)}`}>Fill in a past month instead</Link>}
          </div>
        </form>
      )}
    </div>
  );
}
