const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB5aWtybHFkdWFtcG9vbmNwenJpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzODIxODUsImV4cCI6MjA5NDk1ODE4NX0.STg6C9ZIeIxo76ZLWy9Q1itDgkwjkw2fAJ3BSVB44mg';
const baseUrl = 'https://pyikrlqduampooncpzri.supabase.co/rest/v1/';

async function viewRow(tableName) {
  const url = `${baseUrl}${tableName}?limit=1`;
  try {
    const res = await fetch(url, {
      headers: {
        'apikey': key,
        'Authorization': `Bearer ${key}`
      }
    });
    console.log(`Table '${tableName}' columns and first row:`);
    if (res.ok) {
      const data = await res.json();
      if (data.length > 0) {
        console.log(data[0]);
      } else {
        console.log('Table is empty. Checking table headings via OPTIONS header or empty array...');
        // Let's do a select=* query with an empty filter to get the structure if possible
        console.log('No data returned.');
      }
    } else {
      console.log('Error:', await res.text());
    }
  } catch (err) {
    console.error('Failed:', err);
  }
}

async function run() {
  await viewRow('bills');
  await viewRow('bill_items');
  await viewRow('settlements');
}

run();
