const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const envContent = fs.readFileSync(path.join(__dirname, '../.env'), 'utf8');
const urlMatch = envContent.match(/EXPO_PUBLIC_SUPABASE_URL=(.*)/);
const keyMatch = envContent.match(/EXPO_PUBLIC_SUPABASE_ANON_KEY=(.*)/);

const url = urlMatch ? urlMatch[1].trim() : '';
const key = keyMatch ? keyMatch[1].trim() : '';

const supabase = createClient(url, key);

async function run() {
  const { data: tenants, error: tErr } = await supabase.from('tenants').select('*');
  if (tErr) console.error('Tenant fetch error:', tErr);
  else console.log('Tenants:', tenants);

  const { data: branches, error: bErr } = await supabase.from('branches').select('*');
  if (bErr) console.error('Branch fetch error:', bErr);
  else console.log('Branches:', branches);
}

run().catch(console.error);
