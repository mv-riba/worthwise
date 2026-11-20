import { AuthForm } from '../AuthForm';

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ verified?: string; reset?: string }> }) {
  const sp = await searchParams;
  const notice = sp.verified ? 'Your email is confirmed – please sign in.' : sp.reset ? 'Your password has been changed – please sign in.' : undefined;
  return <AuthForm mode="sign-in" notice={notice} />;
}
