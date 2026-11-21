import Link from 'next/link';
import { AuthShell } from '../AuthShell';
import { VerifyForm } from '../CodeForms';
import { resendVerification } from '../actions';

export default async function VerifyPage({ searchParams }: { searchParams: Promise<{ email?: string; resent?: string; limited?: string }> }) {
  const { email = '', resent, limited } = await searchParams;
  return (
    <AuthShell title="Check your email" intro={<>We’ve sent a 6-digit code to <strong>{email || 'your email'}</strong>. Enter it below to confirm it’s you. The code lasts 15 minutes.</>}>
      {resent && <p className="notice small">A new code is on its way.</p>}
      {limited && <p className="error small">Too many codes requested. Please wait 15 minutes, then try again.</p>}
      <VerifyForm email={email} />
      <form action={resendVerification} style={{ marginTop: 14, textAlign: 'center' }}>
        <input type="hidden" name="email" value={email} />
        <span className="small muted">No email? Check your spam folder, or </span>
        <button className="linkbtn small" type="submit">send a new code</button>
      </form>
      <p className="small" style={{ textAlign: 'center', marginTop: 10, marginBottom: 0 }}><Link href="/auth/sign-in">Back to sign in</Link></p>
    </AuthShell>
  );
}
