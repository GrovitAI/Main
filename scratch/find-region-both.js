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
  'ca-central-1',
  'me-central-1',
  'af-south-1'
];

const refs = [
  'pyikrlqduampooncpzri',
  'pyikrlqduampoobocwjrj'
];

async function check(region, ref) {
  const host = `aws-0-${region}.pooler.supabase.com`;
  const user = `postgres.${ref}`;
  const password = ref; // try using ref itself as password guess or check error message
  
  // First do a DNS lookup to see if the host even exists
  try {
    await new Promise((resolve, reject) => {
      require('dns').lookup(host, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  } catch (err) {
    return;
  }

  const client = new Client({
    host,
    port: 6543,
    database: 'postgres',
    user,
    password,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log(`SUCCESS! Connected to region: ${region} with ref: ${ref}`);
    await client.end();
    return true;
  } catch (err) {
    try {
      await client.end();
    } catch (e) {}
    
    // If it's NOT "tenant/user not found", then the tenant was found on this region!
    if (!err.message.includes('not found')) {
      console.log(`FOUND TENANT! Region: ${region}, Ref: ${ref}. Connection error: ${err.message}`);
      return true;
    }
    return false;
  }
}

async function run() {
  for (const region of regions) {
    for (const ref of refs) {
      await check(region, ref);
    }
  }
  console.log('Scan complete.');
}

run().catch(console.error);
