const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB5aWtybHFkdWFtcG9vbmNwenJpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzODIxODUsImV4cCI6MjA5NDk1ODE4NX0.STg6C9ZIeIxo76ZLWy9Q1itDgkwjkw2fAJ3BSVB44mg';
const baseUrl = 'https://pyikrlqduampooncpzri.supabase.co/rest/v1/';

async function viewCsvHeader(tableName) {
  const url = `${baseUrl}${tableName}?select=*&limit=1`;
  try {
    const res = await fetch(url, {
      headers: {
        'apikey': key,
        'Authorization': `Bearer ${key}`,
        'Accept': 'text/csv'
      }
    });
    console.log(`\nTable '${tableName}' CSV header:`);
    if (res.ok) {
      const text = await res.text();
      console.log(text.split('\n')[0]);
    } else {
      console.log('Error status:', res.status);
      console.log(await res.text());
    }
  } catch (err) {
    console.error('Failed:', err);
  }
}

async function run() {
  await viewCsvHeader('bills');
  await viewCsvHeader('bill_items');
  await viewCsvHeader('settlements');
}

run();
