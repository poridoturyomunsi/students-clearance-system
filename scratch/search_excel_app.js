const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'src', 'App.tsx');
const content = fs.readFileSync(filePath, 'utf8');
const lines = content.split('\n');

console.log("Searching in App.tsx:");
lines.forEach((line, idx) => {
  const lower = line.toLowerCase();
  if (lower.includes('xlsx') || lower.includes('excel') || lower.includes('readasbinarystring') || lower.includes('readasarraybuffer')) {
    console.log(`${idx + 1}: ${line.trim()}`);
  }
});
