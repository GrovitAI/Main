const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB5aWtybHFkdWFtcG9vbmNwenJpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzODIxODUsImV4cCI6MjA5NDk1ODE4NX0.STg6C9ZIeIxo76ZLWy9Q1itDgkwjkw2fAJ3BSVB44mg';
const baseUrl = 'https://pyikrlqduampooncpzri.supabase.co/rest/v1/';

async function testColumn(tableName, colName) {
  const url = `${baseUrl}${tableName}?select=${colName}&limit=1`;
  try {
    const res = await fetch(url, {
      headers: {
        'apikey': key,
        'Authorization': `Bearer ${key}`
      }
    });
    return res.status === 200;
  } catch (err) {
    return false;
  }
}

async function probeTable(tableName, candidates) {
  console.log(`Probing table '${tableName}'...`);
  const validCols = [];
  for (const col of candidates) {
    const isValid = await testColumn(tableName, col);
    if (isValid) {
      validCols.push(col);
    }
  }
  console.log(`Valid columns for '${tableName}':`, validCols);
}

async function run() {
  const transferRequestsCandidates = [
    'id', 'tenant_id', 'branch_id', 'requesting_branch_id', 'to_branch_id',
    'supplying_branch_id', 'from_branch_id', 'request_number', 'status',
    'notes', 'remarks', 'created_by', 'approved_by', 'approved_at',
    'rejected_by', 'rejected_at', 'created_at', 'updated_at', 'request_date'
  ];

  const transferRequestItemsCandidates = [
    'id', 'tenant_id', 'branch_id', 'request_id', 'transfer_request_id',
    'material_id', 'requested_qty', 'requested_quantity', 'approved_qty',
    'approved_quantity', 'received_qty', 'received_quantity', 'created_at'
  ];

  const dispatchesCandidates = [
    'id', 'tenant_id', 'branch_id', 'request_id', 'transfer_request_id',
    'dispatch_number', 'dispatched_at', 'dispatch_date', 'received_at',
    'status', 'remarks', 'notes', 'created_by', 'created_at', 'updated_at',
    'from_branch_id', 'to_branch_id'
  ];

  const dispatchItemsCandidates = [
    'id', 'tenant_id', 'branch_id', 'dispatch_id', 'material_id',
    'quantity', 'dispatched_quantity', 'received_quantity', 'created_at'
  ];

  const recipesCandidates = [
    'id', 'tenant_id', 'branch_id', 'name', 'description', 'yield_quantity',
    'yield_unit', 'cost_snapshot', 'version_no', 'effective_from',
    'supersedes_recipe_id', 'is_active', 'created_at', 'updated_at'
  ];

  const recipeItemsCandidates = [
    'id', 'recipe_id', 'material_id', 'quantity', 'created_at'
  ];

  await probeTable('inventory_transfer_requests', transferRequestsCandidates);
  await probeTable('inventory_transfer_request_items', transferRequestItemsCandidates);
  await probeTable('inventory_dispatches', dispatchesCandidates);
  await probeTable('inventory_dispatch_items', dispatchItemsCandidates);
  await probeTable('inventory_recipes', recipesCandidates);
  await probeTable('inventory_recipe_items', recipeItemsCandidates);
}

run();
