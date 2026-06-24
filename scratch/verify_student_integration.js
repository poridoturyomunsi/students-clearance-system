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
  console.log('Testing student integration details endpoint for ADM-2026-403...');
  try {
    const res = await makeRequest('http://127.0.0.1:3000/api/integration/student/ADM-2026-403');
    console.log('Student details retrieved:');
    console.log(' - Student:', res.student.name, '| Class:', res.student.gradeClass);
    console.log(' - Marks:', res.marks.length, 'records');
    console.log(' - Attendance:', res.attendance.length, 'records');
    console.log(' - Fees:', res.fees.length, 'records');
    console.log('SUCCESS: Student integration API works flawlessly!');
  } catch (err) {
    console.error('Student integration API check failed:', err);
  }
}

run();
