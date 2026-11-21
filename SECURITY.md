# Worthwise security

## What protects your data

**Database**
- **Row-level security on every table.** Each request runs as the restricted `worthwise_app` role with the signed-in user's id. The database itself decides what that person can see: their own accounts, joint accounts in their household, and their partner's *total* only (never the partner's individual accounts).
- **Separate website login** (`npm run db:web-role`). The live site connects as `worthwise_web`, which has no permissions of its own and can only switch into `worthwise_app`. A leaked website connection string can't read or change anything outside the security rules.
- **Shared data is guarded.** Exchange rates can only be saved through a function that rejects malformed or implausible values.
- **Text size limits** on everything people type in.

**Households**
- **Invite codes** are 12 characters from a cryptographically strong random source.
- **Each code works once.** A new one is made as soon as someone joins, and you can make a new one at any time.
- **Two people per household.**
- **Five join attempts per hour per person**, so codes can't be guessed.

**Sign-in (Neon Auth)**
- **Passwords** are stored and checked by Neon Auth, never by Worthwise. New passwords must be at least 12 characters.
- **Email verification** by 6-digit code at sign-up (switch it on in Neon, see below), and **password reset** by emailed code.
- **Attempt limits:**
  - Sign-in: 5 per 15 minutes per email, and 20 per IP address.
  - Codes: 5 tries per 15 minutes.
  - New codes: 3 per 15 minutes.
  - Sign-ups: 5 per hour per IP address.
  - Emails and IP addresses are stored only as one-way hashes.
- **No guessing whose email is registered:** the sign-in and forgot-password forms give the same message whether an email has an account or not.
- **No way around the limits:** the browser-facing auth route refuses sign-in, sign-up and code requests, so they can only go through the rate-limited pages.

**Website**
- **Security headers:** a Content Security Policy (only Worthwise's own scripts, styles and fonts), no framing by other sites, HTTPS-only (HSTS), no MIME sniffing, a strict referrer policy, and no camera, microphone or location access.
- **Every page and action** checks who is signed in. Server actions are protected against cross-site requests by Next.js.
- **No raw database errors or free text** in links or on screen.
- **No bank connections or bank credentials**, ever. Crypto prices, exchange rates and house price indices are public data.

## Your checklist

Do these once, in this order:

1. **Update the database.** In your project folder, run:
   ```
   git pull
   npm install
   npm run db:setup
   ```
2. **Give the website its own limited login.** Run `npm run db:web-role`. It prints a new connection string.
   - In **Vercel → Settings → Environment Variables**, set `DATABASE_URL` to that string for **Production** and **Preview**, then redeploy.
   - Keep your original (owner) string only in `.env.local` on your computer.
3. **Neon Auth settings** (Neon Console → Auth → Settings):
   - Switch on **Verify at Sign-up** and choose **Verification code**.
   - Under trusted or allowed domains, keep only `https://worthwise.mvriba.com` (plus `http://localhost:3000` if you test on your computer).
4. **Two-factor login on every account that could reach your data or code.** This is the biggest real-world risk. Turn on 2FA for:
   - **Neon:** Account settings → Set up two-factor authentication
   - **Vercel**
   - **GitHub**
   - **Your email account**, because password resets for everything go there
   - **The company your domain is registered with**
5. **Cookie secret.** Check that `NEON_AUTH_COOKIE_SECRET` in Vercel is a random string of 32+ characters made with `openssl rand -base64 32`. If you've ever pasted it anywhere, make a new one. Everyone will then need to sign in again.
6. **GitHub:** turn on **Dependabot alerts** (repository Settings → Code security). Consider making the repository private. No secrets are in it, but private is simpler.
7. **Vercel:** keep **Deployment Protection** on for preview deployments (the default "Standard Protection").

## Known limits

- **Two-factor login for Worthwise users** isn't offered by Neon Auth yet (it's on their roadmap). Add it when it arrives.
- **The password-reset-by-code flow** uses Neon Auth's standard endpoint, which isn't in Neon's server SDK docs yet. Test it once after deploying.
- **Rotating the website's database password:** run `npm run db:web-role` again and update Vercel.
