const http = require('http');

const payload = {
  gradeClass: 'S.1 A',
  subject: 'Mathematics',
  term: '2',
  year: 2026,
  teacherId: 'T-DEFAULT',
  marksList: [
    {
      student_id: 'stud-1781548229260',
      integration1: 2,
      integration2: 3,
      integration3: 1,
      exam_score: 78
    }
  ]
};

const data = JSON.stringify(payload);

const options = {
  hostname: 'localhost',
  port: 3002,
  path: '/api/teacher/marks',
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
