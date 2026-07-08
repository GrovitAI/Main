const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB5aWtybHFkdWFtcG9vbmNwenJpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzODIxODUsImV4cCI6MjA5NDk1ODE4NX0.STg6C9ZIeIxo76ZLWy9Q1itDgkwjkw2fAJ3BSVB44mg';
const baseUrl = 'https://pyikrlqduampooncpzri.supabase.co/rest/v1/';

async function run() {
  const url = `${baseUrl}inventory_dispatch_items`;
  try {
    const res = await fetch(url, {
      headers: {
        'apikey': key,
        'Authorization': `Bearer ${key}`
      }
    });
    if (!res.ok) {
      console.error('HTTP Error:', res.status, await res.text());
      return;
    }
    const data = await res.json();
    console.log(`Fetched ${data.length} dispatch items:`);
    data.forEach(item => {
      console.log(`- Dispatch Item: ID=${item.id}, DispatchID=${item.dispatch_id}, MaterialID=${item.material_id}, Qty=${item.quantity}`);
    });
  } catch (err) {
    console.error('Failed to fetch:', err);
  }
}

run();
