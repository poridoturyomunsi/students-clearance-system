const mysql = require('C:/Users/Student/Downloads/Students Clearance Cards/node_modules/mysql2/promise');

async function main() {
  const connection = await mysql.createConnection({
    host: "192.168.0.155",
    port: 3306,
    user: 'root',
    password: 'root123',
    database: 'school_system'
  });

  try {
    console.log('--- RECENT AUDIT LOGS ---');
    const [logs] = await connection.query("SELECT * FROM audit_logs ORDER BY timestamp DESC LIMIT 10");
    console.log(JSON.stringify(logs, null, 2));
  } catch (e) {
    console.error(e);
  } finally {
    await connection.end();
  }
}

main().catch(console.error);
