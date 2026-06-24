const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'src', 'App.tsx');
const content = fs.readFileSync(filePath, 'utf8');
const lines = content.split('\n');

console.log(`Searching for 'term' in src/App.tsx:`);
lines.forEach((line, idx) => {
  if (line.toLowerCase().includes('term')) {
    console.log(`${idx + 1}: ${line.trim()}`);
  }
});
