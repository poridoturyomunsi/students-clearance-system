/**
 * Utility script to migrate local MySQL database (tables + data)
 * to a cloud MySQL instance like Aiven, Railway, or PlanetScale.
 *
 * Usage:
 *   node scripts/migrate-to-cloud-db.js "mysql://avnadmin:password@host:port/defaultdb?ssl-mode=REQUIRED"
 */

const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const targetUri = process.argv[2] || process.env.DATABASE_URL;

if (!targetUri) {
  console.error("❌ ERROR: Please provide the target database connection string.");
  console.error('Usage: node scripts/migrate-to-cloud-db.js "mysql://user:pass@host:port/dbname"');
  process.exit(1);
}

async function migrate() {
  console.log("🚀 Starting database migration to cloud...");

  // 1. Connect to Local DB
  const localConfig = {
    host: process.env.DB_HOST || '127.0.0.1',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_DATABASE || 'student_clearance'
  };

  let localConn, cloudConn;

  try {
    console.log("🔌 Connecting to local MySQL database...");
    localConn = await mysql.createConnection(localConfig);
    console.log("✅ Connected to local database.");

    console.log("🔌 Connecting to Cloud MySQL database...");
    cloudConn = await mysql.createConnection(targetUri);
    console.log("✅ Connected to cloud database.");

    // 2. Read and apply schema.sql
    const schemaPath = path.join(__dirname, '..', 'schema.sql');
    if (fs.existsSync(schemaPath)) {
      console.log("📜 Executing schema.sql on cloud database...");
      let schemaSql = fs.readFileSync(schemaPath, 'utf8');
      
      // Remove CREATE DATABASE & USE statements as cloud DB usually provides a specific database
      schemaSql = schemaSql.replace(/CREATE DATABASE IF NOT EXISTS school_system;/gi, '')
                           .replace(/USE school_system;/gi, '');

      const statements = schemaSql.split(';').map(s => s.trim()).filter(s => s.length > 0);
      for (const stmt of statements) {
        try {
          await cloudConn.query(stmt);
        } catch (err) {
          if (!err.message.includes('already exists')) {
            console.warn("   Notice:", err.message);
          }
        }
      }
      console.log("✅ Schema applied successfully.");
    }

    // 3. Migrate Students Data
    console.log("📦 Migrating students table...");
    const [students] = await localConn.query("SELECT * FROM students");
    console.log(`   Found ${students.length} students locally.`);

    let migratedStudents = 0;
    for (const s of students) {
      const keys = Object.keys(s);
      const values = Object.values(s);
      const placeholders = keys.map(() => '?').join(', ');
      const updates = keys.map(k => `${k} = VALUES(${k})`).join(', ');

      const sql = `INSERT INTO students (${keys.join(', ')}) VALUES (${placeholders}) ON DUPLICATE KEY UPDATE ${updates}`;
      await cloudConn.query(sql, values);
      migratedStudents++;
    }
    console.log(`✅ Migrated ${migratedStudents} students to cloud.`);

    // 4. Migrate Marks Data if exists
    try {
      const [marks] = await localConn.query("SELECT * FROM marks");
      if (marks.length > 0) {
        console.log(`📦 Migrating ${marks.length} marks records...`);
        for (const m of marks) {
          const keys = Object.keys(m);
          const values = Object.values(m);
          const placeholders = keys.map(() => '?').join(', ');
          const sql = `INSERT IGNORE INTO marks (${keys.join(', ')}) VALUES (${placeholders})`;
          await cloudConn.query(sql, values);
        }
        console.log(`✅ Migrated marks successfully.`);
      }
    } catch (e) {
      // marks table optional
    }

    console.log("\n🎉 MIGRATION COMPLETED SUCCESSFULLY!");
    console.log("You can now set DATABASE_URL on Vercel environment variables with your connection string.");

  } catch (err) {
    console.error("❌ Migration failed:", err.message);
  } finally {
    if (localConn) await localConn.end();
    if (cloudConn) await cloudConn.end();
  }
}

migrate();
