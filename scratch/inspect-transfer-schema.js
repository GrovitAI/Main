const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB5aWtybHFkdWFtcG9vbmNwenJpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzODIxODUsImV4cCI6MjA5NDk1ODE4NX0.STg6C9ZIeIxo76ZLWy9Q1itDgkwjkw2fAJ3BSVB44mg';
const url = 'https://pyikrlqduampooncpzri.supabase.co/rest/v1/';

async function run() {
  try {
    const res = await fetch(url, {
      headers: {
        'apikey': key,
        'Authorization': `Bearer ${key}`
      }
    });
    if (res.ok) {
      const data = await res.json();
      console.log('OpenAPI definitions properties found:', Object.keys(data.paths || {}));
      console.log('info:', data.info);
    } else {
      console.log('Error:', res.status, await res.text());
    }
  } catch (err) {
    console.error('Failed to fetch OpenAPI:', err);
  }
}

run();
