import Link from 'next/link';

export function AuthShell({ title, intro, children }: { title: string; intro?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <Link href="/" className="brand" style={{ marginBottom: 18, justifyContent: 'center' }}>
          <span className="brand-mark">W</span>Worthwise
        </Link>
        <div className="card">
          <h1 style={{ fontSize: '1.6rem' }}>{title}</h1>
          {intro && <p className="muted small">{intro}</p>}
          {children}
        </div>
      </div>
    </div>
  );
}
