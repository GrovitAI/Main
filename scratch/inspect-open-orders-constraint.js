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
  const { data, error } = await supabase.rpc('get_constraints', { table_name: 'open_orders' });
  
  if (error) {
    // If RPC doesn't exist, execute a query on pg_constraint
    console.log('RPC get_constraints not found, trying raw sql check...');
    const { data: rawData, error: rawError } = await supabase
      .from('open_orders')
      .select('status')
      .limit(1);
    
    // Let's run a query to fetch the table constraints using a query that works in PostgreSQL
    // Wait, since we don't have direct SQL client, we can inspect a test update:
    // Let's try updating an order status to 'confirmed' and see if it fails!
    console.log('Testing update status to "confirmed"...');
    const { data: testData, error: testError } = await supabase
      .from('open_orders')
      .update({ status: 'confirmed' })
      .eq('id', '00000000-0000-0000-0000-000000000000'); // Dummy UUID
      
    if (testError) {
      console.error('Update test error:', testError);
    } else {
      console.log('Update test success (no constraint failure for confirmed)');
    }
  } else {
    console.log('Constraints:', data);
  }
}

run();
