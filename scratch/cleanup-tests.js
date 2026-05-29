const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB5aWtybHFkdWFtcG9vbmNwenJpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzODIxODUsImV4cCI6MjA5NDk1ODE4NX0.STg6C9ZIeIxo76ZLWy9Q1itDgkwjkw2fAJ3BSVB44mg';
const url = 'https://pyikrlqduampooncpzri.supabase.co/rest/v1/printers';

async function cleanup() {
  console.log('Cleaning up test printers...');
  try {
    const res = await fetch(`${url}?name=like.Test*`, {
      method: 'DELETE',
      headers: {
        'apikey': key,
        'Authorization': `Bearer ${key}`
      }
    });
    console.log('Test printers cleanup status:', res.status);
    
    const res2 = await fetch(`${url}?name=like.Standard*`, {
      method: 'DELETE',
      headers: {
        'apikey': key,
        'Authorization': `Bearer ${key}`
      }
    });
    console.log('Standard printers cleanup status:', res2.status);
  } catch (err) {
    console.error('Cleanup failed:', err);
  }
}

cleanup();
