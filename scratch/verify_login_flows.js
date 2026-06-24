const http = require('http');

function postJSON(url, data) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const postData = JSON.stringify(data);
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => {
        try {
          resolve({ statusCode: res.statusCode, data: JSON.parse(body) });
        } catch (e) {
          reject(new Error(`Failed to parse response: ${body}`));
        }
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    req.write(postData);
    req.end();
  });
}

async function run() {
  console.log('Testing authentication login routes...');
  try {
    // 1. Test Admin Login
    console.log('Testing Admin Login...');
    const adminRes = await postJSON('http://127.0.0.1:3000/api/auth/login', {
      username: 'admin',
      password: 'admin123',
      role: 'admin'
    });
    console.log('Admin Login Response:', adminRes);

    // 2. Test Teacher Login
    console.log('Testing Teacher Login...');
    const teacherRes = await postJSON('http://127.0.0.1:3000/api/auth/login', {
      username: 'teacher',
      password: 'teacher123',
      role: 'teacher'
    });
    console.log('Teacher Login Response:', teacherRes);

    // 3. Test Student Login (general fallback)
    console.log('Testing General Student Login...');
    const studentRes = await postJSON('http://127.0.0.1:3000/api/auth/login', {
      username: 'student',
      password: 'student123',
      role: 'student'
    });
    console.log('Student Login Response:', studentRes);

  } catch (err) {
    console.error('Auth check failed:', err);
  }
}

run();
