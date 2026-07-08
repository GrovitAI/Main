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

async function probe() {
  const candidates = [
    'id', 'tenant_id', 'recipe_code', 'recipe_name', 'menu_item_id', 'is_active', 'created_at', 'updated_at',
    'yield_quantity', 'yield_unit', 'cost_snapshot', 'version_no', 'effective_from', 'supersedes_recipe_id'
  ];
  console.log('Probing inventory_recipes columns...');
  for (const c of candidates) {
    const ok = await testColumn('inventory_recipes', c);
    console.log(`Column ${c}: ${ok ? 'EXISTS' : 'NO'}`);
  }
}

probe();
