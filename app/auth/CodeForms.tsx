'use client';

import { useActionState } from 'react';
import { requestPasswordReset, resetPasswordWithCode, verifyEmailCode, type AuthState } from './actions';

function Submit({ pending, label }: { pending: boolean; label: string }) {
  return <button className="btn" type="submit" disabled={pending} style={{ width: '100%' }}>{pending ? 'One moment…' : label}</button>;
}

function CodeInput() {
  return (
    <div className="field">
      <label htmlFor="code">Code from the email</label>
      <input id="code" name="code" type="text" inputMode="numeric" autoComplete="one-time-code" required placeholder="123456"
        style={{ letterSpacing: '0.3em', fontSize: '1.2rem', textAlign: 'center' }} />
    </div>
  );
}

export function VerifyForm({ email }: { email: string }) {
  const [state, action, pending] = useActionState<AuthState, FormData>(verifyEmailCode, null);
  return (
    <form action={action}>
      <input type="hidden" name="email" value={email} />
      <CodeInput />
      {state?.error && <p className="error">{state.error}</p>}
      <Submit pending={pending} label="Verify email" />
    </form>
  );
}

export function ForgotForm() {
  const [state, action, pending] = useActionState<AuthState, FormData>(requestPasswordReset, null);
  return (
    <form action={action}>
      <div className="field">
        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" autoComplete="email" required />
      </div>
      {state?.error && <p className="error">{state.error}</p>}
      <Submit pending={pending} label="Send me a code" />
    </form>
  );
}

export function ResetForm({ email }: { email: string }) {
  const [state, action, pending] = useActionState<AuthState, FormData>(resetPasswordWithCode, null);
  return (
    <form action={action}>
      <input type="hidden" name="email" value={email} />
      <CodeInput />
      <div className="field">
        <label htmlFor="password">New password</label>
        <input id="password" name="password" type="password" autoComplete="new-password" required minLength={8} />
      </div>
      {state?.error && <p className="error">{state.error}</p>}
      <Submit pending={pending} label="Set new password" />
    </form>
  );
}
