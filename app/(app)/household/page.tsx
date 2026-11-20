import { requireUser } from '@/lib/session';
import { withUser } from '@/lib/db';
import { getMembers } from '@/lib/data';
import { createHousehold, joinHousehold, leaveHousehold, renameHousehold } from './actions';

export default async function HouseholdPage({ searchParams }: { searchParams: Promise<{ error?: string; joined?: string }> }) {
  const sp = await searchParams;
  const { userId } = await requireUser();
  const d = await withUser(userId, async (db) => {
    const h = await db.query<{ id: string; name: string; invite_code: string }>('select id, name, invite_code from households where id = my_household()');
    return { household: h.rows[0] ?? null, members: await getMembers(db) };
  });

  return (
    <div style={{ maxWidth: 760 }}>
      <h1>Household</h1>
      <p className="muted">Partners each keep their own login and accounts. In a shared household you can see each other’s total net worth and your combined total – never each other’s individual accounts. Joint accounts are stored once and split by ownership share.</p>
      {sp.error && <p className="error">{sp.error}</p>}
      {sp.joined && <p className="notice">You’ve joined the household. Your combined view is now on the dashboard.</p>}

      {d.household ? (
        <div className="stack">
          <div className="card peri">
            <div className="card-title">Invite your partner</div>
            <p style={{ marginBottom: 6 }}>Ask them to create their own Worthwise account, open <strong>Household</strong> and enter this code:</p>
            <div className="big num" style={{ letterSpacing: '0.15em' }}>{d.household.invite_code}</div>
          </div>
          <div className="card">
            <h2>{d.household.name}</h2>
            <ul className="list">
              {d.members.map((m) => (
                <li key={m.user_id}><span><strong>{m.name || m.email}</strong>{m.user_id === userId && <span className="tag" style={{ marginLeft: 8 }}>You</span>}</span><span className="small muted">{m.email}</span></li>
              ))}
            </ul>
            <form action={renameHousehold} className="row" style={{ marginTop: 12 }}>
              <input name="name" type="text" defaultValue={d.household.name} style={{ maxWidth: 280 }} aria-label="Household name" />
              <button className="btn secondary small">Rename</button>
            </form>
          </div>
          <div className="card">
            <h3>Leave household</h3>
            <p className="small muted">Your own accounts stay yours. Joint accounts keep their ownership shares, so each of you still sees your own share.</p>
            <form action={leaveHousehold}><button className="btn coral small">Leave household</button></form>
          </div>
        </div>
      ) : (
        <div className="grid grid-2">
          <form action={createHousehold} className="card">
            <h2>Start a household</h2>
            <p className="small muted">You’ll get an invite code to share with your partner.</p>
            <div className="field"><label htmlFor="name">Name</label><input id="name" name="name" type="text" placeholder="e.g. Maria & Mikko" /></div>
            <button className="btn">Create household</button>
          </form>
          <form action={joinHousehold} className="card">
            <h2>Join with a code</h2>
            <p className="small muted">Got a code from your partner? Enter it here.</p>
            <div className="field"><label htmlFor="code">Invite code</label><input id="code" name="code" type="text" required placeholder="AB12CD34" style={{ textTransform: 'uppercase' }} /></div>
            <button className="btn">Join household</button>
          </form>
        </div>
      )}
    </div>
  );
}
