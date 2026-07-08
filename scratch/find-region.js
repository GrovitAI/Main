const { Client } = require('pg');

const regions = [
  'ap-south-1',
  'ap-southeast-1',
  'ap-southeast-2',
  'ap-northeast-1',
  'ap-northeast-2',
  'us-east-1',
  'us-east-2',
  'us-west-1',
  'us-west-2',
  'eu-west-1',
  'eu-west-2',
  'eu-west-3',
  'eu-central-1',
  'eu-north-1',
  'sa-east-1',
  'ca-central-1'
];

const user = 'postgres.pyikrlqduampooncpzri';
const database = 'postgres';
const password = 'pyikrlqduampooncpzri'; // let's try this or another password

async function checkRegion(region) {
  const host = `aws-0-${region}.pooler.supabase.com`;
  
  // First do a DNS lookup to see if the host even exists
  try {
    await new Promise((resolve, reject) => {
      require('dns').lookup(host, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  } catch (err) {
    return { success: false, exists: false, error: 'Host DNS not found' };
  }

  console.log(`Host ${host} exists. Trying connection...`);
  const client = new Client({
    host,
    port: 6543,
    database,
    user,
    password,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log(`SUCCESS! Connected to region: ${region}`);
    await client.query(`SELECT 1;`);
    await client.end();
    return { success: true, exists: true };
  } catch (err) {
    try {
      await client.end();
    } catch (e) {}
    return { success: false, exists: true, error: err.message };
  }
}

async function run() {
  for (const region of regions) {
    const res = await checkRegion(region);
    if (res.exists) {
      console.log(`Region ${region}: Host exists. Error: ${res.error}`);
    }
  }
}

run().catch(console.error);
