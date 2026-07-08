const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB5aWtybHFkdWFtcG9vbmNwenJpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzODIxODUsImV4cCI6MjA5NDk1ODE4NX0.STg6C9ZIeIxo76ZLWy9Q1itDgkwjkw2fAJ3BSVB44mg';
const baseUrl = 'https://pyikrlqduampooncpzri.supabase.co/rest/v1/';

async function checkTable(tableName) {
  const url = `${baseUrl}${tableName}?select=*&limit=1`;
  try {
    const res = await fetch(url, {
      headers: {
        'apikey': key,
        'Authorization': `Bearer ${key}`
      }
    });
    console.log(`Table '${tableName}' status:`, res.status);
    if (!res.ok) {
      const text = await res.text();
      console.log(`Table '${tableName}' error details:`, text);
    }
  } catch (err) {
    console.error(`Table '${tableName}' check failed:`, err);
  }
}

async function run() {
  const tables = [
    'inventory_transfer_requests',
    'inventory_transfer_request_items',
    'inventory_dispatches',
    'inventory_dispatch_items',
    'inventory_transfer_variances',
    'inventory_transfer_events',
    'inventory_recipes',
    'inventory_recipe_items',
    'inventory_consumption_batches',
    'inventory_consumption_jobs'
  ];
  for (const t of tables) {
    await checkTable(t);
  }
}

run();
