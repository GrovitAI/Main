const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB5aWtybHFkdWFtcG9vbmNwenJpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzODIxODUsImV4cCI6MjA5NDk1ODE4NX0.STg6C9ZIeIxo76ZLWy9Q1itDgkwjkw2fAJ3BSVB44mg';
const baseUrl = 'https://pyikrlqduampooncpzri.supabase.co/rest/v1/';

async function run() {
  const url = `${baseUrl}inventory_transfer_requests`;
  try {
    const res = await fetch(url, {
      headers: {
        'apikey': key,
        'Authorization': `Bearer ${key}`
      }
    });
    if (!res.ok) {
      console.error('HTTP Error:', res.status, await res.text());
      return;
    }
    const data = await res.json();
    console.log(`Fetched ${data.length} transfer requests:`);
    data.forEach(req => {
      console.log(`- Request #${req.request_number} (ID: ${req.id})`);
      console.log(`  Status: ${req.status}`);
      console.log(`  Supplying Branch: ${req.supplying_branch_id}`);
      console.log(`  Requesting Branch: ${req.requesting_branch_id}`);
      console.log(`  Created At: ${req.created_at}`);
    });
  } catch (err) {
    console.error('Failed to fetch:', err);
  }
}

run();
