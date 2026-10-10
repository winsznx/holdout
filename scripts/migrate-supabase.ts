import { readFileSync, readdirSync } from 'node:fs';
import pg from 'pg';

const url = process.env.SUPABASE_DB_URL;
if (!url) throw new Error('SUPABASE_DB_URL is required');
const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();
for (const f of readdirSync('supabase/migrations').sort()) {
  await client.query(readFileSync(`supabase/migrations/${f}`, 'utf8'));
  console.log(`applied ${f}`);
}
const { rows } = await client.query("select table_name from information_schema.tables where table_schema='public' order by 1");
console.log(rows.map((r: { table_name: string }) => r.table_name).join(', '));
await client.end();
