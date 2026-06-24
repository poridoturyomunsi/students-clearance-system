const fs = require('fs');
const path = require('path');

function walkDir(dir, callback) {
  fs.readdirSync(dir).forEach(f => {
    let dirPath = path.join(dir, f);
    let isDirectory = fs.statSync(dirPath).isDirectory();
    if (isDirectory) {
      walkDir(dirPath, callback);
    } else {
      callback(dirPath);
    }
  });
}

walkDir(path.join(__dirname, '..', 'src'), (filePath) => {
  if (filePath.endsWith('.tsx') || filePath.endsWith('.ts')) {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    lines.forEach((line, idx) => {
      const match = line.match(/(Term\s*[123]|term|Term\s*=\s*|value=\s*['"]?[123]['"]?)/i);
      if (match && !line.includes('watermarkOpacity')) {
        console.log(`${path.basename(filePath)}:${idx + 1}: ${line.trim()}`);
      }
    });
  }
});
