// Creates (or refreshes) a separate database login just for the live website.
//
//   npm run db:web-role
//
// The website then connects as `worthwise_web`, which has NO permissions of its
// own: it can only switch into the restricted `worthwise_app` role, where
// row-level security applies. Your main (owner) connection string stays on your
// computer for `npm run db:setup` only.
//
// Running it again makes a new password (the old one stops working), so you
// can also use it to rotate the password.
import { readFileSync, existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import pg from 'pg';

for (const f of ['.env.local', '.env']) {
  if (!existsSync(f)) continue;
  for (const line of readFileSync(f, 'utf8').split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
}
const ownerUrl = process.env.DATABASE_URL;
if (!ownerUrl) {
  console.error('DATABASE_URL is not set in .env.local');
  process.exit(1);
}
if (new URL(ownerUrl).username === 'worthwise_web') {
  console.error('DATABASE_URL in .env.local is already the website login. Put your main (owner) connection string there first.');
  process.exit(1);
}

const password = randomBytes(30).toString('base64url'); // ~240 bits, letters/digits/-/_ only
const client = new pg.Client({ connectionString: ownerUrl });
await client.connect();
const exists = (await client.query("select 1 from pg_roles where rolname = 'worthwise_web'")).rowCount > 0;
await client.query(
  exists
    ? `alter role worthwise_web with login noinherit nocreatedb nocreaterole password '${password}'`
    : `create role worthwise_web with login noinherit nocreatedb nocreaterole password '${password}'`,
);
await client.query('grant worthwise_app to worthwise_web');
await client.query(`grant connect on database "${(await client.query('select current_database() as d')).rows[0].d}" to worthwise_web`);
await client.end();

const webUrl = new URL(ownerUrl);
webUrl.username = 'worthwise_web';
webUrl.password = password;

// Check it works – and that it can't read anything without the restricted role.
const test = new pg.Client({ connectionString: webUrl.toString() });
await test.connect();
let blocked = false;
try {
  await test.query('select count(*) from accounts');
} catch {
  blocked = true;
}
await test.query('begin');
await test.query('set local role worthwise_app');
const visible = (await test.query('select count(*)::int as n from accounts')).rows[0].n;
await test.query('rollback');
await test.end();

console.log('\n✅ Website login ready.');
console.log(`   Direct access to tables blocked: ${blocked ? 'yes' : 'NO – please tell Claude'}`);
console.log(`   Accounts visible with no user signed in: ${visible} (should be 0)\n`);
console.log('Copy this into Vercel → Settings → Environment Variables → DATABASE_URL (Production), then redeploy:\n');
console.log(webUrl.toString());
console.log('\nKeep it secret. Don’t put it in GitHub or in .env.local.\n');
