const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'electron', 'server.js');
const content = fs.readFileSync(filePath, 'utf8');
const lines = content.split('\n');

for (let i = 2555; i <= 2595; i++) {
  console.log(`${i + 1}: ${lines[i]}`);
}
