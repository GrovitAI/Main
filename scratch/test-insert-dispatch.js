const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB5aWtybHFkdWFtcG9vbmNwenJpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzODIxODUsImV4cCI6MjA5NDk1ODE4NX0.STg6C9ZIeIxo76ZLWy9Q1itDgkwjkw2fAJ3BSVB44mg';
const baseUrl = 'https://pyikrlqduampooncpzri.supabase.co/rest/v1/';

async function run() {
  const url = `${baseUrl}inventory_dispatches`;
  const dispatchId = '22222222-2222-2222-2222-222222222222';
  const now = new Date().toISOString();
  
  const payload = {
    id: dispatchId, 
    request_id: '11111111-1111-1111-1111-111111111111', // reference our created request
    dispatch_number: `DSP-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`,
    dispatched_at: now,
    status: 'Dispatched'
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
      body: JSON.stringify(payload)
    });
    console.log('Insert dispatch status:', res.status);
    console.log('Response body:', await res.text());
  } catch (err) {
    console.error('Fetch failed:', err);
  }
}

run();
