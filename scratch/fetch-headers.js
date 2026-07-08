async function run() {
  const url = 'https://pyikrlqduampooncpzri.supabase.co/rest/v1/';
  const res = await fetch(url, {
    headers: {
      'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB5aWtybHFkdWFtcG9vbmNwenJpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzODIxODUsImV4cCI6MjA5NDk1ODE4NX0.STg6C9ZIeIxo76ZLWy9Q1itDgkwjkw2fAJ3BSVB44mg'
    }
  });
  console.log('Status:', res.status);
  console.log('Headers:');
  for (const [key, value] of res.headers.entries()) {
    console.log(` - ${key}: ${value}`);
  }
}

run().catch(console.error);
