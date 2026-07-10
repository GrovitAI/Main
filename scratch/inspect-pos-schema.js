const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const envContent = fs.readFileSync(path.join(__dirname, '../.env'), 'utf8');
const urlMatch = envContent.match(/EXPO_PUBLIC_SUPABASE_URL=(.*)/);
const keyMatch = envContent.match(/EXPO_PUBLIC_SUPABASE_ANON_KEY=(.*)/);

const url = urlMatch ? urlMatch[1].trim() : '';
const key = keyMatch ? keyMatch[1].trim() : '';

const supabase = createClient(url, key);

async function inspectTable(tableName) {
  console.log(`Inspecting table: ${tableName}...`);
  const { data, error } = await supabase
    .from(tableName)
    .select('*')
    .limit(1);

  if (error) {
    console.error(`Error inspecting ${tableName}:`, error.message);
  } else if (!data || data.length === 0) {
    console.log(`Table ${tableName} is empty, trying to query column names via select keys...`);
    // Querying with select keys to see if we get empty array with keys or not
    const { data: dummy, error: dummyErr } = await supabase
      .from(tableName)
      .select('*')
      .limit(0);
    console.log(`Empty query results keys for ${tableName}:`, dummy ? Object.keys(dummy[0] || {}) : 'no keys');
  } else {
    console.log(`Columns for ${tableName}:`, Object.keys(data[0]));
    console.log(`Sample row:`, data[0]);
  }
}

async function run() {
  await inspectTable('bills');
  await inspectTable('bill_items');
  await inspectTable('settlements');
  await inspectTable('open_orders');
  await inspectTable('open_order_items');
}

run().catch(console.error);
