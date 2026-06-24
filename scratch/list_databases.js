const mysql = require('mysql2/promise');

async function main() {
  const connection = await mysql.createConnection({
    host: "192.168.0.155",
    port: 3306,
    user: 'root',
    password: 'root123'
  });

  try {
    const [databases] = await connection.query("SHOW DATABASES");
    console.log('Databases:', databases);

    // If there is any database, select it and show tables
    for (const db of databases) {
      const dbName = db.Database || db.database;
      if (['information_schema', 'mysql', 'performance_schema', 'sys'].includes(dbName)) continue;
      
      console.log(`\n--- Tables in ${dbName} ---`);
      await connection.query(`USE \`${dbName}\``);
      const [tables] = await connection.query("SHOW TABLES");
      console.log(tables);
    }
  } catch (e) {
    console.error(e);
  } finally {
    await connection.end();
  }
}

main().catch(console.error);
