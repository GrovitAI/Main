const { importRawMaterials } = require('../src/lib/pos/material-import-service');

// Mock a ValidatedImportRow
const validatedRows = [
  {
    index: 0,
    originalRow: {},
    materialCode: '',
    materialName: 'Mock Tomato 777',
    categoryName: 'BASE',
    unitName: 'KG',
    reorderLevel: 5,
    averageCost: 12.5,
    preferredSupplierName: '',
    action: 'create',
    status: 'valid',
    errors: [],
    warnings: []
  }
];

// Mock the global/window variables if needed by tenant-context or expo
global.localStorage = {
  getItem: () => null,
  setItem: () => null,
};

async function testRealImport() {
  try {
    console.log('Calling importRawMaterials...');
    const result = await importRawMaterials(validatedRows);
    console.log('Result from importRawMaterials:', result);

    // Clean up
    if (result.data && result.data.success) {
      console.log('Import succeeded! Cleaning up the added item...');
      const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB5aWtybHFkdWFtcG9vbmNwenJpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzODIxODUsImV4cCI6MjA5NDk1ODE4NX0.STg6C9ZIeIxo76ZLWy9Q1itDgkwjkw2fAJ3BSVB44mg';
      const baseUrl = 'https://pyikrlqduampooncpzri.supabase.co/rest/v1/';
      const matsRes = await fetch(`${baseUrl}inventory_materials?material_name=eq.Mock Tomato 777`, {
        headers: { 'apikey': key, 'Authorization': `Bearer ${key}` }
      });
      const mats = await matsRes.json();
      for (const m of mats) {
        await fetch(`${baseUrl}inventory_materials?id=eq.${m.id}`, {
          method: 'DELETE',
          headers: { 'apikey': key, 'Authorization': `Bearer ${key}` }
        });
        console.log(`Cleaned up Mock Tomato 777 with id ${m.id}`);
      }
    }
  } catch (err) {
    console.error('Failed to run test:', err);
  }
}

testRealImport();
