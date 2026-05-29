const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB5aWtybHFkdWFtcG9vbmNwenJpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzODIxODUsImV4cCI6MjA5NDk1ODE4NX0.STg6C9ZIeIxo76ZLWy9Q1itDgkwjkw2fAJ3BSVB44mg';
const url = 'https://pyikrlqduampooncpzri.supabase.co/rest/v1/';

async function inspectOpenApi() {
  try {
    const res = await fetch(url, {
      headers: {
        'apikey': key,
        'Authorization': `Bearer ${key}`,
        'Accept': 'application/openapi+json'
      }
    });
    if (res.ok) {
      const data = await res.json();
      console.log('OpenAPI definitions found:');
      const tables = ['bills', 'bill_items', 'settlements'];
      for (const t of tables) {
        console.log(`\n--- SCHEMA FOR TABLE '${t}' ---`);
        const schema = data.definitions?.[t];
        if (schema) {
          console.log('Properties:', Object.keys(schema.properties || {}));
          console.log('Details:', schema.properties);
        } else {
          console.log('No schema definition found in OpenAPI.');
        }
      }
    } else {
      console.log('Error:', res.status, await res.text());
    }
  } catch (err) {
    console.error('Failed to fetch OpenAPI:', err);
  }
}

inspectOpenApi();
