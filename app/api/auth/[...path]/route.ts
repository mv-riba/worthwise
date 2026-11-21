import { auth } from '@/lib/auth/server';

const handlers = auth.handler();

/*
 * Worthwise signs people in, verifies codes and resets passwords only through
 * its own server actions (app/auth/actions.ts), which apply rate limits.
 * So the browser-facing auth route refuses those operations; otherwise they
 * could be called here directly, bypassing the limits.
 */
const BLOCKED = /\/(sign-in|sign-up|email-otp|forget-password|request-password-reset|reset-password|change-password|change-email|update-user|delete-user|magic-link|one-time-token)\b/;

type Handler = (req: Request, ctx: unknown) => Promise<Response> | Response;
const guard = (fn: Handler): Handler => (req, ctx) => {
  if (BLOCKED.test(new URL(req.url).pathname)) return new Response('Not found', { status: 404 });
  return fn(req, ctx);
};

export const GET = guard(handlers.GET as Handler);
export const POST = guard(handlers.POST as Handler);
export const PUT = guard(handlers.PUT as Handler);
export const PATCH = guard(handlers.PATCH as Handler);
export const DELETE = guard(handlers.DELETE as Handler);
