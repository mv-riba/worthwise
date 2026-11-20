'use server';

import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth/server';

export type AuthState = { error: string } | null;

export async function signUpWithEmail(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get('email') ?? '').trim();
  const name = String(formData.get('name') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  if (!email || !password) return { error: 'Please enter your email and a password.' };
  if (password.length < 8) return { error: 'Please use a password of at least 8 characters.' };

  const { error } = await auth.signUp.email({ email, name: name || email.split('@')[0], password });
  if (error) return { error: error.message || 'Could not create your account.' };
  redirect('/dashboard');
}

export async function signInWithEmail(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  if (!email || !password) return { error: 'Please enter your email and password.' };

  const { error } = await auth.signIn.email({ email, password });
  if (error) return { error: error.message || 'Could not sign in. Please try again.' };
  redirect('/dashboard');
}

export async function signOut() {
  await auth.signOut();
  redirect('/');
}
