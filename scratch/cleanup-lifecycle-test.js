const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB5aWtybHFkdWFtcG9vbmNwenJpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzODIxODUsImV4cCI6MjA5NDk1ODE4NX0.STg6C9ZIeIxo76ZLWy9Q1itDgkwjkw2fAJ3BSVB44mg';
const baseUrl = 'https://pyikrlqduampooncpzri.supabase.co/rest/v1/';

const TENANT_ID = 'aaaaaaaa-0000-0000-0000-000000000001';
const MATERIAL_ID = '55cc5e50-ca03-4acc-af35-47a8d5b7e3a7';

async function request(method, path) {
  const headers = {
    'apikey': key,
    'Authorization': `Bearer ${key}`
  };
  const url = `${baseUrl}${path}`;
  const res = await fetch(url, { method, headers });
  if (!res.ok) {
    console.error(`Cleanup failed: ${method} ${path} returned ${res.status}`);
  }
}

async function run() {
  console.log('Cleaning up lifecycle test data...');
  await request('DELETE', 'inventory_transfer_events?tenant_id=eq.' + TENANT_ID);
  await request('DELETE', 'inventory_transfer_variances?tenant_id=eq.' + TENANT_ID);
  await request('DELETE', 'inventory_dispatch_items?id=not.is.null');
  await request('DELETE', 'inventory_dispatches?id=not.is.null');
  await request('DELETE', 'inventory_transfer_request_items?material_id=eq.' + MATERIAL_ID);
  await request('DELETE', 'inventory_transfer_requests?tenant_id=eq.' + TENANT_ID);
  await request('DELETE', 'inventory_stock_ledger?tenant_id=eq.' + TENANT_ID);
  await request('DELETE', 'inventory_material_stock_levels?tenant_id=eq.' + TENANT_ID);
  console.log('Cleanup finished!');
}

run().catch(console.error);
