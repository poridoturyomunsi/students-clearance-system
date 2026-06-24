const http = require('http');

const payload = {
  assessment_limits: JSON.stringify({
    olevel: { integration_max: 4, exam_max: 100 },
    uace: { score_max: 100 }
  })
};

const data = JSON.stringify(payload);

const options = {
  hostname: 'localhost',
  port: 3002,
  path: '/api/settings',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(data)
  }
};

const req = http.request(options, (res) => {
  let body = '';
  res.on('data', (chunk) => { body += chunk; });
  res.on('end', () => {
    console.log('STATUS:', res.statusCode);
    console.log('BODY:', body);
  });
});

req.on('error', (e) => {
  console.error('Request failed:', e.message);
});

req.write(data);
req.end();
