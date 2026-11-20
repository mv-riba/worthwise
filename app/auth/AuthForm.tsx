'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { signInWithEmail, signUpWithEmail, type AuthState } from './actions';

export function AuthForm({ mode, notice }: { mode: 'sign-in' | 'sign-up'; notice?: string }) {
  const action = mode === 'sign-in' ? signInWithEmail : signUpWithEmail;
  const [state, formAction, pending] = useActionState<AuthState, FormData>(action, null);

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <Link href="/" className="brand" style={{ marginBottom: 18, justifyContent: 'center' }}>
          <span className="brand-mark">W</span>Worthwise
        </Link>
        <div className="card">
          <h1 style={{ fontSize: '1.6rem' }}>{mode === 'sign-in' ? 'Welcome back' : 'Create your account'}</h1>
          <p className="muted small">
            {mode === 'sign-in' ? 'Sign in with your email and password.' : 'Each person in your household gets their own login.'}
          </p>
          {notice && <p className="notice small">{notice}</p>}
          <form action={formAction}>
            {mode === 'sign-up' && (
              <div className="field">
                <label htmlFor="name">Your first name</label>
                <input id="name" name="name" type="text" autoComplete="given-name" />
              </div>
            )}
            <div className="field">
              <label htmlFor="email">Email</label>
              <input id="email" name="email" type="email" autoComplete="email" required />
            </div>
            <div className="field">
              <label htmlFor="password">Password</label>
              <input
                id="password" name="password" type="password" required minLength={8}
                autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
              />
            </div>
            {state?.error && <p className="error">{state.error}</p>}
            <button className="btn" type="submit" disabled={pending} style={{ width: '100%' }}>
              {pending ? 'One moment…' : mode === 'sign-in' ? 'Sign in' : 'Create account'}
            </button>
            {mode === 'sign-in' && (
              <p className="small" style={{ textAlign: 'center', marginTop: 12, marginBottom: 0 }}><Link href="/auth/forgot-password">Forgot your password?</Link></p>
            )}
          </form>
          <p className="small muted" style={{ marginTop: 16, textAlign: 'center' }}>
            {mode === 'sign-in' ? (
              <>New here? <Link href="/auth/sign-up">Create an account</Link></>
            ) : (
              <>Already have an account? <Link href="/auth/sign-in">Sign in</Link></>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
