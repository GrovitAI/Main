const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envContent = fs.readFileSync('.env', 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const parts = line.split('=');
  if (parts.length >= 2) {
    env[parts[0].trim()] = parts.slice(1).join('=').trim().replace(/^['"]|['"]$/g, '');
  }
});

const supabaseUrl = env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function run() {
  const { data, error } = await supabase
    .from('open_orders')
    .select('id, order_name, status, invoice_number, created_at')
    .order('created_at', { ascending: false })
    .limit(10);
    
  if (error) {
    console.error('Error fetching open_orders:', error);
  } else {
    console.log('Recent 10 open_orders:');
    data.forEach(row => {
      console.log(`ID: ${row.id} | Name: ${row.order_name} | Status: ${row.status} | Invoice: ${row.invoice_number} | Created: ${row.created_at}`);
    });
  }
}

run();
