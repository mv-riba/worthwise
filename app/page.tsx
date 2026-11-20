import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getUserId } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function Landing() {
  if (await getUserId()) redirect('/dashboard');
  return (
    <div className="shell">
      <header className="topbar">
        <Link href="/" className="brand"><span className="brand-mark">W</span>Worthwise</Link>
        <div className="row">
          <Link href="/auth/sign-in" className="btn secondary small">Sign in</Link>
          <Link href="/auth/sign-up" className="btn small">Create account</Link>
        </div>
      </header>
      <section className="hero">
        <div>
          <h1>See your household’s net worth grow, month by month.</h1>
          <p className="muted" style={{ fontSize: '1.15rem' }}>
            A once-a-month check-in for your bank accounts, savings, pensions, property and crypto.
            Worthwise adds it all up across currencies, shows the trend and estimates your spending.
            No bank connections, ever.
          </p>
          <div className="row" style={{ marginTop: 20 }}>
            <Link href="/auth/sign-up" className="btn">Get started</Link>
            <Link href="/auth/sign-in" className="btn secondary">I have an account</Link>
          </div>
        </div>
        <div className="blob">
          <div className="card-title" style={{ color: 'rgba(255,255,255,0.85)' }}>Our net worth</div>
          <div className="big num">€248,310</div>
          <span className="pill up" style={{ background: 'rgba(255,255,255,0.22)', color: 'white' }}>▲ €3,420 this month</span>
          <svg viewBox="0 0 300 90" width="100%" style={{ marginTop: 18, position: 'relative', zIndex: 1 }} aria-hidden>
            <path d="M0 80 C 40 70, 60 72, 90 60 S 150 50, 180 38 S 240 30, 300 12" stroke="white" strokeWidth="4" fill="none" strokeLinecap="round" />
          </svg>
        </div>
      </section>
      <section className="grid grid-3">
        <div className="card"><h3>Every account, every currency</h3><p className="muted small">Pounds, euros and more, converted with each month’s rates so past totals stay accurate.</p></div>
        <div className="card"><h3>Made for two</h3><p className="muted small">Your own login and accounts. Joint items are counted once, split by ownership share.</p></div>
        <div className="card"><h3>Gentle suggestions</h3><p className="muted small">Educational prompts about cash, debt and risk. General information, never financial advice.</p></div>
      </section>
    </div>
  );
}
