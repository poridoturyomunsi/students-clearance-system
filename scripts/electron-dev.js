const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const VITE_PORT_START = 5173;
const VITE_PORT_END = 5185;
const WAIT_TIMEOUT_MS = 30000;

function spawnDev() {
  const dev = spawn('npm', ['run', 'dev'], { shell: true, stdio: 'inherit' });
  dev.on('exit', (code) => {
    process.exit(code);
  });
  return dev;
}

function waitForUrl(url) {
  const http = require('http');
  return new Promise((resolve, reject) => {
    const start = Date.now();
    function checkPort(port) {
      if (Date.now() - start > WAIT_TIMEOUT_MS) {
        return reject(new Error('Vite did not start within 30 seconds.'));
      }
      const req = http.get(url.replace('{port}', port), (res) => {
        res.destroy();
        resolve(port);
      });
      req.on('error', () => {
        setTimeout(() => checkPort(port === VITE_PORT_END ? VITE_PORT_START : port + 1), 250);
      });
      req.setTimeout(2000, () => {
        req.destroy();
        setTimeout(() => checkPort(port === VITE_PORT_END ? VITE_PORT_START : port + 1), 250);
      });
    }
    checkPort(VITE_PORT_START);
  });
}

(async () => {
  const dev = spawnDev();
  try {
    const port = await waitForUrl('http://localhost:{port}');
    console.log(`Vite ready on port ${port}. Launching Electron...`);
    const electron = spawn('npx', ['electron', '.'], { shell: true, stdio: 'inherit' });
    electron.on('exit', (code) => {
      process.exit(code);
    });
  } catch (err) {
    console.error(err.message);
    dev.kill();
    process.exit(1);
  }
})();
