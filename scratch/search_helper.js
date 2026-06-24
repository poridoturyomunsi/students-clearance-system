const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'src', 'components', 'TeacherPortal.tsx');
if (!fs.existsSync(filePath)) {
  console.log('File does not exist');
  process.exit(1);
}

const content = fs.readFileSync(filePath, 'utf8');
const lines = content.split('\n');

console.log('Searching for class/stream select states in TeacherPortal.tsx...');
lines.forEach((line, idx) => {
  if (line.includes('selectedClass') || line.includes('classVal')) {
    console.log(`${idx + 1}: ${line.trim()}`);
  }
});
