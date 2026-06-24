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
    const [rows] = await connection.query("SELECT DISTINCT boardingStatus FROM students");
    console.log("Distinct boardingStatus values:", rows);
  } catch (e) {
    console.error(e);
  } finally {
    await connection.end();
  }
}

main();
