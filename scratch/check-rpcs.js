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
  console.log('Checking for RPC functions in the database...');
  
  async function testFunc(name, params) {
    const { data, error } = await supabase.rpc(name, params);
    if (error) {
      console.log(`- RPC ${name}: ${error.code} - ${error.message}`);
    } else {
      console.log(`- RPC ${name}: SUCCESS! Response:`, data);
    }
  }

  // Call with dummy args to check existence (if it exists, it will throw a parameter mismatch or validation error, not a 404 function not found)
  await testFunc('rpc_allocate_sequence', {
    p_tenant_id: 'aaaaaaaa-0000-0000-0000-000000000001',
    p_branch_id: 'bbbbbbbb-0000-0000-0000-000000000001',
    p_sequence_key: 'test_seq_check'
  });

  await testFunc('rpc_confirm_order', {
    p_idempotency_key: '00000000-0000-0000-0000-000000000000',
    p_tenant_id: 'aaaaaaaa-0000-0000-0000-000000000001',
    p_branch_id: 'bbbbbbbb-0000-0000-0000-000000000001',
    p_order_id: '00000000-0000-0000-0000-000000000000',
    p_terminal_id: '00000000-0000-0000-0000-000000000000',
    p_user_id: '00000000-0000-0000-0000-000000000000',
    p_expected_version: 1
  });

  await testFunc('rpc_send_kot', {
    p_idempotency_key: '00000000-0000-0000-0000-000000000000',
    p_tenant_id: 'aaaaaaaa-0000-0000-0000-000000000001',
    p_branch_id: 'bbbbbbbb-0000-0000-0000-000000000001',
    p_order_id: '00000000-0000-0000-0000-000000000000',
    p_terminal_id: '00000000-0000-0000-0000-000000000000',
    p_user_id: '00000000-0000-0000-0000-000000000000'
  });

  await testFunc('rpc_settle_bill', {
    p_idempotency_key: '00000000-0000-0000-0000-000000000000',
    p_tenant_id: 'aaaaaaaa-0000-0000-0000-000000000001',
    p_branch_id: 'bbbbbbbb-0000-0000-0000-000000000001',
    p_bill_id: '00000000-0000-0000-0000-000000000000',
    p_terminal_id: '00000000-0000-0000-0000-000000000000',
    p_user_id: '00000000-0000-0000-0000-000000000000',
    p_payment_type: 'cash',
    p_amount_paise: 0
  });

  await testFunc('rpc_cancel_order', {
    p_idempotency_key: '00000000-0000-0000-0000-000000000000',
    p_tenant_id: 'aaaaaaaa-0000-0000-0000-000000000001',
    p_branch_id: 'bbbbbbbb-0000-0000-0000-000000000001',
    p_order_id: '00000000-0000-0000-0000-000000000000',
    p_terminal_id: '00000000-0000-0000-0000-000000000000',
    p_user_id: '00000000-0000-0000-0000-000000000000',
    p_passcode: '1234',
    p_reason_code: 'TEST',
    p_notes: 'Checking existence'
  });
}

run().catch(console.error);
