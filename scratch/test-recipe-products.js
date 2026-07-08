const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB5aWtybHFkdWFtcG9vbmNwenJpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzODIxODUsImV4cCI6MjA5NDk1ODE4NX0.STg6C9ZIeIxo76ZLWy9Q1itDgkwjkw2fAJ3BSVB44mg';
const baseUrl = 'https://pyikrlqduampooncpzri.supabase.co/rest/v1/';

async function testJoin(table, selectQuery) {
  const url = `${baseUrl}${table}?select=${selectQuery}&limit=1`;
  try {
    const res = await fetch(url, {
      headers: {
        'apikey': key,
        'Authorization': `Bearer ${key}`
      }
    });
    console.log(`Table: ${table}, Query: ${selectQuery} -> Status: ${res.status}`);
    const text = await res.text();
    if (res.status !== 200) {
      console.log('Error details:', text);
    } else {
      console.log('Success details:', text);
    }
  } catch (err) {
    console.error('Error:', err);
  }
}

async function run() {
  await testJoin('inventory_recipes', '*,products(*)');
  await testJoin('inventory_recipes', '*,products:menu_item_id(*)');
  await testJoin('inventory_recipes', '*,products!menu_item_id(name)');
}

run();
