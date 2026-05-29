const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB5aWtybHFkdWFtcG9vbmNwenJpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzODIxODUsImV4cCI6MjA5NDk1ODE4NX0.STg6C9ZIeIxo76ZLWy9Q1itDgkwjkw2fAJ3BSVB44mg';
const baseUrl = 'https://pyikrlqduampooncpzri.supabase.co/rest/v1/';

async function checkTable(tableName) {
  const url = `${baseUrl}${tableName}?select=count&limit=1`;
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
  const tables = ['bills', 'bill_items', 'settlements', 'open_orders', 'open_order_items', 'kots', 'kot_items'];
  for (const t of tables) {
    await checkTable(t);
  }
}

run();
