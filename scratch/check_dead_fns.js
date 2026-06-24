const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'src', 'components', 'AdminPortalExtensions.tsx');
const content = fs.readFileSync(filePath, 'utf8');
const lines = content.split('\n');

console.log("Checking references to addSubjectToForm / addClassToForm:");
lines.forEach((line, idx) => {
  if (line.includes('addSubjectToForm') || line.includes('addClassToForm')) {
    console.log(`${idx + 1}: ${line.trim()}`);
  }
});
