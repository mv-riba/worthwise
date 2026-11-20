import Link from 'next/link';
import { AuthShell } from '../AuthShell';
import { ResetForm } from '../CodeForms';

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ email?: string }> }) {
  const { email = '' } = await searchParams;
  return (
    <AuthShell title="Choose a new password" intro={<>If <strong>{email}</strong> has a Worthwise account, we’ve emailed it a code. Enter it with your new password.</>}>
      <ResetForm email={email} />
      <p className="small" style={{ textAlign: 'center', marginTop: 14, marginBottom: 0 }}><Link href="/auth/forgot-password">Send a new code</Link> · <Link href="/auth/sign-in">Back to sign in</Link></p>
    </AuthShell>
  );
}
