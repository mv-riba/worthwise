// Alternative to the Neon SQL Editor: runs db/schema.sql against DATABASE_URL.
//   npm run db:setup
import { readFileSync, existsSync } from 'node:fs';
import pg from 'pg';

for (const f of ['.env.local', '.env']) {
  if (!existsSync(f)) continue;
  for (const line of readFileSync(f, 'utf8').split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
}
if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set. Run `neon deploy` first or add it to .env.local');
  process.exit(1);
}
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
client.on('notice', () => {});
await client.query(readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf8'));
const r = await client.query(readFileSync(new URL('../db/check.sql', import.meta.url), 'utf8'));
const results = Array.isArray(r) ? r : [r];
console.table(results[0].rows);
const stranger = results.find((x) => x.rows?.[0] && 'accounts_visible_to_a_stranger' in x.rows[0]);
console.log('Accounts visible to a stranger (should be 0):', stranger?.rows[0].accounts_visible_to_a_stranger);
await client.end();
console.log('✅ Worthwise database is set up.');
