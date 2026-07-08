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
  const variancesCandidates = [
    'id', 'tenant_id', 'branch_id', 'dispatch_item_id', 'material_id',
    'dispatched_qty', 'received_qty', 'variance_qty', 'reason', 'created_at'
  ];

  const eventsCandidates = [
    'id', 'tenant_id', 'branch_id', 'transfer_request_id', 'event_type',
    'performed_by', 'notes', 'created_at'
  ];

  await probeTable('inventory_transfer_variances', variancesCandidates);
  await probeTable('inventory_transfer_events', eventsCandidates);
}

run();
