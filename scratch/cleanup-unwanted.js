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

  // 1. Fetch categories
  const catRes = await fetch(`${url}/rest/v1/categories?tenant_id=eq.${tenantId}&branch_id=eq.${branchId}&select=*`, { headers });
  const categories = await catRes.json();
  const keepCategories = ['SIGNATURE', 'SALANKATIA', 'KOUSHIRI', 'QASHTUTA'];
  const deleteCats = categories.filter(c => !keepCategories.includes(c.name));
  const deleteCatIds = deleteCats.map(c => c.id);

  console.log('Categories identified for deletion:', deleteCats.map(c => c.name));

  // 2. Fetch products
  const prodRes = await fetch(`${url}/rest/v1/products?tenant_id=eq.${tenantId}&branch_id=eq.${branchId}&select=*`, { headers });
  const products = await prodRes.json();
  
  // Products to delete: those that are in one of the deleted categories, or have no category
  const deleteProducts = products.filter(p => !p.category_id || deleteCatIds.includes(p.category_id));
  const deleteProdIds = deleteProducts.map(p => p.id);

  console.log('Products identified for deletion:', deleteProducts.map(p => p.name));

  // 3. Delete products
  if (deleteProdIds.length > 0) {
    console.log(`\nDeleting ${deleteProdIds.length} products...`);
    const delProdRes = await fetch(`${url}/rest/v1/products?id=in.(${deleteProdIds.join(',')})&tenant_id=eq.${tenantId}&branch_id=eq.${branchId}`, {
      method: 'DELETE',
      headers
    });
    
    if (delProdRes.ok) {
      const deletedData = await delProdRes.json();
      console.log(`Successfully deleted ${deletedData.length} products.`);
    } else {
      console.error('Failed to delete products:', delProdRes.status, await delProdRes.text());
      return;
    }
  } else {
    console.log('\nNo products to delete.');
  }

  // 4. Delete categories
  if (deleteCatIds.length > 0) {
    console.log(`\nDeleting ${deleteCatIds.length} categories...`);
    const delCatRes = await fetch(`${url}/rest/v1/categories?id=in.(${deleteCatIds.join(',')})&tenant_id=eq.${tenantId}&branch_id=eq.${branchId}`, {
      method: 'DELETE',
      headers
    });

    if (delCatRes.ok) {
      const deletedCatsData = await delCatRes.json();
      console.log(`Successfully deleted ${deletedCatsData.length} categories.`);
    } else {
      console.error('Failed to delete categories:', delCatRes.status, await delCatRes.text());
      return;
    }
  } else {
    console.log('\nNo categories to delete.');
  }

  console.log('\nVerification:');
  // Check what's remaining
  const finalCatRes = await fetch(`${url}/rest/v1/categories?tenant_id=eq.${tenantId}&branch_id=eq.${branchId}&select=*`, { headers });
  const finalCats = await finalCatRes.json();
  console.log(`Remaining categories (${finalCats.length}):`, finalCats.map(c => c.name));

  const finalProdRes = await fetch(`${url}/rest/v1/products?tenant_id=eq.${tenantId}&branch_id=eq.${branchId}&select=*`, { headers });
  const finalProds = await finalProdRes.json();
  console.log(`Remaining products (${finalProds.length}):`, finalProds.map(p => p.name));
}

main().catch(console.error);
