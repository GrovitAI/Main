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
  const billsCandidates = [
    'id', 'tenant_id', 'branch_id', 'order_id', 'open_order_id', 
    'bill_number', 'invoice_number', 'total_amount', 'amount', 
    'subtotal', 'tax', 'tax_amount', 'discount_amount', 'status', 
    'created_at', 'updated_at', 'paid_at', 'settled_at', 'payment_method',
    'created_by'
  ];

  const billItemsCandidates = [
    'id', 'bill_id', 'product_id', 'item_name', 'name', 
    'price', 'qty', 'quantity', 'total', 'created_at', 'updated_at',
    'notes', 'kot_item_id'
  ];

  const settlementsCandidates = [
    'id', 'tenant_id', 'branch_id', 'bill_id', 'amount', 
    'payment_method', 'payment_type', 'reference', 'notes', 
    'settled_at', 'created_at', 'updated_at'
  ];

  await probeTable('bills', billsCandidates);
  await probeTable('bill_items', billItemsCandidates);
  await probeTable('settlements', settlementsCandidates);
}

run();
