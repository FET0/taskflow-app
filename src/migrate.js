const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const sql = fs.readFileSync(path.join(__dirname, '..', 'migrations', '001_init.sql'), 'utf8');
  await client.query(sql);
  await client.end();
  console.log('Database migration completed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
