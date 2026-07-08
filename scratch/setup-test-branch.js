const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB5aWtybHFkdWFtcG9vbmNwenJpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzODIxODUsImV4cCI6MjA5NDk1ODE4NX0.STg6C9ZIeIxo76ZLWy9Q1itDgkwjkw2fAJ3BSVB44mg';
const baseUrl = 'https://pyikrlqduampooncpzri.supabase.co/rest/v1/';

async function setupBranch() {
  const url = `${baseUrl}branches`;
  const payload = {
    id: 'cccccccc-0000-0000-0000-000000000001',
    tenant_id: 'aaaaaaaa-0000-0000-0000-000000000001',
    name: 'Le Leban Central Kitchen',
    address: 'Chennai HQ',
    branch_type: 'CENTRAL_KITCHEN'
  };

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'apikey': key,
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates'
      },
      body: JSON.stringify(payload)
    });
    console.log('Setup branch status:', res.status);
    console.log('Response:', await res.text());
  } catch (err) {
    console.error('Error setting up branch:', err);
  }
}

setupBranch();
