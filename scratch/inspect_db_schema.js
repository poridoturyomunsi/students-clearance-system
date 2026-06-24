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
    console.log('--- settings Table ---');
    const [settings] = await connection.query("SELECT * FROM settings");
    console.log(settings);

    console.log('--- teachers Table ---');
    const [teachers] = await connection.query("SELECT id, name, username FROM teachers");
    console.log(teachers);

    console.log('--- class_teachers Table ---');
    const [classTeachers] = await connection.query("SELECT * FROM class_teachers");
    console.log(classTeachers);

    // Let's describe the tables to check their schemas exactly
    console.log('--- Describe teachers ---');
    const [descTeachers] = await connection.query("DESCRIBE teachers");
    console.log(descTeachers);

    console.log('--- Describe settings ---');
    const [descSettings] = await connection.query("DESCRIBE settings");
    console.log(descSettings);

  } catch (e) {
    console.error(e);
  } finally {
    await connection.end();
  }
}

main().catch(console.error);
