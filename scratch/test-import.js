const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB5aWtybHFkdWFtcG9vbmNwenJpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzODIxODUsImV4cCI6MjA5NDk1ODE4NX0.STg6C9ZIeIxo76ZLWy9Q1itDgkwjkw2fAJ3BSVB44mg';
const baseUrl = 'https://pyikrlqduampooncpzri.supabase.co/rest/v1/';

async function simulateImport() {
  try {
    const matsRes = await fetch(`${baseUrl}inventory_materials?select=*`, {
      headers: { 'apikey': key, 'Authorization': `Bearer ${key}` }
    });
    const existingMaterials = await matsRes.json();
    console.log(`Fetched ${existingMaterials.length} materials from DB.`);

    const newItems = [
      { materialName: 'Mock Tomato Juice 1', categoryName: 'BASE', unitName: 'KG', reorderLevel: 5, averageCost: 10 },
      { materialName: 'Mock Tomato Juice 2', categoryName: 'BASE', unitName: 'KG', reorderLevel: 5, averageCost: 10 },
      { materialName: 'Mock Tomato Juice 3', categoryName: 'BASE', unitName: 'KG', reorderLevel: 5, averageCost: 10 }
    ];

    const localMaterials = [...existingMaterials];
    
    for (const row of newItems) {
      let matchedMaterial = localMaterials.find(
        m => m.material_name.toLowerCase() === row.materialName.toLowerCase()
      );
      
      const isUpdate = !!matchedMaterial;
      let generatedCode = '';
      if (!matchedMaterial) {
        let maxNum = 0;
        for (const m of localMaterials) {
          if (m.material_code) {
            const match = m.material_code.match(/^MAT(\d+)$/i);
            if (match) {
              const num = parseInt(match[1], 10);
              if (num > maxNum) {
                maxNum = num;
              }
            }
          }
        }
        const nextNum = maxNum + 1;
        const padded = String(nextNum).padStart(2, '0');
        generatedCode = `MAT${padded}`;
      }

      const code = matchedMaterial ? matchedMaterial.material_code : generatedCode;
      console.log(`Importing "${row.materialName}": determined code is "${code}"`);

      const fullMaterial = {
        tenant_id: 'aaaaaaaa-0000-0000-0000-000000000001',
        branch_id: 'bbbbbbbb-0000-0000-0000-000000000001',
        material_code: code,
        material_name: row.materialName,
        category_id: null,
        inventory_unit_id: null,
        opening_stock: 0,
        current_stock: 0,
        reorder_level: row.reorderLevel,
        average_cost: row.averageCost,
        last_purchase_price: row.averageCost,
        inventory_value: 0,
        is_active: true,
        deleted_at: null,
        deleted_by: null,
        updated_at: new Date().toISOString(),
      };

      const payload = { ...fullMaterial };
      if (matchedMaterial?.id) {
        payload.id = matchedMaterial.id;
      }

      console.log(`Sending upsert payload to Supabase: code="${code}", name="${row.materialName}"`);
      const saveRes = await fetch(`${baseUrl}inventory_materials`, {
        method: 'POST',
        headers: {
          'apikey': key,
          'Authorization': `Bearer ${key}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation'
        },
        body: JSON.stringify(payload)
      });

      const responseText = await saveRes.text();
      if (!saveRes.ok) {
        console.error(`Error saving material "${row.materialName}":`, responseText);
        throw new Error(responseText);
      } else {
        const savedData = JSON.parse(responseText);
        const savedMaterial = savedData[0];
        console.log(`Successfully saved:`, savedMaterial);
        localMaterials.push(savedMaterial);
      }
    }
  } catch (err) {
    console.error('Simulation failed:', err);
  }
}

simulateImport();
