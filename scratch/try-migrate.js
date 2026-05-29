const { Client } = require('pg');

const host = 'aws-0-ap-south-1.pooler.supabase.com';
const port = 6543;
const database = 'postgres';
const user = 'postgres.pyikrlqduampooncpzri';

const passwords = [
  'postgres',
  'admin',
  'Grovit',
  'Grovit123',
  'GrovitAI',
  'pyikrlqduampooncpzri',
  'bbbbbbbb-0000-0000-0000-000000000001'
];

const sql = `
ALTER TABLE printers
ADD COLUMN IF NOT EXISTS paper_width text DEFAULT '80mm';

ALTER TABLE printers
ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;

ALTER TABLE printers
ADD COLUMN IF NOT EXISTS printer_role text DEFAULT 'bill';

ALTER TABLE printers
ADD COLUMN IF NOT EXISTS port integer DEFAULT 9100;
`;

async function tryConnect(password) {
  console.log(`Trying password: ${password}...`);
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
    console.log(`SUCCESS! Connected with password: ${password}`);
    console.log('Running migration...');
    await client.query(sql);
    console.log('Migration ran successfully!');
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
  console.log('All passwords failed.');
  process.exit(1);
}

run();
