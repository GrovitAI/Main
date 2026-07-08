const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB5aWtybHFkdWFtcG9vbmNwenJpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzODIxODUsImV4cCI6MjA5NDk1ODE4NX0.STg6C9ZIeIxo76ZLWy9Q1itDgkwjkw2fAJ3BSVB44mg';
const baseUrl = 'https://pyikrlqduampooncpzri.supabase.co/rest/v1/';

async function testColumn(colName) {
  const url = `${baseUrl}printers?select=${colName}&limit=1`;
  const res = await fetch(url, {
    headers: {
      'apikey': key,
      'Authorization': `Bearer ${key}`
    }
  });
  const text = await res.text();
  console.log(`Column '${colName}': Status = ${res.status}, Response = ${text.substring(0, 150)}`);
}

async function run() {
  const candidates = [
    'id', 'tenant_id', 'branch_id', 'name', 'type', 'connection',
    'ip_address', 'port', 'paper_width', 'printer_role', 'is_default',
    'is_active', 'os_printer_name', 'printnode_printer_id', 'created_at'
  ];
  for (const col of candidates) {
    await testColumn(col);
  }
}

run();
