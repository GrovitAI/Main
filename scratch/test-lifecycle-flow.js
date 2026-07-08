const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB5aWtybHFkdWFtcG9vbmNwenJpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzODIxODUsImV4cCI6MjA5NDk1ODE4NX0.STg6C9ZIeIxo76ZLWy9Q1itDgkwjkw2fAJ3BSVB44mg';
const baseUrl = 'https://pyikrlqduampooncpzri.supabase.co/rest/v1/';

const TENANT_ID = 'aaaaaaaa-0000-0000-0000-000000000001';
const MAIN_BRANCH_ID = 'bbbbbbbb-0000-0000-0000-000000000001'; // Restaurant
const CK_BRANCH_ID = 'cccccccc-0000-0000-0000-000000000001';   // Supplying Branch
const MATERIAL_ID = '55cc5e50-ca03-4acc-af35-47a8d5b7e3a7';

// Generate UUIDs
function uuid() {
  return 'f' + Math.random().toString(16).substr(2, 31).padStart(31, '0');
}

async function request(method, path, body, prefer = '') {
  const headers = {
    'apikey': key,
    'Authorization': `Bearer ${key}`,
    'Content-Type': 'application/json'
  };
  if (prefer) {
    headers['Prefer'] = prefer;
  }
  const url = `${baseUrl}${path}`;
  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status} on ${method} ${path}: ${text}`);
  }
  if (method === 'GET' || prefer.includes('return=representation')) {
    return await res.json();
  }
  return null;
}

async function run() {
  console.log('--- STARTING DATABASE LIFECYCLE FLOW TEST ---');

  const requestId = uuid();
  const dispatchId = uuid();
  const dispatchItemId = uuid();
  const varianceId = uuid();
  const eventId1 = uuid();
  const eventId2 = uuid();
  const eventId3 = uuid();
  const now = new Date().toISOString();

  // 1. Clean up old test data
  console.log('\nStep 1: Cleaning up old test records...');
  await request('DELETE', 'inventory_transfer_events?tenant_id=eq.' + TENANT_ID);
  await request('DELETE', 'inventory_transfer_variances?tenant_id=eq.' + TENANT_ID);
  await request('DELETE', 'inventory_stock_ledger?tenant_id=eq.' + TENANT_ID);
  await request('DELETE', 'inventory_transfer_request_items?material_id=eq.' + MATERIAL_ID);
  await request('DELETE', 'inventory_transfer_requests?tenant_id=eq.' + TENANT_ID);
  await request('DELETE', 'inventory_material_stock_levels?tenant_id=eq.' + TENANT_ID);
  console.log('Cleanup completed!');

  // 2. Initialize Central Kitchen Stock
  console.log('\nStep 2: Initializing Central Kitchen stock levels (current=50, reserved=0, available=50)...');
  await request('POST', 'inventory_material_stock_levels', {
    tenant_id: TENANT_ID,
    branch_id: CK_BRANCH_ID,
    material_id: MATERIAL_ID,
    location_id: 'Main Storage',
    current_stock: 50,
    reserved_stock: 0,
    available_stock: 50
  });

  // 3. Create Transfer Request
  console.log('\nStep 3: Creating Transfer Request for 10 units...');
  const reqNum = `TRF-2026-${Math.floor(1000 + Math.random() * 9000)}`;
  const [reqObj] = await request('POST', 'inventory_transfer_requests', {
    id: requestId,
    tenant_id: TENANT_ID,
    requesting_branch_id: MAIN_BRANCH_ID,
    supplying_branch_id: CK_BRANCH_ID,
    status: 'Pending',
    notes: 'Weekend stocking request',
    request_number: reqNum
  }, 'return=representation');
  console.log(`Request created: ID=${reqObj.id}, Number=${reqObj.request_number}, Status=${reqObj.status}`);

  await request('POST', 'inventory_transfer_request_items', {
    request_id: requestId,
    material_id: MATERIAL_ID,
    requested_qty: 10,
    approved_qty: null,
    received_qty: null
  });
  console.log('Request item inserted.');

  // 4. Approve Transfer Request
  console.log('\nStep 4: Approving Transfer Request...');
  await request('PATCH', 'inventory_transfer_requests?id=eq.' + requestId, {
    status: 'Approved',
    approved_by: TENANT_ID, // Use Tenant ID as a dummy staff UUID
    approved_at: now
  });

  await request('PATCH', `inventory_transfer_request_items?request_id=eq.${requestId}&material_id=eq.${MATERIAL_ID}`, {
    approved_qty: 10
  });

  // Update CK stock level (reserved=10, available=40)
  await request('PATCH', `inventory_material_stock_levels?branch_id=eq.${CK_BRANCH_ID}&material_id=eq.${MATERIAL_ID}`, {
    reserved_stock: 10,
    available_stock: 40
  });

  // Log Approve Event
  await request('POST', 'inventory_transfer_events', {
    id: eventId1,
    tenant_id: TENANT_ID,
    branch_id: CK_BRANCH_ID,
    transfer_request_id: requestId,
    event_type: 'Approved',
    performed_by: 'Owner Staff',
    notes: 'Approved 10 units'
  });
  console.log('Request approved, stock reserved, event logged.');

  // 5. Create Dispatch (8 units)
  console.log('\nStep 5: Creating Dispatch of 8 units...');
  const dispNum = `DSP-2026-${Math.floor(1000 + Math.random() * 9000)}`;
  const [dispObj] = await request('POST', 'inventory_dispatches', {
    id: dispatchId,
    request_id: requestId,
    dispatched_at: now,
    status: 'Dispatched',
    dispatch_number: dispNum
  }, 'return=representation');
  console.log(`Dispatch created: ID=${dispObj.id}, Number=${dispObj.dispatch_number}, Status=${dispObj.status}`);

  await request('POST', 'inventory_dispatch_items', {
    id: dispatchItemId,
    dispatch_id: dispatchId,
    material_id: MATERIAL_ID,
    quantity: 8
  });

  // Update CK stock level (current=42, reserved=2, available=40)
  await request('PATCH', `inventory_material_stock_levels?branch_id=eq.${CK_BRANCH_ID}&material_id=eq.${MATERIAL_ID}`, {
    current_stock: 42,
    reserved_stock: 2,
    available_stock: 40
  });

  // Log Ledger Entry (Transfer Out)
  await request('POST', 'inventory_stock_ledger', {
    tenant_id: TENANT_ID,
    branch_id: CK_BRANCH_ID,
    material_id: MATERIAL_ID,
    transaction_date: now,
    transaction_type: 'Transfer Out',
    reference_type: 'Dispatch Invoice',
    reference_id: dispatchId,
    qty_in: 0,
    qty_out: 8,
    balance_stock: 42,
    unit_cost: 120.00,
    total_value: 42 * 120.00,
    remarks: `Dispatched. Dispatch No: ${dispObj.dispatch_number}`,
    created_by: 'CK Manager'
  });

  // Update Request Status to Partially Dispatched
  await request('PATCH', 'inventory_transfer_requests?id=eq.' + requestId, {
    status: 'Partially Dispatched'
  });

  // Log Dispatch Event
  await request('POST', 'inventory_transfer_events', {
    id: eventId2,
    tenant_id: TENANT_ID,
    branch_id: CK_BRANCH_ID,
    transfer_request_id: requestId,
    event_type: 'Dispatched',
    performed_by: 'CK Manager',
    notes: 'Dispatched 8 units'
  });
  console.log('Dispatch processed, stock adjusted, ledger out written, event logged.');

  // 6. Receive Dispatch (7 units received, 1 variance)
  console.log('\nStep 6: Receiving Dispatch at Main Branch (7 units, 1 variance/loss)...');
  await request('PATCH', 'inventory_dispatches?id=eq.' + dispatchId, {
    status: 'Received',
    received_at: now
  });

  // Update request item received_qty
  await request('PATCH', `inventory_transfer_request_items?request_id=eq.${requestId}&material_id=eq.${MATERIAL_ID}`, {
    received_qty: 7
  });

  // Create Main Branch Stock Level (current=7, reserved=0, available=7)
  await request('POST', 'inventory_material_stock_levels', {
    tenant_id: TENANT_ID,
    branch_id: MAIN_BRANCH_ID,
    material_id: MATERIAL_ID,
    location_id: 'Main Storage',
    current_stock: 7,
    reserved_stock: 0,
    available_stock: 7
  });

  // Log Ledger Entry (Transfer In)
  await request('POST', 'inventory_stock_ledger', {
    tenant_id: TENANT_ID,
    branch_id: MAIN_BRANCH_ID,
    material_id: MATERIAL_ID,
    transaction_date: now,
    transaction_type: 'Transfer In',
    reference_type: 'Receipt Invoice',
    reference_id: dispatchId,
    qty_in: 7,
    qty_out: 0,
    balance_stock: 7,
    unit_cost: 120.00,
    total_value: 7 * 120.00,
    remarks: `Received. Dispatch No: ${dispObj.dispatch_number}`,
    created_by: 'Main Branch Cashier'
  });

  // Create Variance Record
  await request('POST', 'inventory_transfer_variances', {
    id: varianceId,
    tenant_id: TENANT_ID,
    branch_id: MAIN_BRANCH_ID,
    dispatch_item_id: dispatchItemId,
    material_id: MATERIAL_ID,
    dispatched_qty: 8,
    received_qty: 7,
    variance_qty: 1,
    reason: 'Damaged in transit'
  });

  // Update Request Status to Partially Received
  await request('PATCH', 'inventory_transfer_requests?id=eq.' + requestId, {
    status: 'Partially Received'
  });

  // Log Receipt Event
  await request('POST', 'inventory_transfer_events', {
    id: eventId3,
    tenant_id: TENANT_ID,
    branch_id: MAIN_BRANCH_ID,
    transfer_request_id: requestId,
    event_type: 'Received',
    performed_by: 'Main Branch Cashier',
    notes: 'Received 7 units, 1 variance'
  });
  console.log('Receipt processed, stock added, ledger in written, variance logged, event logged.');

  // 7. Verify Data State in Database
  console.log('\nStep 7: Verifying records in database...');
  const reqs = await request('GET', `inventory_transfer_requests?id=eq.${requestId}`);
  console.log('Final Transfer Request:', reqs[0]);

  const reqItems = await request('GET', `inventory_transfer_request_items?request_id=eq.${requestId}`);
  console.log('Final Request Items:', reqItems[0]);

  const disps = await request('GET', `inventory_dispatches?id=eq.${dispatchId}`);
  console.log('Final Dispatch:', disps[0]);

  const dispItems = await request('GET', `inventory_dispatch_items?dispatch_id=eq.${dispatchId}`);
  console.log('Final Dispatch Items:', dispItems[0]);

  const stockLvls = await request('GET', `inventory_material_stock_levels?tenant_id=eq.${TENANT_ID}`);
  console.log('Final Branch Stock Levels:', stockLvls);

  const variances = await request('GET', `inventory_transfer_variances?tenant_id=eq.${TENANT_ID}`);
  console.log('Final Variances:', variances);

  const ledger = await request('GET', `inventory_stock_ledger?tenant_id=eq.${TENANT_ID}`);
  console.log('Final Ledger Entries:', ledger);

  const events = await request('GET', `inventory_transfer_events?transfer_request_id=eq.${requestId}`);
  console.log('Final Events Logged:', events.map(e => `${e.event_type}: ${e.notes}`));

  console.log('\n--- LIFECYCLE FLOW TEST COMPLETED SUCCESSFULLY ---');
}

run().catch(console.error);
