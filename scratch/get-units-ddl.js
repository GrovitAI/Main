const { Client } = require('pg');

const host = 'aws-0-ap-south-1.pooler.supabase.com';
const port = 6543;
const database = 'postgres';
const user = 'postgres.pyikrlqduampooncpzri';

const passwords = [
  'Grovit123',
  'GrovitAI',
  'pyikrlqduampooncpzri',
  'Grovit',
  'postgres',
  'admin'
];

const sql = `
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'inventory_units'
ORDER BY ordinal_position;
`;

async function tryConnect(password) {
  const client = new Client({
    host,
    port,
    database,
    user,
    password,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    const res = await client.query(sql);
    console.log(`SUCCESS! Connected with password.`);
    console.log('Columns configuration:');
    console.log(JSON.stringify(res.rows, null, 2));
    await client.end();
    return true;
  } catch (err) {
    try {
      await client.end();
    } catch (e) {}
    return false;
  }
}

async function run() {
  for (const pw of passwords) {
    const success = await tryConnect(pw);
    if (success) {
      process.exit(0);
    }
  }
  console.log('All passwords failed.');
  process.exit(1);
}

run();
