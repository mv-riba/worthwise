import Link from 'next/link';
import { requireUser } from '@/lib/session';
import { withUser } from '@/lib/db';
import { getAccounts, getCheckin, getMembers, getSummary, firstSnapshotMonth } from '@/lib/data';
import { backfillRates, ensureRatesForMonth, latestRates } from '@/lib/external';
import { CURRENCIES, TYPE_LABELS, formatMoney, monthLabel, monthStart } from '@/lib/core/constants';
import { DISCLAIMER } from '@/lib/core/suggestions';
import { buildSeries, categoryBreakdown, propertyCards, suggestionsFor, type View } from '@/lib/dashboard';
import { BarPairs, Change, LineChart } from '@/components/Charts';

const CAT_COLORS: Record<string, string> = {
  Cash: '#7c85f0', Investments: '#5f68d6', Property: '#f6d56e', Pensions: '#a9aff7', Crypto: '#f2846c',
  'Other assets': '#c7b9e8', Mortgages: '#e0a090', 'Other debts': '#f2846c',
};

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ view?: string; ccy?: string }> }) {
  const sp = await searchParams;
  const { userId, profile } = await requireUser();
  const display = (CURRENCIES as readonly string[]).includes(sp.ccy ?? '') ? sp.ccy! : profile.display_currency;

  const d = await withUser(userId, async (db) => {
    const [accounts, members] = await Promise.all([getAccounts(db, userId), getMembers(db)]);
    const cur = await db.query<{ c: string }>('select household_currencies() as c');
    const currencies = [display, ...cur.rows.map((r) => r.c), ...members.map((m) => m.display_currency)];
    const first = await firstSnapshotMonth(db);
    if (first) await backfillRates(db, first, currencies);
    await ensureRatesForMonth(db, monthStart(), currencies);
    const [summary, rates, checkin] = await Promise.all([getSummary(db, display), latestRates(db), getCheckin(db, monthStart())]);
    return { accounts, members, summary, rates, checkin };
  });

  const partners = d.members.filter((m) => m.user_id !== userId);
  const hasPartner = partners.length > 0;
  const view: View = hasPartner && (sp.view === 'partner' || sp.view === 'us') ? sp.view : 'me';
  const s = buildSeries(d.summary, view);
  const n = s.months.length;
  const latest = n ? s.netWorth[n - 1] : null;
  const prev = n > 1 ? s.netWorth[n - 2] : null;
  const change = latest !== null && prev !== null ? latest - prev : null;

  // latest month that has a spending estimate
  let si = -1;
  for (let i = n - 1; i >= 0; i--) if (s.spending[i] !== null || s.otherChange[i] !== null) { si = i; break; }

  const partnerName = partners.map((p) => p.name || p.email).join(' & ') || 'Partner';
  const title = view === 'me' ? 'My net worth' : view === 'partner' ? `${partnerName}’s net worth` : 'Our combined net worth';
  const qs = (v: string, c = display) => `?view=${v}${c !== profile.display_currency ? `&ccy=${c}` : ''}`;

  const cats = view === 'me' ? categoryBreakdown(d.accounts, display, d.rates) : [];
  const assetsTotal = cats.filter((c) => c.value > 0).reduce((t, c) => t + c.value, 0);
  const debtsTotal = cats.filter((c) => c.value < 0).reduce((t, c) => t + c.value, 0);
  const maxCat = Math.max(1, ...cats.map((c) => Math.abs(c.value)));
  const props = view === 'me' ? propertyCards(d.accounts, display, d.rates) : [];
  const suggestions = view === 'me' ? suggestionsFor(d.accounts, buildSeries(d.summary, 'me'), display, d.rates) : [];
  const joint = d.accounts.filter((a) => a.is_joint);

  const seriesForChart =
    view === 'us' && hasPartner
      ? [
          { name: 'Combined', color: '#7c85f0', values: s.netWorth, fill: true },
          { name: 'Me', color: '#f2846c', values: buildSeries(d.summary, 'me').netWorth, dashed: true },
          { name: partnerName, color: '#e0b93a', values: buildSeries(d.summary, 'partner').netWorth, dashed: true },
        ]
      : [{ name: title, color: '#7c85f0', values: s.netWorth, fill: true }];

  return (
    <div>
      {!d.checkin && (
        <div className="banner">
          <div><strong>Time for your {monthLabel(monthStart(), 'long')} check-in.</strong> <span className="small">It takes a few minutes to update your balances.</span></div>
          <Link className="btn small" href="/check-in" style={{ background: 'var(--ink)' }}>Start check-in</Link>
        </div>
      )}

      <div className="row between" style={{ marginBottom: 16 }}>
        <div className="tabs">
          <Link href={qs('me')} className={view === 'me' ? 'active' : ''}>Me</Link>
          {hasPartner && <Link href={qs('partner')} className={view === 'partner' ? 'active' : ''}>{partnerName}</Link>}
          {hasPartner && <Link href={qs('us')} className={view === 'us' ? 'active' : ''}>Combined</Link>}
        </div>
        <form className="row small" action="/dashboard">
          <input type="hidden" name="view" value={view} />
          <label htmlFor="ccy" style={{ margin: 0 }}>Show in</label>
          <select id="ccy" name="ccy" defaultValue={display} style={{ width: 100, padding: '7px 10px' }}>
            {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
          </select>
          <button className="btn secondary small" type="submit">Go</button>
        </form>
      </div>

      <div className="grid grid-3">
        <div className="card peri">
          <div className="card-title">{title}</div>
          <div className="big num">{formatMoney(latest, display)}</div>
          <div style={{ marginTop: 8 }}><Change value={change} currency={display} label="since last month" /></div>
          {n > 0 && <p className="small muted" style={{ marginTop: 10, marginBottom: 0 }}>As of {monthLabel(s.months[n - 1], 'long')}</p>}
        </div>
        <div className="card">
          <div className="card-title">Estimated spending {si >= 0 && `· ${monthLabel(s.months[si])}`}</div>
          <div className="mid num">{si >= 0 ? formatMoney(s.spending[si], display) : '–'}</div>
          <p className="small muted" style={{ marginBottom: 0 }}>
            {si >= 0 && s.income[si] !== null ? <>Income {formatMoney(s.income[si], display)} minus the change in your cash accounts. </> : 'Add your income at check-in to see this. '}
            <span className="tag">Estimate</span>
          </p>
        </div>
        <div className="card">
          <div className="card-title">Portfolio growth {si >= 0 && `· ${monthLabel(s.months[si])}`}</div>
          <div className="mid num">{si >= 0 && s.otherChange[si] !== null ? formatMoney(s.otherChange[si], display, { sign: true }) : '–'}</div>
          <p className="small muted" style={{ marginBottom: 0 }}>Change in investments, pensions, property, crypto, fixed savings and mortgages.</p>
        </div>

        <div className="card span-2">
          <div className="row between"><h2>Net worth over time</h2><span className="small muted">{display}</span></div>
          <LineChart months={s.months} series={seriesForChart} currency={display} />
        </div>

        {view === 'me' ? (
          <div className="card">
            <h2>Breakdown</h2>
            {cats.length === 0 && <p className="muted small">Add accounts to see your breakdown.</p>}
            <div className="stack">
              {cats.map((c) => (
                <div key={c.category}>
                  <div className="row between small"><strong>{c.category}</strong><span className="num">{formatMoney(c.value, display)}</span></div>
                  <div className="bar-track"><div className="bar-fill" style={{ width: `${(Math.abs(c.value) / maxCat) * 100}%`, background: CAT_COLORS[c.category] }} /></div>
                </div>
              ))}
            </div>
            {cats.length > 0 && (
              <p className="small muted" style={{ marginTop: 14, marginBottom: 0 }}>
                Assets {formatMoney(assetsTotal, display)} · Debts {formatMoney(debtsTotal, display)}
              </p>
            )}
          </div>
        ) : (
          <div className="card">
            <h2>{view === 'us' ? 'Shared items' : 'Totals only'}</h2>
            {view === 'partner' ? (
              <p className="muted small">You can see {partnerName}’s total, but not their individual accounts. Joint accounts you share appear in your own view, at your share.</p>
            ) : joint.length ? (
              <ul className="list">
                {joint.map((a) => (
                  <li key={a.id}>
                    <span><strong>{a.name}</strong><br /><span className="tiny muted">{TYPE_LABELS[a.type]} · your share {a.my_share}%</span></span>
                    <span className="num small">{formatMoney(a.latest_balance, a.currency)}</span>
                  </li>
                ))}
              </ul>
            ) : <p className="muted small">No joint accounts yet. Mark an account as joint when you add it.</p>}
          </div>
        )}

        <div className="card span-2">
          <h2>Spending and growth by month</h2>
          <BarPairs
            months={s.months.slice(-12)}
            a={{ name: 'Estimated spending', color: '#f2846c', values: s.spending.slice(-12) }}
            b={{ name: 'Portfolio growth', color: '#7c85f0', values: s.otherChange.slice(-12) }}
            currency={display}
          />
          <p className="tiny muted" style={{ marginTop: 8, marginBottom: 0 }}>
            Spending is estimated as income minus the change in bank, savings and credit card balances. Fixed savings, investments, pensions, property and crypto are left out; interest on other accounts is ignored.
          </p>
        </div>

        {view === 'me' && (
          <div className="card">
            <h2>Property equity</h2>
            {props.length === 0 ? <p className="muted small">No properties yet.</p> : (
              <ul className="list">
                {props.map((p) => (
                  <li key={p.id} style={{ display: 'block' }}>
                    <div className="row between"><strong>{p.name}</strong><span className="mid num" style={{ fontSize: '1.2rem' }}>{formatMoney(p.myEquity, display)}</span></div>
                    <div className="tiny muted">
                      {p.myShare}% of {formatMoney(p.value, display)} = {formatMoney(p.myPropertyValue, display)}, minus your mortgage {formatMoney(p.myMortgage, display)}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {view === 'me' && suggestions.length > 0 && (
        <section style={{ marginTop: 24 }}>
          <h2>Things people in your situation often look at</h2>
          <div className="grid grid-2">
            {suggestions.map((sg) => (
              <div key={sg.id} className={`card ${sg.tone === 'periwinkle' ? '' : sg.tone}`}>
                <h3>{sg.title}</h3>
                <p className="small" style={{ marginBottom: 0 }}>{sg.body}</p>
                <p className="disclaimer">{DISCLAIMER}</p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
