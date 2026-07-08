const apiKey = 'V35jlwUptTMUpLP-wuFA87phE6ufxnEtjJTTh4HjiKU';
const authHeader = 'Basic ' + Buffer.from(apiKey + ':').toString('base64');
const targetPrinterId = '75621305';

async function checkPrintNode() {
  try {
    const res = await fetch(`https://api.printnode.com/printers/${targetPrinterId}`, {
      headers: {
        'Authorization': authHeader
      }
    });
    console.log("Status:", res.status);
    const data = await res.json();
    console.log("Single Printer Response Type:", typeof data, "IsArray:", Array.isArray(data));
    console.log("Single Printer Response Content:", JSON.stringify(data, null, 2));
  } catch (err) {
    console.error("Failed to connect to PrintNode:", err);
  }
}

checkPrintNode();
