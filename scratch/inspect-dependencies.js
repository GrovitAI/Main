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

  // 1. Get categories
  const catRes = await fetch(`${url}/rest/v1/categories?tenant_id=eq.${tenantId}&branch_id=eq.${branchId}&select=*`, { headers });
  const categories = await catRes.json();
  const keepCategories = ['SIGNATURE', 'SALANKATIA', 'KOUSHIRI', 'QASHTUTA'];
  const deleteCatIds = categories.filter(c => !keepCategories.includes(c.name)).map(c => c.id);
  const deleteCatNames = categories.filter(c => !keepCategories.includes(c.name)).map(c => c.name);

  console.log('Categories to delete:', deleteCatNames);
  console.log('Category IDs to delete:', deleteCatIds);

  // 2. Get products
  const prodRes = await fetch(`${url}/rest/v1/products?tenant_id=eq.${tenantId}&branch_id=eq.${branchId}&select=*`, { headers });
  const products = await prodRes.json();
  const deleteProducts = products.filter(p => !p.category_id || deleteCatIds.includes(p.category_id));
  const deleteProdIds = deleteProducts.map(p => p.id);
  const deleteProdNames = deleteProducts.map(p => p.name);

  console.log('Products to delete:', deleteProdNames);
  console.log('Product IDs to delete:', deleteProdIds);

  // 3. Check open_order_items referencing these products
  if (deleteProdIds.length > 0) {
    const ooiRes = await fetch(`${url}/rest/v1/open_order_items?product_id=in.(${deleteProdIds.join(',')})&select=*`, { headers });
    const ooi = await ooiRes.json();
    console.log(`\nFound ${ooi.length} open_order_items referencing these products.`);

    const biRes = await fetch(`${url}/rest/v1/bill_items?product_id=in.(${deleteProdIds.join(',')})&select=*`, { headers });
    const bi = await biRes.json();
    console.log(`Found ${bi.length} bill_items referencing these products.`);

    // Check inventory consumption batches or other tables
    const rRes = await fetch(`${url}/rest/v1/inventory_recipes?tenant_id=eq.${tenantId}&branch_id=eq.${branchId}&select=*`, { headers });
    const recipes = await rRes.json();
    console.log(`Found ${recipes.length} inventory_recipes.`);
  }
}

main().catch(console.error);
