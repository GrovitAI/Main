const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB5aWtybHFkdWFtcG9vbmNwenJpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzODIxODUsImV4cCI6MjA5NDk1ODE4NX0.STg6C9ZIeIxo76ZLWy9Q1itDgkwjkw2fAJ3BSVB44mg';
const baseUrl = 'https://pyikrlqduampooncpzri.supabase.co/rest/v1/';

const tenant_id = 'aaaaaaaa-0000-0000-0000-000000000001';
const activeBranchId = 'cccccccc-0000-0000-0000-000000000001'; // Central Kitchen

async function run() {
  const url = `${baseUrl}inventory_dispatches?select=*,request:inventory_transfer_requests(*)`;
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
    console.log('Fetched raw dispatches length:', data.length);
    if (data.length > 0) {
      console.log('Sample raw dispatch:', JSON.stringify(data[0], null, 2));
    }

    const filtered = (data || []).filter((d) => {
      const req = d.request;
      if (!req) return false;
      if (req.tenant_id !== tenant_id) return false;
      return req.requesting_branch_id === activeBranchId || req.supplying_branch_id === activeBranchId;
    });

    console.log('Filtered dispatches length:', filtered.length);
    if (filtered.length > 0) {
      console.log('Sample filtered dispatch:', JSON.stringify(filtered[0], null, 2));
    }
  } catch (err) {
    console.error('Failed to fetch:', err);
  }
}

run();
