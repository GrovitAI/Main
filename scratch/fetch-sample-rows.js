const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB5aWtybHFkdWFtcG9vbmNwenJpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzODIxODUsImV4cCI6MjA5NDk1ODE4NX0.STg6C9ZIeIxo76ZLWy9Q1itDgkwjkw2fAJ3BSVB44mg';
const baseUrl = 'https://pyikrlqduampooncpzri.supabase.co/rest/v1/';

async function fetchSample(tableName) {
  const url = `${baseUrl}${tableName}?select=*&limit=1`;
  try {
    const res = await fetch(url, {
      headers: {
        'apikey': key,
        'Authorization': `Bearer ${key}`
      }
    });
    if (res.ok) {
      const data = await res.json();
      console.log(`Sample row for '${tableName}':`, data[0] || 'Empty table');
    } else {
      console.log(`Failed to fetch sample for '${tableName}':`, res.status, await res.text());
    }
  } catch (err) {
    console.error(`Fetch failed for '${tableName}':`, err);
  }
}

async function run() {
  await fetchSample('inventory_transfer_requests');
  await fetchSample('inventory_recipes');
  await fetchSample('products');
}

run();
