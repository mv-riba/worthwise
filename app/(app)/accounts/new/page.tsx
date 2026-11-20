import Link from 'next/link';
import { requireUser } from '@/lib/session';
import { withUser } from '@/lib/db';
import { getAccounts, getMembers } from '@/lib/data';
import { ACCOUNT_TYPES, type AccountType } from '@/lib/core/constants';
import { AccountForm } from '../AccountForm';

export default async function NewAccountPage({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const sp = await searchParams;
  const { userId, profile } = await requireUser();
  const { members, accounts } = await withUser(userId, async (db) => ({
    members: await getMembers(db),
    accounts: await getAccounts(db, userId),
  }));
  const preset = (ACCOUNT_TYPES as readonly string[]).includes(sp.type ?? '') ? (sp.type as AccountType) : undefined;
  return (
    <div>
      <p className="small"><Link href="/accounts">← Accounts</Link></p>
      <h1>Add an account</h1>
      <AccountForm
        me={{ id: userId, name: profile.name || 'Me' }}
        partners={members.filter((m) => m.user_id !== userId).map((m) => ({ id: m.user_id, name: m.name || m.email || 'Partner' }))}
        properties={accounts.filter((a) => a.type === 'property').map((a) => ({ id: a.id, name: a.name }))}
        defaultCurrency={profile.display_currency}
        presetType={preset}
      />
    </div>
  );
}
