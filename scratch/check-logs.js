const fs = require('fs');
const readline = require('readline');

async function searchLogs() {
  const fileStream = fs.createReadStream('C:\\Users\\Might\\.gemini\\antigravity\\brain\\421a8a14-617e-40e4-9b40-cf5080554cdc\\.system_generated\\logs\\transcript.jsonl');
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  let count = 0;
  for await (const line of rl) {
    if (line.includes('Failed to save material') || line.includes('importRawMaterials')) {
      console.log(`Line ${count}:`);
      // truncate to 300 chars to avoid flooding
      console.log(line.substring(0, 500) + '...');
    }
    count++;
  }
}

searchLogs();
