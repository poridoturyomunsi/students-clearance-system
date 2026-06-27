try {
  require('dotenv').config();
} catch (e) {
  // ignore if not installed
}
const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');
const cloudinary = require('cloudinary').v2;

let pool = null;
let currentDbConfig = null;
let dbInitialized = false;
let initializingDb = false;
let lastDbError = null;


function normalizeDbConfig(rawConfig) {
  if (!rawConfig || typeof rawConfig !== 'object') return null;

  const host = rawConfig.db?.host || rawConfig.host || rawConfig.databaseHost || rawConfig.databaseHost || '';
  const port = parseInt(String(rawConfig.db?.port || rawConfig.port || rawConfig.databasePort || 3306), 10) || 3306;
  const user = rawConfig.db?.user || rawConfig.user || rawConfig.databaseUsername || '';
  const password = rawConfig.db?.password || rawConfig.password || rawConfig.databasePassword || '';
  const database = rawConfig.db?.database || rawConfig.database || rawConfig.databaseName || 'school_system';

  return {
    host,
    port,
    user,
    password,
    database
  };
}

function parseConnectionUri(uri) {
  if (typeof uri !== 'string') return null;
  const url = require('url');
  try {
    const parsed = url.parse(uri);
    const auth = parsed.auth ? parsed.auth.split(':') : [];
    const user = decodeURIComponent(auth[0] || '');
    const password = decodeURIComponent(auth[1] || '');
    const database = decodeURIComponent(parsed.pathname ? parsed.pathname.replace(/^\//, '') : '');
    const hostParts = parsed.host ? parsed.host.split(':') : [];
    const host = hostParts[0] || '';
    const port = parseInt(hostParts[1], 10) || 3306;
    return { host, port, user, password, database };
  } catch (e) {
    console.error('Failed to parse connection URI:', e.message);
    return null;
  }
}


// In-memory caching variables
let classesCache = null;
let streamsCache = null;
let settingsCache = {};
let statsCache = null;
let statsCacheExpiry = 0;
const pdfTasks = {};

function getInitials(name) {
  if (!name) return '';
  try {
    return name
      .split(' ')
      .filter(part => part.length > 0)
      .map(part => part.charAt(0).toUpperCase())
      .join('');
  } catch (err) {
    console.error('Error generating initials:', err);
    return 'N/A';
  }
}

function calculateUACEPoints(marks) {
  const subjects = {};
  marks.forEach(m => {
    if (!subjects[m.subject]) {
      subjects[m.subject] = {
        type: m.subject_type,
        scores: []
      };
    }
    subjects[m.subject].scores.push(parseFloat(m.score || 0));
  });

  let principalPoints = 0;
  let subsidiaryPoints = 0;
  Object.values(subjects).forEach(sub => {
    const avgScore = sub.scores.reduce((a, b) => a + b, 0) / sub.scores.length;
    if (sub.type === 'General Paper' || sub.type === 'Subsidiary') {
      if (avgScore >= 35) {
        subsidiaryPoints += 1;
      }
    } else {
      let pts = 0;
      if (avgScore >= 70) pts = 6;
      else if (avgScore >= 60) pts = 5;
      else if (avgScore >= 50) pts = 4;
      else if (avgScore >= 45) pts = 3;
      else if (avgScore >= 40) pts = 2;
      else if (avgScore >= 35) pts = 1;
      principalPoints += pts;
    }
  });

  return { principalPoints, subsidiaryPoints, totalPoints: principalPoints + subsidiaryPoints };
}

const imageCache = {};

async function getBase64ImageFromUrl(url) {
  if (!url) return null;
  if (url.startsWith('data:')) {
    return url;
  }
  if (imageCache[url]) {
    return imageCache[url];
  }
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.statusText}`);
    }
    const contentType = response.headers.get('content-type') || 'image/jpeg';
    const arrayBuffer = await response.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');
    const dataUri = `data:${contentType};base64,${base64}`;
    imageCache[url] = dataUri;
    return dataUri;
  } catch (err) {
    console.error(`Error resolving image URL to base64 for "${url}":`, err);
    return null;
  }
}

async function uploadToCloudinaryIfNeeded(photoBase64, publicId) {
  if (!photoBase64 || !photoBase64.startsWith('data:')) {
    return photoBase64;
  }
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  if (!cloudName || !apiKey || !apiSecret) {
    return photoBase64;
  }
  try {
    cloudinary.config({
      cloud_name: cloudName,
      api_key: apiKey,
      api_secret: apiSecret
    });
    console.log(`[Cloudinary] Uploading image for public ID ${publicId}...`);
    
    // Set up a 2.5-second upload timeout limit
    const uploadPromise = cloudinary.uploader.upload(photoBase64, {
      public_id: publicId,
      folder: 'school_management_system',
      resource_type: 'image',
      overwrite: true,
      invalidate: true
    });
    
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Cloudinary upload timed out (exceeded 2.5s)')), 2500)
    );
    
    const result = await Promise.race([uploadPromise, timeoutPromise]);
    console.log('[Cloudinary] Upload successful. URL:', result.secure_url);
    return result.secure_url;
  } catch (err) {
    console.error('[Cloudinary] Upload failed or timed out:', err.message);
    return photoBase64;
  }
}

// Helper for audit logging
async function writeAuditLog(action, details = null) {
  try {
    if (pool && dbInitialized) {
      await pool.query('INSERT INTO audit_logs (action, details) VALUES (?, ?)', [action, details]);
    }
  } catch (err) {
    console.error('Failed to write audit log:', err);
  }
}

function getExportsDir() {
  const fs = require('fs');
  const path = require('path');
  const dir = process.env.VERCEL
    ? path.join('/tmp', 'exports')
    : path.join(__dirname, '..', 'exports');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function isSameConfig(c1, c2) {
  if (!c1 || !c2) return false;
  return c1.host === c2.host &&
         c1.port === c2.port &&
         c1.user === c2.user &&
         c1.password === c2.password &&
         c1.database === c2.database;
}

async function ensureDbInitialized() {
  if (!pool || !currentDbConfig) return false;
  if (dbInitialized) return true;

  if (initializingDb) return false;
  initializingDb = true;

  try {
    let connection;
    try {
      connection = await pool.getConnection();
    } catch (connErr) {
      if (connErr.errno === 1049 || connErr.code === 'ER_BAD_DB_ERROR') {
        console.log(`Database "${currentDbConfig.database}" does not exist. Creating it...`);
        const tempConnection = await mysql.createConnection({
          host: currentDbConfig.host,
          port: parseInt(String(currentDbConfig.port), 10) || 3306,
          user: currentDbConfig.user,
          password: currentDbConfig.password,
          connectTimeout: 5000
        });
        await tempConnection.query(`CREATE DATABASE IF NOT EXISTS \`${currentDbConfig.database}\``);
        await tempConnection.end();
        console.log(`Database "${currentDbConfig.database}" created.`);
        connection = await pool.getConnection();
      } else {
        throw connErr;
      }
    }

    if (connection) {
      connection.release();
    }

    const tableQueries = [
      `CREATE TABLE IF NOT EXISTS classes (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(50) NOT NULL UNIQUE,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,
      
      `CREATE TABLE IF NOT EXISTS streams (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(50) NOT NULL UNIQUE,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,
      
      `CREATE TABLE IF NOT EXISTS students (
        id VARCHAR(50) PRIMARY KEY,
        adminNo VARCHAR(50) NOT NULL,
        name VARCHAR(255) NOT NULL,
        aliases TEXT NULL,
        gender VARCHAR(10) NOT NULL,
        gradeClass VARCHAR(50) NOT NULL,
        boardingStatus VARCHAR(50) NOT NULL,
        isCleared BOOLEAN NOT NULL DEFAULT FALSE,
        gateClearanceDate VARCHAR(20) NULL,
        mealsClearanceDate VARCHAR(20) NULL,
        remarks TEXT NULL,
        photo LONGTEXT NULL,
        photoOriginal LONGTEXT NULL,
        photoEnhanced LONGTEXT NULL,
        printStatus VARCHAR(20) NOT NULL DEFAULT 'Not Printed',
        updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,
      
      `CREATE TABLE IF NOT EXISTS marks (
        id INT AUTO_INCREMENT PRIMARY KEY,
        student_id VARCHAR(50) NOT NULL,
        subject VARCHAR(100) NOT NULL,
        marks_obtained DECIMAL(5,2) NOT NULL,
        max_marks DECIMAL(5,2) NOT NULL DEFAULT 100.00,
        term VARCHAR(20) NOT NULL,
        year INT NOT NULL,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
        UNIQUE KEY \`unique_student_subject_term\` (student_id, subject, term, year)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,
      
      `CREATE TABLE IF NOT EXISTS attendance (
        id INT AUTO_INCREMENT PRIMARY KEY,
        student_id VARCHAR(50) NOT NULL,
        date DATE NOT NULL,
        status ENUM('Present', 'Absent', 'Late', 'Excused') NOT NULL,
        remarks VARCHAR(255) NULL,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
        UNIQUE KEY \`unique_student_date\` (student_id, date)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,
      
      `CREATE TABLE IF NOT EXISTS fees (
        id INT AUTO_INCREMENT PRIMARY KEY,
        student_id VARCHAR(50) NOT NULL,
        term VARCHAR(20) NOT NULL,
        year INT NOT NULL,
        amount_due DECIMAL(12,2) NOT NULL DEFAULT 0.00,
        amount_paid DECIMAL(12,2) NOT NULL DEFAULT 0.00,
        balance DECIMAL(12,2) GENERATED ALWAYS AS (amount_due - amount_paid) STORED,
        payment_status ENUM('Paid', 'Pending', 'Overdue') NOT NULL DEFAULT 'Pending',
        updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
        UNIQUE KEY \`unique_student_term\` (student_id, term, year)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,
      
      `CREATE TABLE IF NOT EXISTS settings (
        key_name VARCHAR(50) PRIMARY KEY,
        val_value LONGTEXT NULL,
        updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

      `CREATE TABLE IF NOT EXISTS audit_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        action VARCHAR(255) NOT NULL,
        details TEXT NULL,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

      `CREATE TABLE IF NOT EXISTS print_history (
        id INT AUTO_INCREMENT PRIMARY KEY,
        student_ids TEXT NOT NULL,
        print_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        layout_mode VARCHAR(50) NOT NULL,
        pdf_path VARCHAR(255) NOT NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

      `CREATE TABLE IF NOT EXISTS teachers (
        id VARCHAR(50) PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        name VARCHAR(100) NOT NULL,
        gender VARCHAR(20) NULL,
        subjects JSON NOT NULL,
        classes JSON NOT NULL,
        position VARCHAR(100) NULL,
        signature LONGTEXT NULL,
        photo LONGTEXT NULL,
        status VARCHAR(20) DEFAULT 'Active',
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

      `CREATE TABLE IF NOT EXISTS student_accounts (
        student_id VARCHAR(50) PRIMARY KEY,
        password_hash VARCHAR(255) NOT NULL,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

      `CREATE TABLE IF NOT EXISTS olevel_marks (
        id INT AUTO_INCREMENT PRIMARY KEY,
        student_id VARCHAR(50) NOT NULL,
        subject VARCHAR(100) NOT NULL,
        integration1 DECIMAL(3,1) NULL,
        integration2 DECIMAL(3,1) NULL,
        integration3 DECIMAL(3,1) NULL,
        exam_score DECIMAL(5,2) NULL,
        term VARCHAR(20) NOT NULL,
        year INT NOT NULL,
        teacher_id VARCHAR(50) NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'Draft',
        updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
        UNIQUE KEY \`unique_olevel_subject_term\` (student_id, subject, term, year)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

      `CREATE TABLE IF NOT EXISTS uace_marks (
        id INT AUTO_INCREMENT PRIMARY KEY,
        student_id VARCHAR(50) NOT NULL,
        subject VARCHAR(100) NOT NULL,
        subject_type VARCHAR(20) NOT NULL,
        paper INT NOT NULL DEFAULT 1,
        score DECIMAL(5,2) NOT NULL,
        bot DECIMAL(5,2) NOT NULL DEFAULT 0.00,
        mot DECIMAL(5,2) NOT NULL DEFAULT 0.00,
        eot DECIMAL(5,2) NOT NULL DEFAULT 0.00,
        grade VARCHAR(2) NULL,
        points INT NOT NULL DEFAULT 0,
        term VARCHAR(20) NOT NULL,
        year INT NOT NULL,
        teacher_id VARCHAR(50) NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'Draft',
        updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
        UNIQUE KEY \`unique_uace_subject_paper_term\` (student_id, subject, paper, term, year)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

      `CREATE TABLE IF NOT EXISTS teacher_assignments (
        id INT AUTO_INCREMENT PRIMARY KEY,
        teacher_id VARCHAR(50) NOT NULL,
        subject VARCHAR(100) NOT NULL,
        grade_class VARCHAR(50) NOT NULL,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE CASCADE,
        UNIQUE KEY \`unique_teacher_subject_class\` (teacher_id, subject, grade_class)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

      `CREATE TABLE IF NOT EXISTS class_teachers (
        id INT AUTO_INCREMENT PRIMARY KEY,
        grade_class VARCHAR(50) UNIQUE NOT NULL,
        teacher_id VARCHAR(50) NOT NULL,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,
      `CREATE TABLE IF NOT EXISTS announcements (
        id INT AUTO_INCREMENT PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        content TEXT NOT NULL,
        author VARCHAR(100) NOT NULL DEFAULT 'Administrator',
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`
    ];

    for (const q of tableQueries) {
      await pool.query(q);
    }

    // Alter student_accounts table to support account status, last login, and change password flag
    try {
      await pool.query("ALTER TABLE student_accounts ADD COLUMN status VARCHAR(20) DEFAULT 'Active' AFTER password_hash");
    } catch (e) {}
    try {
      await pool.query("ALTER TABLE student_accounts ADD COLUMN lastLogin TIMESTAMP NULL AFTER status");
    } catch (e) {}
    try {
      await pool.query("ALTER TABLE student_accounts ADD COLUMN needs_password_change TINYINT(1) DEFAULT 1 AFTER lastLogin");
    } catch (e) {}

    // Alter teachers table to add position and signature if missing
    try {
      await pool.query('ALTER TABLE teachers ADD COLUMN position VARCHAR(100) NULL AFTER classes');
    } catch (e) {}
    try {
      await pool.query('ALTER TABLE teachers ADD COLUMN signature LONGTEXT NULL AFTER position');
    } catch (e) {}
    try {
      await pool.query('ALTER TABLE teachers ADD COLUMN gender VARCHAR(20) NULL AFTER name');
    } catch (e) {}
    try {
      await pool.query('ALTER TABLE teachers ADD COLUMN photo LONGTEXT NULL AFTER signature');
    } catch (e) {}
    try {
      await pool.query("ALTER TABLE teachers ADD COLUMN status VARCHAR(20) DEFAULT 'Active' AFTER photo");
    } catch (e) {}

    // Alter students table to add aliases field if missing
    try {
      await pool.query('ALTER TABLE students ADD COLUMN aliases TEXT NULL AFTER name');
    } catch (e) {}

    // Alter students table to add photoOriginal and photoEnhanced if missing
    try {
      await pool.query("ALTER TABLE students ADD COLUMN photoOriginal LONGTEXT NULL AFTER photo");
    } catch (e) {}
    try {
      await pool.query("ALTER TABLE students ADD COLUMN photoEnhanced LONGTEXT NULL AFTER photoOriginal");
    } catch (e) {}

    // Alter students table to add uace_combination if missing
    try {
      await pool.query('ALTER TABLE students ADD COLUMN uace_combination VARCHAR(50) NULL AFTER printStatus');
    } catch (e) {
      // Column may already exist
    }
    try {
      await pool.query("ALTER TABLE students ADD COLUMN parentName VARCHAR(255) NULL AFTER uace_combination");
    } catch (e) {}
    try {
      await pool.query("ALTER TABLE students ADD COLUMN parentContact VARCHAR(255) NULL AFTER parentName");
    } catch (e) {}

    // Create performance indexes if they don't exist
    try {
      await pool.query('ALTER TABLE students ADD INDEX idx_adminNo (adminNo)');
    } catch (e) {}
    try {
      await pool.query('ALTER TABLE students ADD INDEX idx_name (name(100))');
    } catch (e) {}
    try {
      await pool.query('ALTER TABLE students ADD INDEX idx_gradeClass (gradeClass)');
    } catch (e) {}
    try {
      await pool.query('ALTER TABLE students ADD INDEX idx_isCleared (isCleared)');
    } catch (e) {}
    // OPTIMIZED: Add more filter column indexes for faster WHERE clause execution
    try {
      await pool.query('ALTER TABLE students ADD INDEX idx_boardingStatus (boardingStatus)');
    } catch (e) {}
    try {
      await pool.query('ALTER TABLE students ADD INDEX idx_printStatus (printStatus)');
    } catch (e) {}
    try {
      await pool.query('ALTER TABLE students ADD INDEX idx_gender (gender)');
    } catch (e) {}
    // OPTIMIZED: Add composite index for common search patterns
    try {
      await pool.query('ALTER TABLE students ADD INDEX idx_search_composite (name(50), adminNo, gradeClass)');
    } catch (e) {}
    try {
      await pool.query('ALTER TABLE olevel_marks ADD INDEX idx_olevel_student_term_year (student_id, term, year)');
    } catch (e) {}
    try {
      await pool.query('ALTER TABLE uace_marks ADD INDEX idx_uace_student_term_year (student_id, term, year)');
    } catch (e) {}
    try {
      await pool.query('ALTER TABLE uace_marks ADD COLUMN bot DECIMAL(5,2) NOT NULL DEFAULT 0.00 AFTER score');
    } catch (e) {}
    try {
      await pool.query('ALTER TABLE uace_marks ADD COLUMN mot DECIMAL(5,2) NOT NULL DEFAULT 0.00 AFTER bot');
    } catch (e) {}
    try {
      await pool.query('ALTER TABLE uace_marks ADD COLUMN eot DECIMAL(5,2) NOT NULL DEFAULT 0.00 AFTER mot');
    } catch (e) {}
    try {
      await pool.query('ALTER TABLE uace_marks ADD COLUMN paper INT NOT NULL DEFAULT 1 AFTER subject_type');
    } catch (e) {}
    try {
      await pool.query('ALTER TABLE uace_marks DROP INDEX unique_uace_subject_term');
    } catch (e) {}
    try {
      await pool.query('ALTER TABLE uace_marks ADD UNIQUE KEY unique_uace_subject_paper_term (student_id, subject, paper, term, year)');
    } catch (e) {}

    try {
      await pool.query('ALTER TABLE students DROP KEY unique_student_class_stream');
    } catch (e) {}

    // Seed default subjects if not present
    // Seed default subjects if not present or migrate if old curriculum detected
    const [olevelSubjRows] = await pool.query('SELECT * FROM settings WHERE key_name = ?', ['olevel_subjects']);
    const olevelSubjects = [
      "English Language", "Mathematics", "Biology", "Chemistry", "Physics",
      "History and Political Education", "Geography", "Kiswahili", "Entrepreneurship Education",
      "Physical Education", "Christian Religious Education", "Islamic Religious Education",
      "Agriculture", "Information and Communications Technology (ICT)", "Art and Design",
      "Performing Arts", "Literature in English", "Nutrition and Food Technology",
      "Technology and Design", "Local Languages", "Foreign Languages"
    ];
    if (olevelSubjRows.length === 0) {
      await pool.query('INSERT INTO settings (key_name, val_value) VALUES (?, ?)', ['olevel_subjects', JSON.stringify(olevelSubjects)]);
    } else {
      try {
        const current = JSON.parse(olevelSubjRows[0].val_value);
        if (current.includes('Fine Art') || current.includes('Commerce') || !current.includes('History and Political Education')) {
          await pool.query('UPDATE settings SET val_value = ? WHERE key_name = ?', [JSON.stringify(olevelSubjects), 'olevel_subjects']);
        }
      } catch (err) {
        console.warn("Failed to check or migrate olevel_subjects setting, forcing reset:", err);
        await pool.query('UPDATE settings SET val_value = ? WHERE key_name = ?', [JSON.stringify(olevelSubjects), 'olevel_subjects']);
      }
    }

    const [uaceSubjRows] = await pool.query('SELECT * FROM settings WHERE key_name = ?', ['uace_subjects']);
    if (uaceSubjRows.length === 0) {
      const uaceSubjects = [
        "Mathematics", "Physics", "Chemistry", "Biology", "Economics",
        "Geography", "History", "Literature in English", "General Paper",
        "Subsidiary Mathematics", "Subsidiary ICT"
      ];
      await pool.query('INSERT INTO settings (key_name, val_value) VALUES (?, ?)', ['uace_subjects', JSON.stringify(uaceSubjects)]);
    }

    // Seed/Enforce assessment limits setting
    try {
      const [limitsRows] = await pool.query('SELECT * FROM settings WHERE key_name = ?', ['assessment_limits']);
      const defaultLimits = {
        olevel: { integration_max: 3, exam_max: 100 },
        uace: { score_max: 100 }
      };
      if (limitsRows.length === 0) {
        await pool.query('INSERT INTO settings (key_name, val_value) VALUES (?, ?)', ['assessment_limits', JSON.stringify(defaultLimits)]);
      } else {
        try {
          const currentLimits = JSON.parse(limitsRows[0].val_value || '{}');
          if (currentLimits?.olevel?.integration_max !== 3 || currentLimits?.olevel?.exam_max !== 100 || currentLimits?.uace?.score_max !== 100) {
            await pool.query('UPDATE settings SET val_value = ? WHERE key_name = ?', [JSON.stringify(defaultLimits), 'assessment_limits']);
          }
        } catch (parseErr) {
          await pool.query('UPDATE settings SET val_value = ? WHERE key_name = ?', [JSON.stringify(defaultLimits), 'assessment_limits']);
        }
      }
    } catch (e) {
      console.warn('Failed to seed/update assessment_limits setting:', e);
    }

    // Seed default teacher if not present
    const [teacherCountRows] = await pool.query('SELECT COUNT(*) as count FROM teachers');
    if (teacherCountRows[0].count === 0) {
      const crypto = require('crypto');
      const defaultTeacherId = 'T-DEFAULT';
      const defaultPasswordHash = crypto.createHash('sha256').update('teacher123').digest('hex');
      const defaultSubjects = ["Mathematics", "Physics", "Chemistry", "English Language", "History and Political Education", "Geography"];
      const defaultClasses = ["S.1 A", "S.2 A", "S.3 A", "S.4 A", "S.5 Sciences", "S.6 Sciences"];
      await pool.query(
        'INSERT INTO teachers (id, username, password_hash, name, subjects, classes) VALUES (?, ?, ?, ?, ?, ?)',
        [defaultTeacherId, 'teacher', defaultPasswordHash, 'Default Teacher', JSON.stringify(defaultSubjects), JSON.stringify(defaultClasses)]
      );
    }

    const [classRows] = await pool.query('SELECT COUNT(*) as count FROM classes');
    if (classRows[0].count === 0) {
      const defaultClasses = ['S.1', 'S.2', 'S.3', 'S.4', 'S.5', 'S.6'];
      for (const cls of defaultClasses) {
        await pool.query('INSERT IGNORE INTO classes (name) VALUES (?)', [cls]);
      }
    }

    const [streamRows] = await pool.query('SELECT COUNT(*) as count FROM streams');
    if (streamRows[0].count === 0) {
      const defaultStreams = ['A', 'B', 'C', 'Arts', 'Sciences'];
      for (const stm of defaultStreams) {
        await pool.query('INSERT IGNORE INTO streams (name) VALUES (?)', [stm]);
      }
    }

    dbInitialized = true;
    initializingDb = false;
    return true;
  } catch (err) {
    console.error('ensureDbInitialized critical connection error:', err);
    lastDbError = err.message || String(err);
    initializingDb = false;
    return false;
  }
}

async function initDb(config) {
  console.log('[initDb] Config received:', typeof config === 'string' ? config.replace(/:([^@:]+)@/, ':****@') : (config ? { ...config, password: '****' } : 'null'));
  const connectionUri = process.env.DATABASE_URL || (typeof config === 'string' ? config : null);

  if (process.env.DATABASE_URL) {
    console.log('[initDb] DATABASE_URL is present in process.env and will be prioritized.');
  }

  let targetConfig = config;
  if (connectionUri) {
    const parsed = parseConnectionUri(connectionUri);
    if (parsed) {
      targetConfig = parsed;
      console.log('[initDb] Parsed DATABASE_URL to config:', { ...targetConfig, password: '****' });
    } else {
      console.error('[initDb] Failed to parse connection URI!');
    }
  }

  if (pool && isSameConfig(currentDbConfig, targetConfig)) {
    console.log('Database configuration is unchanged. Reusing existing connection pool.');
    ensureDbInitialized().catch(err => {
      console.warn('Lazy migration attempt failed during reuse:', err.message);
    });
    return true;
  }

  if (pool) {
    try {
      await pool.end();
    } catch (err) {
      console.error('Error closing database pool:', err);
    }
    pool = null;
  }

  currentDbConfig = targetConfig;
  dbInitialized = false;
  // Invalidate caches on DB config changes
  classesCache = null;
  streamsCache = null;
  settingsCache = {};

  if (!connectionUri && (!config || !config.host)) {
    console.log('Database configuration is missing. Express server is active but database pool is uninitialized.');
    return false;
  }

  try {
    if (connectionUri) {
      pool = mysql.createPool(connectionUri);
      console.log(`Database pool instantiated for MySQL using connection URI.`);
    } else {
      pool = mysql.createPool({
        host: config.host,
        port: parseInt(String(config.port), 10) || 3306,
        user: config.user,
        password: config.password,
        database: config.database,
        waitForConnections: true,
        connectionLimit: 15,
        queueLimit: 0,
        connectTimeout: 5000
      });
      console.log(`Database pool instantiated for MySQL at ${config.host}:${config.port || 3306}`);
    }
    
    if (process.env.VERCEL) {
      try {
        await ensureDbInitialized();
      } catch (err) {
        console.error('ensureDbInitialized error on Vercel:', err);
      }
    } else {
      ensureDbInitialized()
        .then(success => {
          if (success) {
            console.log('Database migrations completed successfully on startup.');
          } else {
            console.log('Database migrations deferred (database may be offline). Will retry lazily.');
          }
        })
        .catch(err => {
          console.log('Database migrations deferred (database may be offline). Will retry lazily:', err.message);
        });
    }

    return true;
  } catch (err) {
    console.error(`Failed to instantiate database pool: ${err.message}`);
    lastDbError = err.message || String(err);
    pool = null;
    return false;
  }
}

const app = express();

const corsOptions = {
  origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : '*',
  credentials: true
};
app.use(cors(corsOptions));
app.use(express.json({ limit: '100mb' }));

// Rate Limiters
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests from this IP, please try again later.' }
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Stricter request limit reached. Please wait 15 minutes.' }
});

app.use('/api/', limiter);
app.use('/api/auth/login', authLimiter);
app.use('/api/ai/ask', authLimiter);

const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_spss_123';

app.use(async (req, res, next) => {
  // 1. JWT verification for protected endpoints
  const publicPaths = [
    '/api/auth/login',
    '/api/config-status',
    '/api/database-status',
    '/api/test-db-connection',
    '/api/save-db-config',
    '/api/ai/test-key'
  ];
  
  const isPublic = 
    publicPaths.includes(req.path) || 
    req.path.match(/\/api\/students\/[^/]+\/photo/) ||
    req.path.startsWith('/api/pdf/download/') ||
    (req.method === 'GET' && req.path === '/api/branding');
  
  if (!isPublic) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({ error: 'Access token required. Please log in.' });
    }
    try {
      req.user = jwt.verify(token, JWT_SECRET);
    } catch (e) {
      return res.status(403).json({ error: 'Invalid or expired access token. Please log in again.' });
    }
  }

  // 2. Database connectivity checks
  const connectionBypassPaths = [
    '/api/config-status',
    '/api/database-status',
    '/api/test-db-connection',
    '/api/save-db-config',
    '/api/branding',
    '/api/auth/login'
  ];
  
  const bypassDbCheck = connectionBypassPaths.includes(req.path);

  // Lazy database initialization from environment variables (useful for serverless/Vercel)
  if (!pool) {
    console.log('[DB-LAZY-INIT] Checking environment variables in middleware:');
    console.log(`  - process.env.MYSQL_PUBLIC_URL: ${process.env.MYSQL_PUBLIC_URL ? 'Set (Redacted)' : 'Not Set'}`);
    console.log(`  - process.env.DATABASE_URL: ${process.env.DATABASE_URL ? 'Set (Redacted)' : 'Not Set'}`);
    console.log(`  - process.env.DB_HOST: ${process.env.DB_HOST || 'Not Set'}`);
    console.log(`  - process.env.DB_PORT: ${process.env.DB_PORT || 'Not Set'}`);
    console.log(`  - process.env.DB_DATABASE: ${process.env.DB_DATABASE || 'Not Set'}`);
    console.log(`  - process.env.DB_USER: ${process.env.DB_USER || 'Not Set'}`);

    const dbConfig = process.env.MYSQL_PUBLIC_URL || process.env.DATABASE_URL || (process.env.DB_HOST ? {
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT || '3306', 10),
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_DATABASE
    } : null);

    if (dbConfig) {
      console.log('[API] Intercepted request. Initializing database pool lazily with Resolved Config:', 
        typeof dbConfig === 'string' 
          ? dbConfig.replace(/:([^@:]+)@/, ':****@') 
          : { ...dbConfig, password: '****' }
      );
      const success = await initDb(dbConfig);
      if (!success && !bypassDbCheck) {
        return res.status(500).json({ error: 'Failed to initialize database pool from environment variables. Please verify connection credentials.' });
      }
    } else {
      console.warn('[DB-LAZY-INIT] No database configuration found in environment variables!');
    }
  }

  if (bypassDbCheck) {
    return next();
  }

  if (!currentDbConfig) {
    return res.status(500).json({ error: 'Database connection is not configured. Please check host settings.' });
  }
  if (!pool) {
    return res.status(500).json({ error: 'Database pool is uninitialized. Please check host settings.' });
  }

  const initialized = await ensureDbInitialized();
  if (!initialized) {
    return res.status(500).json({ error: 'Database connection failed: The database is offline, unreachable, or tables could not be initialized. Please check credentials and server status.' });
  }
  next();
});

app.get('/api/config-status', async (req, res) => {
  let dbConnected = false;
  if (pool) {
    try {
      dbConnected = await ensureDbInitialized();
    } catch (err) {
      dbConnected = false;
    }
  }
  res.json({
    dbConnected: dbConnected,
    dbError: lastDbError,
    config: currentDbConfig ? {
      host: currentDbConfig.host,
      port: currentDbConfig.port,
      database: currentDbConfig.database,
      user: currentDbConfig.user
    } : null
  });
});

// GET database configuration
app.get('/api/database-config', async (req, res) => {
  return res.json({
    success: true,
    config: {
      mode: 'cloud',
      serverIp: '',
      serverPort: 3000,
      databaseHost: '●●●●●●●●',
      databasePort: 3306,
      databaseName: '●●●●●●●●',
      databaseUsername: '●●●●●●●●',
      databasePassword: '●●●●●●●●'
    }
  });
});

// POST test database connection (via HTTP API)
app.post('/api/test-db-connection', async (req, res) => {
  return res.status(403).json({
    success: false,
    error: 'Database connection testing is disabled in Cloud mode.'
  });
});

// POST save database config (via HTTP API)
app.post('/api/save-db-config', async (req, res) => {
  return res.status(403).json({
    success: false,
    error: 'Database configuration is locked in Cloud mode.'
  });
});

// GET database connection status
app.get('/api/database-status', async (req, res) => {
  try {
    let lastSuccessfulConnection = null;
    try {
      const [rows] = await pool.query('SELECT val_value FROM settings WHERE key_name = ?', ['last_successful_db_connection']);
      if (rows.length > 0) {
        lastSuccessfulConnection = rows[0].val_value;
      }
    } catch (e) {
      // Ignore error, field may not exist yet
    }
    
    let dbConnected = false;
    if (pool) {
      try {
        dbConnected = await ensureDbInitialized();
      } catch (err) {
        dbConnected = false;
      }
    }
    
    const mode = 'cloud';

    res.json({
      connected: dbConnected,
      lastSuccessfulConnection: lastSuccessfulConnection,
      connectionMode: mode,
      config: {
        host: '●●●●●●●●',
        port: 3306,
        database: '●●●●●●●●',
        user: '●●●●●●●●'
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// GET paginated, filtered students (EXCLUDE photo column)
app.get('/api/students', async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 50; // OPTIMIZED: Changed default to 50
    const search = req.query.search || '';
    const filterName = req.query.name || '';
    const filterAdminNo = req.query.adminNo || '';
    const filterClass = req.query.gradeClass || '';
    const filterStream = req.query.stream || '';
    const gender = req.query.gender || '';
    const isCleared = req.query.isCleared || '';
    const boardingStatus = req.query.boardingStatus || '';
    const photo = req.query.photo || '';
    const printStatus = req.query.printStatus || '';
    const academicYear = req.query.academicYear || '';
    const level = req.query.level || '';
    let sortBy = req.query.sortBy || 'name';

    const allowedSortFields = ['name', 'adminNo', 'gradeClass', 'updatedAt'];
    if (!allowedSortFields.includes(sortBy)) {
      sortBy = 'name';
    }

    let whereClauses = [];
    let queryParams = [];

    // OPTIMIZED: Prefix search pattern for better index usage
    if (search) {
      whereClauses.push('(name LIKE ? OR adminNo LIKE ?)');
      queryParams.push(`${search}%`, `${search}%`);
    }

    if (filterName) {
      whereClauses.push('name LIKE ?');
      queryParams.push(`${filterName}%`);
    }

    if (filterAdminNo) {
      whereClauses.push('adminNo LIKE ?');
      queryParams.push(`${filterAdminNo}%`);
    }

    if (gender && gender !== 'All') {
      whereClauses.push('gender = ?');
      queryParams.push(gender);
    }

    if (isCleared && isCleared !== 'All') {
      whereClauses.push('isCleared = ?');
      queryParams.push(isCleared === 'Cleared' ? 1 : 0);
    }

    if (boardingStatus && boardingStatus !== 'All') {
      if (boardingStatus === 'Hosteller' || boardingStatus === 'Boarder' || boardingStatus === 'Hostellers') {
        whereClauses.push('(boardingStatus = "Boarder" OR boardingStatus = "Hosteller")');
      } else if (boardingStatus === 'Day Scholar' || boardingStatus === 'Day Scholars') {
        whereClauses.push('(boardingStatus = "Day Scholar" OR boardingStatus = "Day Scholars")');
      } else {
        whereClauses.push('boardingStatus = ?');
        queryParams.push(boardingStatus);
      }
    }

    if (printStatus && printStatus !== 'All') {
      whereClauses.push('printStatus = ?');
      queryParams.push(printStatus);
    }

    if (photo && photo !== 'All') {
      if (photo === 'WithPhoto') {
        whereClauses.push('(photo IS NOT NULL AND photo != "")');
      } else if (photo === 'NoPhoto') {
        whereClauses.push('(photo IS NULL OR photo = "")');
      }
    }

    if (academicYear && academicYear !== 'All') {
      whereClauses.push('adminNo LIKE ?');
      queryParams.push(`%${academicYear}%`);
    }

    if (level && level !== 'All') {
      if (level === 'Lower') {
        whereClauses.push('(gradeClass LIKE "S.1%" OR gradeClass LIKE "S.2%" OR gradeClass LIKE "S.3%" OR gradeClass LIKE "S.4%")');
      } else if (level === 'Upper') {
        whereClauses.push('(gradeClass LIKE "S.5%" OR gradeClass LIKE "S.6%")');
      }
    }

    if (filterClass && filterClass !== 'All') {
      if (filterStream && filterStream !== 'All') {
        whereClauses.push('gradeClass = ?');
        queryParams.push(`${filterClass} ${filterStream}`);
      } else {
        whereClauses.push('(gradeClass = ? OR gradeClass LIKE ?)');
        queryParams.push(filterClass, `${filterClass} %`);
      }
    } else if (filterStream && filterStream !== 'All') {
      whereClauses.push('gradeClass LIKE ?');
      queryParams.push(`% ${filterStream}`);
    }

    let whereSql = '';
    if (whereClauses.length > 0) {
      whereSql = ' WHERE ' + whereClauses.join(' AND ');
    }

    // Count query
    const countQuery = `SELECT COUNT(*) as count FROM students${whereSql}`;
    const [countRows] = await pool.query(countQuery, queryParams);
    const totalCount = countRows[0].count;

    if (limit === -1) {
      const dataQuery = `
        SELECT id, adminNo, name, aliases, gender, gradeClass, boardingStatus, isCleared, 
               gateClearanceDate, mealsClearanceDate, remarks, printStatus, updatedAt,
               IF(photo IS NOT NULL AND photo != '', 1, 0) as hasPhoto
        FROM students
        ${whereSql}
        ORDER BY ${sortBy} ASC
      `;
      const [rows] = await pool.query(dataQuery, queryParams);
      const students = rows.map(r => {
        let aliases = r.aliases;
        if (typeof aliases === 'string' && aliases) {
          try {
            aliases = JSON.parse(aliases);
          } catch (err) {
            aliases = undefined;
          }
        }
        return {
          ...r,
          aliases,
          isCleared: !!r.isCleared,
          hasPhoto: !!r.hasPhoto
        };
      });
      return res.json({
        data: students,
        total: totalCount,
        page: 1,
        limit: totalCount
      });
    }

    const offset = (page - 1) * limit;
    const dataQuery = `
      SELECT id, adminNo, name, aliases, gender, gradeClass, boardingStatus, isCleared, 
             gateClearanceDate, mealsClearanceDate, remarks, printStatus, updatedAt,
             IF(photo IS NOT NULL AND photo != '', 1, 0) as hasPhoto
      FROM students
      ${whereSql}
      ORDER BY ${sortBy} ASC
      LIMIT ? OFFSET ?
    `;

    const [rows] = await pool.query(dataQuery, [...queryParams, limit, offset]);
    const students = rows.map(r => {
      let aliases = r.aliases;
      if (typeof aliases === 'string' && aliases) {
        try {
          aliases = JSON.parse(aliases);
        } catch (err) {
          aliases = undefined;
        }
      }
      return {
        ...r,
        aliases,
        isCleared: !!r.isCleared,
        hasPhoto: !!r.hasPhoto
      };
    });
    res.json({
      data: students,
      total: totalCount,
      page,
      limit
    });
  } catch (err) {
    console.error('Error fetching students:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET single student
app.get('/api/students/:id', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, adminNo, name, aliases, gender, gradeClass, boardingStatus, isCleared, 
              gateClearanceDate, mealsClearanceDate, remarks, printStatus, uace_combination, 
              parentName, parentContact, updatedAt, photo, 
              IF(photo IS NOT NULL AND photo != '', 1, 0) as hasPhoto 
       FROM students WHERE id = ?`,
      [req.params.id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Student not found' });
    }
    let aliases = rows[0].aliases;
    if (typeof aliases === 'string' && aliases) {
      try {
        aliases = JSON.parse(aliases);
      } catch (err) {
        aliases = undefined;
      }
    }
    const student = {
      ...rows[0],
      aliases,
      isCleared: !!rows[0].isCleared,
      hasPhoto: !!rows[0].hasPhoto,
    };

    res.json(student);
  } catch (err) {
    console.error('Error fetching student:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET student photo binary
app.get('/api/students/:id/photo', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT photo FROM students WHERE id = ?', [req.params.id]);
    if (rows.length === 0 || !rows[0].photo) {
      return res.status(404).send('Photo not found');
    }
    const photoStr = rows[0].photo;
    if (photoStr.startsWith('http://') || photoStr.startsWith('https://')) {
      return res.redirect(photoStr);
    }
    const match = photoStr.match(/^data:image\/([a-zA-Z+]+);base64,(.+)$/);
    if (match) {
      const contentType = `image/${match[1]}`;
      const buffer = Buffer.from(match[2], 'base64');
      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'public, max-age=86400'); // 1 day browser caching
      return res.send(buffer);
    } else {
      const buffer = Buffer.from(photoStr, 'base64');
      res.setHeader('Content-Type', 'image/jpeg');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      return res.send(buffer);
    }
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// Helper to automatically create student login account if it doesn't exist
async function ensureStudentAccount(connectionOrPool, studentId) {
  const crypto = require('crypto');
  const defaultHash = crypto.createHash('sha256').update('123').digest('hex');
  await connectionOrPool.query(
    `INSERT IGNORE INTO student_accounts (student_id, password_hash, status, needs_password_change) 
     VALUES (?, ?, 'Active', 1)`,
    [studentId, defaultHash]
  );
}

function normalizeText(value) {
  return value === null || value === undefined ? '' : String(value).trim();
}

async function mergeTableRows(connection, table, uniqueKeys, preferColumns, keepStudentId, duplicateStudentId) {
  const [duplicateRows] = await connection.query(`SELECT * FROM ${table} WHERE student_id = ?`, [duplicateStudentId]);
  for (const row of duplicateRows) {
    const uniqueCondition = uniqueKeys.map((key) => `${key} = ?`).join(' AND ');
    const uniqueValues = uniqueKeys.map((key) => row[key]);

    const [existingRows] = await connection.query(
      `SELECT * FROM ${table} WHERE student_id = ? AND ${uniqueCondition} LIMIT 1`,
      [keepStudentId, ...uniqueValues]
    );

    if (existingRows.length > 0) {
      const existing = existingRows[0];
      const updateFields = [];
      const params = [];

      for (const col of preferColumns) {
        const existingValue = existing[col];
        const duplicateValue = row[col];
        if ((existingValue === null || existingValue === undefined || existingValue === '') && duplicateValue !== null && duplicateValue !== undefined && duplicateValue !== '') {
          updateFields.push(`${col} = ?`);
          params.push(duplicateValue);
        }
      }

      if (updateFields.length > 0) {
        await connection.query(
          `UPDATE ${table} SET ${updateFields.join(', ')} WHERE id = ?`,
          [...params, existing.id]
        );
      }

      await connection.query('DELETE FROM ?? WHERE id = ?', [table, row.id]);
    } else {
      await connection.query(`UPDATE ${table} SET student_id = ? WHERE id = ?`, [keepStudentId, row.id]);
    }
  }
}

async function mergeStudentAccount(connection, keepStudentId, duplicateStudentId) {
  const [duplicateAccounts] = await connection.query('SELECT * FROM student_accounts WHERE student_id = ?', [duplicateStudentId]);
  if (duplicateAccounts.length === 0) {
    return;
  }

  const duplicateAccount = duplicateAccounts[0];
  const [keepAccounts] = await connection.query('SELECT * FROM student_accounts WHERE student_id = ?', [keepStudentId]);

  if (keepAccounts.length > 0) {
    const keepAccount = keepAccounts[0];
    const updates = [];
    const params = [];

    if ((!keepAccount.password_hash || keepAccount.password_hash === '') && duplicateAccount.password_hash) {
      updates.push('password_hash = ?');
      params.push(duplicateAccount.password_hash);
    }

    if (keepAccount.status !== 'Active' && duplicateAccount.status === 'Active') {
      updates.push('status = ?');
      params.push(duplicateAccount.status);
    }

    const duplicateNeedsPassword = duplicateAccount.needs_password_change ? 1 : 0;
    const keepNeedsPassword = keepAccount.needs_password_change ? 1 : 0;
    if (duplicateNeedsPassword && !keepNeedsPassword) {
      updates.push('needs_password_change = ?');
      params.push(duplicateNeedsPassword);
    }

    const keepLogin = keepAccount.lastLogin ? new Date(keepAccount.lastLogin) : null;
    const duplicateLogin = duplicateAccount.lastLogin ? new Date(duplicateAccount.lastLogin) : null;
    if (!keepLogin && duplicateLogin) {
      updates.push('lastLogin = ?');
      params.push(duplicateAccount.lastLogin);
    } else if (keepLogin && duplicateLogin && duplicateLogin > keepLogin) {
      updates.push('lastLogin = ?');
      params.push(duplicateAccount.lastLogin);
    }

    if (updates.length > 0) {
      await connection.query(
        `UPDATE student_accounts SET ${updates.join(', ')} WHERE student_id = ?`,
        [...params, keepStudentId]
      );
    }

    await connection.query('DELETE FROM student_accounts WHERE student_id = ?', [duplicateStudentId]);
  } else {
    await connection.query('UPDATE student_accounts SET student_id = ? WHERE student_id = ?', [keepStudentId, duplicateStudentId]);
  }
}

async function mergePrintHistory(connection, keepStudentId, duplicateStudentId) {
  const [rows] = await connection.query('SELECT id, student_ids FROM print_history WHERE student_ids LIKE ?', [`%${duplicateStudentId}%`]);
  for (const row of rows) {
    let studentIds = [];
    if (row.student_ids) {
      try {
        const parsed = JSON.parse(row.student_ids);
        if (Array.isArray(parsed)) {
          studentIds = parsed.map(String);
        } else {
          studentIds = String(row.student_ids).split(',').map((value) => String(value).trim()).filter(Boolean);
        }
      } catch (err) {
        studentIds = String(row.student_ids).split(',').map((value) => String(value).trim()).filter(Boolean);
      }
    }

    const replaced = studentIds.map((id) => (id === duplicateStudentId ? keepStudentId : id));
    const uniqueIds = [...new Set(replaced)];

    if (uniqueIds.length === 0) {
      await connection.query('DELETE FROM print_history WHERE id = ?', [row.id]);
    } else if (JSON.stringify(uniqueIds) !== JSON.stringify(studentIds)) {
      await connection.query('UPDATE print_history SET student_ids = ? WHERE id = ?', [JSON.stringify(uniqueIds), row.id]);
    }
  }
}

// POST new student (Insert or Update)
app.post('/api/students', async (req, res) => {
  try {
    const s = req.body;
    if (!s.adminNo) {
      return res.status(400).json({ error: 'Admission number (adminNo) is required.' });
    }
    // Check duplicate
    const [existing] = await pool.query('SELECT id, name FROM students WHERE adminNo = ? AND id != ?', [s.adminNo, s.id]);
    if (existing.length > 0) {
      return res.status(400).json({ error: `Registration number "${s.adminNo}" is already assigned to student "${existing[0].name}".` });
    }

    try {
      s.photo = await uploadToCloudinaryIfNeeded(s.photo, `student_${s.id}_photo`);
      s.photoOriginal = await uploadToCloudinaryIfNeeded(s.photoOriginal, `student_${s.id}_original`);
      s.photoEnhanced = await uploadToCloudinaryIfNeeded(s.photoEnhanced, `student_${s.id}_enhanced`);
    } catch (e) {
      console.warn('Cloudinary upload warning:', e);
    }

    await pool.query(
      `INSERT INTO students (id, adminNo, name, aliases, gender, gradeClass, boardingStatus, isCleared, gateClearanceDate, mealsClearanceDate, remarks, photo, photoOriginal, photoEnhanced, printStatus, parentName, parentContact) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) 
       ON DUPLICATE KEY UPDATE 
       adminNo = ?, name = ?, aliases = ?, gender = ?, gradeClass = ?, boardingStatus = ?, isCleared = ?, gateClearanceDate = ?, mealsClearanceDate = ?, remarks = ?, photo = ?, photoOriginal = ?, photoEnhanced = ?, printStatus = ?, parentName = ?, parentContact = ?`,
      [
        s.id, s.adminNo, s.name, s.aliases ? JSON.stringify(s.aliases) : null, s.gender, s.gradeClass, s.boardingStatus, s.isCleared ? 1 : 0, s.gateClearanceDate || null, s.mealsClearanceDate || null, s.remarks || null, s.photo || null, s.photoOriginal || null, s.photoEnhanced || null, s.printStatus || 'Not Printed', s.parentName || null, s.parentContact || null,
        s.adminNo, s.name, s.aliases ? JSON.stringify(s.aliases) : null, s.gender, s.gradeClass, s.boardingStatus, s.isCleared ? 1 : 0, s.gateClearanceDate || null, s.mealsClearanceDate || null, s.remarks || null, s.photo || null, s.photoOriginal || null, s.photoEnhanced || null, s.printStatus || 'Not Printed', s.parentName || null, s.parentContact || null
      ]
    );
    await ensureStudentAccount(pool, s.id);
    await writeAuditLog('Save Student', `Saved student "${s.name}" (${s.adminNo})`);
    statsCache = null;
    res.json({ success: true, id: s.id });
  } catch (err) {
    console.error('Error saving student:', err);
    res.status(500).json({ error: err.message });
  }
});

// PUT update student
app.put('/api/students/:id', async (req, res) => {
  try {
    const s = req.body;
    if (!s.adminNo) {
      return res.status(400).json({ error: 'Admission number (adminNo) is required.' });
    }
    // Check duplicate
    const [existing] = await pool.query('SELECT id, name FROM students WHERE adminNo = ? AND id != ?', [s.adminNo, req.params.id]);
    if (existing.length > 0) {
      return res.status(400).json({ error: `Registration number "${s.adminNo}" is already assigned to student "${existing[0].name}".` });
    }

    try {
      s.photo = await uploadToCloudinaryIfNeeded(s.photo, `student_${req.params.id}_photo`);
      s.photoOriginal = await uploadToCloudinaryIfNeeded(s.photoOriginal, `student_${req.params.id}_original`);
      s.photoEnhanced = await uploadToCloudinaryIfNeeded(s.photoEnhanced, `student_${req.params.id}_enhanced`);
    } catch (e) {
      console.warn('Cloudinary upload warning:', e);
    }

    await pool.query(
      `UPDATE students SET adminNo = ?, name = ?, aliases = ?, gender = ?, gradeClass = ?, boardingStatus = ?, isCleared = ?, gateClearanceDate = ?, mealsClearanceDate = ?, remarks = ?, photo = ?, photoOriginal = ?, photoEnhanced = ?, printStatus = ?, parentName = ?, parentContact = ? WHERE id = ?`,
      [s.adminNo, s.name, s.aliases ? JSON.stringify(s.aliases) : null, s.gender, s.gradeClass, s.boardingStatus, s.isCleared ? 1 : 0, s.gateClearanceDate || null, s.mealsClearanceDate || null, s.remarks || null, s.photo || null, s.photoOriginal || null, s.photoEnhanced || null, s.printStatus || 'Not Printed', s.parentName || null, s.parentContact || null, req.params.id]
    );
    await ensureStudentAccount(pool, req.params.id);
    await writeAuditLog('Update Student', `Updated student "${s.name}" (${s.adminNo})`);
    statsCache = null;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE single student
app.delete('/api/students/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM students WHERE id = ?', [req.params.id]);
    await writeAuditLog('Delete Student', `Deleted student ID ${req.params.id}`);
    statsCache = null;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET database-wide statistics
app.get('/api/stats', async (req, res) => {
  try {
    const now = Date.now();
    if (statsCache && now < statsCacheExpiry) {
      return res.json(statsCache);
    }
    const [totalRows] = await pool.query('SELECT COUNT(*) as count FROM students');
    const [clearedRows] = await pool.query('SELECT COUNT(*) as count FROM students WHERE isCleared = 1');
    const [photoRows] = await pool.query('SELECT COUNT(*) as count FROM students WHERE photo IS NOT NULL AND photo != ""');
    
    const [lowerRows] = await pool.query("SELECT COUNT(*) as count FROM students WHERE gradeClass LIKE 'S.1%' OR gradeClass LIKE 'S.2%' OR gradeClass LIKE 'S.3%' OR gradeClass LIKE 'S.4%'");
    const [upperRows] = await pool.query("SELECT COUNT(*) as count FROM students WHERE gradeClass LIKE 'S.5%' OR gradeClass LIKE 'S.6%'");

    const total = totalRows[0].count;
    const cleared = clearedRows[0].count;
    const withPhoto = photoRows[0].count;
    const lowerSecondaryTotal = lowerRows[0].count;
    const upperSecondaryTotal = upperRows[0].count;
    
    statsCache = {
      total,
      cleared,
      pending: total - cleared,
      withPhoto,
      lowerSecondaryTotal,
      upperSecondaryTotal,
      clearedPct: total > 0 ? Math.round((cleared / total) * 100) : 0,
      photoPct: total > 0 ? Math.round((withPhoto / total) * 100) : 0
    };
    statsCacheExpiry = now + 30000; // 30s TTL
    
    res.json(statsCache);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST bulk insert/update
app.post('/api/students/bulk', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const students = req.body.students || [];
    
    // Upload student photos to Cloudinary before starting the database transaction
    for (const s of students) {
      try {
        s.photo = await uploadToCloudinaryIfNeeded(s.photo, `student_${s.id}_photo`);
      } catch (e) {}
    }

    await connection.beginTransaction();
    for (const s of students) {
      await connection.query(
        `INSERT INTO students (id, adminNo, name, gender, gradeClass, boardingStatus, isCleared, gateClearanceDate, mealsClearanceDate, remarks, photo, printStatus, parentName, parentContact) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) 
         ON DUPLICATE KEY UPDATE 
         adminNo = ?, name = ?, gender = ?, gradeClass = ?, boardingStatus = ?, isCleared = ?, gateClearanceDate = ?, mealsClearanceDate = ?, remarks = ?, photo = ?, printStatus = ?, parentName = ?, parentContact = ?`,
        [
          s.id, s.adminNo, s.name, s.gender, s.gradeClass, s.boardingStatus, s.isCleared ? 1 : 0, s.gateClearanceDate || null, s.mealsClearanceDate || null, s.remarks || null, s.photo || null, s.printStatus || 'Not Printed', s.parentName || null, s.parentContact || null,
          s.adminNo, s.name, s.gender, s.gradeClass, s.boardingStatus, s.isCleared ? 1 : 0, s.gateClearanceDate || null, s.mealsClearanceDate || null, s.remarks || null, s.photo || null, s.printStatus || 'Not Printed', s.parentName || null, s.parentContact || null
        ]
      );
      await ensureStudentAccount(connection, s.id);
    }
    
    await connection.commit();
    statsCache = null;
    res.json({ success: true, count: students.length });
  } catch (err) {
    await connection.rollback();
    console.error('Error in bulk insert:', err);
    res.status(500).json({ error: err.message });
  } finally {
    connection.release();
  }
});

// POST bulk delete
app.post('/api/students/bulk-delete', async (req, res) => {
  try {
    const ids = req.body.ids || [];
    if (ids.length === 0) {
      return res.json({ success: true, count: 0 });
    }
    await pool.query('DELETE FROM students WHERE id IN (?)', [ids]);
    statsCache = null;
    res.json({ success: true, count: ids.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Helper to pre-resolve database logo path/url into base64 for PDF rendering engines
async function getLogoAsBase64(logoVal) {
  const fs = require('fs');
  const path = require('path');

  if (!logoVal) {
    const defaultPath = path.join(process.cwd(), 'public/school_logo.png');
    if (fs.existsSync(defaultPath)) {
      try {
        const data = fs.readFileSync(defaultPath);
        return `data:image/png;base64,${data.toString('base64')}`;
      } catch (err) {
        console.error('Failed to read default logo file:', err);
      }
    }
    return null;
  }

  if (logoVal.startsWith('data:')) {
    return logoVal;
  }
  
  // If it is a relative download path, extract the filename
  if (logoVal.includes('/api/pdf/download/')) {
    const parts = logoVal.split('/');
    const filename = parts[parts.length - 1];
    const filePath = path.join(getExportsDir(), filename);
    if (fs.existsSync(filePath)) {
      try {
        const ext = path.extname(filePath).substring(1);
        const mime = ext === 'svg' ? 'image/svg+xml' : `image/${ext}`;
        const data = fs.readFileSync(filePath);
        return `data:${mime};base64,${data.toString('base64')}`;
      } catch (err) {
        console.error('Failed to read logo file for base64 conversion:', err);
      }
    }
  }
  
  // Fallback to fetch if it's a full http URL
  if (logoVal.startsWith('http')) {
    try {
      return await getBase64ImageFromUrl(logoVal) || logoVal;
    } catch (e) {
      console.warn('Failed to pre-resolve http logo URL:', e);
    }
  }
  
  return null;
}

// GET school logo branding
app.get('/api/branding', async (req, res) => {
  try {
    if (!pool || !dbInitialized) {
      return res.json({ logo: null, degraded: true, message: 'Database unavailable; using default branding.' });
    }

    const [rows] = await pool.query('SELECT val_value FROM settings WHERE key_name = ?', ['school_logo']);
    if (rows.length === 0) {
      return res.json({ logo: null, degraded: false });
    }
    res.json({ logo: rows[0].val_value, degraded: false });
  } catch (err) {
    res.status(500).json({ error: err.message, degraded: true });
  }
});

// POST school logo branding (Saves logo to disk and saves path in DB)
app.post('/api/branding', async (req, res) => {
  try {
    const { logo } = req.body;
    let logoValue = logo;
    
    if (logo && logo.startsWith('data:image/')) {
      const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
      const apiKey = process.env.CLOUDINARY_API_KEY;
      const apiSecret = process.env.CLOUDINARY_API_SECRET;
      
      if (cloudName && apiKey && apiSecret) {
        console.log('[Branding] Cloudinary configured. Uploading logo to Cloudinary...');
        logoValue = await uploadToCloudinaryIfNeeded(logo, 'school_logo_branding');
      } else {
        const fs = require('fs');
        const path = require('path');
        
        const exportDir = getExportsDir();
        if (!fs.existsSync(exportDir)) {
          fs.mkdirSync(exportDir, { recursive: true });
        }
        
        // Delete old logo files matching school_logo_* to prevent disk bloat
        try {
          const files = fs.readdirSync(exportDir);
          for (const file of files) {
            if (file.startsWith('school_logo_')) {
              fs.unlinkSync(path.join(exportDir, file));
            }
          }
        } catch (delErr) {
          console.warn('Failed to clean up old logos:', delErr);
        }
        
        // Extract data format and write to file
        const matches = logo.match(/^data:image\/([a-zA-Z0-9+]+);base64,(.+)$/);
        if (matches && matches.length === 3) {
          const ext = matches[1] === 'svg+xml' ? 'svg' : matches[1];
          const dataBuffer = Buffer.from(matches[2], 'base64');
          const filename = `school_logo_${Date.now()}.${ext}`;
          const filePath = path.join(exportDir, filename);
          
          fs.writeFileSync(filePath, dataBuffer);
          logoValue = `/api/pdf/download/${filename}`;
          console.log(`Saved new school logo to disk: ${filePath}`);
        }
      }
    }
    
    await pool.query(
      `INSERT INTO settings (key_name, val_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE val_value = ?`,
      ['school_logo', logoValue || null, logoValue || null]
    );
    res.json({ success: true, logo: logoValue });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- CLASSES ENDPOINTS ---
app.get('/api/classes', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM classes ORDER BY name');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/classes', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Class name is required' });
    await pool.query('INSERT INTO classes (name) VALUES (?) ON DUPLICATE KEY UPDATE name=name', [name]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- STREAMS ENDPOINTS ---
app.get('/api/streams', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM streams ORDER BY name');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/streams', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Stream name is required' });
    await pool.query('INSERT INTO streams (name) VALUES (?) ON DUPLICATE KEY UPDATE name=name', [name]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- MARKS ENDPOINTS ---
app.get('/api/marks', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM marks');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/marks/:studentId', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM marks WHERE student_id = ?', [req.params.studentId]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/marks', async (req, res) => {
  try {
    const { student_id, subject, marks_obtained, max_marks, term, year } = req.body;
    if (!student_id || !subject || marks_obtained === undefined || !term || !year) {
      return res.status(400).json({ error: 'Missing required parameters for marks' });
    }
    await pool.query(
      `INSERT INTO marks (student_id, subject, marks_obtained, max_marks, term, year) 
       VALUES (?, ?, ?, ?, ?, ?) 
       ON DUPLICATE KEY UPDATE marks_obtained = ?, max_marks = ?`,
      [student_id, subject, marks_obtained, max_marks || 100.00, term, year, marks_obtained, max_marks || 100.00]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/marks/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM marks WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- ATTENDANCE ENDPOINTS ---
app.get('/api/attendance', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM attendance');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/attendance/:studentId', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM attendance WHERE student_id = ? ORDER BY date DESC', [req.params.studentId]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/attendance', async (req, res) => {
  try {
    const { student_id, date, status, remarks } = req.body;
    if (!student_id || !date || !status) {
      return res.status(400).json({ error: 'Missing required parameters for attendance' });
    }
    await pool.query(
      `INSERT INTO attendance (student_id, date, status, remarks) 
       VALUES (?, ?, ?, ?) 
       ON DUPLICATE KEY UPDATE status = ?, remarks = ?`,
      [student_id, date, status, remarks || null, status, remarks || null]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- FEES ENDPOINTS ---
app.get('/api/fees', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM fees');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/fees/:studentId', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM fees WHERE student_id = ?', [req.params.studentId]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/fees', async (req, res) => {
  try {
    const { student_id, term, year, amount_due, amount_paid, payment_status } = req.body;
    if (!student_id || !term || !year || amount_due === undefined || amount_paid === undefined) {
      return res.status(400).json({ error: 'Missing required parameters for fees' });
    }
    await pool.query(
      `INSERT INTO fees (student_id, term, year, amount_due, amount_paid, payment_status) 
       VALUES (?, ?, ?, ?, ?, ?) 
       ON DUPLICATE KEY UPDATE amount_due = ?, amount_paid = ?, payment_status = ?`,
      [student_id, term, year, amount_due, amount_paid, payment_status || 'Pending', amount_due, amount_paid, payment_status || 'Pending']
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/fees/payment', async (req, res) => {
  try {
    const { student_id, term, year, amount_paid } = req.body;
    if (!student_id || !term || !year || amount_paid === undefined) {
      return res.status(400).json({ error: 'Missing required parameters for payment recording' });
    }
    // Check if fee record exists first, if not create one with default 0 amount_due
    const [rows] = await pool.query('SELECT * FROM fees WHERE student_id = ? AND term = ? AND year = ?', [student_id, term, year]);
    if (rows.length === 0) {
      await pool.query(
        `INSERT INTO fees (student_id, term, year, amount_due, amount_paid, payment_status) 
         VALUES (?, ?, ?, 0.00, ?, 'Pending')`,
        [student_id, term, year, amount_paid]
      );
    } else {
      await pool.query(
        `UPDATE fees SET amount_paid = amount_paid + ? WHERE student_id = ? AND term = ? AND year = ?`,
        [amount_paid, student_id, term, year]
      );
    }
    
    // Update status based on new balance
    const [updatedRows] = await pool.query('SELECT * FROM fees WHERE student_id = ? AND term = ? AND year = ?', [student_id, term, year]);
    if (updatedRows.length > 0) {
      const rec = updatedRows[0];
      const balance = parseFloat(rec.balance || 0);
      let status = 'Pending';
      if (balance <= 0) {
        status = 'Paid';
      } else if (balance > 0 && rec.payment_status === 'Paid') {
        status = 'Pending';
      } else {
        status = rec.payment_status;
      }
      await pool.query('UPDATE fees SET payment_status = ? WHERE id = ?', [status, rec.id]);
    }
    
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- INTEGRATION ENDPOINT (UNIFIED) ---
app.get('/api/integration/student/:adminNo', async (req, res) => {
  try {
    const [studentRows] = await pool.query(
      `SELECT id, adminNo, name, aliases, gender, gradeClass, boardingStatus, isCleared, 
              gateClearanceDate, mealsClearanceDate, remarks, printStatus, uace_combination, 
              parentName, parentContact, updatedAt, 
              IF(photo IS NOT NULL AND photo != '', 1, 0) as hasPhoto 
       FROM students WHERE adminNo = ?`,
      [req.params.adminNo]
    );
    if (studentRows.length === 0) {
      return res.status(404).json({ error: 'Student not found' });
    }
    const student = {
      ...studentRows[0],
      isCleared: !!studentRows[0].isCleared
    };
    
    const studentId = student.id;
    const isUACE = student.gradeClass.startsWith('S.5') || student.gradeClass.startsWith('S.6');
    
    // Get marks (querying active olevel_marks / uace_marks depending on class level)
    let marksRows = [];
    if (isUACE) {
      [marksRows] = await pool.query('SELECT * FROM uace_marks WHERE student_id = ? ORDER BY subject ASC', [studentId]);
    } else {
      [marksRows] = await pool.query('SELECT * FROM olevel_marks WHERE student_id = ? ORDER BY subject ASC', [studentId]);
    }
    
    // Get attendance
    const [attendanceRows] = await pool.query('SELECT * FROM attendance WHERE student_id = ? ORDER BY date DESC', [studentId]);
    // Get fees
    const [feesRows] = await pool.query('SELECT * FROM fees WHERE student_id = ?', [studentId]);
    // Get recent announcements
    const [announcements] = await pool.query('SELECT * FROM announcements ORDER BY createdAt DESC LIMIT 10');

    // Calculate positions (rank) dynamically
    let classPosition = 0;
    let totalClassStudents = 0;
    let streamPosition = 0;
    let totalStreamStudents = 0;

    if (marksRows.length > 0) {
      const term = marksRows[0].term;
      const year = marksRows[0].year;
      
      const parts = (student.gradeClass || '').trim().split(/\s+/);
      const className = parts[0] || 'S.1';

      const [classStudents] = await pool.query('SELECT id, gradeClass FROM students WHERE gradeClass LIKE ?', [`${className}%`]);
      const classStudentIds = Array.isArray(classStudents) ? classStudents.map(s => s.id) : [];
      const streamStudentIds = Array.isArray(classStudents) ? classStudents.filter(s => s.gradeClass === student.gradeClass).map(s => s.id) : [];

      if (classStudentIds.length > 0) {
        let classScores = [];
        if (isUACE) {
          const [uaceScores] = await pool.query(
            'SELECT student_id, AVG(score) as avg_score FROM uace_marks WHERE student_id IN (?) AND term = ? AND year = ? GROUP BY student_id',
            [classStudentIds, term, year]
          );
          classScores = uaceScores.map(u => ({ student_id: u.student_id, avg_score: parseFloat(u.avg_score || 0) }));
        } else {
          const [olevelRows] = await pool.query(
            'SELECT * FROM olevel_marks WHERE student_id IN (?) AND term = ? AND year = ?',
            [classStudentIds, term, year]
          );
          
          const studentMarksMap = {};
          olevelRows.forEach(row => {
            if (!studentMarksMap[row.student_id]) studentMarksMap[row.student_id] = [];
            studentMarksMap[row.student_id].push(row);
          });

          classScores = classStudentIds.map(sid => {
            const sMarks = studentMarksMap[sid] || [];
            let total = 0;
            let count = 0;
            sMarks.forEach(m => {
              const aiScores = [];
              if (m.integration1 !== null && m.integration1 !== undefined && m.integration1 !== '' && !isNaN(parseFloat(m.integration1))) {
                aiScores.push(parseFloat(m.integration1));
              }
              if (m.integration2 !== null && m.integration2 !== undefined && m.integration2 !== '' && !isNaN(parseFloat(m.integration2))) {
                aiScores.push(parseFloat(m.integration2));
              }
              if (m.integration3 !== null && m.integration3 !== undefined && m.integration3 !== '' && !isNaN(parseFloat(m.integration3))) {
                aiScores.push(parseFloat(m.integration3));
              }
              let caAverage = 0;
              if (aiScores.length > 0) {
                const sumPct = aiScores.map(score => (score / 3) * 100).reduce((a, b) => a + b, 0);
                caAverage = sumPct / aiScores.length;
              }
              const ca = (caAverage * 20) / 100;
              const exam = parseFloat(m.exam_score || 0);
              const examW = (exam * 80) / 100;
              total += (ca + examW);
              count++;
            });
            return {
              student_id: sid,
              avg_score: count > 0 ? (total / count) : 0
            };
          });
        }

        // Sort class positions
        classScores.sort((a, b) => b.avg_score - a.avg_score);
        classPosition = classScores.findIndex(s => s.student_id === studentId) + 1;
        totalClassStudents = classScores.filter(s => s.avg_score > 0 || s.student_id === studentId).length;

        // Filter stream positions
        const streamScores = classScores.filter(s => streamStudentIds.includes(s.student_id));
        streamPosition = streamScores.findIndex(s => s.student_id === studentId) + 1;
        totalStreamStudents = streamScores.filter(s => s.avg_score > 0 || s.student_id === studentId).length;
      }
    }

    res.json({
      student,
      marks: marksRows,
      attendance: attendanceRows,
      fees: feesRows,
      positions: {
        classPosition,
        totalClassStudents,
        streamPosition,
        totalStreamStudents
      },
      announcements
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST export to CSV
app.post('/api/export/csv', async (req, res) => {
  const fs = require('fs');
  const path = require('path');
  const createCsvWriter = require('csv-writer').createObjectCsvWriter;
  
  try {
    const students = req.body.students || [];
    const exportDir = getExportsDir();
    if (!fs.existsSync(exportDir)) {
      fs.mkdirSync(exportDir, { recursive: true });
    }
    
    const filename = `students-export-${Date.now()}.csv`;
    const filePath = path.join(exportDir, filename);
    
    const csvWriter = createCsvWriter({
      path: filePath,
      header: [
        { id: 'name', title: 'Name' },
        { id: 'adminNo', title: 'ADM Number' },
        { id: 'class', title: 'Class' },
        { id: 'stream', title: 'Stream' },
        { id: 'gender', title: 'Gender' },
        { id: 'boardingStatus', title: 'Boarding Status' },
        { id: 'isCleared', title: 'Clearance Status' },
        { id: 'photo', title: 'Photo URL' }
      ]
    });
    
    const records = Array.isArray(students) ? students.map(s => {
      const parts = (s.gradeClass || '').trim().split(/\s+/);
      const className = parts[0] || '';
      const streamName = parts.slice(1).join(' ') || '';
      return {
        name: s.name,
        adminNo: s.adminNo,
        class: className,
        stream: streamName,
        gender: s.gender,
        boardingStatus: s.boardingStatus,
        isCleared: s.isCleared ? 'Cleared' : 'On Hold',
        photo: s.photo || ''
      };
    }) : [];
    
    await csvWriter.writeRecords(records);
    
    res.download(filePath, 'students-export.csv', (err) => {
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      } catch (e) {
        console.error('Error deleting temp CSV:', e);
      }
    });
  } catch (err) {
    console.error('CSV export failed:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST export to Excel
app.post('/api/export/excel', async (req, res) => {
  const fs = require('fs');
  const path = require('path');
  const ExcelJS = require('exceljs');
  
  try {
    const students = req.body.students || [];
    const exportDir = getExportsDir();
    if (!fs.existsSync(exportDir)) {
      fs.mkdirSync(exportDir, { recursive: true });
    }
    
    const filename = `students-export-${Date.now()}.xlsx`;
    const filePath = path.join(exportDir, filename);
    
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Students');
    
    worksheet.columns = [
      { header: 'Name', key: 'name', width: 25 },
      { header: 'ADM Number', key: 'adminNo', width: 15 },
      { header: 'Class', key: 'class', width: 10 },
      { header: 'Stream', key: 'stream', width: 12 },
      { header: 'Gender', key: 'gender', width: 10 },
      { header: 'Boarding Status', key: 'boardingStatus', width: 15 },
      { header: 'Clearance Status', key: 'isCleared', width: 15 },
      { header: 'Photo URL', key: 'photo', width: 30 }
    ];
    
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE2E8F0' }
    };
    
    students.forEach(s => {
      const parts = (s.gradeClass || '').trim().split(/\s+/);
      const className = parts[0] || '';
      const streamName = parts.slice(1).join(' ') || '';
      worksheet.addRow({
        name: s.name,
        adminNo: s.adminNo,
        class: className,
        stream: streamName,
        gender: s.gender,
        boardingStatus: s.boardingStatus,
        isCleared: s.isCleared ? 'Cleared' : 'On Hold',
        photo: s.photo || ''
      });
    });
    
    await workbook.xlsx.writeFile(filePath);
    
    res.download(filePath, 'students-export.xlsx', (err) => {
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      } catch (e) {
        console.error('Error deleting temp Excel:', e);
      }
    });
  } catch (err) {
    console.error('Excel export failed:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET print history
app.get('/api/print-history', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM print_history ORDER BY print_date DESC');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET audit logs
app.get('/api/audit-logs', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM audit_logs ORDER BY timestamp DESC LIMIT 500');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST generate PDF on the server
app.post('/api/pdf/generate', async (req, res) => {
  try {
    const {
      layoutMode,
      studentIds, // Array of student IDs to print
      filters, // Optional query filters
      printSide,
      increasePdfBrightness,
      showWatermark,
      watermarkOpacity,
      schoolLogoBase64
    } = req.body;
    
    let finalStudentIds = studentIds;
    if ((!finalStudentIds || !Array.isArray(finalStudentIds) || finalStudentIds.length === 0) && filters) {
      // Build filters SQL query exactly like GET /api/students
      let whereClauses = [];
      let queryParams = [];
      
      if (filters.search) {
        whereClauses.push('(name LIKE ? OR adminNo LIKE ?)');
        queryParams.push(`${filters.search}%`, `${filters.search}%`);
      }
      if (filters.gradeClass && filters.gradeClass !== 'All') {
        if (filters.stream && filters.stream !== 'All') {
          whereClauses.push('gradeClass = ?');
          queryParams.push(`${filters.gradeClass} ${filters.stream}`);
        } else {
          whereClauses.push('(gradeClass = ? OR gradeClass LIKE ?)');
          queryParams.push(filters.gradeClass, `${filters.gradeClass} %`);
        }
      } else if (filters.stream && filters.stream !== 'All') {
        whereClauses.push('gradeClass LIKE ?');
        queryParams.push(`% ${filters.stream}`);
      }
      if (filters.gender && filters.gender !== 'All') {
        whereClauses.push('gender = ?');
        queryParams.push(filters.gender);
      }
      if (filters.isCleared && filters.isCleared !== 'All') {
        whereClauses.push('isCleared = ?');
        queryParams.push(filters.isCleared === 'Cleared' ? 1 : 0);
      }
      if (filters.boardingStatus && filters.boardingStatus !== 'All') {
        if (filters.boardingStatus === 'Hosteller' || filters.boardingStatus === 'Boarder' || filters.boardingStatus === 'Hostellers') {
          whereClauses.push('(boardingStatus = "Boarder" OR boardingStatus = "Hosteller")');
        } else if (filters.boardingStatus === 'Day Scholar' || filters.boardingStatus === 'Day Scholars') {
          whereClauses.push('(boardingStatus = "Day Scholar" OR boardingStatus = "Day Scholars")');
        } else {
          whereClauses.push('boardingStatus = ?');
          queryParams.push(filters.boardingStatus);
        }
      }
      if (filters.printStatus && filters.printStatus !== 'All') {
        whereClauses.push('printStatus = ?');
        queryParams.push(filters.printStatus);
      }
      if (filters.photo && filters.photo !== 'All') {
        if (filters.photo === 'WithPhoto') {
          whereClauses.push('(photo IS NOT NULL AND photo != "")');
        } else if (filters.photo === 'NoPhoto') {
          whereClauses.push('(photo IS NULL OR photo = "")');
        }
      }
      if (filters.academicYear && filters.academicYear !== 'All') {
        whereClauses.push('adminNo LIKE ?');
        queryParams.push(`%${filters.academicYear}%`);
      }
      
      let whereSql = '';
      if (whereClauses.length > 0) {
        whereSql = ' WHERE ' + whereClauses.join(' AND ');
      }
      
      const [rows] = await pool.query(`SELECT id FROM students${whereSql}`, queryParams);
      finalStudentIds = rows.map(r => r.id);
    }

    if (!finalStudentIds || !Array.isArray(finalStudentIds) || finalStudentIds.length === 0) {
      return res.status(400).json({ error: 'No student IDs or matching filters provided for PDF generation' });
    }

    // Quality Control validations - Select specific columns to check completeness (avoids loading massive photos)
    const [studentsCheck] = await pool.query(
      'SELECT id, name, adminNo, gradeClass, photo FROM students WHERE id IN (?)',
      [finalStudentIds]
    );
    if (studentsCheck.length === 0) {
      return res.status(404).json({ error: 'No students found matching the provided IDs' });
    }

    if (!schoolLogoBase64) {
      console.warn('Quality Control Warning: School crest/logo is missing or not visible. Proceeding without logo.');
    }

    const incompleteStudents = [];
    for (const student of studentsCheck) {
      const missing = [];
      if (!student.name || !student.name.trim()) missing.push('Name');
      if (!student.adminNo || !student.adminNo.trim()) missing.push('Admin Number');
      if (!student.gradeClass || !student.gradeClass.trim()) missing.push('Class');
      if (!student.photo || !student.photo.trim()) missing.push('Passport Photo');

      if (missing.length > 0) {
        incompleteStudents.push(`${student.name || 'Unnamed Student'} (ID: ${student.adminNo || student.id}) - Missing: ${missing.join(', ')}`);
      }
    }

    if (incompleteStudents.length > 0) {
      console.warn(`Quality Control Warning: Incomplete student profiles found:\n\n${incompleteStudents.join('\n')}`);
    }
    
    const taskId = `task-pdf-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Set initial status
    pdfTasks[taskId] = {
      id: taskId,
      status: 'processing',
      progress: 0,
      total: finalStudentIds.length,
      filename: null,
      filePath: null,
      error: null
    };

    // Run PDF generation in the background
    (async () => {
      try {
        // Load student records from DB (specifically select required fields only, avoids photoOriginal/photoEnhanced)
        const [students] = await pool.query(
          `SELECT id, adminNo, name, gender, gradeClass, boardingStatus, isCleared, photo, printStatus, uace_combination, parentName, parentContact, updatedAt 
           FROM students WHERE id IN (?)`,
          [finalStudentIds]
        );
        if (students.length === 0) {
          throw new Error('No students found matching the provided IDs');
        }

        // Order students to match the input finalStudentIds array order
        const studentMap = new Map(Array.isArray(students) ? students.map(s => [s.id, { ...s, isCleared: !!s.isCleared }]) : []);
        const orderedStudents = finalStudentIds.map(id => studentMap.get(id)).filter(Boolean);

        // Pre-resolve school logo (URL, path, or base64)
        let activeLogo = schoolLogoBase64;
        if (activeLogo) {
          activeLogo = await getLogoAsBase64(activeLogo) || activeLogo;
        }

        // Pre-resolve student photos if they are URLs (in batches of 30 in parallel)
        const batchSize = 30;
        for (let i = 0; i < orderedStudents.length; i += batchSize) {
          const batch = orderedStudents.slice(i, i + batchSize);
          await Promise.all(batch.map(async (student) => {
            if (student.photo && student.photo.startsWith('http')) {
              student.photo = await getBase64ImageFromUrl(student.photo) || student.photo;
            }
          }));
        }
        
        const { generateClearancePdf } = require('./pdfGenerator');
        
        // Generate PDF
        const doc = await generateClearancePdf({
          layoutMode,
          students: orderedStudents,
          schoolLogoBase64: activeLogo,
          printSide,
          increasePdfBrightness,
          showWatermark,
          watermarkOpacity,
          onProgress: (current, total) => {
            if (pdfTasks[taskId]) {
              pdfTasks[taskId].progress = current;
              pdfTasks[taskId].total = total;
            }
          }
        });
        
        // Output to buffer
        const pdfBuffer = Buffer.from(doc.output('arraybuffer'));
        
        const fs = require('fs');
        const path = require('path');
        const exportDir = getExportsDir();
        if (!fs.existsSync(exportDir)) {
          fs.mkdirSync(exportDir, { recursive: true });
        }
        
        const filename = `clearance-cards-${Date.now()}.pdf`;
        const filePath = path.join(exportDir, filename);
        fs.writeFileSync(filePath, pdfBuffer);
        
        // Insert into print_history
        const [result] = await pool.query(
          'INSERT INTO print_history (student_ids, layout_mode, pdf_path) VALUES (?, ?, ?)',
          [JSON.stringify(finalStudentIds), layoutMode, filename]
        );
        
        // Log audit trail
        await writeAuditLog(
          'Generate PDF Cards',
          `Generated PDF containing ${orderedStudents.length} clearance cards. Output saved as ${filename}.`
        );
        
        // Mark all these students as 'Printed' in DB
        await pool.query('UPDATE students SET printStatus = ? WHERE id IN (?)', ['Printed', finalStudentIds]);
        
        // Update task status as completed
        if (pdfTasks[taskId]) {
          pdfTasks[taskId].status = 'completed';
          pdfTasks[taskId].filename = filename;
          pdfTasks[taskId].filePath = filePath;
          pdfTasks[taskId].historyId = result.insertId;
        }
      } catch (bgErr) {
        console.error('Background PDF generation error:', bgErr);
        if (pdfTasks[taskId]) {
          pdfTasks[taskId].status = 'failed';
          pdfTasks[taskId].error = bgErr.message;
        }
      }
    })();

    // Respond immediately
    res.json({
      success: true,
      taskId
    });
  } catch (err) {
    console.error('Failed to generate PDF on server:', err);
    res.status(500).json({ error: err.message });
  }
});
// GET download PDF file
app.get('/api/pdf/download/:filename', (req, res) => {
  const fs = require('fs');
  const path = require('path');
  const filename = req.params.filename;
  const filePath = path.join(getExportsDir(), filename);
  
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'PDF file not found' });
  }
  
  if (req.query.preview === 'true') {
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="' + filename + '"');
    res.sendFile(filePath);
  } else {
    res.download(filePath, filename);
  }
});

// GET PDF generation status
app.get('/api/pdf/status/:taskId', (req, res) => {
  const task = pdfTasks[req.params.taskId];
  if (!task) {
    return res.status(404).json({ error: 'PDF generation task not found.' });
  }
  res.json(task);
});

// ==========================================
// ===== SCHOOL MANAGEMENT SYSTEM APIS =====
// ==========================================

// GET settings
app.get('/api/settings', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT key_name, val_value FROM settings');
    const settings = {};
    rows.forEach(r => {
      settings[r.key_name] = r.val_value;
    });
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST settings
app.post('/api/settings', async (req, res) => {
  try {
    const settings = req.body;
    for (const [key, value] of Object.entries(settings)) {
      await pool.query(
        'INSERT INTO settings (key_name, val_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE val_value = ?',
        [key, value, value]
      );
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST auth login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password, role } = req.body;
    if (!username || !password || !role) {
      return res.status(400).json({ error: 'Username, password, and role are required.' });
    }

    if (!pool || !dbInitialized) {
      if (role === 'admin' && ((username === 'admin' || username === 'adin') && password === 'admin123')) {
        const payload = { id: 'admin', role: 'admin', username: 'admin' };
        const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '24h' });
        return res.json({
          success: true,
          role: 'admin',
          user: { name: 'System Administrator', username: 'admin' },
          token,
          degraded: true
        });
      }

      if (role === 'teacher' && username === 'teacher' && password === 'teacher123') {
        const payload = { id: 'teacher', role: 'teacher', username: 'teacher' };
        const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '24h' });
        return res.json({
          success: true,
          role: 'teacher',
          user: { name: 'Default Teacher', username: 'teacher', status: 'Active', position: 'Teacher', subjects: [], classes: [] },
          token,
          degraded: true
        });
      }

      return res.status(503).json({ error: 'Database service is temporarily unavailable. Please retry later.', degraded: true });
    }

    if (role === 'admin') {
      let dbName = 'System Administrator';
      let dbUser = 'admin';
      let dbPass = 'admin123';

      try {
        const [rows] = await pool.query('SELECT val_value FROM settings WHERE key_name = ?', ['admin_profile']);
        if (rows.length > 0 && rows[0].val_value) {
          const profile = JSON.parse(rows[0].val_value);
          dbName = profile.name || dbName;
          dbUser = profile.username || dbUser;
          dbPass = profile.password || dbPass;
        }
      } catch (e) {
        console.warn('Failed to load admin profile from database settings:', e);
      }

      if ((username === dbUser || (username === 'adin' && dbUser === 'admin')) && password === dbPass) {
        const payload = { id: 'admin', role: 'admin', username: dbUser };
        const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '24h' });
        return res.json({
          success: true,
          role: 'admin',
          user: { name: dbName, username: dbUser },
          token: token
        });
      }
      return res.status(401).json({ error: 'Invalid admin credentials.' });
    }

    // Helper to get teacher profile with specific assignments
    async function getTeacherProfile(teacher) {
      const [assignments] = await pool.query('SELECT subject, grade_class FROM teacher_assignments WHERE teacher_id = ?', [teacher.id]);
      const [classTeacherRows] = await pool.query('SELECT grade_class FROM class_teachers WHERE teacher_id = ?', [teacher.id]);
      const classTeacherFor = classTeacherRows.map(ct => ct.grade_class);
      
      let userSubjects = typeof teacher.subjects === 'string' ? JSON.parse(teacher.subjects) : teacher.subjects;
      let userClasses = typeof teacher.classes === 'string' ? JSON.parse(teacher.classes) : teacher.classes;
      let userAssignments = assignments.map(a => ({ subject: a.subject, grade_class: a.grade_class }));
      
      if (userAssignments.length === 0 && userSubjects.length > 0 && userClasses.length > 0) {
        userSubjects.forEach(s => {
          userClasses.forEach(c => {
            userAssignments.push({ subject: s, grade_class: c });
          });
        });
      }
      
      return {
        id: teacher.id,
        name: teacher.name,
        username: teacher.username,
        gender: teacher.gender || null,
        photo: teacher.photo || null,
        status: teacher.status || 'Active',
        position: teacher.position || 'Teacher',
        subjects: Array.from(new Set(userAssignments.map(a => a.subject))),
        classes: Array.from(new Set(userAssignments.map(a => a.grade_class))),
        assignments: userAssignments,
        classTeacherFor
      };
    }

    if (role === 'teacher') {
      if (username === 'teacher' && password === 'teacher123') {
        const [rows] = await pool.query('SELECT * FROM teachers WHERE username = ?', ['teacher']);
        if (rows.length > 0) {
          const teacher = rows[0];
          if (teacher.status === 'Inactive') {
            return res.status(403).json({ error: 'Your account is deactivated. Please contact the administrator.' });
          }
          const profile = await getTeacherProfile(teacher);
          const payload = { id: teacher.id, role: 'teacher', username: teacher.username };
          const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '24h' });
          return res.json({
            success: true,
            role: 'teacher',
            user: profile,
            token: token
          });
        }
      }

      const [rows] = await pool.query('SELECT * FROM teachers WHERE username = ?', [username]);
      if (rows.length === 0) {
        return res.status(401).json({ error: 'Teacher not found.' });
      }
      const teacher = rows[0];
      if (teacher.status === 'Inactive') {
        return res.status(403).json({ error: 'Your account is deactivated. Please contact the administrator.' });
      }
      const crypto = require('crypto');
      const hash = crypto.createHash('sha256').update(password).digest('hex');
      if (hash !== teacher.password_hash) {
        return res.status(401).json({ error: 'Invalid teacher password.' });
      }

      const profile = await getTeacherProfile(teacher);
      const payload = { id: teacher.id, role: 'teacher', username: teacher.username };
      const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '24h' });
      return res.json({
        success: true,
        role: 'teacher',
        user: profile,
        token: token
      });
    }

    if (role === 'student') {
      if (username === 'student' && password === 'student123') {
        const [stRows] = await pool.query('SELECT id, name, adminNo, gradeClass FROM students LIMIT 1');
        if (stRows.length > 0) {
          const st = stRows[0];
          const payload = { id: st.id, role: 'student', username: st.adminNo };
          const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '24h' });
          return res.json({
            success: true,
            role: 'student',
            user: {
              id: st.id,
              name: st.name,
              adminNo: st.adminNo,
              gradeClass: st.gradeClass,
              needsPasswordChange: false
            },
            token: token
          });
        }
        return res.status(404).json({ error: 'No students found in the database.' });
      }

      // Find student by adminNo
      const [stRows] = await pool.query('SELECT id FROM students WHERE adminNo = ?', [username]);
      if (stRows.length === 0) {
        return res.status(401).json({ error: 'Student record not found in registry.' });
      }
      const studentId = stRows[0].id;

      // Auto-create login account if missing
      await ensureStudentAccount(pool, studentId);

      // Fetch student account details
      const [rows] = await pool.query(
        'SELECT sa.*, s.name, s.adminNo, s.gradeClass FROM student_accounts sa JOIN students s ON sa.student_id = s.id WHERE s.id = ?',
        [studentId]
      );
      if (rows.length === 0) {
        return res.status(401).json({ error: 'Student account not found.' });
      }

      const studentAcc = rows[0];
      if (studentAcc.status === 'Inactive') {
        return res.status(403).json({ error: 'Your student account is currently Inactive. Please contact the Administrator.' });
      }

      const crypto = require('crypto');
      const hash = crypto.createHash('sha256').update(password).digest('hex');
      if (hash !== studentAcc.password_hash) {
        return res.status(401).json({ error: 'Invalid student password.' });
      }

      // Update last login
      await pool.query('UPDATE student_accounts SET lastLogin = NOW() WHERE student_id = ?', [studentId]);

      const payload = { id: studentAcc.student_id, role: 'student', username: studentAcc.adminNo };
      const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '24h' });
      return res.json({
        success: true,
        role: 'student',
        user: {
          id: studentAcc.student_id,
          name: studentAcc.name,
          adminNo: studentAcc.adminNo,
          gradeClass: studentAcc.gradeClass,
          needsPasswordChange: !!studentAcc.needs_password_change
        },
        token: token
      });
    }

    res.status(400).json({ error: 'Invalid role specified.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET teacher classes
app.get('/api/teacher/classes', async (req, res) => {
  try {
    const { teacherId } = req.query;
    if (!teacherId) return res.status(400).json({ error: 'Teacher ID required' });
    const [rows] = await pool.query('SELECT classes, subjects FROM teachers WHERE id = ?', [teacherId]);
    if (rows.length === 0) return res.status(404).json({ error: 'Teacher not found' });
    const t = rows[0];
    res.json({
      classes: typeof t.classes === 'string' ? JSON.parse(t.classes) : t.classes,
      subjects: typeof t.subjects === 'string' ? JSON.parse(t.subjects) : t.subjects
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET teacher students
app.get('/api/teacher/students', async (req, res) => {
  try {
    const { gradeClass } = req.query;
    if (!gradeClass) return res.status(400).json({ error: 'Class required' });
    const [rows] = await pool.query(
      'SELECT id, adminNo, name, gender, gradeClass, boardingStatus FROM students WHERE gradeClass = ? ORDER BY name',
      [gradeClass]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET teacher marks
app.get('/api/teacher/marks', async (req, res) => {
  try {
    const { gradeClass, subject, term, year, paper } = req.query;
    if (!gradeClass || !subject || !term || !year) {
      return res.status(400).json({ error: 'Missing required query parameters' });
    }
    const isUACE = gradeClass.startsWith('S.5') || gradeClass.startsWith('S.6');
    if (isUACE) {
      const paperNum = parseInt(paper || 1, 10);
      const [rows] = await pool.query(
        `SELECT um.*, s.name, s.adminNo 
         FROM uace_marks um 
         JOIN students s ON um.student_id = s.id 
         WHERE s.gradeClass = ? AND um.subject = ? AND um.paper = ? AND um.term = ? AND um.year = ?`,
        [gradeClass, subject, paperNum, term, parseInt(year, 10)]
      );
      res.json(rows);
    } else {
      const [rows] = await pool.query(
        `SELECT om.*, s.name, s.adminNo 
         FROM olevel_marks om 
         JOIN students s ON om.student_id = s.id 
         WHERE s.gradeClass = ? AND om.subject = ? AND om.term = ? AND om.year = ?`,
        [gradeClass, subject, term, parseInt(year, 10)]
      );
      res.json(rows);
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST save/update teacher marks
app.post('/api/teacher/marks', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const { gradeClass, subject, term, year, teacherId, marksList, paper } = req.body;
    if (!gradeClass || !subject || !term || !year || !marksList || !Array.isArray(marksList)) {
      return res.status(400).json({ error: 'Missing parameters' });
    }
    // Permission check: ensure teacher is allowed to edit this subject/class
    if (teacherId) {
      const [tRows] = await connection.query('SELECT classes, subjects, username FROM teachers WHERE id = ?', [teacherId]);
      if (tRows.length === 0) {
        await connection.rollback();
        return res.status(403).json({ error: 'Teacher not found or not authorised.' });
      }
      const teacherRec = tRows[0];
      const allowedSubjects = typeof teacherRec.subjects === 'string' ? JSON.parse(teacherRec.subjects || '[]') : (teacherRec.subjects || []);
      const allowedClasses = typeof teacherRec.classes === 'string' ? JSON.parse(teacherRec.classes || '[]') : (teacherRec.classes || []);
      // Allow if teacher is assigned to the subject and the gradeClass matches any allowed class prefix
      const subjectAllowed = allowedSubjects.length === 0 || allowedSubjects.includes(subject);
      const classAllowed = allowedClasses.length === 0 || allowedClasses.some(c => gradeClass.startsWith(c));
      if (!subjectAllowed || !classAllowed) {
        await connection.rollback();
        return res.status(403).json({ error: 'You are not allowed to edit marks for this subject or class.' });
      }
    }
    // Lookup teacher username for detailed audit trail
    let teacherUsername = 'Unknown';
    if (teacherId) {
      const [tRows] = await connection.query('SELECT username FROM teachers WHERE id = ?', [teacherId]);
      if (tRows.length > 0) {
        teacherUsername = tRows[0].username;
      }
    }

    const parts = gradeClass.trim().split(/\s+/);
    const className = parts[0] || '';
    const streamName = parts.slice(1).join(' ') || '';

    const now = new Date();
    const dateStr = now.toLocaleDateString('en-GB');
    const timeStr = now.toLocaleTimeString('en-GB');

    // Determine whether this is a new entry or modifications exist
    const [studentsInClass] = await connection.query('SELECT id FROM students WHERE gradeClass = ?', [gradeClass]);
    const studentIds = studentsInClass.map(s => s.id);
    const isUACE = gradeClass.startsWith('S.5') || gradeClass.startsWith('S.6');
    let existingCount = 0;
    const paperNum = parseInt(paper || 1, 10);

    if (studentIds.length > 0) {
      if (isUACE) {
        const [cnt] = await connection.query('SELECT COUNT(*) as c FROM uace_marks WHERE subject = ? AND paper = ? AND term = ? AND year = ? AND student_id IN (?)', [subject, paperNum, term, parseInt(year, 10), studentIds]);
        existingCount = cnt[0]?.c || 0;
      } else {
        const [cnt] = await connection.query('SELECT COUNT(*) as c FROM olevel_marks WHERE subject = ? AND term = ? AND year = ? AND student_id IN (?)', [subject, term, parseInt(year, 10), studentIds]);
        existingCount = cnt[0]?.c || 0;
      }
    }

    const auditAction = existingCount === 0 ? 'Enter Marks' : 'Modify Marks';

    const { getUACEPrincipalGrade, getUACESubGPGrade } = require('./reportGenerator');

    for (const m of marksList) {
      if (isUACE) {
        const botVal = m.bot !== undefined && m.bot !== null && m.bot !== '' ? parseFloat(m.bot) : 0;
        const motVal = m.mot !== undefined && m.mot !== null && m.mot !== '' ? parseFloat(m.mot) : 0;
        const eotVal = m.eot !== undefined && m.eot !== null && m.eot !== '' ? parseFloat(m.eot) : 0;
        if (isNaN(botVal) || botVal < 0 || botVal > 100 ||
            isNaN(motVal) || motVal < 0 || motVal > 100 ||
            isNaN(eotVal) || eotVal < 0 || eotVal > 100) {
          await connection.rollback();
          return res.status(400).json({ error: `Invalid UACE marks for student ${m.student_id || 'unknown'}. BOT, MOT, and EOT scores must be between 0 and 100.` });
        }
      } else {
        const maxAI = 3; // Strictly capped at 3
        const maxExam = 100; // Strictly capped at 100
        const checkOLevelRange = (val, label) => {
          if (val === undefined || val === null || val === '') return null;
          const num = parseFloat(val);
          if (isNaN(num) || num < 0 || num > (label === 'Exam score' ? maxExam : maxAI)) {
            return `${label} must be between 0 and ${label === 'Exam score' ? maxExam : maxAI}.`;
          }
          return null;
        };

        let err = checkOLevelRange(m.integration1, 'AI1');
        if (err) {
          await connection.rollback();
          return res.status(400).json({ error: `${err} (student ${m.student_id || 'unknown'})` });
        }
        err = checkOLevelRange(m.integration2, 'AI2');
        if (err) {
          await connection.rollback();
          return res.status(400).json({ error: `${err} (student ${m.student_id || 'unknown'})` });
        }
        err = checkOLevelRange(m.integration3, 'AI3');
        if (err) {
          await connection.rollback();
          return res.status(400).json({ error: `${err} (student ${m.student_id || 'unknown'})` });
        }
        err = checkOLevelRange(m.exam_score, 'Exam score');
        if (err) {
          await connection.rollback();
          return res.status(400).json({ error: `${err} (student ${m.student_id || 'unknown'})` });
        }
      }
    }

    const auditDetails = `Teacher: ${teacherUsername}, Subject: ${subject}, Class: ${className}, Stream: ${streamName}, Date: ${dateStr}, Time: ${timeStr}`;
    await connection.query('INSERT INTO audit_logs (action, details) VALUES (?, ?)', [auditAction, auditDetails]);

    for (const m of marksList) {
      if (isUACE) {
        const botVal = m.bot !== undefined && m.bot !== null && m.bot !== '' ? parseFloat(m.bot) : 0;
        const motVal = m.mot !== undefined && m.mot !== null && m.mot !== '' ? parseFloat(m.mot) : 0;
        const eotVal = m.eot !== undefined && m.eot !== null && m.eot !== '' ? parseFloat(m.eot) : 0;
        
        const score = Math.round(botVal * 0.3 + motVal * 0.3 + eotVal * 0.4);
        const subType = m.subject_type || 'Principal';
        const pNum = m.paper !== undefined && m.paper !== null && m.paper !== '' ? parseInt(m.paper, 10) : paperNum;
        
        const grInfo = (subType === 'General Paper' || subType === 'Subsidiary') ? getUACESubGPGrade(score) : getUACEPrincipalGrade(score);
        const targetStatus = 'Approved';

        await connection.query(
          `INSERT INTO uace_marks (student_id, subject, subject_type, paper, bot, mot, eot, score, grade, points, term, year, teacher_id, status) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) 
           ON DUPLICATE KEY UPDATE bot = ?, mot = ?, eot = ?, score = ?, grade = ?, points = ?, teacher_id = ?, status = ?`,
          [
            m.student_id, subject, subType, pNum, botVal, motVal, eotVal, score, grInfo.grade, grInfo.points, term, parseInt(year, 10), teacherId, targetStatus,
            botVal, motVal, eotVal, score, grInfo.grade, grInfo.points, teacherId, targetStatus
          ]
        );
      } else {
        const int1 = m.integration1 !== undefined && m.integration1 !== null && m.integration1 !== '' ? parseFloat(m.integration1) : null;
        const int2 = m.integration2 !== undefined && m.integration2 !== null && m.integration2 !== '' ? parseFloat(m.integration2) : null;
        const int3 = m.integration3 !== undefined && m.integration3 !== null && m.integration3 !== '' ? parseFloat(m.integration3) : null;
        const exam = m.exam_score !== undefined && m.exam_score !== null && m.exam_score !== '' ? parseFloat(m.exam_score) : null;
        
        const hasNoMarks = (int1 === null) && (int2 === null) && (int3 === null) && (exam === null);
        const targetStatus = 'Approved';

        await connection.query(
          `INSERT INTO olevel_marks (student_id, subject, integration1, integration2, integration3, exam_score, term, year, teacher_id, status) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) 
           ON DUPLICATE KEY UPDATE integration1 = ?, integration2 = ?, integration3 = ?, exam_score = ?, teacher_id = ?, status = ?`,
          [
            m.student_id, subject, int1, int2, int3, exam, term, parseInt(year, 10), teacherId, targetStatus,
            int1, int2, int3, exam, teacherId, targetStatus
          ]
        );
      }
    }

    await connection.commit();

    // Clear cached stats so report averages/rankings reflect the new marks immediately
    statsCache = null;

    res.json({ success: true });
  } catch (err) {
    await connection.rollback();
    res.status(500).json({ error: err.message });
  } finally {
    connection.release();
  }
});

// POST submit marks for approval
// POST submit marks (deprecated - approval workflow removed)
app.post('/api/teacher/marks/submit', async (req, res) => {
  try {
    // Previously used to set status 'Submitted'. Approval flows removed; marks are saved as 'Approved' immediately when teachers save.
    const { gradeClass, subject, term, year, teacherId } = req.body;
    await writeAuditLog('Submit Marks (Deprecated)', `Marks submit requested for ${gradeClass} ${subject} by ${teacherId || 'unknown'}`);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET pending marks
app.get('/api/admin/marks/pending', async (req, res) => {
  try {
    // Approval workflow removed. No pending marks concept anymore.
    res.json([]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST approve/reject marks
app.post('/api/admin/marks/approve', async (req, res) => {
  try {
    const { gradeClass, subject, term, year, action, approvedBy } = req.body;
    const isUACE = gradeClass.startsWith('S.5') || gradeClass.startsWith('S.6');
    const newStatus = action === 'Approve' ? 'Approved' : (action === 'Reopen' ? 'Reopened' : 'Draft');
    const adminName = approvedBy || 'Administrator';
    // Approval endpoints are kept for compatibility but no longer change active marks.
    // If requested, we log the admin action and return success.
    const termText = (term === '1' || term === '2' || term === '3') ? 'Term ' + term : term;
    await writeAuditLog(`${action} Marks (No-Op)`, `${action} requested by ${adminName} for ${gradeClass} - ${subject} - ${termText} (${year})`);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET all worksheets with aggregated statuses
// Note: Approval statuses removed; worksheets returned with active flag when marks exist
app.get('/api/admin/marks/all-worksheets', async (req, res) => {
  try {
    const olevelQuery = `
      SELECT s.gradeClass, om.subject, om.term, om.year, t.name as teacher_name,
             SUM(CASE WHEN om.status = 'Approved' THEN 1 ELSE 0 END) as approved_count,
             SUM(CASE WHEN om.status = 'Submitted' THEN 1 ELSE 0 END) as submitted_count,
             SUM(CASE WHEN om.status = 'Reopened' THEN 1 ELSE 0 END) as reopened_count,
             SUM(CASE WHEN om.status = 'Draft' THEN 1 ELSE 0 END) as draft_count,
             COUNT(*) as total_count
      FROM olevel_marks om
      JOIN students s ON om.student_id = s.id
      LEFT JOIN teachers t ON om.teacher_id = t.id
      GROUP BY s.gradeClass, om.subject, om.term, om.year, t.name
    `;
    const uaceQuery = `
      SELECT s.gradeClass, um.subject, um.term, um.year, t.name as teacher_name,
             SUM(CASE WHEN um.status = 'Approved' THEN 1 ELSE 0 END) as approved_count,
             SUM(CASE WHEN um.status = 'Submitted' THEN 1 ELSE 0 END) as submitted_count,
             SUM(CASE WHEN um.status = 'Reopened' THEN 1 ELSE 0 END) as reopened_count,
             SUM(CASE WHEN um.status = 'Draft' THEN 1 ELSE 0 END) as draft_count,
             COUNT(*) as total_count
      FROM uace_marks um
      JOIN students s ON um.student_id = s.id
      LEFT JOIN teachers t ON um.teacher_id = t.id
      GROUP BY s.gradeClass, um.subject, um.term, um.year, t.name
    `;

    const [olevelRows] = await pool.query(olevelQuery);
    const [uaceRows] = await pool.query(uaceQuery);

    const combined = [...olevelRows, ...uaceRows].map(w => {
      const total = w.total_count || 0;
      const status = total > 0 ? 'Active' : 'No Marks';
      return {
        gradeClass: w.gradeClass,
        subject: w.subject,
        term: w.term,
        year: w.year,
        teacher_name: w.teacher_name,
        status,
        total: total
      };
    });

    const TERM_ORDER = {
      '1': 1,
      'Midterm 1': 2,
      '2': 3,
      'Midterm 2': 4,
      '3': 5,
      'Midterm 3': 6
    };
    combined.sort((a, b) => {
      if (a.year !== b.year) return a.year - b.year;
      const oA = TERM_ORDER[a.term] || 99;
      const oB = TERM_ORDER[b.term] || 99;
      if (oA !== oB) return oA - oB;
      if (a.gradeClass !== b.gradeClass) return a.gradeClass.localeCompare(b.gradeClass);
      return a.subject.localeCompare(b.subject);
    });

    res.json(combined);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST bulk approve/reopen marks
app.post('/api/admin/marks/approve-bulk', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    // Approval workflow removed - do not change marks statuses in bulk.
    await connection.beginTransaction();
    const { classVal, stream, subject, term, year, action, approvedBy } = req.body;
    const adminName = approvedBy || 'Administrator';
    const logDetails = `Bulk ${action} requested by ${adminName}. Filters: Class=${classVal || 'All'}, Stream=${stream || 'All'}, Subject=${subject || 'All'}, Term=${term || 'All'}, Year=${year || 'All'}`;
    await writeAuditLog(`${action} Marks (Bulk) - No-Op`, logDetails);
    await connection.commit();
    res.json({ success: true });
  } catch (err) {
    await connection.rollback();
    res.status(500).json({ error: err.message });
  } finally {
    connection.release();
  }
});

// POST search students with marks aggregates
app.post('/api/admin/students/search-with-marks', async (req, res) => {
  try {
    const { term, year, search, gradeClass, stream, gender, performanceGrade, reportStatus } = req.body;

    if (!term || !year) {
      return res.status(400).json({ error: 'Term and Year are required parameters.' });
    }

    let studentQuery = 'SELECT id, adminNo, name, gender, gradeClass, boardingStatus FROM students WHERE 1=1';
    const studentParams = [];

    if (search) {
      studentQuery += ' AND (name LIKE ? OR adminNo LIKE ?)';
      studentParams.push(`%${search}%`, `%${search}%`);
    }
    if (gradeClass && gradeClass !== 'All') {
      studentQuery += ' AND gradeClass LIKE ?';
      studentParams.push(`${gradeClass}%`);
    }
    if (stream && stream !== 'All') {
      studentQuery += ' AND gradeClass LIKE ?';
      studentParams.push(`% ${stream}`);
    }
    if (gender && gender !== 'All') {
      studentQuery += ' AND gender = ?';
      studentParams.push(gender);
    }

    const [students] = await pool.query(studentQuery, studentParams);
    if (students.length === 0) {
      return res.json({ data: [] });
    }

    const studentIds = Array.isArray(students) ? students.map(s => s.id) : [];
    const olevelMarks = [];
    const uaceMarks = [];
    const batchSize = 1000;

    for (let i = 0; i < studentIds.length; i += batchSize) {
      const batchIds = studentIds.slice(i, i + batchSize);
      const [oRows] = await pool.query('SELECT * FROM olevel_marks WHERE student_id IN (?) AND term = ? AND year = ?', [batchIds, term, parseInt(year, 10)]);
      const [uRows] = await pool.query('SELECT * FROM uace_marks WHERE student_id IN (?) AND term = ? AND year = ?', [batchIds, term, parseInt(year, 10)]);
      olevelMarks.push(...oRows);
      uaceMarks.push(...uRows);
    }

    const { getOLevelGrade, getUACEPrincipalGrade, getUACESubGPGrade } = require('./reportGenerator');

    const data = Array.isArray(students) ? students.map(student => {
      const isUACE = student.gradeClass.startsWith('S.5') || student.gradeClass.startsWith('S.6');
      let totalMarks = 0;
      let subjectCount = 0;
      let uacePoints = 0;
      const statuses = [];

      if (isUACE) {
        const marks = uaceMarks.filter(m => m.student_id === student.id);
        const uacePtsObj = calculateUACEPoints(marks);
        uacePoints = uacePtsObj.totalPoints;
        marks.forEach(m => {
          const score = parseFloat(m.score || 0);
          totalMarks += score;
          subjectCount++;
          statuses.push(m.status);
        });
      } else {
        const marks = olevelMarks.filter(m => m.student_id === student.id);
        marks.forEach(m => {
          const aiScores = [];
          if (m.integration1 !== null && m.integration1 !== undefined && m.integration1 !== '' && !isNaN(parseFloat(m.integration1))) {
            aiScores.push(parseFloat(m.integration1));
          }
          if (m.integration2 !== null && m.integration2 !== undefined && m.integration2 !== '' && !isNaN(parseFloat(m.integration2))) {
            aiScores.push(parseFloat(m.integration2));
          }
          if (m.integration3 !== null && m.integration3 !== undefined && m.integration3 !== '' && !isNaN(parseFloat(m.integration3))) {
            aiScores.push(parseFloat(m.integration3));
          }

          let caAverage = 0;
          if (aiScores.length > 0) {
            const sumPct = aiScores.map(score => (score / 3) * 100).reduce((a, b) => a + b, 0);
            caAverage = sumPct / aiScores.length;
          }

          const ca = (caAverage * 20) / 100;
          const exam = parseFloat(m.exam_score || 0);

          totalMarks += ca + exam;
          subjectCount++;
          statuses.push(m.status);
        });
      }

      const average = subjectCount > 0 ? totalMarks / subjectCount : 0;
      const passedAll = true; // All marks are considered active immediately

      return {
        ...student,
        average,
        uacePoints,
        reportStatus: passedAll ? 'Complete' : 'Incomplete'
      };
    }) : [];

    res.json({ data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/students/merge-duplicates', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const { keepStudentId, duplicateStudentIds, newAdminNo } = req.body;
    if (!keepStudentId) {
      return res.status(400).json({ error: 'keepStudentId is required.' });
    }
    if (!Array.isArray(duplicateStudentIds) || duplicateStudentIds.length === 0) {
      return res.status(400).json({ error: 'duplicateStudentIds must be a non-empty array.' });
    }

    const filteredDuplicateIds = duplicateStudentIds.filter((id) => id && id !== keepStudentId);
    if (filteredDuplicateIds.length === 0) {
      return res.status(400).json({ error: 'No valid duplicate student IDs provided.' });
    }

    await connection.beginTransaction();

    const [keepRows] = await connection.query('SELECT * FROM students WHERE id = ?', [keepStudentId]);
    if (keepRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: 'Keep student record not found.' });
    }

    const [duplicateRows] = await connection.query('SELECT * FROM students WHERE id IN (?)', [filteredDuplicateIds]);
    if (duplicateRows.length !== filteredDuplicateIds.length) {
      await connection.rollback();
      return res.status(404).json({ error: 'One or more duplicate student records were not found.' });
    }

    const keepStudent = keepRows[0];
    const mergedFields = {};

    if (newAdminNo && String(newAdminNo).trim()) {
      mergedFields.adminNo = String(newAdminNo).trim();
    } else if (!keepStudent.adminNo) {
      const firstValidAdmin = duplicateRows.find((dup) => dup.adminNo && String(dup.adminNo).trim());
      if (firstValidAdmin) {
        mergedFields.adminNo = String(firstValidAdmin.adminNo).trim();
      }
    }

    for (const duplicateStudent of duplicateRows) {
      if ((!keepStudent.gender || keepStudent.gender === '') && duplicateStudent.gender) {
        mergedFields.gender = duplicateStudent.gender;
      }
      if ((!keepStudent.gradeClass || keepStudent.gradeClass === '') && duplicateStudent.gradeClass) {
        mergedFields.gradeClass = duplicateStudent.gradeClass;
      }
      if ((!keepStudent.boardingStatus || keepStudent.boardingStatus === '') && duplicateStudent.boardingStatus) {
        mergedFields.boardingStatus = duplicateStudent.boardingStatus;
      }
      if ((!keepStudent.photo || keepStudent.photo === '') && duplicateStudent.photo) {
        mergedFields.photo = duplicateStudent.photo;
      }
      if ((!keepStudent.photoOriginal || keepStudent.photoOriginal === '') && duplicateStudent.photoOriginal) {
        mergedFields.photoOriginal = duplicateStudent.photoOriginal;
      }
      if ((!keepStudent.photoEnhanced || keepStudent.photoEnhanced === '') && duplicateStudent.photoEnhanced) {
        mergedFields.photoEnhanced = duplicateStudent.photoEnhanced;
      }
      if ((!keepStudent.remarks || keepStudent.remarks === '') && duplicateStudent.remarks) {
        mergedFields.remarks = duplicateStudent.remarks;
      }
      if ((!keepStudent.parentName || keepStudent.parentName === '') && duplicateStudent.parentName) {
        mergedFields.parentName = duplicateStudent.parentName;
      }
      if ((!keepStudent.parentContact || keepStudent.parentContact === '') && duplicateStudent.parentContact) {
        mergedFields.parentContact = duplicateStudent.parentContact;
      }
      if ((!keepStudent.gateClearanceDate || keepStudent.gateClearanceDate === '') && duplicateStudent.gateClearanceDate) {
        mergedFields.gateClearanceDate = duplicateStudent.gateClearanceDate;
      }
      if ((!keepStudent.mealsClearanceDate || keepStudent.mealsClearanceDate === '') && duplicateStudent.mealsClearanceDate) {
        mergedFields.mealsClearanceDate = duplicateStudent.mealsClearanceDate;
      }
      if ((!keepStudent.printStatus || keepStudent.printStatus === 'Not Printed') && duplicateStudent.printStatus && duplicateStudent.printStatus !== 'Not Printed') {
        mergedFields.printStatus = duplicateStudent.printStatus;
      }
      if ((!keepStudent.isCleared || keepStudent.isCleared === 0) && duplicateStudent.isCleared) {
        mergedFields.isCleared = 1;
      }
    }

    if (Object.keys(mergedFields).length > 0) {
      const updateSet = Object.keys(mergedFields).map((field) => `${field} = ?`).join(', ');
      const params = [...Object.values(mergedFields), keepStudentId];
      await connection.query(`UPDATE students SET ${updateSet} WHERE id = ?`, params);
    }

    const mergeConfigs = [
      { table: 'marks', uniqueKeys: ['subject', 'term', 'year'], preferColumns: ['marks_obtained', 'max_marks'] },
      { table: 'olevel_marks', uniqueKeys: ['subject', 'term', 'year'], preferColumns: ['integration1', 'integration2', 'integration3', 'exam_score', 'status', 'teacher_id'] },
      { table: 'uace_marks', uniqueKeys: ['subject', 'term', 'year'], preferColumns: ['score', 'grade', 'points', 'status', 'teacher_id'] },
      { table: 'fees', uniqueKeys: ['term', 'year'], preferColumns: ['amount_due', 'amount_paid', 'payment_status'] },
      { table: 'attendance', uniqueKeys: ['date'], preferColumns: ['status', 'remarks'] }
    ];

    let mergedCount = 0;
    for (const duplicateStudent of duplicateRows) {
      await mergeStudentAccount(connection, keepStudentId, duplicateStudent.id);
      await mergePrintHistory(connection, keepStudentId, duplicateStudent.id);
      for (const config of mergeConfigs) {
        await mergeTableRows(connection, config.table, config.uniqueKeys, config.preferColumns, keepStudentId, duplicateStudent.id);
      }
      await connection.query('DELETE FROM students WHERE id = ?', [duplicateStudent.id]);
      mergedCount += 1;
    }

    await connection.commit();
    await writeAuditLog('Merge Duplicate Students', `Merged ${mergedCount} duplicate student record(s) into ${keepStudentId}.`);
    res.json({ success: true, mergedCount, keptStudentId: keepStudentId, removedStudentIds: filteredDuplicateIds });
  } catch (err) {
    await connection.rollback();
    console.error('Error merging duplicate students:', err);
    res.status(500).json({ error: err.message });
  } finally {
    connection.release();
  }
});


// POST promote students
app.post('/api/admin/promote', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const { sourceClass, targetClass } = req.body;
    if (!sourceClass || !targetClass) {
      return res.status(400).json({ error: 'Source and target classes are required.' });
    }

    if (sourceClass === 'S.6') {
      await connection.query(
        `UPDATE students 
         SET gradeClass = ?, boardingStatus = 'Graduated', isCleared = 0 
         WHERE gradeClass LIKE 'S.6%'`,
        [targetClass]
      );
    } else {
      const [studentsToPromote] = await connection.query(
        'SELECT id, gradeClass FROM students WHERE gradeClass LIKE ?',
        [`${sourceClass}%`]
      );

      for (const st of studentsToPromote) {
        const parts = st.gradeClass.split(' ');
        const stream = parts.slice(1).join(' ') || '';
        let newGradeClass = '';
        
        if (sourceClass === 'S.4') {
          newGradeClass = stream === 'Sciences' || stream === 'Arts' ? `${targetClass} ${stream}` : `${targetClass} Sciences`;
        } else {
          newGradeClass = stream ? `${targetClass} ${stream}` : targetClass;
        }

        await connection.query('UPDATE students SET gradeClass = ? WHERE id = ?', [newGradeClass, st.id]);
      }
    }

    await connection.commit();
    await writeAuditLog('Promote Students', `Promoted class ${sourceClass} to ${targetClass}`);
    res.json({ success: true });
  } catch (err) {
    await connection.rollback();
    res.status(500).json({ error: err.message });
  } finally {
    connection.release();
  }
});

// POST generate report cards PDF
app.post('/api/pdf/generate-reports', async (req, res) => {
  try {
    const { studentIds, term, year } = req.body;
    if (!studentIds || !Array.isArray(studentIds) || studentIds.length === 0 || !term || !year) {
      return res.status(400).json({ error: 'Missing parameters for report generation' });
    }

    // Check for marks records and throw error if none exist or if any are unapproved
    const [olevelAll] = await pool.query('SELECT status FROM olevel_marks WHERE student_id IN (?) AND term = ? AND year = ?', [studentIds, term, parseInt(year, 10)]);
    const [uaceAll] = await pool.query('SELECT status FROM uace_marks WHERE student_id IN (?) AND term = ? AND year = ?', [studentIds, term, parseInt(year, 10)]);

    if (olevelAll.length === 0 && uaceAll.length === 0) {
      return res.status(400).json({ error: 'No marks records found. Cannot print blank report cards.' });
    }

    // Quality Control validations - Select specific columns to check completeness (avoids loading massive photos)
    const [studentsCheck] = await pool.query(
      'SELECT id, name, adminNo, gradeClass, photo FROM students WHERE id IN (?)',
      [studentIds]
    );
    if (studentsCheck.length === 0) {
      return res.status(404).json({ error: 'No students found matching the provided IDs' });
    }

    // Check school settings for crest/logo
    const [logoRows] = await pool.query('SELECT val_value FROM settings WHERE key_name = ?', ['school_logo']);
    const schoolLogoSetting = logoRows[0]?.val_value;
    if (!schoolLogoSetting) {
      console.warn('Quality Control Warning: School crest/logo is missing or not visible. Proceeding without logo.');
    }

    const incompleteStudents = [];
    for (const student of studentsCheck) {
      const missing = [];
      if (!student.name || !student.name.trim()) missing.push('Name');
      if (!student.adminNo || !student.adminNo.trim()) missing.push('Admin Number');
      if (!student.gradeClass || !student.gradeClass.trim()) missing.push('Class');
      if (!student.photo || !student.photo.trim()) missing.push('Passport Photo');

      if (missing.length > 0) {
        incompleteStudents.push(`${student.name || 'Unnamed Student'} (ID: ${student.adminNo || student.id}) - Missing: ${missing.join(', ')}`);
      }
    }

    if (incompleteStudents.length > 0) {
      console.warn(`Quality Control Warning: Incomplete student profiles found:\n\n${incompleteStudents.join('\n')}`);
    }

    const taskId = `task-report-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    pdfTasks[taskId] = {
      id: taskId,
      status: 'processing',
      progress: 0,
      total: studentIds.length,
      filename: null,
      filePath: null,
      error: null
    };

    // Spawn background task
    (async () => {
      try {
        // Load student records from DB (specifically select required fields only, avoids photoOriginal/photoEnhanced)
        const [students] = await pool.query(
          `SELECT id, name, adminNo, gender, gradeClass, boardingStatus, isCleared, photo, printStatus, uace_combination, parentName, parentContact, updatedAt 
           FROM students WHERE id IN (?)`,
          [studentIds]
        );
        if (students.length === 0) throw new Error('No students found');

        // Sort students by class/stream and then alphabetically by name before printing
        students.sort((a, b) => {
          const classA = a.gradeClass || '';
          const classB = b.gradeClass || '';
          if (classA !== classB) {
            return classA.localeCompare(classB);
          }
          return a.name.localeCompare(b.name);
        });

        const [olevelMarks] = await pool.query('SELECT * FROM olevel_marks WHERE student_id IN (?) AND term = ? AND year = ?', [studentIds, term, parseInt(year, 10)]);
        const [uaceMarks] = await pool.query('SELECT * FROM uace_marks WHERE student_id IN (?) AND term = ? AND year = ?', [studentIds, term, parseInt(year, 10)]);

        const [settingsRows] = await pool.query('SELECT key_name, val_value FROM settings');
        const settings = {};
        settingsRows.forEach(r => {
          settings[r.key_name] = r.val_value;
        });

        // Fetch class teachers mapping
        const [classTeachersRows] = await pool.query(`
          SELECT ct.grade_class, t.name as teacher_name, t.signature
          FROM class_teachers ct 
          JOIN teachers t ON ct.teacher_id = t.id
        `);
        
        // Map grade_class -> teacher info object
        const classTeachersMap = {};
        classTeachersRows.forEach(row => {
          classTeachersMap[row.grade_class] = {
            name: row.teacher_name,
            signature: row.signature
          };
        });

        // Fetch all teachers mapping for subject teacher initials
        const [teachersRows] = await pool.query('SELECT id, name FROM teachers');
        const teachersMap = {};
        teachersRows.forEach(t => {
          teachersMap[t.id] = t.name;
        });

        // Fetch Director of Studies and Head Teacher info dynamically
        const [dosRows] = await pool.query("SELECT name, signature FROM teachers WHERE position = 'Director of Studies' OR position = 'DOS' LIMIT 1");
        const dosTeacher = dosRows[0] || null;

        const [htRows] = await pool.query("SELECT name, signature FROM teachers WHERE position = 'Head Teacher' OR position = 'Headteacher' LIMIT 1");
        const htTeacher = htRows[0] || null;

        // Pre-resolve student photos in parallel (batches of 30)
        const batchSize = 30;
        for (let i = 0; i < students.length; i += batchSize) {
          const batch = students.slice(i, i + batchSize);
          await Promise.all(batch.map(async (student) => {
            if (student.photo && student.photo.startsWith('http')) {
              student.photo = await getBase64ImageFromUrl(student.photo) || student.photo;
            }
          }));
        }

        settings.school_logo = await getLogoAsBase64(settings.school_logo);

        if (settings.school_stamp && settings.school_stamp.startsWith('http')) {
          settings.school_stamp = await getBase64ImageFromUrl(settings.school_stamp) || settings.school_stamp;
        }

        // Pre-resolve all teacher signatures in parallel
        await Promise.all([
          ...Object.keys(classTeachersMap).map(async (gradeClass) => {
            const ct = classTeachersMap[gradeClass];
            if (ct && ct.signature && ct.signature.startsWith('http')) {
              ct.signature = await getBase64ImageFromUrl(ct.signature) || ct.signature;
            }
          }),
          (async () => {
            if (dosTeacher && dosTeacher.signature && dosTeacher.signature.startsWith('http')) {
              dosTeacher.signature = await getBase64ImageFromUrl(dosTeacher.signature) || dosTeacher.signature;
            }
          })(),
          (async () => {
            if (htTeacher && htTeacher.signature && htTeacher.signature.startsWith('http')) {
              htTeacher.signature = await getBase64ImageFromUrl(htTeacher.signature) || htTeacher.signature;
            }
          })()
        ]);

        const { compileReportsPdf, getOLevelGrade, getUACEPrincipalGrade, getUACESubGPGrade } = require('./reportGenerator');
        
        // Generate/retrieve verification tokens and snapshots for all students
        const crypto = require('crypto');
        const studentTokensMap = {};

        // Calculate student stats first to save in the verification snapshot
        const studentStats = [];
        students.forEach(student => {
          const isUACE = student.gradeClass.startsWith('S.5') || student.gradeClass.startsWith('S.6');
          let totalMarks = 0;
          let subjectCount = 0;
          let uacePoints = 0;

          if (isUACE) {
            const marks = uaceMarks.filter(m => m.student_id === student.id);
            const uacePtsObj = calculateUACEPoints(marks);
            uacePoints = uacePtsObj.totalPoints;
            marks.forEach(m => {
              const score = parseFloat(m.score || 0);
              totalMarks += score;
              subjectCount++;
            });
          } else {
            const marks = olevelMarks.filter(m => m.student_id === student.id);
            marks.forEach(m => {
              const aiScores = [];
              if (m.integration1 !== null && m.integration1 !== undefined && m.integration1 !== '' && !isNaN(parseFloat(m.integration1))) {
                aiScores.push(parseFloat(m.integration1));
              }
              if (m.integration2 !== null && m.integration2 !== undefined && m.integration2 !== '' && !isNaN(parseFloat(m.integration2))) {
                aiScores.push(parseFloat(m.integration2));
              }
              if (m.integration3 !== null && m.integration3 !== undefined && m.integration3 !== '' && !isNaN(parseFloat(m.integration3))) {
                aiScores.push(parseFloat(m.integration3));
              }

              let caAverage = 0;
              if (aiScores.length > 0) {
                const sumPct = aiScores.map(score => (score / 3) * 100).reduce((a, b) => a + b, 0);
                caAverage = sumPct / aiScores.length;
              }

              const ca = (caAverage * 20) / 100;
              const exam = parseFloat(m.exam_score || 0);
              const examW = (exam * 80) / 100;
              const finalMark = ca + examW;
              totalMarks += finalMark;
              subjectCount++;
            });
          }

          const average = subjectCount > 0 ? (totalMarks / subjectCount) : 0;

          studentStats.push({
            studentId: student.id,
            gradeClass: student.gradeClass,
            isUACE,
            totalMarks,
            average,
            uacePoints,
            subjectCount
          });
        });

        // Group by class to calculate positions
        const classesMap = {};
        studentStats.forEach(stat => {
          if (!classesMap[stat.gradeClass]) {
            classesMap[stat.gradeClass] = [];
          }
          classesMap[stat.gradeClass].push(stat);
        });

        Object.keys(classesMap).forEach(clsName => {
          const clsList = classesMap[clsName];
          const isUACE = clsName.startsWith('S.5') || clsName.startsWith('S.6');
          if (isUACE) {
            clsList.sort((a, b) => b.uacePoints - a.uacePoints || b.average - a.average);
          } else {
            clsList.sort((a, b) => b.average - a.average);
          }
          clsList.forEach((stat, idx) => {
            stat.position = idx + 1;
            stat.classTotal = clsList.length;
          });
        });

        for (const student of students) {
          const isUACE = student.gradeClass.startsWith('S.5') || student.gradeClass.startsWith('S.6');
          const sStats = studentStats.find(st => st.studentId === student.id);

          // Verification token generation removed
          studentTokensMap[student.id] = null;

          // Compute UCE Result Status
          let uceResultStatus = '';
          if (!isUACE) {
            const sMarks = olevelMarks.filter(m => m.student_id === student.id);
            const olevelGrades = sMarks.map(m => {
              const aiScores = [];
              if (m.integration1 !== null && m.integration1 !== undefined && m.integration1 !== '' && !isNaN(parseFloat(m.integration1))) aiScores.push(parseFloat(m.integration1));
              if (m.integration2 !== null && m.integration2 !== undefined && m.integration2 !== '' && !isNaN(parseFloat(m.integration2))) aiScores.push(parseFloat(m.integration2));
              if (m.integration3 !== null && m.integration3 !== undefined && m.integration3 !== '' && !isNaN(parseFloat(m.integration3))) aiScores.push(parseFloat(m.integration3));

              let caAverage = 0;
              if (aiScores.length > 0) {
                const sumPct = aiScores.map(score => (score / 3) * 100).reduce((a, b) => a + b, 0);
                caAverage = sumPct / aiScores.length;
              }
              const caContribution = (caAverage * 20) / 100;
              const examScore = parseFloat(m.exam_score || 0);
              const examContribution = (examScore * 80) / 100;
              const finalMark = caContribution + examContribution;
              return getOLevelGrade(finalMark).grade;
            });

            const COMPULSORY_SUBJECTS = [
              "English Language",
              "Mathematics",
              "Biology",
              "Chemistry",
              "Physics",
              "History and Political Education",
              "Geography"
            ];

            const satSubjects = sMarks.map(m => (m.subject || '').trim().toLowerCase());
            const missingCompulsory = COMPULSORY_SUBJECTS.filter(subj => !satSubjects.includes(subj.toLowerCase()));
            const satCompulsory = missingCompulsory.length === 0;
            const satCount = sMarks.length;
            const meetsSubjectRange = satCount >= 8 && satCount <= 9;
            const hasDOrHigher = olevelGrades.some(g => ['A', 'B', 'C', 'D'].includes(g));

            if (satCount > 0) {
              if (!satCompulsory) {
                uceResultStatus = 'Result 2 (Missed compulsory subjects)';
              } else if (!meetsSubjectRange) {
                uceResultStatus = `Result 2 (Sat for ${satCount} subjects, expected 8 or 9)`;
              } else if (!hasDOrHigher) {
                uceResultStatus = 'Result 2 (Scores exclusively at E level)';
              } else {
                uceResultStatus = 'Result 1 (Passed / Achieved Certification)';
              }
            } else {
              uceResultStatus = 'Result 2 (No marks/No subjects sat)';
            }
          }

          // Build subject list
          const subjectsList = [];
          if (isUACE) {
            const sMarks = uaceMarks.filter(m => m.student_id === student.id);
            sMarks.forEach(m => {
              const score = parseFloat(m.score || 0);
              const isGP = m.subject_type === 'General Paper';
              const isSub = m.subject_type === 'Subsidiary';
              const grInfo = (isGP || isSub) ? getUACESubGPGrade(score) : getUACEPrincipalGrade(score);
              let initials = 'N/A';
              try {
                const teacherName = teachersMap[m.teacher_id];
                initials = teacherName ? getInitials(teacherName) : 'N/A';
              } catch (e) {
                console.error("Failed to compute initials:", e);
              }

              subjectsList.push({
                subject: m.subject,
                type: m.subject_type,
                score: score,
                grade: grInfo.grade,
                points: grInfo.points,
                initials: initials
              });
            });
          } else {
            const sMarks = olevelMarks.filter(m => m.student_id === student.id);
            sMarks.forEach(m => {
              const aiScores = [];
              if (m.integration1 !== null && m.integration1 !== undefined && m.integration1 !== '' && !isNaN(parseFloat(m.integration1))) aiScores.push(parseFloat(m.integration1));
              if (m.integration2 !== null && m.integration2 !== undefined && m.integration2 !== '' && !isNaN(parseFloat(m.integration2))) aiScores.push(parseFloat(m.integration2));
              if (m.integration3 !== null && m.integration3 !== undefined && m.integration3 !== '' && !isNaN(parseFloat(m.integration3))) aiScores.push(parseFloat(m.integration3));

              let caAverage = 0;
              if (aiScores.length > 0) {
                const sumPct = aiScores.map(score => (score / 3) * 100).reduce((a, b) => a + b, 0);
                caAverage = sumPct / aiScores.length;
              }
              const caContribution = (caAverage * 20) / 100;
              const examScore = parseFloat(m.exam_score || 0);
              const examContribution = (examScore * 80) / 100;
              const finalMark = caContribution + examContribution;
              const gr = getOLevelGrade(finalMark);
              let initials = 'N/A';
              try {
                const teacherName = teachersMap[m.teacher_id];
                initials = teacherName ? getInitials(teacherName) : 'N/A';
              } catch (e) {
                console.error("Failed to compute initials:", e);
              }

              subjectsList.push({
                subject: m.subject,
                ai1: (m.integration1 !== null && m.integration1 !== undefined && m.integration1 !== '' && !isNaN(parseFloat(m.integration1))) ? parseFloat(m.integration1) : null,
                ai2: (m.integration2 !== null && m.integration2 !== undefined && m.integration2 !== '' && !isNaN(parseFloat(m.integration2))) ? parseFloat(m.integration2) : null,
                ai3: (m.integration3 !== null && m.integration3 !== undefined && m.integration3 !== '' && !isNaN(parseFloat(m.integration3))) ? parseFloat(m.integration3) : null,
                caAverage: caAverage,
                caContribution: caContribution,
                examScore: examScore,
                examContribution: examContribution,
                finalMark: finalMark,
                grade: gr.grade,
                label: gr.label,
                initials: initials
              });
            });
          }

          // Database verification snapshot storage removed
        }

        const doc = await compileReportsPdf({
          students,
          olevelMarks,
          uaceMarks,
          term,
          year,
          settings,
          classTeachers: classTeachersMap,
          teachersMap,
          verificationTokens: studentTokensMap,
          dosTeacher,
          htTeacher,
          onProgress: (current, total) => {
            if (pdfTasks[taskId]) {
              pdfTasks[taskId].progress = current;
              pdfTasks[taskId].total = total;
            }
          }
        });

        const pdfBuffer = Buffer.from(doc.output('arraybuffer'));

        const fs = require('fs');
        const path = require('path');
        const exportDir = getExportsDir();
        if (!fs.existsSync(exportDir)) {
          fs.mkdirSync(exportDir, { recursive: true });
        }

        const filename = `report-cards-${term}-${year}-${Date.now()}.pdf`;
        const filePath = path.join(exportDir, filename);
        fs.writeFileSync(filePath, pdfBuffer);

        await writeAuditLog('Generate Reports', `Generated academic reports for ${students.length} students. Saved as ${filename}`);

        if (pdfTasks[taskId]) {
          pdfTasks[taskId].status = 'completed';
          pdfTasks[taskId].filename = filename;
          pdfTasks[taskId].filePath = filePath;
        }
      } catch (bgErr) {
        console.error('Background report cards compilation error:', bgErr);
        if (pdfTasks[taskId]) {
          pdfTasks[taskId].status = 'failed';
          pdfTasks[taskId].error = bgErr.message;
        }
      }
    })();

    res.json({
      success: true,
      taskId
    });
  } catch (err) {
    console.error('Failed to generate reports:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET single student report data
app.get('/api/reports/:studentId', async (req, res) => {
  try {
    const { studentId } = req.params;
    const [studentRows] = await pool.query('SELECT * FROM students WHERE id = ?', [studentId]);
    if (studentRows.length === 0) return res.status(404).json({ error: 'Student not found' });
    const student = studentRows[0];

    const isUACE = student.gradeClass.startsWith('S.5') || student.gradeClass.startsWith('S.6');
    let marks = [];
    if (isUACE) {
      const [rows] = await pool.query('SELECT * FROM uace_marks WHERE student_id = ? ORDER BY subject', [studentId]);
      marks = rows;
    } else {
      const [rows] = await pool.query('SELECT * FROM olevel_marks WHERE student_id = ? ORDER BY subject', [studentId]);
      marks = rows;
    }

    res.json({
      student,
      isUACE,
      marks
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});



// GET all teachers
app.get('/api/teachers', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT id, username, name, gender, subjects, classes, position, photo, status, createdAt, (signature IS NOT NULL AND LENGTH(signature) > 0) as hasSignature FROM teachers ORDER BY name');
    
    // Fetch all assignments and class teachers
    const [assignmentsRows] = await pool.query('SELECT teacher_id, subject, grade_class FROM teacher_assignments');
    const [classTeacherRows] = await pool.query('SELECT grade_class, teacher_id FROM class_teachers');

    const list = rows.map(r => {
      const assignments = assignmentsRows
        .filter(a => a.teacher_id === r.id)
        .map(a => ({ subject: a.subject, grade_class: a.grade_class }));
        
      const classTeacherFor = classTeacherRows
        .filter(ct => ct.teacher_id === r.id)
        .map(ct => ct.grade_class);

      return {
        ...r,
        subjects: typeof r.subjects === 'string' ? JSON.parse(r.subjects) : r.subjects,
        classes: typeof r.classes === 'string' ? JSON.parse(r.classes) : r.classes,
        hasSignature: !!r.hasSignature,
        assignments,
        classTeacherFor
      };
    });
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET teacher signature lazily
app.get('/api/teachers/:id/signature', async (req, res) => {
  try {
    await ensureDbInitialized();
    const [rows] = await pool.query('SELECT signature FROM teachers WHERE id = ?', [req.params.id]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Teacher not found' });
    }
    res.json({ signature: rows[0].signature });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST create teacher
app.post('/api/teachers', async (req, res) => {
  const tStart = Date.now();
  console.log(`[SAVE_TEACHER][POST] Started request at ${tStart}`);
  let connection;
  try {
    connection = await pool.getConnection();
    console.log(`[SAVE_TEACHER][POST] Connection acquired in ${Date.now() - tStart} ms`);
    
    let { username, password, name, gender, subjects, classes, assignments, position, signature, photo, status } = req.body;
    if (!username || !password || !name) {
      console.log(`[SAVE_TEACHER][POST] Validation failed: missing username, password, or name`);
      return res.status(400).json({ error: 'Username, password, and name are required' });
    }

    const tExistStart = Date.now();
    const [existing] = await connection.query('SELECT id FROM teachers WHERE username = ?', [username]);
    console.log(`[SAVE_TEACHER][POST] Checked existing username in ${Date.now() - tExistStart} ms`);
    if (existing.length > 0) {
      console.log(`[SAVE_TEACHER][POST] Username is already taken: ${username}`);
      return res.status(400).json({ error: 'Username is already taken' });
    }

    const id = 'T-' + Date.now();
    
    // Parallel Cloudinary Uploads for Photo and Signature
    const tUploadStart = Date.now();
    try {
      console.log(`[SAVE_TEACHER][POST] Base64 Photo length: ${photo ? photo.length : 0}, Signature length: ${signature ? signature.length : 0}`);
      const [uploadedPhoto, uploadedSignature] = await Promise.all([
        uploadToCloudinaryIfNeeded(photo, `teacher_${id}_photo`),
        uploadToCloudinaryIfNeeded(signature, `teacher_${id}_signature`)
      ]);
      photo = uploadedPhoto;
      signature = uploadedSignature;
      console.log(`[SAVE_TEACHER][POST] Image uploads finished in ${Date.now() - tUploadStart} ms`);
    } catch (e) {
      console.error(`[SAVE_TEACHER][POST] Image uploads failed in ${Date.now() - tUploadStart} ms:`, e.message);
    }

    const tTxStart = Date.now();
    await connection.beginTransaction();
    console.log(`[SAVE_TEACHER][POST] Transaction started in ${Date.now() - tTxStart} ms`);
    
    const crypto = require('crypto');
    const hash = crypto.createHash('sha256').update(password).digest('hex');

    const finalSubjects = assignments && Array.isArray(assignments) 
      ? Array.from(new Set(assignments.map(a => a.subject))) 
      : (subjects || []);
    const finalClasses = assignments && Array.isArray(assignments) 
      ? Array.from(new Set(assignments.map(a => a.grade_class))) 
      : (classes || []);

    const tInsertStart = Date.now();
    await connection.query(
      'INSERT INTO teachers (id, username, password_hash, name, gender, subjects, classes, position, signature, photo, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [id, username, hash, name, gender || null, JSON.stringify(finalSubjects), JSON.stringify(finalClasses), position || 'Teacher', signature || null, photo || null, status || 'Active']
    );
    console.log(`[SAVE_TEACHER][POST] Inserted teacher record in ${Date.now() - tInsertStart} ms`);

    const actualAssignments = assignments && Array.isArray(assignments)
      ? assignments
      : [];
      
    if (!assignments || !Array.isArray(assignments)) {
      if (Array.isArray(finalSubjects) && Array.isArray(finalClasses)) {
        for (const s of finalSubjects) {
          for (const c of finalClasses) {
            actualAssignments.push({ subject: s, grade_class: c });
          }
        }
      }
    }

    const tAssignStart = Date.now();
    for (const a of actualAssignments) {
      await connection.query(
        'INSERT INTO teacher_assignments (teacher_id, subject, grade_class) VALUES (?, ?, ?)',
        [id, a.subject, a.grade_class]
      );
    }
    console.log(`[SAVE_TEACHER][POST] Inserted assignments in ${Date.now() - tAssignStart} ms`);

    const tCommitStart = Date.now();
    await connection.commit();
    console.log(`[SAVE_TEACHER][POST] Committed transaction in ${Date.now() - tCommitStart} ms`);
    console.log(`[SAVE_TEACHER][POST] Request completed successfully in ${Date.now() - tStart} ms`);
    res.json({ success: true, id });
  } catch (err) {
    console.error(`[SAVE_TEACHER][POST] Error occurred:`, err.message);
    if (connection) {
      await connection.rollback().catch(() => {});
    }
    res.status(500).json({ error: err.message });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});

// PUT update teacher
app.put('/api/teachers/:id', async (req, res) => {
  const tStart = Date.now();
  console.log(`[SAVE_TEACHER][PUT] Started request for ID: ${req.params.id} at ${tStart}`);
  let connection;
  try {
    connection = await pool.getConnection();
    console.log(`[SAVE_TEACHER][PUT] Connection acquired in ${Date.now() - tStart} ms`);
    
    let { username, password, name, gender, subjects, classes, assignments, position, signature, photo, status } = req.body;
    const { id } = req.params;

    const tExistStart = Date.now();
    const [existing] = await connection.query('SELECT id FROM teachers WHERE username = ? AND id != ?', [username, id]);
    console.log(`[SAVE_TEACHER][PUT] Checked existing username in ${Date.now() - tExistStart} ms`);
    if (existing.length > 0) {
      console.log(`[SAVE_TEACHER][PUT] Username is already taken: ${username}`);
      return res.status(400).json({ error: 'Username is already taken' });
    }

    // Parallel Cloudinary Uploads for Photo and Signature
    const tUploadStart = Date.now();
    try {
      console.log(`[SAVE_TEACHER][PUT] Base64 Photo length: ${photo ? photo.length : 0}, Signature length: ${signature ? signature.length : 0}`);
      const [uploadedPhoto, uploadedSignature] = await Promise.all([
        uploadToCloudinaryIfNeeded(photo, `teacher_${id}_photo`),
        uploadToCloudinaryIfNeeded(signature, `teacher_${id}_signature`)
      ]);
      photo = uploadedPhoto;
      signature = uploadedSignature;
      console.log(`[SAVE_TEACHER][PUT] Image uploads finished in ${Date.now() - tUploadStart} ms`);
    } catch (e) {
      console.error(`[SAVE_TEACHER][PUT] Image uploads failed in ${Date.now() - tUploadStart} ms:`, e.message);
    }

    const tTxStart = Date.now();
    await connection.beginTransaction();
    console.log(`[SAVE_TEACHER][PUT] Transaction started in ${Date.now() - tTxStart} ms`);

    const finalSubjects = assignments && Array.isArray(assignments) 
      ? Array.from(new Set(assignments.map(a => a.subject))) 
      : (subjects || []);
    const finalClasses = assignments && Array.isArray(assignments) 
      ? Array.from(new Set(assignments.map(a => a.grade_class))) 
      : (classes || []);

    const tUpdateStart = Date.now();
    if (password) {
      const crypto = require('crypto');
      const hash = crypto.createHash('sha256').update(password).digest('hex');
      await connection.query(
        'UPDATE teachers SET username = ?, password_hash = ?, name = ?, gender = ?, subjects = ?, classes = ?, position = ?, signature = ?, photo = ?, status = ? WHERE id = ?',
        [username, hash, name, gender || null, JSON.stringify(finalSubjects), JSON.stringify(finalClasses), position || 'Teacher', signature || null, photo || null, status || 'Active', id]
      );
    } else {
      await connection.query(
        'UPDATE teachers SET username = ?, name = ?, gender = ?, subjects = ?, classes = ?, position = ?, signature = ?, photo = ?, status = ? WHERE id = ?',
        [username, name, gender || null, JSON.stringify(finalSubjects), JSON.stringify(finalClasses), position || 'Teacher', signature || null, photo || null, status || 'Active', id]
      );
    }
    console.log(`[SAVE_TEACHER][PUT] Updated teacher record in ${Date.now() - tUpdateStart} ms`);

    const actualAssignments = assignments && Array.isArray(assignments)
      ? assignments
      : [];
      
    if (!assignments || !Array.isArray(assignments)) {
      if (Array.isArray(finalSubjects) && Array.isArray(finalClasses)) {
        for (const s of finalSubjects) {
          for (const c of finalClasses) {
            actualAssignments.push({ subject: s, grade_class: c });
          }
        }
      }
    }

    const tAssignStart = Date.now();
    await connection.query('DELETE FROM teacher_assignments WHERE teacher_id = ?', [id]);
    for (const a of actualAssignments) {
      await connection.query(
        'INSERT INTO teacher_assignments (teacher_id, subject, grade_class) VALUES (?, ?, ?)',
        [id, a.subject, a.grade_class]
      );
    }
    console.log(`[SAVE_TEACHER][PUT] Updated assignments in ${Date.now() - tAssignStart} ms`);

    const tCommitStart = Date.now();
    await connection.commit();
    console.log(`[SAVE_TEACHER][PUT] Committed transaction in ${Date.now() - tCommitStart} ms`);
    console.log(`[SAVE_TEACHER][PUT] Request completed successfully in ${Date.now() - tStart} ms`);
    res.json({ success: true });
  } catch (err) {
    console.error(`[SAVE_TEACHER][PUT] Error occurred:`, err.message);
    if (connection) {
      await connection.rollback().catch(() => {});
    }
    res.status(500).json({ error: err.message });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});

// POST import teachers (Bulk upload Excel/CSV)
app.post('/api/teachers/import', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const { teachers } = req.body;
    if (!Array.isArray(teachers)) {
      return res.status(400).json({ error: 'Invalid payload: teachers must be an array' });
    }

    await connection.beginTransaction();

    const success = [];
    const skipped = [];
    const errors = [];

    const [existingTeachers] = await connection.query('SELECT id, username FROM teachers');
    const existingIds = new Set(existingTeachers.map(t => t.id.toLowerCase()));
    const existingUsernames = new Set(existingTeachers.map(t => t.username.toLowerCase()));

    const seenIdsInImport = new Set();
    const seenUsernamesInImport = new Set();

    const crypto = require('crypto');

    for (let i = 0; i < teachers.length; i++) {
      const t = teachers[i];
      const rowNum = t.rowNumber || (i + 2);
      const id = String(t.id || '').trim();
      const name = String(t.name || '').trim();
      const gender = String(t.gender || '').trim();
      const username = String(t.username || '').trim();
      const password = String(t.password || '').trim();
      const rawSubjects = String(t.subjects || '').trim();
      const classTeacher = String(t.classTeacher || '').trim();

      // Required validations
      if (!id) {
        errors.push({ rowNum, name, error: 'Teacher Number (Employee ID) is required' });
        continue;
      }
      if (!name) {
        errors.push({ rowNum, name: `ID: ${id}`, error: 'Full Name is required' });
        continue;
      }
      if (!gender) {
        errors.push({ rowNum, name, error: 'Gender is required' });
        continue;
      }
      if (!username) {
        errors.push({ rowNum, name, error: 'Username is required' });
        continue;
      }
      if (!password) {
        errors.push({ rowNum, name, error: 'Password is required' });
        continue;
      }
      if (!rawSubjects) {
        errors.push({ rowNum, name, error: 'Subject(s) Taught is required' });
        continue;
      }

      const idLower = id.toLowerCase();
      const usernameLower = username.toLowerCase();

      // Check duplicate in import file
      if (seenIdsInImport.has(idLower)) {
        skipped.push({ id, username, name, reason: 'Duplicate Teacher Number in import file' });
        continue;
      }
      if (seenUsernamesInImport.has(usernameLower)) {
        skipped.push({ id, username, name, reason: 'Duplicate Username in import file' });
        continue;
      }

      // Check duplicate in database
      if (existingIds.has(idLower)) {
        skipped.push({ id, username, name, reason: 'Teacher Number already exists' });
        continue;
      }
      if (existingUsernames.has(usernameLower)) {
        skipped.push({ id, username, name, reason: 'Username already exists' });
        continue;
      }

      seenIdsInImport.add(idLower);
      seenUsernamesInImport.add(usernameLower);

      try {
        const hash = crypto.createHash('sha256').update(password).digest('hex');
        
        // Parse subjects
        const subjectsArr = rawSubjects.split(',').map(s => s.trim()).filter(Boolean);
        const classesArr = classTeacher ? [classTeacher] : [];

        // Insert teacher
        await connection.query(
          'INSERT INTO teachers (id, username, password_hash, name, gender, subjects, classes, position, signature, photo, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [id, username, hash, name, gender, JSON.stringify(subjectsArr), JSON.stringify(classesArr), 'Teacher', null, null, 'Active']
        );

        // Assign Class Teacher if provided
        if (classTeacher) {
          await connection.query(
            'INSERT INTO class_teachers (grade_class, teacher_id) VALUES (?, ?) ON DUPLICATE KEY UPDATE teacher_id = ?',
            [classTeacher, id, id]
          );

          // Auto-assign subjects to that class
          for (const s of subjectsArr) {
            await connection.query(
              'INSERT INTO teacher_assignments (teacher_id, subject, grade_class) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE teacher_id = teacher_id',
              [id, s, classTeacher]
            );
          }
        }

        success.push({ id, username, name });
      } catch (err) {
        errors.push({ rowNum, name, error: 'Database error: ' + err.message });
      }
    }

    await connection.commit();
    res.json({ success: true, report: { success, skipped, errors } });
  } catch (err) {
    await connection.rollback();
    res.status(500).json({ error: err.message });
  } finally {
    connection.release();
  }
});

// GET all class teacher assignments
app.get('/api/class-teachers', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT ct.grade_class, ct.teacher_id, t.name as teacher_name 
      FROM class_teachers ct 
      JOIN teachers t ON ct.teacher_id = t.id
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST assign/update class teacher
app.post('/api/class-teachers', async (req, res) => {
  try {
    const { gradeClass, teacherId } = req.body;
    if (!gradeClass) {
      return res.status(400).json({ error: 'Class stream (gradeClass) is required' });
    }
    
    if (!teacherId) {
      await pool.query('DELETE FROM class_teachers WHERE grade_class = ?', [gradeClass]);
    } else {
      await pool.query(
        'INSERT INTO class_teachers (grade_class, teacher_id) VALUES (?, ?) ON DUPLICATE KEY UPDATE teacher_id = ?',
        [gradeClass, teacherId, teacherId]
      );
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE teacher
app.delete('/api/teachers/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM teachers WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST change student password
app.post('/api/student/change-password', async (req, res) => {
  try {
    const { studentId, currentPassword, newPassword } = req.body;
    if (!studentId || !currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Student ID, current password, and new password are required.' });
    }

    const [rows] = await pool.query('SELECT * FROM student_accounts WHERE student_id = ?', [studentId]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Student account not found.' });
    }

    const studentAcc = rows[0];
    const crypto = require('crypto');
    const currentHash = crypto.createHash('sha256').update(currentPassword).digest('hex');
    if (currentHash !== studentAcc.password_hash) {
      return res.status(400).json({ error: 'Current password does not match.' });
    }

    const newHash = crypto.createHash('sha256').update(newPassword).digest('hex');
    await pool.query(
      'UPDATE student_accounts SET password_hash = ?, needs_password_change = 0 WHERE student_id = ?',
      [newHash, studentId]
    );

    const [stRows] = await pool.query('SELECT name, adminNo FROM students WHERE id = ?', [studentId]);
    const studentName = stRows.length > 0 ? stRows[0].name : studentId;
    const adminNo = stRows.length > 0 ? stRows[0].adminNo : '';
    await writeAuditLog('Password Change', `Student changed password for "${studentName}" (${adminNo})`);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET all student accounts for admin list view
app.get('/api/admin/student-accounts', async (req, res) => {
  try {
    const { search, gradeClass, stream, status, needsPasswordChange } = req.query;

    let sql = `
      SELECT sa.student_id, sa.status, sa.lastLogin, sa.needs_password_change, sa.createdAt,
             s.name, s.adminNo, s.gradeClass, s.parentName, s.parentContact
      FROM student_accounts sa
      RIGHT JOIN students s ON sa.student_id = s.id
      WHERE 1=1
    `;
    const params = [];

    if (search) {
      sql += ' AND (s.name LIKE ? OR s.adminNo LIKE ? OR s.parentName LIKE ? OR s.parentContact LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (gradeClass && gradeClass !== 'All') {
      sql += ' AND s.gradeClass LIKE ?';
      params.push(`${gradeClass}%`);
    }
    if (stream && stream !== 'All') {
      sql += ' AND s.gradeClass LIKE ?';
      params.push(`% ${stream}`);
    }
    if (status && status !== 'All') {
      if (status === 'Not Created') {
        sql += ' AND sa.student_id IS NULL';
      } else {
        sql += ' AND sa.status = ?';
        params.push(status);
      }
    }
    if (needsPasswordChange && needsPasswordChange !== 'All') {
      sql += ' AND sa.needs_password_change = ?';
      params.push(needsPasswordChange === 'Yes' ? 1 : 0);
    }

    sql += ' ORDER BY s.name ASC';

    const [rows] = await pool.query(sql, params);
    
    const formatted = rows.map(r => ({
      studentId: r.student_id || null,
      id: r.student_id,
      name: r.name,
      adminNo: r.adminNo,
      gradeClass: r.gradeClass,
      parentName: r.parentName || 'N/A',
      parentContact: r.parentContact || 'N/A',
      status: r.student_id ? (r.status || 'Active') : 'Not Created',
      lastLogin: r.lastLogin || null,
      needsPasswordChange: r.student_id ? (!!r.needs_password_change) : null,
      createdAt: r.createdAt || null
    }));

    res.json({ data: formatted });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST reset student password
app.post('/api/admin/student-accounts/reset-password', async (req, res) => {
  try {
    const { studentId, approvedBy } = req.body;
    if (!studentId) {
      return res.status(400).json({ error: 'Student ID is required.' });
    }

    const crypto = require('crypto');
    const defaultHash = crypto.createHash('sha256').update('123').digest('hex');

    await pool.query(
      'UPDATE student_accounts SET password_hash = ?, needs_password_change = 1 WHERE student_id = ?',
      [defaultHash, studentId]
    );

    const [stRows] = await pool.query('SELECT name, adminNo FROM students WHERE id = ?', [studentId]);
    const studentName = stRows.length > 0 ? stRows[0].name : studentId;
    const adminNo = stRows.length > 0 ? stRows[0].adminNo : '';
    
    const adminName = approvedBy || 'Administrator';
    await writeAuditLog('Password Reset', `Admin ${adminName} reset password for student "${studentName}" (${adminNo})`);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST bulk reset student passwords
app.post('/api/admin/student-accounts/bulk-reset', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const { studentIds, approvedBy } = req.body;
    if (!studentIds || !Array.isArray(studentIds) || studentIds.length === 0) {
      return res.status(400).json({ error: 'Student IDs array is required.' });
    }

    const crypto = require('crypto');
    const defaultHash = crypto.createHash('sha256').update('123').digest('hex');

    await connection.query(
      'UPDATE student_accounts SET password_hash = ?, needs_password_change = 1 WHERE student_id IN (?)',
      [defaultHash, studentIds]
    );

    await connection.commit();

    const adminName = approvedBy || 'Administrator';
    await writeAuditLog('Password Reset (Bulk)', `Admin ${adminName} bulk reset password for ${studentIds.length} student(s)`);

    res.json({ success: true });
  } catch (err) {
    await connection.rollback();
    res.status(500).json({ error: err.message });
  } finally {
    connection.release();
  }
});

// POST bulk update student status
app.post('/api/admin/student-accounts/bulk-status', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const { studentIds, status, approvedBy } = req.body;
    if (!studentIds || !Array.isArray(studentIds) || studentIds.length === 0 || !status) {
      return res.status(400).json({ error: 'Student IDs and status are required.' });
    }

    await connection.query(
      'UPDATE student_accounts SET status = ? WHERE student_id IN (?)',
      [status, studentIds]
    );

    await connection.commit();

    const adminName = approvedBy || 'Administrator';
    await writeAuditLog('Account Status Change (Bulk)', `Admin ${adminName} bulk set status to ${status} for ${studentIds.length} student(s)`);

    res.json({ success: true });
  } catch (err) {
    await connection.rollback();
    res.status(500).json({ error: err.message });
  } finally {
    connection.release();
  }
});

// POST create student account manually
app.post('/api/admin/student-accounts/create-manual', async (req, res) => {
  try {
    const { studentId, approvedBy } = req.body;
    if (!studentId) {
      return res.status(400).json({ error: 'Student ID is required.' });
    }

    const [existing] = await pool.query('SELECT * FROM student_accounts WHERE student_id = ?', [studentId]);
    if (existing.length > 0) {
      return res.status(400).json({ error: 'Student account already exists.' });
    }

    await ensureStudentAccount(pool, studentId);

    const [stRows] = await pool.query('SELECT name, adminNo FROM students WHERE id = ?', [studentId]);
    const studentName = stRows.length > 0 ? stRows[0].name : studentId;
    const adminNo = stRows.length > 0 ? stRows[0].adminNo : '';

    const adminName = approvedBy || 'Administrator';
    await writeAuditLog('Account Creation (Manual)', `Admin ${adminName} manually created student login account for "${studentName}" (${adminNo})`);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST bulk create student accounts manually
app.post('/api/admin/student-accounts/bulk-create', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const { studentIds, approvedBy } = req.body;
    if (!studentIds || !Array.isArray(studentIds) || studentIds.length === 0) {
      return res.status(400).json({ error: 'Student IDs array is required.' });
    }

    for (const sid of studentIds) {
      await ensureStudentAccount(connection, sid);
    }

    await connection.commit();

    const adminName = approvedBy || 'Administrator';
    await writeAuditLog('Account Creation (Bulk)', `Admin ${adminName} bulk created student login accounts for ${studentIds.length} student(s)`);

    res.json({ success: true });
  } catch (err) {
    await connection.rollback();
    res.status(500).json({ error: err.message });
  } finally {
    connection.release();
  }
});

// GET announcements
app.get('/api/announcements', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM announcements ORDER BY createdAt DESC');
    res.json({ data: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST create announcement
app.post('/api/admin/announcements', async (req, res) => {
  try {
    const { title, content, author } = req.body;
    if (!title || !content) {
      return res.status(400).json({ error: 'Title and content are required.' });
    }

    await pool.query(
      'INSERT INTO announcements (title, content, author) VALUES (?, ?, ?)',
      [title, content, author || 'Administrator']
    );

    await writeAuditLog('Announcement Created', `Created announcement: "${title}"`);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE announcement
app.delete('/api/admin/announcements/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM announcements WHERE id = ?', [id]);
    await writeAuditLog('Announcement Deleted', `Deleted announcement ID ${id}`);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Register St.Paul AI Assistant Routes
const { registerAiAssistantRoutes } = require('./aiAssistant.js');
registerAiAssistantRoutes(app, () => pool);

let serverInstance = null;

// Function to start the Express server
function startServer(startPort = 3000) {
  return new Promise((resolve, reject) => {
    if (serverInstance) {
      const addr = serverInstance.address();
      const actualPort = typeof addr === 'string' ? startPort : (addr?.port || startPort);
      console.log(`Server already running on port ${actualPort}`);
      return resolve({ server: serverInstance, port: actualPort });
    }

    const isCloud = !!process.env.PORT;
    let port = isCloud ? parseInt(process.env.PORT, 10) : startPort;
    
    function tryListen() {
      const server = app.listen(port, '0.0.0.0', () => {
        serverInstance = server;
        console.log(`Express API Server listening on 0.0.0.0:${port}`);
        
        // Write active port to .port file for Vite proxy routing
        if (!isCloud) {
          try {
            const fs = require('fs');
            const path = require('path');
            fs.writeFileSync(path.join(__dirname, '..', '.port'), String(port), 'utf8');
          } catch (e) {
            // ignore
          }
        }
        
        resolve({ server: serverInstance, port: port });
      });

      server.on('error', (err) => {
        if (err.code === 'EADDRINUSE' && !isCloud) {
          console.log(`Port ${port} is occupied, trying next port...`);
          port++;
          tryListen();
        } else {
          reject(err);
        }
      });
    }

    tryListen();
  });
}

// Function to stop the Express server
async function stopServer() {
  if (pool) {
    try {
      await pool.end();
    } catch (err) {
      console.error(err);
    }
    pool = null;
  }
  if (serverInstance) {
    return new Promise((resolve) => {
      serverInstance.close(() => {
        console.log('Express API Server stopped');
        serverInstance = null;
        resolve();
      });
    });
  }
}

module.exports = {
  app,
  startServer,
  stopServer,
  initDb
};

if (require.main === module) {
  const fs = require('fs');
  const path = require('path');
  
  const isCloudProd = process.env.NODE_ENV === 'production' || !!process.env.VERCEL;
  
  let dbConfig = null;
  if (process.env.MYSQL_PUBLIC_URL) {
    dbConfig = process.env.MYSQL_PUBLIC_URL;
  } else if (process.env.DATABASE_URL) {
    dbConfig = process.env.DATABASE_URL;
  } else if (process.env.DB_HOST) {
    dbConfig = {
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT || '3306', 10),
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_DATABASE || process.env.DB_NAME || 'school_system'
    };
  } else if (!isCloudProd) {
    // Local development fallback
    dbConfig = {
      host: 'localhost',
      port: 3306,
      user: 'root',
      password: '',
      database: 'school_system'
    };

    // Check possible paths for db_config.json
    const possiblePaths = [
      path.join(process.env.APPDATA || '', 'students-clearance-cards', 'db_config.json'),
      path.join(__dirname, '..', 'db_config.json'),
      path.join(process.cwd(), 'db_config.json')
    ];

    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        try {
          const fullConfig = JSON.parse(fs.readFileSync(p, 'utf8'));
          const normalized = normalizeDbConfig(fullConfig);
          if (normalized) {
            dbConfig = normalized;
            console.log(`Loaded DB configuration from: ${p}`);
            break;
          }
        } catch (err) {
          // ignore
        }
      }
    }
  } else {
    console.error('[Cloud-Mode] No cloud database credentials found in environment variables!');
  }

  console.log('[Startup] Resolving Database Configuration for Startup:');
  console.log(`  - NODE_ENV: ${process.env.NODE_ENV}`);
  console.log(`  - VERCEL: ${process.env.VERCEL}`);
  console.log(`  - Resolved dbConfig:`, dbConfig ? (typeof dbConfig === 'string' ? dbConfig.replace(/:([^@:]+)@/, ':****@') : { ...dbConfig, password: '****' }) : 'None');

  const startPort = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
  startServer(startPort).then(async () => {
    const success = await initDb(dbConfig);
    if (success) {
      console.log('Database initialized successfully.');
    } else {
      console.error('Failed to initialize database.');
    }
  }).catch(err => {
    console.error('Failed to start server:', err);
  });
}

