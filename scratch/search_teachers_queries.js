const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'electron', 'server.js');
const content = fs.readFileSync(filePath, 'utf8');
const lines = content.split('\n');

lines.forEach((line, idx) => {
  if (line.includes('teachers') && (line.includes('SELECT') || line.includes('INSERT') || line.includes('UPDATE'))) {
    console.log(`Line ${idx + 1}: ${line.trim()}`);
  }
});
