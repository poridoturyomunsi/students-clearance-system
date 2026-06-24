const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

async function main() {
  const configs = [
    {
      host: "192.168.0.155",
      port: 3306,
      user: 'root',
      password: 'root123',
      database: 'school_system'
    },
    {
      host: "192.168.0.155",
      port: 3306,
      user: 'root',
      password: '',
      database: 'school_system'
    }
  ];

  for (const config of configs) {
    try {
      console.log(`Trying connection to ${config.host} with password "${config.password}"...`);
      const connection = await mysql.createConnection(config);
      console.log('Connected successfully!');
      
      const [teachers] = await connection.query("SELECT name, position, signature IS NOT NULL as has_sig FROM teachers");
      console.log('Teachers in database:');
      console.log(teachers);
      
      const [settings] = await connection.query("SELECT key_name, val_value FROM settings LIMIT 5");
      console.log('Settings in database:');
      console.log(settings);

      await connection.end();
      return;
    } catch (e) {
      console.error(`Connection failed: ${e.message}`);
    }
  }
}

main().catch(console.error);
