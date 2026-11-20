import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="auth-wrap">
      <div className="card" style={{ maxWidth: 420, textAlign: 'center' }}>
        <h1>Not found</h1>
        <p className="muted">That page doesn’t exist, or you don’t have access to it.</p>
        <Link className="btn" href="/dashboard">Back to dashboard</Link>
      </div>
    </div>
  );
}
