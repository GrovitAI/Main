const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB5aWtybHFkdWFtcG9vbmNwenJpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzODIxODUsImV4cCI6MjA5NDk1ODE4NX0.STg6C9ZIeIxo76ZLWy9Q1itDgkwjkw2fAJ3BSVB44mg';
const baseUrl = 'https://pyikrlqduampooncpzri.supabase.co/rest/v1/';

async function testInsert() {
  const url = `${baseUrl}inventory_dispatch_items`;
  // We'll use a dummy UUID format that exists for other records
  const dispatchId = '22222222-2222-2222-2222-222222222222';
  const materialId = '55cc5e50-ca03-4acc-af35-47a8d5b7e3a7';

  // Test inserting without an 'id' column
  const payloadNoId = {
    dispatch_id: dispatchId,
    material_id: materialId,
    quantity: 5
  };

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'apikey': key,
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify(payloadNoId)
    });
    console.log('Insert status without ID:', res.status);
    console.log('Response without ID:', await res.text());
  } catch (err) {
    console.error('Fetch failed without ID:', err);
  }

  // Test inserting WITH a client-generated UUID 'id'
  const payloadWithId = {
    id: 'f' + Math.random().toString(16).substr(2, 31).padStart(31, '0'),
    dispatch_id: dispatchId,
    material_id: materialId,
    quantity: 5
  };

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'apikey': key,
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify(payloadWithId)
    });
    console.log('Insert status with ID:', res.status);
    console.log('Response with ID:', await res.text());
  } catch (err) {
    console.error('Fetch failed with ID:', err);
  }
}

testInsert();
