const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'electron', 'server.js');
const content = fs.readFileSync(filePath, 'utf8');
const lines = content.split('\n');

function findRoute(pattern) {
  console.log(`--- Searching for "${pattern}" ---`);
  lines.forEach((line, idx) => {
    if (line.includes(pattern)) {
      console.log(`Line ${idx + 1}: ${line.trim()}`);
      // Print a few surrounding lines
      const start = Math.max(0, idx - 5);
      const end = Math.min(lines.length - 1, idx + 15);
      for (let i = start; i <= end; i++) {
        console.log(`  ${i + 1}: ${lines[i]}`);
      }
    }
  });
}

findRoute('/api/teachers');
