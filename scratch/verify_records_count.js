const http = require('http');

function makeRequest(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`Failed to parse JSON: ${data.substring(0, 100)}`));
        }
      });
    }).on('error', (err) => {
      reject(err);
    });
  });
}

async function run() {
  console.log('Verifying Express server student records count...');
  try {
    const stats = await makeRequest('http://127.0.0.1:3000/api/stats');
    console.log('Stats:', stats);
    if (stats.total === 623) {
      console.log('SUCCESS: Express server returns exactly 623 student records!');
    } else {
      console.warn(`WARNING: Express server returned ${stats.total} instead of 623 records.`);
    }
  } catch (err) {
    console.error('Failed to query statistics:', err);
  }
}

run();
