// Query via the service_role key to bypass RLS and inspect the real schema
// We'll query each table via Supabase REST to get their columns
const fs = require('fs');
const path = require('path');

const envContent = fs.readFileSync(path.join(__dirname, '../.env'), 'utf8');
const urlMatch = envContent.match(/EXPO_PUBLIC_SUPABASE_URL=(.*)/);
const keyMatch = envContent.match(/EXPO_PUBLIC_SUPABASE_ANON_KEY=(.*)/);

const url = urlMatch ? urlMatch[1].trim() : '';
const anonKey = keyMatch ? keyMatch[1].trim() : '';

// Tables from PROJECT_CONTEXT.md
const tables = [
  'tenants', 'branches', 'staff', 'categories', 'products',
  'open_orders', 'open_order_items', 'kots', 'kot_items',
  'bills', 'bill_items', 'settlements', 'expenses',
  'tax_configs', 'tenant_features', 'subscriptions', 'settings', 'printers'
];

async function inspectTable(tableName) {
  const res = await fetch(`${url}/rest/v1/${tableName}?limit=1`, {
    headers: {
      'apikey': anonKey,
      'Authorization': `Bearer ${anonKey}`,
      'Accept': 'application/json'
    }
  });
  const status = res.status;
  if (status === 200) {
    const data = await res.json();
    const cols = data.length > 0 ? Object.keys(data[0]) : [];
    return { status, cols, note: cols.length === 0 ? '(empty - no rows)' : '' };
  } else {
    const err = await res.json().catch(() => ({}));
    return { status, cols: [], note: err.message || err.code || 'error' };
  }
}

async function run() {
  console.log('Inspecting tables reachable by anon key:\n');
  for (const t of tables) {
    const result = await inspectTable(t);
    if (result.status === 200) {
      console.log(`✅ ${t}: ${result.cols.length ? result.cols.join(', ') : result.note}`);
    } else {
      console.log(`❌ ${t} [${result.status}]: ${result.note}`);
    }
  }
}

run().catch(console.error);
