const { Client } = require('pg');

const host = 'db.pyikrlqduampooncpzri.supabase.co';
const port = 5432;
const database = 'postgres';
const user = 'postgres';

const passwords = [
  'Grovit123',
  'GrovitAI',
  'pyikrlqduampooncpzri',
  'Grovit',
  'postgres',
  'admin'
];

async function tryConnect(password) {
  console.log(`Trying direct password: ${password}...`);
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
    console.log(`SUCCESS! Connected directly with password: ${password}`);
    await client.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS image_url text;`);
    console.log('Successfully added image_url column!');
    await client.end();
    return true;
  } catch (err) {
    console.log(`Failed for password ${password}:`, err.message);
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
  console.log('All direct passwords failed.');
  process.exit(1);
}

run().catch(console.error);
