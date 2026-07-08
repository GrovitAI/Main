const fs = require('fs');
const readline = require('readline');

async function searchTranscript() {
  const fileStream = fs.createReadStream('C:\\Users\\Might\\.gemini\\antigravity\\brain\\421a8a14-617e-40e4-9b40-cf5080554cdc\\.system_generated\\logs\\transcript.jsonl');
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  console.log('--- USER INPUTS FROM HISTORY ---');
  for await (const line of rl) {
    try {
      const obj = JSON.parse(line);
      if (obj.type === 'USER_INPUT') {
        console.log(`[USER]: ${obj.content}`);
      } else if (obj.type === 'PLANNER_RESPONSE' && obj.content && (obj.content.includes('dispatch') || obj.content.includes('save') || obj.content.includes('fail'))) {
        // print brief summary of model thinking if relevant
        // console.log(`[MODEL]: ${obj.content.substring(0, 150)}...`);
      }
    } catch (e) {
      // ignore parse errors
    }
  }
}

searchTranscript();
