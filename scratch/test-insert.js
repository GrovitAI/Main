const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB5aWtybHFkdWFtcG9vbmNwenJpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzODIxODUsImV4cCI6MjA5NDk1ODE4NX0.STg6C9ZIeIxo76ZLWy9Q1itDgkwjkw2fAJ3BSVB44mg';
const url = 'https://pyikrlqduampooncpzri.supabase.co/rest/v1/printers';

async function testInsert() {
  const tenant_id = 'aaaaaaaa-0000-0000-0000-000000000001';
  const branch_id = 'bbbbbbbb-0000-0000-0000-000000000001';

  // Let's try to insert a printer with the new columns
  const payload = {
    tenant_id,
    branch_id,
    name: 'Test Printer 1',
    ip_address: '192.168.1.100',
    port: 9100,
    paper_width: '80mm',
    is_active: true,
    printer_role: 'bill'
  };

  console.log('Inserting with all fields (including new ones):');
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
    console.log('Status:', res.status);
    const data = await res.json();
    console.log('Data:', data);
  } catch (err) {
    console.error('Insert failed:', err);
  }
}

testInsert();
