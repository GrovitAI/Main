const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB5aWtybHFkdWFtcG9vbmNwenJpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzODIxODUsImV4cCI6MjA5NDk1ODE4NX0.STg6C9ZIeIxo76ZLWy9Q1itDgkwjkw2fAJ3BSVB44mg';

async function testUrl(subdomain) {
  const url = `https://${subdomain}.supabase.co/rest/v1/printers?select=*`;
  console.log(`Testing subdomain ${subdomain}...`);
  try {
    const res = await fetch(url, {
      headers: {
        'apikey': key,
        'Authorization': `Bearer ${key}`
      }
    });
    console.log(`Status for ${subdomain}:`, res.status);
    if (res.ok) {
      const data = await res.json();
      console.log(`Success! Data returned:`, data);
      return true;
    } else {
      const text = await res.text();
      console.log(`Error text:`, text);
    }
  } catch (err) {
    console.error(`Failed to fetch ${subdomain}:`, err);
  }
  return false;
}

async function run() {
  await testUrl('pyikrlqduampooncpzri');
  await testUrl('pyikrlqduampoobocwjrj');
}

run();
