const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'src', 'utils', 'pdfGenerator.ts');
const content = fs.readFileSync(filePath, 'utf8');
const lines = content.split('\n');

console.log(`Searching for 'term' or '2026' in src/utils/pdfGenerator.ts:`);
lines.forEach((line, idx) => {
  const lineLower = line.toLowerCase();
  if (lineLower.includes('term') || lineLower.includes('2026')) {
    console.log(`${idx + 1}: ${line.trim()}`);
  }
});
