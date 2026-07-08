const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB5aWtybHFkdWFtcG9vbmNwenJpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzODIxODUsImV4cCI6MjA5NDk1ODE4NX0.STg6C9ZIeIxo76ZLWy9Q1itDgkwjkw2fAJ3BSVB44mg';
const baseUrl = 'https://pyikrlqduampooncpzri.supabase.co/rest/v1/';

async function cleanup() {
  const ids = [
    'c2e7547c-e037-4647-93dd-b5a4f4f77c4d',
    'ef55e621-fa93-48d6-a934-9539a24244ed',
    '17887972-5f53-4eaf-9a25-2eec823f4bfa'
  ];
  for (const id of ids) {
    const res = await fetch(`${baseUrl}inventory_materials?id=eq.${id}`, {
      method: 'DELETE',
      headers: {
        'apikey': key,
        'Authorization': `Bearer ${key}`
      }
    });
    console.log(`Deleted ${id}: status =`, res.status);
  }
}

cleanup();
