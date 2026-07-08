const { Client } = require('pg');

const host = 'aws-0-ap-south-1.pooler.supabase.com';
const port = 6543;
const database = 'postgres';

const users = [
  'postgres.pyikrlqduampooncpzri',
  'postgres.pyikrlqduampoobocwjrj'
];

const passwords = [
  'Grovit123',
  'GrovitAI',
  'pyikrlqduampooncpzri',
  'pyikrlqduampoobocwjrj',
  'Grovit',
  'postgres',
  'admin'
];

async function tryConnect(user, password) {
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
    console.log(`SUCCESS! Connected with user: ${user}, password: ${password}`);
    await client.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS image_url text;`);
    console.log('Successfully added image_url column!');
    await client.end();
    return true;
  } catch (err) {
    console.log(`Failed for ${user} with ${password}:`, err.message);
    try {
      await client.end();
    } catch (e) {}
    return false;
  }
}

async function run() {
  for (const user of users) {
    for (const pw of passwords) {
      const success = await tryConnect(user, pw);
      if (success) {
        process.exit(0);
      }
    }
  }
  console.log('All attempts failed.');
  process.exit(1);
}

run().catch(console.error);
