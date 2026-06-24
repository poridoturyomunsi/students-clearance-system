const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'src', 'components', 'TeacherPortal.tsx');
const content = fs.readFileSync(filePath, 'utf8');
const lines = content.split('\n');

console.log("Searching in TeacherPortal.tsx:");
lines.forEach((line, idx) => {
  const lower = line.toLowerCase();
  if (lower.includes('excel') || lower.includes('upload') || lower.includes('file') || lower.includes('xlsx')) {
    console.log(`${idx + 1}: ${line.trim()}`);
  }
});
