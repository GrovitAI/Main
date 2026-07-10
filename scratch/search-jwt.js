const fs = require('fs');
const path = require('path');

const brainDir = 'C:/Users/Might/.gemini/antigravity/brain/d44934bd-692f-42d8-b4a3-989d975ee17e';
const files = fs.readdirSync(brainDir);

files.forEach(f => {
  if (f.endsWith('.sql')) {
    const p = path.join(brainDir, f);
    const content = fs.readFileSync(p, 'utf8');
    content.split('\n').forEach((line, idx) => {
      if (line.toLowerCase().includes('jwt')) {
        console.log(`[${f}:${idx+1}]: ${line.trim()}`);
      }
    });
  }
});
