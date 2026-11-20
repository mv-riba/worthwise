# Worthwise

A household net worth tracker: a monthly check-in for bank accounts, savings, pensions, property, mortgages, cards and crypto, in any currency, with a shared household view.

Built with Next.js (App Router) + Neon Postgres + Neon Auth, for hosting on Vercel.

---

## Setting it up (about 15 minutes)

You'll need [Node.js](https://nodejs.org) 20 or newer on your computer. Open a terminal **in this folder** for every command below.

> **Tip:** You can also open this folder in Claude Code and paste the set-up prompt Neon gave you. Claude Code can run all of these steps for you, including `npm run build`.

### 1. Install the app's packages

```bash
npm install
```

### 2. Connect the Neon database

These are the commands from your Neon project page:

```bash
npx neon@latest init -y --org-id org-ancient-paper-92700644 --project-id icy-leaf-07931508 --branch production --services postgres
npx neon@latest deploy
```

If a browser window opens asking you to sign in to Neon, finish signing in there. `neon deploy` creates a file called `.env.local` containing `DATABASE_URL`.

### 3. Turn on Neon Auth (email and password login)

1. Open the [Neon Console](https://console.neon.tech) → your **Worthwise** project → **Auth**, and enable it.
2. Copy the **Auth URL** it shows you.
3. Open `.env.local` in a text editor and add two lines (see `.env.example`):

   ```
   NEON_AUTH_BASE_URL=paste-the-auth-url-here
   NEON_AUTH_COOKIE_SECRET=paste-a-long-random-string-here
   ```

   To make the random string, run `openssl rand -base64 32` and copy what it prints.

### 4. Create the database tables

```bash
npm run db:setup
```

This runs `db/schema.sql` and then a check. It should print 8 tables, all with `rls_on: true`, followed by `Accounts visible to a stranger (should be 0): 0`.

*(Alternative: paste the whole of `db/schema.sql` into the Neon **SQL Editor** and press Run, then do the same with `db/check.sql`.)*

### 5. Try it on your computer

```bash
npm run build
npm run dev
```

Open http://localhost:3000. Create an account, add a couple of accounts, then do a check-in.

### 6. Put it online with your own domain

1. Push this folder to a new GitHub repository, the same way as your Vivig and Streaks apps.
2. In [Vercel](https://vercel.com), choose **Add New → Project** and import the repository.
3. Under **Environment Variables**, add `DATABASE_URL`, `NEON_AUTH_BASE_URL` and `NEON_AUTH_COOKIE_SECRET`, copied from `.env.local`.
4. Deploy. Then go to **Settings → Domains** and add your domain, e.g. `worthwise.yourdomain.com`.
5. In Neon's **Auth** settings, add that domain to the list of allowed domains, if it has one, so sign-in works there.

---

## How it works

### The database (plain English)

| Table | What it holds |
|---|---|
| **profiles** | One row per person: name, email, preferred display currency and which household they belong to. |
| **households** | Groups partners together, with an invite code to join. |
| **accounts** | Every account or asset. Each has a type, a currency and a joint flag. Mortgages can link to a property. Debts are stored as negative numbers. |
| **ownership_shares** | Who owns what percentage. An individual account has one row at 100%. A joint one has a row per partner (default 50/50). A property can also list co-owners outside the app, e.g. "Mum 40%". |
| **snapshots** | One balance per account per month, in the account's own currency. |
| **checkins** | One row per person per month: income, and the spending estimate worked out at the time. |
| **property_values** | Each property's monthly market value, and whether it came from the price index or from you. |
| **exchange_rates** | How much of each currency one euro bought that month, so past totals stay accurate. |

### Privacy and security

- Manual entry only. No bank connections and no bank credentials.
- **Row-level security** is switched on for every table. Each web request runs as a restricted database role, `worthwise_app`, with the signed-in user's id attached. The database itself then decides what that person may see:
  - your own accounts;
  - joint accounts in your household;
  - your partner's **total** only. This comes from one function, `household_monthly_summary`, which adds things up and returns a single number per person per month. It never shows their individual accounts.
- Nobody can move themselves into a household by editing their profile. Joining only works through the invite code.

### The maths

- **Your share:** each account counts at your ownership percentage. Joint items are stored once, so the combined total never counts them twice.
- **Equity:** your % of the property's value, minus your share of each mortgage linked to it. Property ownership and mortgage ownership are tracked separately.
- **Currencies:** each balance is converted at that month's rate. Rates come from the European Central Bank via [Frankfurter](https://frankfurter.dev) (free, no key), and are stored with each month.
- **Spending estimate:** income minus the change in bank, non-fixed savings and credit card balances, each counted at your share. Changes are measured in the account's own currency, so exchange-rate swings don't look like spending. Fixed savings, pensions, property and crypto are left out. It's always labelled as an estimate.
- **Portfolio growth:** the change in everything else (pensions, property, crypto, fixed savings, mortgages).
- **Property estimates:** each month, the last known value is moved in line with the official house price index for the area: *new value = last value × latest index ÷ index when that value was set*. You can always type your own figure, and the history of values is kept.
  - UK: [HM Land Registry UK House Price Index](https://landregistry.data.gov.uk/app/ukhpi). The area is a region slug such as `london`, `manchester` or `city-of-edinburgh`.
  - Finland: [Statistics Finland](https://pxdata.stat.fi) price indices for flats (`StatFin/ashi/15iq.px`) and detached houses (`StatFin/kihi/15hx.px`). The area is a name such as `Helsinki`. If no area matches, the whole country is used. If Statistics Finland renames these tables, set `FI_APARTMENTS_TABLE` / `FI_HOUSES_TABLE` in the environment variables.
  - A paid per-address valuation API could be added later in `lib/external.ts` (`fetchPriceIndex`).
- **Crypto:** if you enter the number of coins, the value is worked out from the [CoinGecko](https://www.coingecko.com) price at check-in.
- **Suggestions:** simple rules in `lib/core/suggestions.ts`. They cover idle cash, a thin emergency buffer, card debt alongside savings, the crypto share of assets, spending compared with income, growth compared with spending, and a missing pension. Each one carries a "general information, not financial advice" note.

### Monthly check-in

The dashboard shows a reminder banner until you've checked in for the current month. On the check-in page you can choose any past month, which is how you'll add history from your Excel sheets (each month is saved with that month's exchange rates).

---

## Project map

```
app/
  page.tsx                 landing page
  auth/                    sign in / sign up (Neon Auth)
  api/auth/[...path]/      Neon Auth API route
  (app)/dashboard/         totals, trend, spending vs growth, breakdown, equity, suggestions
  (app)/check-in/          monthly check-in form + save
  (app)/accounts/          list, add, edit, close, delete
  (app)/household/         create / join / leave household
  (app)/settings/          name and display currency
components/                charts (plain SVG, no chart library) and navigation
lib/
  db.ts                    database connection; every query runs under row-level security
  session.ts               signed-in user + profile
  data.ts                  database queries
  external.ts              exchange rates, crypto prices, house price indices
  valuation.ts             property estimate logic
  dashboard.ts             turns data into dashboard figures
  core/                    pure maths, constants and suggestion rules (unit-tested)
db/
  schema.sql               full database setup (safe to run again)
  check.sql                confirms the setup worked
  test_rls.sql             security test scenario used during development
tests/                     unit tests: npm test
```

## Later (after the MVP)

- Bulk import of past months from the Excel sheets (single past months can already be entered on the check-in page).
- Email reminders for the monthly check-in (for example a Vercel Cron job plus an email service).
