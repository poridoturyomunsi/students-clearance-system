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
    console.log('Altering teachers table...');
    await connection.query('ALTER TABLE teachers ADD COLUMN position VARCHAR(100) NULL AFTER classes');
    console.log('Position added.');
  } catch (e) {
    console.error('Error adding position:', e.message);
  }

  try {
    await connection.query('ALTER TABLE teachers ADD COLUMN signature LONGTEXT NULL AFTER position');
    console.log('Signature added.');
  } catch (e) {
    console.error('Error adding signature:', e.message);
  }

  try {
    const [desc] = await connection.query('DESCRIBE teachers');
    console.log('New schema description:', desc);
  } catch (e) {
    console.error(e);
  } finally {
    await connection.end();
  }
}

main().catch(console.error);
