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
    const [rows] = await connection.query("SELECT key_name FROM settings");
    console.log("Settings keys:", rows.map(r => r.key_name));
  } catch (e) {
    console.error(e);
  } finally {
    await connection.end();
  }
}

main().catch(console.error);
