const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

async function run() {
  try {
    const possiblePaths = [
      path.join(process.env.APPDATA || '', 'students-clearance-cards', 'db_config.json'),
      path.join(__dirname, '..', 'db_config.json'),
      path.join(process.cwd(), 'db_config.json')
    ];

    let dbConfig = null;
    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        try {
          const fullConfig = JSON.parse(fs.readFileSync(p, 'utf8'));
          console.log('Found config at:', p);
          console.log('Config:', JSON.stringify(fullConfig, null, 2));
          if (fullConfig.db) {
            dbConfig = fullConfig.db;
            break;
          }
        } catch (e) {
          console.log('Error reading config at:', p, e.message);
        }
      }
    }

    if (!dbConfig) {
      console.error('No database configuration found.');
      return;
    }

    console.log('Connecting to database:', dbConfig.database, 'on', dbConfig.host, 'port', dbConfig.port);
    const conn = await mysql.createConnection({
      host: dbConfig.host,
      port: dbConfig.port,
      user: dbConfig.user,
      password: dbConfig.password,
      database: dbConfig.database
    });

    const [rows] = await conn.query('SELECT id, adminNo, name, LENGTH(photo) as photo_len, SUBSTRING(photo, 1, 50) as photo_prefix FROM students WHERE photo IS NOT NULL AND photo != "" LIMIT 5');
    console.log('Students with photos in DB:');
    console.log(rows);

    await conn.end();
  } catch (err) {
    console.error('Error:', err);
  }
}

run().catch(console.error);
