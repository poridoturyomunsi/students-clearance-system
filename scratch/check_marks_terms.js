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
    const tables = ['marks', 'olevel_marks', 'uace_marks', 'fees'];
    for (const table of tables) {
      const [rows] = await connection.query(`SELECT DISTINCT term FROM ${table}`);
      console.log(`Distinct terms in ${table}:`, rows.map(r => r.term));
    }
  } catch (e) {
    console.error(e);
  } finally {
    await connection.end();
  }
}

main().catch(console.error);
