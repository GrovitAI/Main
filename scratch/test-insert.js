const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB5aWtybHFkdWFtcG9vbmNwenJpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzODIxODUsImV4cCI6MjA5NDk1ODE4NX0.STg6C9ZIeIxo76ZLWy9Q1itDgkwjkw2fAJ3BSVB44mg';
const baseUrl = 'https://pyikrlqduampooncpzri.supabase.co/rest/v1/';

async function run() {
  const url = `${baseUrl}inventory_transfer_requests`;
  const now = new Date().toISOString();
  
  const payload = {
    id: '11111111-1111-1111-1111-111111111111', 
    tenant_id: 'aaaaaaaa-0000-0000-0000-000000000001',
    requesting_branch_id: 'bbbbbbbb-0000-0000-0000-000000000001',
    supplying_branch_id: 'cccccccc-0000-0000-0000-000000000001',
    request_number: `TRF-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`,
    status: 'Pending',
    notes: 'Test insert from diagnostics script with client-side request_number',
    updated_at: now
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
    console.log('Insert status:', res.status);
    console.log('Response body:', await res.text());
  } catch (err) {
    console.error('Fetch failed:', err);
  }
}

run();
