const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB5aWtybHFkdWFtcG9vbmNwenJpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzODIxODUsImV4cCI6MjA5NDk1ODE4NX0.STg6C9ZIeIxo76ZLWy9Q1itDgkwjkw2fAJ3BSVB44mg';
const baseUrl = 'https://pyikrlqduampooncpzri.supabase.co/rest/v1/';

const tenant_id = 'aaaaaaaa-0000-0000-0000-000000000001';
const supplying_branch_id = 'cccccccc-0000-0000-0000-000000000001'; // Central Kitchen
const requesting_branch_id = 'bbbbbbbb-0000-0000-0000-000000000001'; // Main branch
const material_id = '55cc5e50-ca03-4acc-af35-47a8d5b7e3a7';

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
  try {
    console.log('--- STARTING INTERACTION EMULATION ---');

    // 1. Create a dummy request to dispatch against (only valid columns)
    const requestId = uuid();
    const now = new Date().toISOString();
    console.log('Creating transfer request...');
    await request('POST', 'inventory_transfer_requests', {
      id: requestId,
      tenant_id,
      requesting_branch_id,
      supplying_branch_id,
      status: 'Approved',
      notes: 'Test dispatch request',
      request_number: `TRF-TEST-${Math.floor(1000 + Math.random() * 9000)}`
    });

    console.log('Inserting request item...');
    await request('POST', 'inventory_transfer_request_items', {
      request_id: requestId,
      material_id,
      requested_qty: 10,
      approved_qty: 10
    });

    // 2. Now run the createDispatch queries
    const dispatchId = uuid();
    console.log('\n--- Q1: Inserting dispatch... ---');
    const dispPayload = {
      id: dispatchId,
      request_id: requestId,
      dispatch_number: `DSP-TEST-${Math.floor(1000 + Math.random() * 9000)}`,
      dispatched_at: now,
      status: 'Dispatched'
    };
    const [dispData] = await request('POST', 'inventory_dispatches', dispPayload, 'return=representation');
    console.log('Dispatch inserted successfully:', dispData);

    // Q2: Fetch stock levels
    console.log('\n--- Q2: Fetching stock levels... ---');
    const stockUrl = `inventory_material_stock_levels?tenant_id=eq.${tenant_id}&branch_id=eq.${supplying_branch_id}&material_id=eq.${material_id}`;
    const stockLevels = await request('GET', stockUrl);
    console.log('Stock levels fetched:', stockLevels);

    if (stockLevels.length > 0) {
      // Q3: Update stock level
      console.log('\n--- Q3: Updating stock level... ---');
      const stockId = stockLevels[0].id;
      await request('PATCH', `inventory_material_stock_levels?id=eq.${stockId}`, {
        reserved_stock: 0,
        current_stock: 40,
        available_stock: 40,
        updated_at: now
      });
      console.log('Stock level updated successfully');
    }

    // Q4: Fetch average cost
    console.log('\n--- Q4: Fetching material cost... ---');
    const [material] = await request('GET', `inventory_materials?id=eq.${material_id}`);
    console.log('Material cost info:', material);

    // Q5: Insert stock ledger
    console.log('\n--- Q5: Inserting stock ledger... ---');
    const ledgerPayload = {
      tenant_id,
      branch_id: supplying_branch_id,
      material_id,
      transaction_date: now,
      transaction_type: 'Transfer Out',
      reference_type: 'Dispatch Invoice',
      reference_id: dispatchId,
      qty_in: 0,
      qty_out: 8,
      balance_stock: 40,
      unit_cost: Number(material.average_cost) || 0,
      total_value: 40 * (Number(material.average_cost) || 0),
      remarks: `Dispatched to branch. Dispatch No: ${dispData.dispatch_number}`,
      created_by: 'Central Kitchen Staff'
    };
    await request('POST', 'inventory_stock_ledger', ledgerPayload);
    console.log('Stock ledger entry inserted successfully');

    // Q6: Insert dispatch items
    console.log('\n--- Q6: Inserting dispatch items... ---');
    const dispatchItemsPayload = [{
      dispatch_id: dispatchId,
      material_id,
      quantity: 8
    }];
    await request('POST', 'inventory_dispatch_items', dispatchItemsPayload);
    console.log('Dispatch items inserted successfully');

    // Q7: Update request status
    console.log('\n--- Q7: Updating request status... ---');
    await request('PATCH', `inventory_transfer_requests?id=eq.${requestId}`, {
      status: 'Dispatched',
      updated_at: now
    });
    console.log('Request status updated successfully');

    // Q8: Insert transfer event
    console.log('\n--- Q8: Inserting transfer event... ---');
    const eventPayload = {
      tenant_id,
      branch_id: supplying_branch_id,
      transfer_request_id: requestId,
      event_type: 'Dispatched',
      performed_by: 'Central Kitchen Staff',
      notes: 'Items dispatched. Status set to Dispatched.'
    };
    await request('POST', 'inventory_transfer_events', eventPayload);
    console.log('Transfer event inserted successfully');

    // 3. Now run the receiveDispatch queries to check if receipt works
    console.log('\n--- Q9: Updating dispatch to Received... ---');
    await request('PATCH', `inventory_dispatches?id=eq.${dispatchId}`, {
      status: 'Received',
      received_at: now
    });
    console.log('Dispatch status updated to Received');

    console.log('\n--- Q10: Fetching request item for update... ---');
    const [reqItem] = await request('GET', `inventory_transfer_request_items?request_id=eq.${requestId}&material_id=eq.${material_id}`);
    console.log('Request item fetched:', reqItem);

    console.log('\n--- Q11: Updating request item received_qty... ---');
    await request('PATCH', `inventory_transfer_request_items?id=eq.${reqItem.id}`, {
      received_qty: (Number(reqItem.received_qty) || 0) + 8
    });
    console.log('Request item received_qty updated successfully');

    console.log('\n--- Q12: Fetching requesting branch stock levels... ---');
    const destStockUrl = `inventory_material_stock_levels?tenant_id=eq.${tenant_id}&branch_id=eq.${requesting_branch_id}&material_id=eq.${material_id}`;
    const destStockLevels = await request('GET', destStockUrl);
    console.log('Destination stock levels:', destStockLevels);

    if (destStockLevels.length > 0) {
      console.log('\n--- Q13: Updating destination stock level... ---');
      await request('PATCH', `inventory_material_stock_levels?id=eq.${destStockLevels[0].id}`, {
        current_stock: (Number(destStockLevels[0].current_stock) || 0) + 8,
        available_stock: ((Number(destStockLevels[0].current_stock) || 0) + 8) - (Number(destStockLevels[0].reserved_stock) || 0),
        updated_at: now
      });
      console.log('Destination stock level updated successfully');
    } else {
      console.log('\n--- Q13: Inserting new destination stock level... ---');
      await request('POST', 'inventory_material_stock_levels', {
        tenant_id,
        branch_id: requesting_branch_id,
        material_id,
        location_id: 'Main Storage',
        current_stock: 8,
        reserved_stock: 0,
        available_stock: 8
      });
      console.log('Destination stock level inserted successfully');
    }

    console.log('\n--- Q14: Inserting receiving stock ledger... ---');
    await request('POST', 'inventory_stock_ledger', {
      tenant_id,
      branch_id: requesting_branch_id,
      material_id,
      transaction_date: now,
      transaction_type: 'Transfer In',
      reference_type: 'Receipt Invoice',
      reference_id: dispatchId,
      qty_in: 8,
      qty_out: 0,
      balance_stock: 8,
      unit_cost: Number(material.average_cost) || 0,
      total_value: 8 * (Number(material.average_cost) || 0),
      remarks: `Received from branch. Dispatch No: DSP-TEST`,
      created_by: 'Branch Staff'
    });
    console.log('Receiving stock ledger inserted successfully');

    console.log('\n--- Q15: Updating request status to Completed... ---');
    await request('PATCH', `inventory_transfer_requests?id=eq.${requestId}`, {
      status: 'Completed',
      updated_at: now
    });
    console.log('Request status updated to Completed');

    console.log('\n--- Q16: Inserting Received transfer event... ---');
    await request('POST', 'inventory_transfer_events', {
      tenant_id,
      branch_id: requesting_branch_id,
      transfer_request_id: requestId,
      event_type: 'Received',
      performed_by: 'Branch Staff',
      notes: 'Goods received. Status set to Completed.'
    });
    console.log('Received transfer event inserted successfully');

    console.log('\n--- ALL EMULATION STEPS PASSED SUCCESSFULLY! ---');

  } catch (err) {
    console.error('\n!!! ERROR OCCURRED !!!');
    console.error(err.message);
  }
}

run();
