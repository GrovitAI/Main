const fs = require('fs');
const readline = require('readline');

async function searchImportSummary() {
  const fileStream = fs.createReadStream('C:\\Users\\Might\\.gemini\\antigravity\\brain\\421a8a14-617e-40e4-9b40-cf5080554cdc\\.system_generated\\logs\\transcript.jsonl');
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  let count = 0;
  for await (const line of rl) {
    if (line.includes('importSummary') && line.includes('rows') && line.includes('validRows')) {
      console.log(`Line ${count}:`);
      console.log(line.substring(0, 1000) + '...');
    }
    count++;
  }
}

searchImportSummary();
