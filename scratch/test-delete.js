const url = 'https://pyikrlqduampooncpzri.supabase.co';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB5aWtybHFkdWFtcG9vbmNwenJpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzODIxODUsImV4cCI6MjA5NDk1ODE4NX0.STg6C9ZIeIxo76ZLWy9Q1itDgkwjkw2fAJ3BSVB44mg';

const tenantId = 'aaaaaaaa-0000-0000-0000-000000000001';
const branchId = 'bbbbbbbb-0000-0000-0000-000000000001';

async function main() {
  const headers = {
    'apikey': key,
    'Authorization': `Bearer ${key}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation'
  };

  const testProdId = 'cc54dff4-b514-498e-8da0-1d776a481738'; // Arabic Coffee
  console.log(`Attempting to delete product ${testProdId}...`);
  const res = await fetch(`${url}/rest/v1/products?id=eq.${testProdId}&tenant_id=eq.${tenantId}&branch_id=eq.${branchId}`, {
    method: 'DELETE',
    headers
  });
  console.log('Status:', res.status);
  const text = await res.text();
  console.log('Response:', text);
}

main().catch(console.error);
