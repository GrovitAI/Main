const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB5aWtybHFkdWFtcG9vbmNwenJpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzODIxODUsImV4cCI6MjA5NDk1ODE4NX0.STg6C9ZIeIxo76ZLWy9Q1itDgkwjkw2fAJ3BSVB44mg';
const baseUrl = 'https://pyikrlqduampooncpzri.supabase.co/rest/v1/';

async function checkTenants() {
  try {
    const materialsRes = await fetch(`${baseUrl}inventory_materials?select=tenant_id,material_code,material_name`, {
      headers: { 'apikey': key, 'Authorization': `Bearer ${key}` }
    });
    const materials = await materialsRes.json();
    
    console.log('Materials in DB:', materials.length);
    const tenantCounts = {};
    for (const m of materials) {
      tenantCounts[m.tenant_id] = (tenantCounts[m.tenant_id] || 0) + 1;
    }
    console.log('Tenant counts in DB:', tenantCounts);
    
    // Also fetch the tenant context from the app
    // We can run a command or parse it if we can find it
  } catch (err) {
    console.error('Error:', err);
  }
}

checkTenants();
