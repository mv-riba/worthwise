import Link from 'next/link';
import { Nav } from '@/components/Nav';
import { requireUser } from '@/lib/session';
import { signOut } from '@/app/auth/actions';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireUser();
  return (
    <div className="shell">
      <header className="topbar">
        <Link href="/dashboard" className="brand"><span className="brand-mark">W</span>Worthwise</Link>
        <Nav />
        <form action={signOut} className="row small">
          <span className="muted">{profile.name || profile.email}</span>
          <button className="linkbtn" type="submit">Sign out</button>
        </form>
      </header>
      <main>{children}</main>
      <footer className="footer">
        Worthwise shows general information only, not financial advice. Balances are entered by you; no bank credentials are ever stored.
      </footer>
    </div>
  );
}
