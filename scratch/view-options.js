const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB5aWtybHFkdWFtcG9vbmNwenJpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzODIxODUsImV4cCI6MjA5NDk1ODE4NX0.STg6C9ZIeIxo76ZLWy9Q1itDgkwjkw2fAJ3BSVB44mg';
const baseUrl = 'https://pyikrlqduampooncpzri.supabase.co/rest/v1/';

async function viewOptions(tableName) {
  const url = `${baseUrl}${tableName}`;
  try {
    const res = await fetch(url, {
      method: 'OPTIONS',
      headers: {
        'apikey': key,
        'Authorization': `Bearer ${key}`
      }
    });
    console.log(`Table '${tableName}' OPTIONS response:`);
    if (res.ok) {
      const data = await res.json();
      console.log('Columns:', Object.keys(data.columns || {}));
      console.log('Details:', data.columns);
    } else {
      console.log('Error status:', res.status);
      console.log(await res.text());
    }
  } catch (err) {
    console.error('Failed:', err);
  }
}

async function run() {
  await viewOptions('bills');
  await viewOptions('bill_items');
  await viewOptions('settlements');
}

run();
