const apiKey = 'V35jlwUptTMUpLP-wuFA87phE6ufxnEtjJTTh4HjiKU';
const authHeader = 'Basic ' + Buffer.from(apiKey + ':').toString('base64');

async function listAll() {
  const res = await fetch('https://api.printnode.com/printers', {
    headers: { 'Authorization': authHeader }
  });
  const data = await res.json();
  data.forEach(p => {
    console.log(`ID: ${p.id}, Name: ${p.name}, State: ${p.state}`);
  });
}
listAll();
