import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/session';
import { withUser } from '@/lib/db';
import { CURRENCIES } from '@/lib/core/constants';

async function saveSettings(fd: FormData) {
  'use server';
  const { userId } = await requireUser();
  const ccy = String(fd.get('display_currency') ?? 'EUR');
  if (!(CURRENCIES as readonly string[]).includes(ccy)) redirect('/settings');
  await withUser(userId, (db) =>
    db.query('update profiles set name = $2, display_currency = $3 where user_id = $1', [userId, String(fd.get('name') ?? '').trim().slice(0, 120), ccy]),
  );
  revalidatePath('/', 'layout');
  redirect('/settings?saved=1');
}

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const sp = await searchParams;
  const { profile } = await requireUser();
  return (
    <div style={{ maxWidth: 560 }}>
      <h1>Settings</h1>
      {sp.saved && <p className="notice">Saved.</p>}
      <form action={saveSettings} className="card">
        <div className="field">
          <label htmlFor="name">Your name</label>
          <input id="name" name="name" type="text" defaultValue={profile.name} />
        </div>
        <div className="field">
          <label htmlFor="display_currency">Display currency <span className="hint">all totals are converted into this</span></label>
          <select id="display_currency" name="display_currency" defaultValue={profile.display_currency}>
            {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>
        <p className="small muted">Signed in as {profile.email}.</p>
        <button className="btn">Save</button>
      </form>
      <div className="card" style={{ marginTop: 18 }}>
        <h3>Your privacy</h3>
        <p className="small muted" style={{ marginBottom: 0 }}>
          Everything is entered by you – Worthwise never connects to your bank or stores bank credentials. The database only lets you see your own data and the joint items in your household. Exchange rates come from the European Central Bank (via Frankfurter), property estimates from official house price indices, and crypto prices from CoinGecko.
        </p>
      </div>
    </div>
  );
}
