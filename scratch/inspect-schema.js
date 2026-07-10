const fs = require('fs');
const path = require('path');

function searchDir(dir) {
  if (!fs.existsSync(dir)) return;
  const items = fs.readdirSync(dir);
  items.forEach(item => {
    const fullPath = path.join(dir, item);
    if (fs.statSync(fullPath).isDirectory()) {
      if (item !== 'node_modules' && !item.startsWith('.')) {
        searchDir(fullPath);
      }
    } else if (item.endsWith('.sql')) {
      const content = fs.readFileSync(fullPath, 'utf8');
      content.split('\n').forEach((line, idx) => {
        if (line.toLowerCase().includes('create table')) {
          console.log(`[${item}:${idx+1}]: ${line.trim()}`);
        }
      });
    }
  });
}

searchDir('c:/Users/Might/Grovit');
searchDir('C:/Users/Might/.gemini/antigravity/brain/d44934bd-692f-42d8-b4a3-989d975ee17e');
