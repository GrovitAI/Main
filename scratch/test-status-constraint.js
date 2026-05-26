const url = 'https://pyikrlqduampooncpzri.supabase.co/rest/v1/open_orders';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB5aWtybHFkdWFtcG9vbmNwenJpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzODIxODUsImV4cCI6MjA5NDk1ODE4NX0.STg6C9ZIeIxo76ZLWy9Q1itDgkwjkw2fAJ3BSVB44mg';

const tenant_id = 'aaaaaaaa-0000-0000-0000-000000000001';
const branch_id = 'bbbbbbbb-0000-0000-0000-000000000001';

async function run() {
  console.log('Testing "unpaid" status...');
  const res1 = await fetch(url, {
    method: 'POST',
    headers: {
      'apikey': key,
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    },
    body: JSON.stringify({
      tenant_id,
      branch_id,
      order_name: 'Status Test Unpaid',
      status: 'unpaid'
    })
  });
  const data1 = await res1.json();
  console.log('Unpaid response status:', res1.status);
  console.log('Unpaid response data:', data1);

  if (res1.status === 201) {
    const id = data1[0].id;
    await fetch(`${url}?id=eq.${id}`, {
      method: 'DELETE',
      headers: {
        'apikey': key,
        'Authorization': `Bearer ${key}`
      }
    });
    console.log('Cleanup unpaid order succeeded.');
  }

  console.log('\nTesting "in_kitchen" status...');
  const res2 = await fetch(url, {
    method: 'POST',
    headers: {
      'apikey': key,
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    },
    body: JSON.stringify({
      tenant_id,
      branch_id,
      order_name: 'Status Test Kitchen',
      status: 'in_kitchen'
    })
  });
  const data2 = await res2.json();
  console.log('In Kitchen response status:', res2.status);
  console.log('In Kitchen response data:', data2);

  if (res2.status === 201) {
    const id = data2[0].id;
    await fetch(`${url}?id=eq.${id}`, {
      method: 'DELETE',
      headers: {
        'apikey': key,
        'Authorization': `Bearer ${key}`
      }
    });
    console.log('Cleanup in_kitchen order succeeded.');
  }
}

run();
