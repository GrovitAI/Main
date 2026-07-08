const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB5aWtybHFkdWFtcG9vbmNwenJpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzODIxODUsImV4cCI6MjA5NDk1ODE4NX0.STg6C9ZIeIxo76ZLWy9Q1itDgkwjkw2fAJ3BSVB44mg';
const baseUrl = 'https://pyikrlqduampooncpzri.supabase.co/rest/v1/';

async function checkMaterials() {
  try {
    const materialsRes = await fetch(`${baseUrl}inventory_materials?select=id,material_code,material_name,deleted_at,is_active`, {
      headers: { 'apikey': key, 'Authorization': `Bearer ${key}` }
    });
    const materials = await materialsRes.json();
    console.log('Total materials in DB:', materials.length);
    
    // Print all codes matching MAT\d+
    const matCodes = [];
    for (const m of materials) {
      if (m.material_code) {
        matCodes.push(m);
      }
    }
    
    matCodes.sort((a, b) => {
      const matchA = a.material_code.match(/^MAT(\d+)$/i);
      const matchB = b.material_code.match(/^MAT(\d+)$/i);
      if (matchA && matchB) {
        return parseInt(matchA[1], 10) - parseInt(matchB[1], 10);
      }
      return a.material_code.localeCompare(b.material_code);
    });

    console.log('Sorted Material Codes:');
    for (const m of matCodes) {
      console.log(`- Code: ${m.material_code}, Name: "${m.material_name}", Active: ${m.is_active}, Deleted At: ${m.deleted_at}`);
    }
  } catch (err) {
    console.error('Error:', err);
  }
}

checkMaterials();
