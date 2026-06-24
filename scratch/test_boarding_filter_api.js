const http = require('http');

function makeRequest(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        resolve(JSON.parse(data));
      });
    }).on('error', (err) => {
      reject(err);
    });
  });
}

async function run() {
  console.log('Testing boarding filters against server...');
  try {
    const hostellersRes = await makeRequest('http://127.0.0.1:3000/api/students?boardingStatus=Hostellers&limit=5');
    console.log('Hostellers query (status=Hostellers):', hostellersRes.data.length, 'returned');
    hostellersRes.data.forEach(s => {
      console.log(` - Student: ${s.name} | Status: ${s.boardingStatus}`);
    });
  } catch (err) {
    console.error('API request failed:', err);
  }
}

run();
