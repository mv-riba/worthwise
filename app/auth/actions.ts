'use server';

import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth/server';
import { TOO_MANY, allowAttempt, clientIp } from '@/lib/ratelimit';

export type AuthState = { error?: string; info?: string } | null;

type Result = { data?: any; error?: { message?: string; code?: string; status?: number } | null };
type LooseAuth = {
  emailOtp?: {
    sendVerificationOtp?: (a: { email: string; type?: string }) => Promise<Result>;
    verifyEmail?: (a: { email: string; otp: string }) => Promise<Result>;
    resetPassword?: (a: { email: string; otp: string; password: string }) => Promise<Result>;
  };
};
const loose = auth as unknown as LooseAuth;

/** Direct call to a Better Auth endpoint on the Neon Auth server (for methods the SDK doesn't expose yet). */
async function authApi(path: string, body: object): Promise<Result> {
  const base = (process.env.NEON_AUTH_BASE_URL ?? '').replace(/\/$/, '');
  const h = await headers();
  const origin = h.get('origin') ?? `https://${h.get('host')}`;
  try {
    const res = await fetch(`${base}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => null);
    return res.ok ? { data, error: null } : { error: { message: data?.message, code: data?.code, status: res.status } };
  } catch {
    return { error: { message: 'Could not reach the sign-in service. Please try again.' } };
  }
}

async function sendCode(email: string, type: 'email-verification' | 'forget-password') {
  if (loose.emailOtp?.sendVerificationOtp) return loose.emailOtp.sendVerificationOtp({ email, type });
  return authApi('/email-otp/send-verification-otp', { email, type });
}

const isUnverified = (e?: Result['error']) =>
  !!e && (e.code === 'EMAIL_NOT_VERIFIED' || e.status === 403 || /verif/i.test(e.message ?? ''));

const MIN_PASSWORD = 12;
const PASSWORD_HELP = `Please use at least ${MIN_PASSWORD} characters – a few random words or a password manager works well.`;
const tooLong = (...v: string[]) => v.some((x) => x.length > 254);

const verifyUrl = (email: string, sent = true) => `/auth/verify?email=${encodeURIComponent(email)}${sent ? '&sent=1' : ''}`;

export async function signUpWithEmail(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get('email') ?? '').trim();
  const name = String(formData.get('name') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  if (!email || !password) return { error: 'Please enter your email and a password.' };
  if (tooLong(email, name) || password.length > 128) return { error: 'That is too long.' };
  if (password.length < MIN_PASSWORD) return { error: PASSWORD_HELP };
  if (!(await allowAttempt('sign-up', [{ key: await clientIp(), max: 5, minutes: 60 }]))) return { error: TOO_MANY };

  const { data, error } = (await auth.signUp.email({ email, name: name || email.split('@')[0], password })) as Result;
  if (error) return { error: error.message || 'Could not create your account.' };
  // With "Verify at sign-up" switched on in Neon, no session is created until the emailed code is entered.
  const signedIn = !!(data?.token || data?.session);
  if (!signedIn && data?.user?.emailVerified === false) redirect(verifyUrl(email));
  redirect('/dashboard');
}

export async function signInWithEmail(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  if (!email || !password) return { error: 'Please enter your email and password.' };
  if (tooLong(email) || password.length > 128) return { error: 'Email or password is incorrect.' };
  const ip = await clientIp();
  if (!(await allowAttempt('sign-in', [{ key: email, max: 5, minutes: 15 }, { key: ip, max: 20, minutes: 15 }]))) {
    return { error: TOO_MANY };
  }

  const { error } = (await auth.signIn.email({ email, password })) as Result;
  if (isUnverified(error)) {
    await sendCode(email, 'email-verification');
    redirect(verifyUrl(email));
  }
  // Same message whatever went wrong, so the form doesn't reveal which emails have accounts.
  if (error) return { error: 'Email or password is incorrect.' };
  redirect('/dashboard');
}

export async function verifyEmailCode(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get('email') ?? '').trim();
  const otp = String(formData.get('code') ?? '').replace(/\s/g, '');
  if (!email || !/^\d{4,8}$/.test(otp)) return { error: 'Please enter the code from the email.' };
  if (!(await allowAttempt('verify', [{ key: email, max: 5, minutes: 15 }, { key: await clientIp(), max: 20, minutes: 15 }]))) {
    return { error: TOO_MANY };
  }
  const r = loose.emailOtp?.verifyEmail
    ? await loose.emailOtp.verifyEmail({ email, otp })
    : await authApi('/email-otp/verify-email', { email, otp });
  if (r.error) return { error: r.error.message || 'That code didn’t work. Check it, or send a new one.' };
  if (r.data?.session || r.data?.token) redirect('/dashboard');
  redirect('/auth/sign-in?verified=1');
}

export async function resendVerification(formData: FormData) {
  const email = String(formData.get('email') ?? '').trim();
  const ok = email && !tooLong(email) &&
    (await allowAttempt('send-code', [{ key: email, max: 3, minutes: 15 }, { key: await clientIp(), max: 10, minutes: 60 }]));
  if (ok) await sendCode(email, 'email-verification');
  redirect(verifyUrl(email) + (ok ? '&resent=1' : '&limited=1'));
}

export async function requestPasswordReset(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get('email') ?? '').trim();
  if (!email || tooLong(email)) return { error: 'Please enter your email.' };
  if (!(await allowAttempt('send-code', [{ key: email, max: 3, minutes: 15 }, { key: await clientIp(), max: 10, minutes: 60 }]))) {
    return { error: TOO_MANY };
  }
  // Always continue to the next step, so the form doesn't reveal which emails have accounts.
  await sendCode(email, 'forget-password');
  redirect(`/auth/reset-password?email=${encodeURIComponent(email)}`);
}

export async function resetPasswordWithCode(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get('email') ?? '').trim();
  const otp = String(formData.get('code') ?? '').replace(/\s/g, '');
  const password = String(formData.get('password') ?? '');
  if (!/^\d{4,8}$/.test(otp)) return { error: 'Please enter the code from the email.' };
  if (password.length < MIN_PASSWORD || password.length > 128) return { error: PASSWORD_HELP };
  if (!(await allowAttempt('reset', [{ key: email, max: 5, minutes: 15 }, { key: await clientIp(), max: 20, minutes: 15 }]))) {
    return { error: TOO_MANY };
  }
  const r = loose.emailOtp?.resetPassword
    ? await loose.emailOtp.resetPassword({ email, otp, password })
    : await authApi('/email-otp/reset-password', { email, otp, password });
  if (r.error) return { error: r.error.message || 'That code didn’t work. Request a new one and try again.' };
  redirect('/auth/sign-in?reset=1');
}

export async function signOut() {
  await auth.signOut();
  redirect('/');
}
