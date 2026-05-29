const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB5aWtybHFkdWFtcG9vbmNwenJpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzODIxODUsImV4cCI6MjA5NDk1ODE4NX0.STg6C9ZIeIxo76ZLWy9Q1itDgkwjkw2fAJ3BSVB44mg';
const baseUrl = 'https://pyikrlqduampooncpzri.supabase.co/rest/v1/rpc/';

async function testRpc(name, body) {
  const url = `${baseUrl}${name}`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'apikey': key,
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });
    console.log(`RPC ${name} status:`, res.status);
    const data = await res.text();
    console.log(`RPC ${name} response:`, data);
  } catch (err) {
    console.error(`RPC ${name} failed:`, err);
  }
}

async function run() {
  await testRpc('exec_sql', { sql: 'SELECT 1;' });
  await testRpc('execute_sql', { sql: 'SELECT 1;' });
  await testRpc('run_sql', { sql: 'SELECT 1;' });
}

run();
