import Link from 'next/link';
import { AuthShell } from '../AuthShell';
import { ForgotForm } from '../CodeForms';

export default function ForgotPasswordPage() {
  return (
    <AuthShell title="Reset your password" intro="Enter the email you signed up with and we’ll send you a code to set a new password.">
      <ForgotForm />
      <p className="small" style={{ textAlign: 'center', marginTop: 14, marginBottom: 0 }}><Link href="/auth/sign-in">Back to sign in</Link></p>
    </AuthShell>
  );
}
