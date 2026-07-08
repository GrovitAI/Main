const url = 'https://pyikrlqduampooncpzri.supabase.co';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB5aWtybHFkdWFtcG9vbmNwenJpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzODIxODUsImV4cCI6MjA5NDk1ODE4NX0.STg6C9ZIeIxo76ZLWy9Q1itDgkwjkw2fAJ3BSVB44mg';

const tenantId = 'aaaaaaaa-0000-0000-0000-000000000001';
const branchId = 'bbbbbbbb-0000-0000-0000-000000000001';

async function main() {
  const headers = {
    'apikey': key,
    'Authorization': `Bearer ${key}`,
    'Content-Type': 'application/json'
  };

  console.log('Fetching categories...');
  const catRes = await fetch(`${url}/rest/v1/categories?tenant_id=eq.${tenantId}&branch_id=eq.${branchId}&select=*`, { headers });
  const categories = await catRes.json();
  console.log(`Found ${categories.length} categories:`);
  categories.forEach(c => console.log(` - [${c.id}] ${c.name}`));

  console.log('\nFetching products...');
  const prodRes = await fetch(`${url}/rest/v1/products?tenant_id=eq.${tenantId}&branch_id=eq.${branchId}&select=*`, { headers });
  const products = await prodRes.json();
  console.log(`Found ${products.length} products:`);
  products.forEach(p => console.log(` - [${p.id}] ${p.name} (Category: ${p.category_id}, is_active: ${p.is_active})`));
}

main().catch(console.error);
