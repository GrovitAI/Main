const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const envFile = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8');
const envVars = {};
envFile.split('\n').forEach(line => {
  const parts = line.split('=');
  if (parts.length >= 2) {
    envVars[parts[0].trim()] = parts.slice(1).join('=').trim();
  }
});

const supabaseUrl = envVars.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = envVars.EXPO_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseAnonKey);

const tenant_id = 'aaaaaaaa-0000-0000-0000-000000000001';
const branch_id = 'bbbbbbbb-0000-0000-0000-000000000001';

async function testInsert() {
  const payload = {
    tenant_id,
    branch_id,
    name: 'Test Printer',
    type: 'epson_thermal',
    connection: 'printnode',
    ip_address: '75621305',
    port: 9100,
    paper_width: '80mm',
    printer_role: 'bill',
    is_default: true,
    is_active: true
  };

  const { data, error } = await supabase.from('printers').insert(payload).select('*');
  if (error) {
    console.error("Insert failed:", error);
  } else {
    console.log("Insert succeeded:", data);
  }
}

testInsert();
