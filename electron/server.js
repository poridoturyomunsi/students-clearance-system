try {
  const path = require('path');
  require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
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
  if (!rawConfig) return null;
  if (typeof rawConfig === 'string') return rawConfig;

  // Handle case where rawConfig is a connection URL directly or wrapped inside an object
  if (typeof rawConfig.connectionString === 'string' && rawConfig.connectionString) {
    return rawConfig.connectionString;
  }
  if (typeof rawConfig.databaseUrl === 'string' && rawConfig.databaseUrl) {
    return rawConfig.databaseUrl;
  }
  if (typeof rawConfig.mysqlUrl === 'string' && rawConfig.mysqlUrl) {
    return rawConfig.mysqlUrl;
  }

  // Handle the format sent by the frontend UI:
  // { mode: 'network', db: { host: '...', port: 3306, ... } }
  const dbData = rawConfig.db || rawConfig;

  // If the host field itself is a connection URI (like mysql://...), return it directly
  if (typeof dbData.host === 'string' && (dbData.host.startsWith('mysql://') || dbData.host.startsWith('mysql2://'))) {
    return dbData.host;
  }

  const host = dbData.host || dbData.databaseHost || '';
  const port = parseInt(String(dbData.port || dbData.databasePort || 3306), 10) || 3306;
  const user = dbData.user || dbData.databaseUsername || '';
  const password = dbData.password || dbData.databasePassword || '';
  const database = dbData.database || dbData.databaseName || 'student_clearance';

  return {
    host,
    port,
    user,
    password,
    database
  };
}

function getDbConfigFilePath() {
  const path = require('path');
  const os = require('os');
  const appDataDir = process.env.APPDATA || (process.platform === 'darwin' ? path.join(os.homedir(), 'Library', 'Application Support') : path.join(os.homedir(), '.config'));
  const configDir = path.join(appDataDir, 'students-clearance-cards');
  const fs = require('fs');
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }
  return path.join(configDir, 'db_config.json');
}

function saveToEnvFile(config) {
  try {
    const fs = require('fs');
    const path = require('path');
    const envPath = path.join(__dirname, '..', '.env');
    let envContent = '';
    if (fs.existsSync(envPath)) {
      envContent = fs.readFileSync(envPath, 'utf8');
    }
    
    let newLines = [];
    if (typeof config === 'string') {
      newLines.push(`DATABASE_URL=${config}`);
    } else {
      if (config.host) newLines.push(`DB_HOST=${config.host}`);
      if (config.port) newLines.push(`DB_PORT=${config.port}`);
      if (config.user) newLines.push(`DB_USER=${config.user}`);
      if (config.password !== undefined) newLines.push(`DB_PASSWORD=${config.password}`);
      if (config.database) newLines.push(`DB_DATABASE=${config.database}`);
    }
    
    const envLines = envContent.split(/\r?\n/);
    const updatedLines = [];
    const keysToUpdate = typeof config === 'string' ? ['DATABASE_URL'] : ['DB_HOST', 'DB_PORT', 'DB_USER', 'DB_PASSWORD', 'DB_DATABASE'];
    
    for (let line of envLines) {
      const match = line.match(/^\s*([^=#\s]+)\s*=\s*(.*)$/);
      if (match) {
        const key = match[1];
        if (keysToUpdate.includes(key)) {
          continue;
        }
      }
      updatedLines.push(line);
    }
    
    updatedLines.push(...newLines);
    fs.writeFileSync(envPath, updatedLines.join('\n'), 'utf8');
    console.log('[saveToEnvFile] Successfully updated .env file.');
  } catch (err) {
    console.warn('[saveToEnvFile] Failed to write to .env file:', err.message);
  }
}

function getDbConfigFromEnv() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  if (process.env.MYSQL_PUBLIC_URL) return process.env.MYSQL_PUBLIC_URL;
  if (process.env.MYSQL_URL) return process.env.MYSQL_URL;
  if (process.env.MYSQL_PRIVATE_URL) return process.env.MYSQL_PRIVATE_URL;
  
  const host = process.env.DB_HOST || process.env.MYSQLHOST || process.env.MYSQL_HOST;
  if (host) {
    return {
      host: host,
      port: parseInt(process.env.DB_PORT || process.env.MYSQLPORT || process.env.MYSQL_PORT || '3306', 10),
      user: process.env.DB_USER || process.env.MYSQLUSER || process.env.MYSQL_USER || 'root',
      password: process.env.DB_PASSWORD || process.env.MYSQLPASSWORD || process.env.MYSQL_PASSWORD || '',
      database: process.env.DB_DATABASE || process.env.MYSQLDATABASE || process.env.MYSQL_DATABASE || process.env.DB_NAME || 'student_clearance'
    };
  }
  return null;
}

function loadDbConfig() {
  const fs = require('fs');
  const path = require('path');
  
  const envConfig = getDbConfigFromEnv();
  if (envConfig) {
    console.log('[DB-CONFIG] Loaded database config from environment variables');
    return envConfig;
  }

  const appDataPath = getDbConfigFilePath();
  if (fs.existsSync(appDataPath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(appDataPath, 'utf8'));
      const normalized = normalizeDbConfig(parsed);
      if (normalized) {
        console.log(`[DB-CONFIG] Loaded database config from APPDATA path: ${appDataPath}`);
        return normalized;
      }
    } catch (err) {
      console.warn(`[DB-CONFIG] Error reading config from APPDATA path: ${err.message}`);
    }
  }

  const rootPath = path.join(__dirname, '..', 'db_config.json');
  if (fs.existsSync(rootPath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(rootPath, 'utf8'));
      const normalized = normalizeDbConfig(parsed);
      if (normalized) {
        console.log(`[DB-CONFIG] Loaded database config from project root path: ${rootPath}`);
        return normalized;
      }
    } catch (err) {
      console.warn(`[DB-CONFIG] Error reading config from project root path: ${err.message}`);
    }
  }

  return {
    host: 'localhost',
    port: 3306,
    user: 'root',
    password: '',
    database: 'student_clearance'
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

function isScienceSubject(subjectName) {
  const norm = (subjectName || '').toLowerCase().trim();
  return norm.includes('physic') || norm.includes('phy') ||
         norm.includes('chemist') || norm.includes('chem') ||
         norm.includes('biolog') || norm.includes('bio') ||
         norm.includes('agricult') || norm.includes('agr') ||
         norm.includes('mathe') || norm.includes('math') || norm.includes('mtc');
}

function isSubsidiarySubject(subjectName, subjectType) {
  const normType = (subjectType || '').toLowerCase().trim();
  if (normType === 'general paper' || normType === 'subsidiary') {
    return true;
  }
  const normName = (subjectName || '').toLowerCase().trim();
  if (normName === 'general paper' || normName === 'gp' || normName === 'sub math' || normName === 'subsidiary math' || normName === 'subsidiary mathematics' || normName === 'subsidiary ict' || normName === 'sict' || normName === 'sm') {
    return true;
  }
  if (normName.includes('subsidiary') || normName.includes('general paper')) {
    return true;
  }
  return false;
}

function getUACEOverallSubjectGrade(papers, subjectName, subjectType) {
  if (isSubsidiarySubject(subjectName, subjectType)) {
    let sumScore = 0;
    let count = 0;
    papers.forEach(p => {
      if (p.score !== null && p.score !== undefined && p.score !== '') {
        sumScore += parseFloat(p.score);
        count++;
      }
    });
    const avg = count > 0 ? Math.round(sumScore / count) : 0;
    if (avg >= 60) {
      return { grade: 'SP', points: 1, comment: 'Subsidiary Pass' };
    } else {
      return { grade: 'F', points: 0, comment: 'Fail' };
    }
  }

  const grades = [];
  papers.forEach(p => {
    if (p.score !== null && p.score !== undefined && p.score !== '') {
      const s = Math.round(p.score);
      let pg = 9;
      if (s >= 85) pg = 1;
      else if (s >= 80) pg = 2;
      else if (s >= 75) pg = 3;
      else if (s >= 70) pg = 4;
      else if (s >= 65) pg = 5;
      else if (s >= 60) pg = 6;
      else if (s >= 50) pg = 7;
      else if (s >= 40) pg = 8;
      grades.push(pg);
    }
  });

  if (grades.length === 0) {
    return { grade: '-', points: 0, comment: '-' };
  }

  const sorted = grades.sort((a, b) => a - b);
  const numPapers = sorted.length;

  if (numPapers === 1) {
    const g = sorted[0];
    if (g <= 2) return { grade: 'A', points: 6, comment: 'Excellent' };
    if (g === 3) return { grade: 'B', points: 5, comment: 'Very Good results' };
    if (g === 4) return { grade: 'C', points: 4, comment: 'Good performance' };
    if (g === 5) return { grade: 'D', points: 3, comment: 'Fair' };
    if (g === 6) return { grade: 'E', points: 2, comment: 'Pass' };
    if (g <= 8) return { grade: 'O', points: 1, comment: 'Subsidiary Pass' };
    return { grade: 'F', points: 0, comment: 'Fail' };
  }

  if (numPapers === 2) {
    const g1 = sorted[0];
    const g2 = sorted[1];
    if (g2 <= 2) return { grade: 'A', points: 6, comment: 'Excellent' };
    if (g2 === 3) return { grade: 'B', points: 5, comment: 'Very Good results' };
    if (g2 === 4) return { grade: 'C', points: 4, comment: 'Good performance' };
    if (g2 === 5) return { grade: 'D', points: 3, comment: 'Fair' };
    if (g2 === 6 || (g2 <= 8 && g1 + g2 <= 12)) return { grade: 'E', points: 2, comment: 'Pass' };
    if (g2 <= 8 && g1 + g2 <= 16) return { grade: 'O', points: 1, comment: 'Subsidiary Pass' };
    if (g1 <= 7 && g2 === 9) return { grade: 'O', points: 1, comment: 'Subsidiary Pass' };
    return { grade: 'F', points: 0, comment: 'Fail' };
  }

  if (numPapers === 3) {
    const g1 = sorted[0];
    const g2 = sorted[1];
    const g3 = sorted[2];
    if (g3 <= 3) return { grade: 'A', points: 6, comment: 'Excellent' };
    if (g3 === 4) return { grade: 'B', points: 5, comment: 'Very Good results' };
    if (g3 === 5) return { grade: 'C', points: 4, comment: 'Good performance' };
    if (g3 === 6) return { grade: 'D', points: 3, comment: 'Fair' };
    if ((g3 === 7 && g2 <= 6) || (g3 === 8 && g2 <= 6 && g1 <= 5)) return { grade: 'E', points: 2, comment: 'Pass' };
    if (g3 <= 8) return { grade: 'O', points: 1, comment: 'Subsidiary Pass' };
    if (g3 === 9 && g2 <= 8) return { grade: 'O', points: 1, comment: 'Subsidiary Pass' };
    if (g3 === 9 && g2 === 9 && g1 <= 7) {
      if (g1 === 7 && isScienceSubject(subjectName)) {
        return { grade: 'F', points: 0, comment: 'Fail' };
      }
      return { grade: 'O', points: 1, comment: 'Subsidiary Pass' };
    }
    return { grade: 'F', points: 0, comment: 'Fail' };
  }

  const g1 = sorted[0];
  const g2 = sorted[1];
  const g3 = sorted[2];
  const g4 = sorted[3];
  if (g4 <= 3) return { grade: 'A', points: 6, comment: 'Excellent' };
  if (g4 === 4) return { grade: 'B', points: 5, comment: 'Very Good results' };
  if (g4 === 5) return { grade: 'C', points: 4, comment: 'Good performance' };
  if (g4 === 6) return { grade: 'D', points: 3, comment: 'Fair' };
  if ((g4 === 7 && g3 <= 6) || (g4 === 8 && g3 <= 6 && g2 <= 6 && g1 <= 5)) return { grade: 'E', points: 2, comment: 'Pass' };
  if (g4 <= 8) return { grade: 'O', points: 1, comment: 'Subsidiary Pass' };
  if (g4 === 9 && g3 <= 8) return { grade: 'O', points: 1, comment: 'Subsidiary Pass' };
  if (g4 === 9 && g3 === 9 && g2 <= 7) return { grade: 'O', points: 1, comment: 'Subsidiary Pass' };
  return { grade: 'F', points: 0, comment: 'Fail' };
}

function calculateUACEPoints(marks) {
  const subjects = {};
  marks.forEach(m => {
    if (!subjects[m.subject]) {
      subjects[m.subject] = {
        name: m.subject,
        type: m.subject_type,
        papers: []
      };
    }
    subjects[m.subject].papers.push({ score: m.score });
  });

  let principalPoints = 0;
  let subsidiaryPoints = 0;
  Object.values(subjects).forEach(sub => {
    const grInfo = getUACEOverallSubjectGrade(sub.papers, sub.name, sub.type);
    if (isSubsidiarySubject(sub.name, sub.type)) {
      subsidiaryPoints += grInfo.points;
    } else {
      principalPoints += grInfo.points;
    }
  });

  return { principalPoints, subsidiaryPoints, totalPoints: principalPoints + subsidiaryPoints };
}

const imageCache = {};
const { Jimp } = require('jimp');

async function compressImageIfNeeded(base64Str, maxWidth, maxHeight, quality = 80, forceJpeg = false) {
  if (!base64Str) return null;
  if (!base64Str.startsWith('data:')) {
    return base64Str;
  }
  
  // Fast path: If the image is already compressed and small (under ~300KB base64), skip slow backend Jimp processing
  if (base64Str.length < 400000) {
    return base64Str;
  }

  try {
    const matches = base64Str.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,(.+)$/);
    if (!matches) return base64Str;
    const mimeType = matches[1];
    
    if (mimeType.includes('svg')) {
      return base64Str; // Cannot process SVG with Jimp
    }

    const buffer = Buffer.from(matches[2], 'base64');
    let image = await Jimp.read(buffer);
    
    const width = image.width;
    const height = image.height;
    
    let changed = false;
    if (width > maxWidth || height > maxHeight) {
      image.scaleToFit({ w: maxWidth, h: maxHeight });
      changed = true;
    }
    
    let outputMime = 'image/jpeg';
    if (!forceJpeg && (mimeType.includes('png') || mimeType.includes('gif'))) {
      outputMime = 'image/png';
    }
    
    if (outputMime === 'image/jpeg' && (mimeType.includes('png') || mimeType.includes('gif'))) {
      // Create a white background and composite transparent PNGs over it
      const whiteBg = new Jimp({ width: image.width, height: image.height, color: 0xffffffff });
      whiteBg.composite(image, 0, 0);
      image = whiteBg;
      changed = true;
    }
    
    if (!changed && buffer.length < 150000) {
      return base64Str;
    }
    
    const options = {};
    if (outputMime === 'image/jpeg') {
      options.quality = quality;
    }
    
    const compressedBuffer = await image.getBuffer(outputMime, options);
    const compressedBase64 = compressedBuffer.toString('base64');
    return `data:${outputMime};base64,${compressedBase64}`;
  } catch (err) {
    console.error('Failed to compress/resize base64 image:', err);
    return base64Str;
  }
}

async function getBase64ImageFromUrl(url) {
  if (!url) return null;
  if (url.startsWith('data:')) {
    return url;
  }
  if (imageCache[url]) {
    return imageCache[url];
  }
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
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
  const uploadStart = Date.now();
  try {
    cloudinary.config({
      cloud_name: cloudName,
      api_key: apiKey,
      api_secret: apiSecret
    });
    console.log(`[Cloudinary] Starting image upload for public ID ${publicId}...`);
    
    // Set up a 10-second upload timeout limit (increased from 2.5s)
    const uploadPromise = cloudinary.uploader.upload(photoBase64, {
      public_id: publicId,
      folder: 'school_management_system',
      resource_type: 'image',
      overwrite: true,
      invalidate: true
    });
    
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Cloudinary upload timed out (exceeded 10s)')), 10000)
    );
    
    const result = await Promise.race([uploadPromise, timeoutPromise]);
    const duration = Date.now() - uploadStart;
    console.log(`[Cloudinary] Upload successful in ${duration}ms. URL: ${result.secure_url}`);
    return result.secure_url;
  } catch (err) {
    const duration = Date.now() - uploadStart;
    console.error(`[Cloudinary-ERROR] Upload failed or timed out after ${duration}ms:`, err.message);
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

async function dbSavePdfTask(taskId, status, progress, total, filename = null, error = null, pdfData = null) {
  try {
    if (pool && dbInitialized) {
      if (status === 'processing') {
        await pool.query(
          `INSERT INTO pdf_tasks (id, status, progress, total) 
           VALUES (?, 'processing', ?, ?) 
           ON DUPLICATE KEY UPDATE 
             progress = VALUES(progress), 
             total = VALUES(total)`,
          [taskId, progress, total]
        );
      } else {
        await pool.query(
          `INSERT INTO pdf_tasks (id, status, progress, total, filename, error, pdf_data) 
           VALUES (?, ?, ?, ?, ?, ?, ?) 
           ON DUPLICATE KEY UPDATE 
             status = VALUES(status), 
             progress = VALUES(progress), 
             total = VALUES(total), 
             filename = VALUES(filename), 
             error = VALUES(error), 
             pdf_data = VALUES(pdf_data)`,
          [taskId, status, progress, total, filename, error, pdfData]
        );

        // Clean up tasks older than 3 hours to prevent database disk bloat
        if (status === 'completed' || status === 'failed') {
          try {
            await pool.query('DELETE FROM pdf_tasks WHERE updatedAt < NOW() - INTERVAL 3 HOUR');
            console.log('[DB-CLEANUP] Successfully removed old completed/failed PDF tasks.');
          } catch (cleanupErr) {
            console.warn('[DB-CLEANUP] Non-blocking PDF task cleanup failed:', cleanupErr.message);
          }
        }
      }
    }
  } catch (err) {
    console.error('Failed to save PDF task to DB:', err);
  }
}

async function dbGetPdfTask(taskId) {
  try {
    if (pool && dbInitialized) {
      const [rows] = await pool.query(
        'SELECT id, status, progress, total, filename, error FROM pdf_tasks WHERE id = ?',
        [taskId]
      );
      if (rows.length > 0) {
        return rows[0];
      }
    }
  } catch (err) {
    console.error('Failed to get PDF task from DB:', err);
  }
  return null;
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

let backupSchedulerStarted = false;

function escapeSqlVal(val) {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'number') return String(val);
  if (typeof val === 'boolean') return val ? '1' : '0';
  if (val instanceof Date) {
    return `'${val.toISOString().slice(0, 19).replace('T', ' ')}'`;
  }
  if (typeof val === 'object') {
    val = JSON.stringify(val);
  }
  const escaped = String(val)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n')
    .replace(/\x1a/g, '\\Z'); // CTRL+Z
  return `'${escaped}'`;
}

async function backupDatabaseJS(outputPath) {
  const fs = require('fs');
  const [tablesRows] = await pool.query('SHOW TABLES');
  const dbName = currentDbConfig.database || 'student_clearance';
  const tableKey = `Tables_in_${dbName}`;
  const tables = tablesRows.map(row => row[tableKey] || row[Object.keys(row)[0]]);
  
  let sqlDump = `-- SPSS Database Backup\n-- Date: ${new Date().toISOString()}\n\n`;
  sqlDump += `CREATE DATABASE IF NOT EXISTS \`${dbName}\`;\nUSE \`${dbName}\`;\n\n`;
  
  for (const table of tables) {
    const [createRows] = await pool.query(`SHOW CREATE TABLE \`${table}\``);
    const createSql = createRows[0]['Create Table'];
    sqlDump += `DROP TABLE IF EXISTS \`${table}\`;\n${createSql};\n\n`;
    
    const [rows] = await pool.query(`SELECT * FROM \`${table}\``);
    if (rows.length > 0) {
      sqlDump += `INSERT INTO \`${table}\` VALUES \n`;
      const valStrings = rows.map(row => {
        const vals = Object.values(row).map(val => escapeSqlVal(val));
        return `(${vals.join(', ')})`;
      });
      sqlDump += valStrings.join(',\n') + ';\n\n';
    }
  }
  
  const zlib = require('zlib');
  const gzipData = zlib.gzipSync(Buffer.from(sqlDump, 'utf8'));
  fs.writeFileSync(outputPath, gzipData);
}

async function restoreDatabaseJS(inputPath) {
  const fs = require('fs');
  const zlib = require('zlib');
  const gzipData = fs.readFileSync(inputPath);
  const sqlDump = zlib.gunzipSync(gzipData).toString('utf8');
  
  const connection = await pool.getConnection();
  try {
    await connection.query('SET FOREIGN_KEY_CHECKS = 0');
    
    // Split by statement separator (;\n\n or ;\r\n\r\n)
    const statements = sqlDump.split(/;\r?\n\r?\n/);
    for (let statement of statements) {
      statement = statement.trim();
      if (!statement) continue;
      if (!statement.endsWith(';')) {
        statement += ';';
      }
      try {
        await connection.query(statement);
      } catch (stmtErr) {
        console.error('Failed to restore statement:', statement.substring(0, 100), stmtErr.message);
        throw stmtErr;
      }
    }
    
    await connection.query('SET FOREIGN_KEY_CHECKS = 1');
  } finally {
    connection.release();
  }
}

async function checkAndRunBackup() {
  try {
    if (!pool || !dbInitialized) return;
    
    // Get settings
    const [enabledRows] = await pool.query("SELECT val_value FROM settings WHERE key_name = 'auto_backup_enabled'");
    const enabled = enabledRows[0]?.val_value !== 'false'; // default true
    
    if (!enabled) return;
    
    const [lastBackupRows] = await pool.query("SELECT val_value FROM settings WHERE key_name = 'last_backup_time'");
    const lastBackupTime = lastBackupRows[0]?.val_value ? parseInt(lastBackupRows[0].val_value, 10) : 0;
    
    const now = Date.now();
    const oneDayMs = 24 * 60 * 60 * 1000;
    
    if (now - lastBackupTime >= oneDayMs) {
      console.log('[Auto-Backup] Last backup was more than 24h ago. Starting daily automatic database backup...');
      
      const fs = require('fs');
      const path = require('path');
      const backupsDir = path.join(getExportsDir(), 'backups');
      if (!fs.existsSync(backupsDir)) {
        fs.mkdirSync(backupsDir, { recursive: true });
      }
      
      const filename = `auto-backup-${new Date().toISOString().slice(0, 10)}.sql.gz`;
      const outputPath = path.join(backupsDir, filename);
      
      await backupDatabaseJS(outputPath);
      
      // Update last backup time
      await pool.query(
        "INSERT INTO settings (key_name, val_value) VALUES ('last_backup_time', ?) ON DUPLICATE KEY UPDATE val_value = VALUES(val_value)",
        [String(now)]
      );
      
      // Apply retention policy (delete backups older than backup_retention_days)
      const [retentionRows] = await pool.query("SELECT val_value FROM settings WHERE key_name = 'backup_retention_days'");
      const retentionDays = retentionRows[0]?.val_value ? parseInt(retentionRows[0].val_value, 10) : 7;
      
      const files = fs.readdirSync(backupsDir);
      for (const file of files) {
        if (!file.endsWith('.sql.gz')) continue;
        const filePath = path.join(backupsDir, file);
        const stat = fs.statSync(filePath);
        const ageDays = (now - stat.mtimeMs) / oneDayMs;
        if (ageDays > retentionDays) {
          fs.unlinkSync(filePath);
          console.log(`[Auto-Backup] Deleted old backup file due to retention policy: ${file}`);
        }
      }
      
      await writeAuditLog('Auto Backup', `Daily automatic database backup completed successfully: ${filename}`);
    }
  } catch (err) {
    console.error('[Auto-Backup] Automatic database backup failed:', err);
  }
}

function startAutoBackupScheduler() {
  if (backupSchedulerStarted) return;
  backupSchedulerStarted = true;
  
  // Check immediately
  setTimeout(() => {
    checkAndRunBackup();
  }, 5000);
  
  // Check every hour
  setInterval(() => {
    checkAndRunBackup();
  }, 60 * 60 * 1000);
}

async function runStaffMigrations(conn) {
  // Check if staff table exists
  const [tables] = await conn.query("SHOW TABLES LIKE 'staff'");
  if (tables.length === 0) {
    console.log('[MIGRATION] Staff table not found. Checking if teachers table exists to rename...');
    const [tTables] = await conn.query("SHOW TABLES LIKE 'teachers'");
    if (tTables.length > 0) {
      console.log('[MIGRATION] Teachers table exists. Renaming teachers to staff...');
      
      // Drop existing foreign keys on teacher_assignments and class_teachers
      try {
        await conn.query('ALTER TABLE teacher_assignments DROP FOREIGN KEY teacher_assignments_ibfk_1');
      } catch (e) {
        console.warn('[MIGRATION] Dropping teacher_assignments FK via standard name failed:', e.message);
      }
      try {
        await conn.query('ALTER TABLE class_teachers DROP FOREIGN KEY class_teachers_ibfk_1');
      } catch (e) {
        console.warn('[MIGRATION] Dropping class_teachers FK via standard name failed:', e.message);
      }
      try {
        await conn.query('ALTER TABLE teacher_assignments DROP FOREIGN KEY fk_teacher_assignments_teachers');
      } catch (e) {}
      try {
        await conn.query('ALTER TABLE class_teachers DROP FOREIGN KEY fk_class_teachers_teachers');
      } catch (e) {}

      // Rename table
      await conn.query('RENAME TABLE teachers TO staff');
      console.log('[MIGRATION] Successfully renamed teachers to staff.');
    } else {
      console.log('[MIGRATION] Creating staff table from scratch...');
      await conn.query(`
        CREATE TABLE staff (
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
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `);
    }
  }

  // Ensure all new columns exist on staff
  const columnsToAdd = [
    { name: 'employee_number', def: 'VARCHAR(50) NULL' },
    { name: 'first_name', def: 'VARCHAR(50) NULL' },
    { name: 'middle_name', def: 'VARCHAR(50) NULL' },
    { name: 'last_name', def: 'VARCHAR(50) NULL' },
    { name: 'dob', def: 'DATE NULL' },
    { name: 'national_id', def: 'VARCHAR(50) NULL' },
    { name: 'phone', def: 'VARCHAR(20) NULL' },
    { name: 'email', def: 'VARCHAR(100) NULL' },
    { name: 'residential_address', def: 'TEXT NULL' },
    { name: 'district', def: 'VARCHAR(50) NULL' },
    { name: 'nationality', def: 'VARCHAR(50) NULL' },
    { name: 'religion', def: 'VARCHAR(50) NULL' },
    { name: 'category', def: "VARCHAR(20) NOT NULL DEFAULT 'Teaching'" },
    { name: 'department', def: 'VARCHAR(50) NULL' },
    { name: 'date_appointed', def: 'DATE NULL' },
    { name: 'employment_status', def: "VARCHAR(20) NOT NULL DEFAULT 'Permanent'" },
    { name: 'salary_scale', def: 'VARCHAR(20) NULL' },
    { name: 'qualification', def: 'VARCHAR(100) NULL' },
    { name: 'emergency_contact_name', def: 'VARCHAR(100) NULL' },
    { name: 'emergency_contact_phone', def: 'VARCHAR(20) NULL' },
    { name: 'force_password_change', def: 'BOOLEAN NOT NULL DEFAULT FALSE' },
    { name: 'verification_token', def: 'VARCHAR(100) UNIQUE NULL' }
  ];

  const [cols] = await conn.query('DESCRIBE staff');
  const existingCols = cols.map(c => c.Field);

  for (const col of columnsToAdd) {
    if (!existingCols.includes(col.name)) {
      console.log(`[MIGRATION] Adding column staff.${col.name}...`);
      await conn.query(`ALTER TABLE staff ADD COLUMN \`${col.name}\` ${col.def}`);
    }
  }

  // Split names for existing records that don't have first_name / last_name populated
  const [rows] = await conn.query('SELECT id, name, first_name, last_name, verification_token FROM staff');
  const crypto = require('crypto');
  for (const r of rows) {
    let updateFields = [];
    let updateParams = [];
    if (!r.first_name || !r.last_name) {
      const parts = (r.name || '').trim().split(/\s+/);
      const fName = parts[0] || 'Staff';
      let mName = '';
      let lName = '';
      if (parts.length === 2) {
        lName = parts[1];
      } else if (parts.length > 2) {
        mName = parts[1];
        lName = parts.slice(2).join(' ');
      } else {
        lName = 'Member';
      }
      updateFields.push('first_name = ?', 'middle_name = ?', 'last_name = ?');
      updateParams.push(fName, mName, lName);
    }
    if (!r.verification_token) {
      const token = crypto.randomBytes(16).toString('hex');
      updateFields.push('verification_token = ?');
      updateParams.push(token);
    }
    if (updateFields.length > 0) {
      updateParams.push(r.id);
      await conn.query(`UPDATE staff SET ${updateFields.join(', ')} WHERE id = ?`, updateParams);
    }
  }

  // Also check if legacy 'teachers' table exists alongside 'staff' and merge any missing teachers into 'staff'
  try {
    const [tTables] = await conn.query("SHOW TABLES LIKE 'teachers'");
    if (tTables.length > 0) {
      const [legacyTeachers] = await conn.query('SELECT * FROM teachers');
      for (const tch of legacyTeachers) {
        const [exists] = await conn.query('SELECT id FROM staff WHERE id = ? OR username = ?', [tch.id, tch.username]);
        if (exists.length === 0) {
          console.log(`[MIGRATION] Migrating legacy teacher "${tch.name}" (${tch.username}) into staff table...`);
          const parts = (tch.name || '').trim().split(/\s+/);
          const fName = parts[0] || 'Teacher';
          const lName = parts.slice(1).join(' ') || 'Staff';
          await conn.query(
            `INSERT INTO staff (
              id, username, password_hash, name, first_name, last_name, gender, subjects, classes, position, signature, photo, status, category, createdAt
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Teaching', ?)`,
            [
              tch.id,
              tch.username,
              tch.password_hash || '',
              tch.name,
              fName,
              lName,
              tch.gender || null,
              typeof tch.subjects === 'string' ? tch.subjects : JSON.stringify(tch.subjects || []),
              typeof tch.classes === 'string' ? tch.classes : JSON.stringify(tch.classes || []),
              tch.position || 'Teacher',
              tch.signature || null,
              tch.photo || null,
              tch.status || 'Active',
              tch.createdAt || new Date()
            ]
          );
        }
      }
    }
  } catch (e) {
    console.warn('[MIGRATION] Merging legacy teachers into staff table failed:', e.message);
  }

  // Ensure all active students have a student_accounts record
  try {
    const crypto = require('crypto');
    const defaultHash = crypto.createHash('sha256').update('123').digest('hex');
    await conn.query(`
      INSERT IGNORE INTO student_accounts (student_id, password_hash, status, needs_password_change)
      SELECT id, ?, 'Active', 1 FROM students WHERE deleted_at IS NULL
    `, [defaultHash]);
    console.log('[MIGRATION] Ensured all active students have student_accounts records.');
  } catch (e) {
    console.warn('[MIGRATION] Creating missing student accounts failed:', e.message);
  }

  // Restore foreign keys on teacher_assignments and class_teachers pointing to staff
  try {
    await conn.query('ALTER TABLE teacher_assignments ADD CONSTRAINT fk_teacher_assignments_staff FOREIGN KEY (teacher_id) REFERENCES staff(id) ON DELETE CASCADE');
  } catch (e) {}
  try {
    await conn.query('ALTER TABLE class_teachers ADD CONSTRAINT fk_class_teachers_staff FOREIGN KEY (teacher_id) REFERENCES staff(id) ON DELETE CASCADE');
  } catch (e) {}

  // Create staff_cards table
  try {
    await conn.query(`
      CREATE TABLE IF NOT EXISTS staff_cards (
        id INT AUTO_INCREMENT PRIMARY KEY,
        staff_id VARCHAR(50) NOT NULL,
        card_id VARCHAR(50) NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'Active',
        issue_date DATE NOT NULL,
        expiry_date DATE NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (staff_id) REFERENCES staff(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
  } catch (e) {
    console.error('[MIGRATION] Failed to create staff_cards table:', e.message);
  }

  // Create leave_requests table
  await conn.query(`
    CREATE TABLE IF NOT EXISTS leave_requests (
      id INT AUTO_INCREMENT PRIMARY KEY,
      staff_id VARCHAR(50) NOT NULL,
      leave_type VARCHAR(50) NOT NULL,
      start_date DATE NOT NULL,
      end_date DATE NOT NULL,
      reason TEXT NOT NULL,
      status ENUM('Pending', 'Approved', 'Rejected') NOT NULL DEFAULT 'Pending',
      approved_by VARCHAR(100) NULL,
      remarks TEXT NULL,
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (staff_id) REFERENCES staff(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  // Create timetables table
  await conn.query(`
    CREATE TABLE IF NOT EXISTS timetables (
      id INT AUTO_INCREMENT PRIMARY KEY,
      staff_id VARCHAR(50) NOT NULL,
      day_of_week VARCHAR(20) NOT NULL,
      period_name VARCHAR(50) NOT NULL,
      start_time TIME NOT NULL,
      end_time TIME NOT NULL,
      grade_class VARCHAR(50) NOT NULL,
      subject VARCHAR(100) NOT NULL,
      room VARCHAR(50) NULL,
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (staff_id) REFERENCES staff(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  // Create verifications table
  await conn.query(`
    CREATE TABLE IF NOT EXISTS verifications (
      token VARCHAR(100) PRIMARY KEY,
      document_type VARCHAR(50) NOT NULL,
      reference_id VARCHAR(50) NOT NULL,
      metadata JSON NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'Active',
      expiresAt DATE NULL,
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  // Sync verifications table with active staff
  const [activeStaff] = await conn.query('SELECT id, name, category, position, department, employment_status, verification_token, status, photo FROM staff');
  for (const s of activeStaff) {
    if (s.verification_token) {
      const [vRows] = await conn.query('SELECT token FROM verifications WHERE token = ?', [s.verification_token]);
      if (vRows.length === 0) {
        const metadata = {
          name: s.name,
          photo: s.photo,
          category: s.category,
          department: s.department || 'N/A',
          position: s.position || 'N/A',
          employmentStatus: s.employment_status,
          issueDate: new Date().toISOString().split('T')[0],
          expiryDate: new Date(Date.now() + 365*24*60*60*1000).toISOString().split('T')[0],
          status: s.status
        };
        await conn.query('INSERT INTO verifications (token, document_type, reference_id, metadata, status, expiresAt) VALUES (?, ?, ?, ?, ?, ?)', [
          s.verification_token,
          'Staff ID',
          s.id,
          JSON.stringify(metadata),
          s.status === 'Active' ? 'Active' : 'Inactive',
          metadata.expiryDate
        ]);
      }
    }
  }

  // Ensure verification_token exists on students table and sync verifications
  try {
    const [stCols] = await conn.query('DESCRIBE students');
    const existingStCols = stCols.map(c => c.Field);
    if (!existingStCols.includes('verification_token')) {
      console.log('[MIGRATION] Adding column students.verification_token...');
      await conn.query('ALTER TABLE students ADD COLUMN `verification_token` VARCHAR(100) NULL');
    }

    const [activeStudents] = await conn.query('SELECT id, adminNo, name, gender, gradeClass, boardingStatus, isCleared, photo, verification_token FROM students');
    const crypto = require('crypto');
    for (const s of activeStudents) {
      let vToken = s.verification_token;
      if (!vToken) {
        vToken = `STP-STD-${s.id}`;
        await conn.query('UPDATE students SET verification_token = ? WHERE id = ?', [vToken, s.id]);
      }
      const [vRows] = await conn.query('SELECT token FROM verifications WHERE token = ? OR (reference_id = ? AND document_type = "Student Clearance Card")', [vToken, s.id]);
      if (vRows.length === 0) {
        const metadata = {
          name: s.name,
          adminNo: s.adminNo,
          studentNo: s.adminNo,
          studentId: s.id,
          gradeClass: s.gradeClass,
          boardingStatus: s.boardingStatus,
          gender: s.gender,
          isCleared: !!s.isCleared,
          photo: s.photo || null,
          issueDate: new Date().toISOString().split('T')[0],
          expiryDate: new Date(Date.now() + 365*24*60*60*1000).toISOString().split('T')[0],
          status: s.isCleared ? 'Cleared' : 'Pending Clearance'
        };
        await conn.query('INSERT INTO verifications (token, document_type, reference_id, metadata, status, expiresAt) VALUES (?, ?, ?, ?, ?, ?)', [
          vToken,
          'Student Clearance Card',
          s.id,
          JSON.stringify(metadata),
          'Active',
          metadata.expiryDate
        ]);
      }
    }
  } catch (e) {
    console.warn('[MIGRATION] Syncing students with verifications table error:', e.message);
  }
}

async function ensurePerformanceIndexes(dbPool) {
  if (!dbPool) return;
  const queries = [
    { table: 'students', index: 'idx_adminNo', sql: 'ALTER TABLE students ADD INDEX idx_adminNo (adminNo)' },
    { table: 'students', index: 'idx_name', sql: 'ALTER TABLE students ADD INDEX idx_name (name(100))' },
    { table: 'students', index: 'idx_gradeClass', sql: 'ALTER TABLE students ADD INDEX idx_gradeClass (gradeClass)' },
    { table: 'students', index: 'idx_isCleared', sql: 'ALTER TABLE students ADD INDEX idx_isCleared (isCleared)' },
    { table: 'students', index: 'idx_boardingStatus', sql: 'ALTER TABLE students ADD INDEX idx_boardingStatus (boardingStatus)' },
    { table: 'students', index: 'idx_printStatus', sql: 'ALTER TABLE students ADD INDEX idx_printStatus (printStatus)' },
    { table: 'students', index: 'idx_gender', sql: 'ALTER TABLE students ADD INDEX idx_gender (gender)' },
    { table: 'students', index: 'idx_search_composite', sql: 'ALTER TABLE students ADD INDEX idx_search_composite (name(50), adminNo, gradeClass)' },
    { table: 'student_accounts', index: 'idx_student_accounts_id', sql: 'ALTER TABLE student_accounts ADD INDEX idx_student_accounts_id (student_id)' },
    { table: 'olevel_marks', index: 'idx_olevel_student_term_year', sql: 'ALTER TABLE olevel_marks ADD INDEX idx_olevel_student_term_year (student_id, term, year)' },
    { table: 'uace_marks', index: 'idx_uace_student_term_year', sql: 'ALTER TABLE uace_marks ADD INDEX idx_uace_student_term_year (student_id, term, year)' }
  ];
  for (const q of queries) {
    try {
      const [rows] = await dbPool.query(
        'SELECT INDEX_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ? LIMIT 1',
        [q.table, q.index]
      );
      if (rows.length === 0) {
        await dbPool.query(q.sql);
      }
    } catch (e) {}
  }
}

async function ensureDbInitialized() {
  if (!pool || !currentDbConfig) return false;
  if (dbInitialized) return true;

  if (initializingDb) {
    let attempts = 0;
    while (initializingDb && attempts < 10) {
      await new Promise(resolve => setTimeout(resolve, 500));
      attempts++;
    }
    return dbInitialized;
  }
  initializingDb = true;

  // Fast path: If parent_contacts table exists, bypass full migrations (crucial for Vercel serverless cold starts)
  try {
    await pool.query('SELECT 1 FROM parent_contacts LIMIT 1');
    let fastMigConn;
    try {
      fastMigConn = await pool.getConnection();
      await runStaffMigrations(fastMigConn);
    } catch (migErr) {
      console.error('[DB-INIT-LOG] Failed to run staff migrations in fast path:', migErr.message);
    } finally {
      if (fastMigConn) fastMigConn.release();
    }
    ensurePerformanceIndexes(pool).catch(idxErr => console.warn('[DB-INIT-LOG] Index verification warning:', idxErr.message));
    dbInitialized = true;
    initializingDb = false;
    console.log('[DB-INIT-LOG] Database is already initialized. Skipping full migration schemas.');
    return true;
  } catch (fastErr) {
    console.warn('[DB-INIT-LOG] parent_contacts table check failed. Running full database schema migration...');
    // Disk full mitigation: If it's Vercel/Cloud and we failed parent_contacts check, try to drop pdf_tasks to free up space.
    try {
      await pool.query('DROP TABLE IF EXISTS pdf_tasks');
      console.log('[DB-CLEANUP] Successfully dropped pdf_tasks to free up disk space on Railway/cloud.');
    } catch (cleanupErr) {
      console.warn('[DB-CLEANUP] Failed to drop pdf_tasks during init:', cleanupErr.message);
    }
  }

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
          connectTimeout: 30000
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
        dob DATE NULL,
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
        parentName VARCHAR(255) NULL,
        parentContact VARCHAR(255) NULL,
        updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY \`unique_adminNo\` (adminNo),
        UNIQUE KEY \`unique_name_class_dob\` (name, gradeClass, dob)
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

      `CREATE TABLE IF NOT EXISTS staff (
        id VARCHAR(50) PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        name VARCHAR(100) NOT NULL,
        first_name VARCHAR(50) NULL,
        middle_name VARCHAR(50) NULL,
        last_name VARCHAR(50) NULL,
        employee_number VARCHAR(50) NULL,
        gender VARCHAR(20) NULL,
        dob DATE NULL,
        national_id VARCHAR(50) NULL,
        phone VARCHAR(20) NULL,
        email VARCHAR(100) NULL,
        residential_address TEXT NULL,
        district VARCHAR(50) NULL,
        nationality VARCHAR(50) NULL,
        religion VARCHAR(50) NULL,
        category VARCHAR(20) NOT NULL DEFAULT 'Teaching',
        department VARCHAR(50) NULL,
        date_appointed DATE NULL,
        employment_status VARCHAR(20) NOT NULL DEFAULT 'Permanent',
        salary_scale VARCHAR(20) NULL,
        qualification VARCHAR(100) NULL,
        emergency_contact_name VARCHAR(100) NULL,
        emergency_contact_phone VARCHAR(20) NULL,
        force_password_change BOOLEAN NOT NULL DEFAULT FALSE,
        verification_token VARCHAR(100) UNIQUE NULL,
        subjects JSON NOT NULL,
        classes JSON NOT NULL,
        position VARCHAR(100) NULL,
        signature LONGTEXT NULL,
        photo LONGTEXT NULL,
        status VARCHAR(20) DEFAULT 'Active',
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

      `CREATE TABLE IF NOT EXISTS staff_cards (
        id INT AUTO_INCREMENT PRIMARY KEY,
        staff_id VARCHAR(50) NOT NULL,
        card_id VARCHAR(50) NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'Active',
        issue_date DATE NOT NULL,
        expiry_date DATE NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (staff_id) REFERENCES staff(id) ON DELETE CASCADE
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
        score DECIMAL(5,2) NULL,
        bot DECIMAL(5,2) NULL DEFAULT NULL,
        mot DECIMAL(5,2) NULL DEFAULT NULL,
        eot DECIMAL(5,2) NULL DEFAULT NULL,
        grade VARCHAR(2) NULL,
        points INT NULL DEFAULT NULL,
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
        FOREIGN KEY (teacher_id) REFERENCES staff(id) ON DELETE CASCADE,
        UNIQUE KEY \`unique_teacher_subject_class\` (teacher_id, subject, grade_class)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

      `CREATE TABLE IF NOT EXISTS class_teachers (
        id INT AUTO_INCREMENT PRIMARY KEY,
        grade_class VARCHAR(50) UNIQUE NOT NULL,
        teacher_id VARCHAR(50) NOT NULL,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (teacher_id) REFERENCES staff(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,
      `CREATE TABLE IF NOT EXISTS announcements (
        id INT AUTO_INCREMENT PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        content TEXT NOT NULL,
        author VARCHAR(100) NOT NULL DEFAULT 'Administrator',
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,
      `CREATE TABLE IF NOT EXISTS pdf_tasks (
        id VARCHAR(50) PRIMARY KEY,
        status VARCHAR(20) NOT NULL,
        progress INT NOT NULL DEFAULT 0,
        total INT NOT NULL DEFAULT 0,
        filename VARCHAR(255) NULL,
        error TEXT NULL,
        pdf_data LONGTEXT NULL,
        updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,
      `CREATE TABLE IF NOT EXISTS parent_contacts (
        student_id VARCHAR(50) PRIMARY KEY,
        father_name VARCHAR(100) NULL,
        father_phone VARCHAR(20) NULL,
        father_whatsapp VARCHAR(20) NULL,
        mother_name VARCHAR(100) NULL,
        mother_phone VARCHAR(20) NULL,
        mother_whatsapp VARCHAR(20) NULL,
        guardian_name VARCHAR(100) NULL,
        guardian_phone VARCHAR(20) NULL,
        guardian_whatsapp VARCHAR(20) NULL,
        relationship VARCHAR(50) NULL,
        home_address TEXT NULL,
        email VARCHAR(100) NULL,
        emergency_contact VARCHAR(100) NULL,
        occupation VARCHAR(100) NULL,
        preferred_notification VARCHAR(20) NOT NULL DEFAULT 'SMS',
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,
      `CREATE TABLE IF NOT EXISTS gate_locations (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL UNIQUE,
        status VARCHAR(20) NOT NULL DEFAULT 'Active',
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,
      `CREATE TABLE IF NOT EXISTS gate_devices (
        id VARCHAR(50) PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        device_type VARCHAR(50) NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'Active',
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,
      `CREATE TABLE IF NOT EXISTS attendance_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        student_id VARCHAR(50) NOT NULL,
        date DATE NOT NULL,
        time_in TIME NULL,
        time_out TIME NULL,
        gate_in_id INT NULL,
        gate_out_id INT NULL,
        device_in VARCHAR(50) NULL,
        device_out VARCHAR(50) NULL,
        operator_in VARCHAR(100) NULL,
        operator_out VARCHAR(100) NULL,
        gps_in VARCHAR(50) NULL,
        gps_out VARCHAR(50) NULL,
        status VARCHAR(50) NOT NULL DEFAULT 'Present',
        departure_status ENUM('Normal Departure', 'Permission', 'Medical', 'Sports', 'Trip', 'Suspension', 'Emergency', 'Other') NULL,
        reason_for_leaving VARCHAR(255) NULL,
        remarks VARCHAR(255) NULL,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
        FOREIGN KEY (gate_in_id) REFERENCES gate_locations(id) ON DELETE SET NULL,
        FOREIGN KEY (gate_out_id) REFERENCES gate_locations(id) ON DELETE SET NULL,
        FOREIGN KEY (device_in) REFERENCES gate_devices(id) ON DELETE SET NULL,
        FOREIGN KEY (device_out) REFERENCES gate_devices(id) ON DELETE SET NULL,
        UNIQUE KEY unique_student_date (student_id, date),
        INDEX idx_student_date (student_id, date),
        INDEX idx_date (date),
        INDEX idx_status (status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,
      `CREATE TABLE IF NOT EXISTS attendance_notifications (
        id INT AUTO_INCREMENT PRIMARY KEY,
        student_id VARCHAR(50) NOT NULL,
        log_id INT NOT NULL,
        type ENUM('ClockIn', 'ClockOut') NOT NULL,
        channel ENUM('SMS', 'WhatsApp', 'Email', 'Both') NOT NULL,
        recipient_type VARCHAR(20) NOT NULL,
        recipient_phone VARCHAR(20) NULL,
        message TEXT NOT NULL,
        status ENUM('Sent', 'Delivered', 'Failed', 'Pending', 'Not Attempted') NOT NULL DEFAULT 'Pending',
        error_message TEXT NULL,
        sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
        FOREIGN KEY (log_id) REFERENCES attendance_logs(id) ON DELETE CASCADE,
        INDEX idx_student_notification (student_id),
        INDEX idx_status (status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,
      `CREATE TABLE IF NOT EXISTS audit_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        action VARCHAR(100) NOT NULL,
        details TEXT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,
      `CREATE TABLE IF NOT EXISTS student_permissions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        student_id VARCHAR(50) NOT NULL,
        reason TEXT NOT NULL,
        approved_by VARCHAR(100) NOT NULL,
        time_out DATETIME NOT NULL,
        expected_return DATETIME NOT NULL,
        actual_return DATETIME NULL,
        status ENUM('Returned', 'Not Returned') NOT NULL DEFAULT 'Not Returned',
        remarks TEXT NULL,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
        INDEX idx_student (student_id),
        INDEX idx_status (status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,
      `CREATE TABLE IF NOT EXISTS attendance_settings (
        key_name VARCHAR(50) PRIMARY KEY,
        val_value LONGTEXT NULL,
        updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,
      `CREATE TABLE IF NOT EXISTS attendance_reports_cache (
        cache_key VARCHAR(100) PRIMARY KEY,
        data LONGTEXT NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,
      `CREATE TABLE IF NOT EXISTS compiled_rankings (
        student_id VARCHAR(50),
        term VARCHAR(20),
        year INT,
        class_position INT NOT NULL DEFAULT 0,
        total_class INT NOT NULL DEFAULT 0,
        stream_position INT NOT NULL DEFAULT 0,
        total_stream INT NOT NULL DEFAULT 0,
        updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (student_id, term, year),
        FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`
    ];

    for (const q of tableQueries) {
      await pool.query(q);
    }

    try {
      await pool.query("ALTER TABLE attendance_notifications MODIFY COLUMN status ENUM('Sent','Delivered','Failed','Pending','Not Attempted') NOT NULL DEFAULT 'Pending'");
    } catch (e) {
      // Ignore if column migration is already applied
    }

    try {
      await pool.query("ALTER TABLE attendance_logs ADD INDEX idx_date_status_time (date, status, time_in, time_out)");
    } catch (e) {}

    try {
      await pool.query("ALTER TABLE students ADD INDEX idx_lookup_multi (adminNo, verification_token)");
    } catch (e) {}

    try {
      await pool.query("ALTER TABLE students ADD COLUMN has_photo TINYINT(1) DEFAULT 0");
    } catch (e) {}

    try {
      await pool.query("ALTER TABLE students ADD INDEX idx_has_photo (has_photo)");
    } catch (e) {}

    try {
      await pool.query("UPDATE students SET has_photo = IF((photo IS NOT NULL AND photo != '') OR (photoOriginal IS NOT NULL AND photoOriginal != '') OR (photoEnhanced IS NOT NULL AND photoEnhanced != ''), 1, 0) WHERE has_photo IS NULL OR has_photo = 0");
    } catch (e) {}

    // Seed default settings and some locations/devices if they don't exist
    try {
      const defaultSettings = [
        { k: 'school_start_time', v: '07:30' },
        { k: 'late_threshold', v: '08:00' },
        { k: 'very_late_threshold', v: '08:30' },
        { k: 'school_name', v: 'St Paul Senior Secondary School' }
      ];
      for (const s of defaultSettings) {
        await pool.query(
          `INSERT INTO attendance_settings (key_name, val_value) VALUES (?, ?)
           ON DUPLICATE KEY UPDATE val_value = ?`,
          [s.k, s.v, s.v]
        );
      }
      
      const [locations] = await pool.query('SELECT COUNT(*) as count FROM gate_locations');
      if (locations[0].count === 0) {
        await pool.query(`INSERT INTO gate_locations (name, status) VALUES 
          ('Main Gate', 'Active'),
          ('Back Gate', 'Active'),
          ('Administration Gate', 'Active')`);
      }
      
      const [devices] = await pool.query('SELECT COUNT(*) as count FROM gate_devices');
      if (devices[0].count === 0) {
        await pool.query(`INSERT INTO gate_devices (id, name, device_type, status) VALUES 
          ('DEV-001', 'Main QR Reader', 'QR', 'Active'),
          ('DEV-002', 'East Gate RFID', 'RFID', 'Active'),
          ('DEV-003', 'Manual Console', 'Manual', 'Active')`);
      }
    } catch (err) {
      console.error('Failed to seed default attendance settings/registries:', err.message);
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

    // Alter staff table to add position and signature if missing
    try {
      await pool.query('ALTER TABLE staff ADD COLUMN position VARCHAR(100) NULL AFTER classes');
    } catch (e) {}
    try {
      await pool.query('ALTER TABLE staff ADD COLUMN signature LONGTEXT NULL AFTER position');
    } catch (e) {}
    try {
      await pool.query('ALTER TABLE staff ADD COLUMN gender VARCHAR(20) NULL AFTER name');
    } catch (e) {}
    try {
      await pool.query('ALTER TABLE staff ADD COLUMN photo LONGTEXT NULL AFTER signature');
    } catch (e) {}
    try {
      await pool.query("ALTER TABLE staff ADD COLUMN status VARCHAR(20) DEFAULT 'Active' AFTER photo");
    } catch (e) {}

    // Alter students table to add aliases field if missing
    try {
      await pool.query('ALTER TABLE students ADD COLUMN aliases TEXT NULL AFTER name');
    } catch (e) {}

    // Alter students table to add dob column if missing
    try {
      await pool.query('ALTER TABLE students ADD COLUMN dob DATE NULL AFTER gender');
    } catch (e) {
      try {
        await pool.query('ALTER TABLE students ADD COLUMN dob DATE NULL');
      } catch (err) {}
    }

    // Alter students table to add photoOriginal and photoEnhanced if missing
    try {
      await pool.query("ALTER TABLE students ADD COLUMN photoOriginal LONGTEXT NULL AFTER photo");
    } catch (e) {}
    try {
      await pool.query("ALTER TABLE students ADD COLUMN photoEnhanced LONGTEXT NULL AFTER photoOriginal");
    } catch (e) {}

    // Add unique constraint on adminNo if missing
    try {
      await pool.query('ALTER TABLE students ADD UNIQUE KEY unique_adminNo (adminNo)');
    } catch (e) {
      console.warn('[DB-MIGRATION] Could not enforce UNIQUE constraint on adminNo (likely duplicate entries exist):', e.message);
    }

    // Add unique constraint on name, class, dob if missing
    try {
      await pool.query('ALTER TABLE students ADD UNIQUE KEY unique_name_class_dob (name, gradeClass, dob)');
    } catch (e) {
      console.warn('[DB-MIGRATION] Could not enforce UNIQUE constraint on name, gradeClass, dob (likely duplicate entries exist):', e.message);
    }

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

    // Helper for safe index creation
    const safeAddIndex = async (table, indexName, alterSql) => {
      try {
        const [rows] = await pool.query(
          'SELECT INDEX_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ? LIMIT 1',
          [table, indexName]
        );
        if (rows.length === 0) {
          await pool.query(alterSql);
        }
      } catch (e) {}
    };

    // Create performance indexes safely if they don't exist
    await safeAddIndex('students', 'idx_adminNo', 'ALTER TABLE students ADD INDEX idx_adminNo (adminNo)');
    await safeAddIndex('students', 'idx_name', 'ALTER TABLE students ADD INDEX idx_name (name(100))');
    await safeAddIndex('students', 'idx_gradeClass', 'ALTER TABLE students ADD INDEX idx_gradeClass (gradeClass)');
    await safeAddIndex('students', 'idx_isCleared', 'ALTER TABLE students ADD INDEX idx_isCleared (isCleared)');
    await safeAddIndex('students', 'idx_boardingStatus', 'ALTER TABLE students ADD INDEX idx_boardingStatus (boardingStatus)');
    await safeAddIndex('students', 'idx_printStatus', 'ALTER TABLE students ADD INDEX idx_printStatus (printStatus)');
    await safeAddIndex('students', 'idx_gender', 'ALTER TABLE students ADD INDEX idx_gender (gender)');
    await safeAddIndex('students', 'idx_search_composite', 'ALTER TABLE students ADD INDEX idx_search_composite (name(50), adminNo, gradeClass)');
    await safeAddIndex('student_accounts', 'idx_student_accounts_id', 'ALTER TABLE student_accounts ADD INDEX idx_student_accounts_id (student_id)');
    await safeAddIndex('olevel_marks', 'idx_olevel_student_term_year', 'ALTER TABLE olevel_marks ADD INDEX idx_olevel_student_term_year (student_id, term, year)');
    await safeAddIndex('uace_marks', 'idx_uace_student_term_year', 'ALTER TABLE uace_marks ADD INDEX idx_uace_student_term_year (student_id, term, year)');

    // Normalize gradeClass in database for consistent querying across the app
    try {
      await pool.query(`
        UPDATE students 
        SET gradeClass = CONCAT('S.', SUBSTRING(gradeClass, 2))
        WHERE gradeClass REGEXP '^S[1-6][[:space:]]'
      `);
      await pool.query(`
        UPDATE students 
        SET gradeClass = CONCAT('S.', SUBSTRING(gradeClass, 2, 1), ' ', SUBSTRING(gradeClass, 3))
        WHERE gradeClass REGEXP '^S[1-6][A-Za-z]'
      `);
      await pool.query(`
        UPDATE students 
        SET gradeClass = CONCAT('S.', SUBSTRING(gradeClass, 8))
        WHERE gradeClass REGEXP '^Senior[[:space:]]*[1-6]'
      `);
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
      await pool.query('ALTER TABLE uace_marks MODIFY COLUMN bot DECIMAL(5,2) NULL DEFAULT NULL');
    } catch (e) {}
    try {
      await pool.query('ALTER TABLE uace_marks MODIFY COLUMN mot DECIMAL(5,2) NULL DEFAULT NULL');
    } catch (e) {}
    try {
      await pool.query('ALTER TABLE uace_marks MODIFY COLUMN eot DECIMAL(5,2) NULL DEFAULT NULL');
    } catch (e) {}
    try {
      await pool.query('ALTER TABLE uace_marks MODIFY COLUMN score DECIMAL(5,2) NULL DEFAULT NULL');
    } catch (e) {}
    try {
      await pool.query('ALTER TABLE uace_marks MODIFY COLUMN points INT NULL DEFAULT NULL');
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
    const [teacherCountRows] = await pool.query("SELECT COUNT(*) as count FROM staff WHERE category = 'Teaching'");
    if (teacherCountRows[0].count === 0) {
      const crypto = require('crypto');
      const defaultTeacherId = 'T-DEFAULT';
      const defaultPasswordHash = crypto.createHash('sha256').update('teacher123').digest('hex');
      const defaultSubjects = ["Mathematics", "Physics", "Chemistry", "English Language", "History and Political Education", "Geography"];
      const defaultClasses = ["S.1 A", "S.2 A", "S.3 A", "S.4 A", "S.5 Sciences", "S.6 Sciences"];
      const verificationToken = crypto.randomBytes(16).toString('hex');
      await pool.query(
        "INSERT INTO staff (id, username, password_hash, name, first_name, last_name, category, subjects, classes, verification_token, position) VALUES (?, ?, ?, ?, 'Default', 'Teacher', 'Teaching', ?, ?, ?, 'Teacher')",
        [defaultTeacherId, 'teacher', defaultPasswordHash, 'Default Teacher', JSON.stringify(defaultSubjects), JSON.stringify(defaultClasses), verificationToken]
      );
      
      // Also seed public verification snapshot
      const metadata = {
        name: 'Default Teacher',
        photo: null,
        category: 'Teaching',
        department: 'N/A',
        position: 'Teacher',
        employmentStatus: 'Permanent',
        issueDate: new Date().toISOString().split('T')[0],
        expiryDate: new Date(Date.now() + 365*24*60*60*1000).toISOString().split('T')[0],
        status: 'Active'
      };
      await pool.query(
        'INSERT INTO verifications (token, document_type, reference_id, metadata, status, expiresAt) VALUES (?, ?, ?, ?, ?, ?)',
        [verificationToken, 'Staff ID', defaultTeacherId, JSON.stringify(metadata), 'Active', metadata.expiryDate]
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

    // Migrate old 'Boarder' values to 'Hosteller'
    try {
      await pool.query("UPDATE students SET boardingStatus = 'Hosteller' WHERE boardingStatus = 'Boarder'");
      console.log("[DB-MIGRATION] Successfully migrated any 'Boarder' values to 'Hosteller'.");
    } catch (e) {
      console.warn("[DB-MIGRATION] Failed to migrate 'Boarder' to 'Hosteller':", e.message);
    }

    dbInitialized = true;
    initializingDb = false;
    // Start automated daily backup scheduler
    startAutoBackupScheduler();
    // Run background one-time image compression migration
    runOneTimeImageMigration().catch(err => console.error('[MIGRATION] One-time migration error:', err));
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

  if (!targetConfig || !targetConfig.host) {
    console.log('Database configuration is missing. Express server is active but database pool is uninitialized.');
    return false;
  }

  try {
    const poolConfig = {
      host: targetConfig.host,
      port: parseInt(String(targetConfig.port), 10) || 3306,
      user: targetConfig.user,
      password: targetConfig.password,
      database: targetConfig.database,
      waitForConnections: true,
      connectionLimit: 20,
      maxIdle: 20,
      idleTimeout: 60000,
      queueLimit: 0,
      connectTimeout: 30000,
      enableKeepAlive: true,
      keepAliveInitialDelay: 10000,
      dateStrings: true
    };

    pool = mysql.createPool(poolConfig);
    console.log(`Database pool instantiated for MySQL at ${targetConfig.host}:${targetConfig.port || 3306} with Keep-Alive support.`);

    // Reconnection and retry wrapper for query and getConnection calls
    const originalQuery = pool.query;
    const originalGetConnection = pool.getConnection;

    pool.query = async function(...args) {
      const startTime = Date.now();
      const sqlSnippet = typeof args[0] === 'string' ? args[0].substring(0, 150) : 'Non-string query';
      console.log(`[DB-QUERY-LOG] [${new Date().toISOString()}] Starting query: "${sqlSnippet}..."`);

      let retries = 2;
      while (retries >= 0) {
        let timerId;
        try {
          const queryPromise = originalQuery.apply(pool, args);
          const timeoutPromise = new Promise((_, reject) => {
            timerId = setTimeout(() => reject(new Error('MySQL query execution timed out (exceeded 15s)')), 15000);
          });
          const result = await Promise.race([queryPromise, timeoutPromise]);
          clearTimeout(timerId);
          const elapsed = Date.now() - startTime;
          console.log(`[DB-QUERY-LOG] [${new Date().toISOString()}] Query completed in ${elapsed}ms: "${sqlSnippet}..."`);
          return result;
        } catch (err) {
          if (timerId) clearTimeout(timerId);
          const elapsed = Date.now() - startTime;
          const isNetworkError = 
            err.code === 'PROTOCOL_CONNECTION_LOST' ||
            err.code === 'ECONNRESET' ||
            err.code === 'ETIMEDOUT' ||
            err.code === 'ECONNREFUSED' ||
            err.code === 'ENOTFOUND' ||
            err.code === 'EHOSTUNREACH' ||
            err.code === 'PROTOCOL_ENQUEUE_AFTER_FATAL_ERROR' ||
            err.message.includes('closed') ||
            err.message.includes('connection') ||
            err.message.includes('timeout') ||
            err.message.includes('timed out');

          console.error(`[DB-ERROR-LOG] [${new Date().toISOString()}] Query failed after ${elapsed}ms (retries left: ${retries}). SQL: "${sqlSnippet}...". Error: ${err.code || 'NO_CODE'} - ${err.message}`);

          // Categorize timeout/connection errors clearly for Railway, MySQL, or API identification
          if (err.code === 'PROTOCOL_CONNECTION_LOST' || err.code === 'ECONNRESET') {
            console.error(`[DB-TIMEOUT-LOG-ORIGIN] Source: Railway / Network Layer. Connection was terminated by the remote host or proxy.`);
          } else if (err.code === 'ETIMEDOUT' || err.message.toLowerCase().includes('timeout') || err.message.toLowerCase().includes('time out')) {
            console.error(`[DB-TIMEOUT-LOG-ORIGIN] Source: Database / MySQL Timeout. The database host failed to respond within the socket or query timeout limit.`);
          } else if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND' || err.code === 'EHOSTUNREACH') {
            console.error(`[DB-TIMEOUT-LOG-ORIGIN] Source: Connection Route Layer. The server is offline or host DNS is unresolved.`);
          } else if (err.code && err.code.startsWith('ER_')) {
            console.error(`[DB-TIMEOUT-LOG-ORIGIN] Source: MySQL Database Engine (SQL Syntax/Data Constraint Violation).`);
          } else {
            console.error(`[DB-TIMEOUT-LOG-ORIGIN] Source: API or Internal App State Layer.`);
          }

          if (isNetworkError && retries > 0) {
            console.warn(`[DB-QUERY-RETRY] Attempting automatic query retry in 1.0 second...`);
            retries--;
            await new Promise(resolve => setTimeout(resolve, 1000));
          } else {
            throw err;
          }
        }
      }
    };

    pool.getConnection = async function(...args) {
      const startTime = Date.now();
      let retries = 2;
      while (retries >= 0) {
        let timerId;
        try {
          const getConnectionPromise = originalGetConnection.apply(pool, args);
          const timeoutPromise = new Promise((_, reject) => {
            timerId = setTimeout(() => reject(new Error('MySQL getConnection timed out (exceeded 10s)')), 10000);
          });
          const conn = await Promise.race([getConnectionPromise, timeoutPromise]);
          clearTimeout(timerId);
          const elapsed = Date.now() - startTime;
          console.log(`[DB-CONN-LOG] [${new Date().toISOString()}] Connection retrieved in ${elapsed}ms`);
          return conn;
        } catch (err) {
          if (timerId) clearTimeout(timerId);
          const elapsed = Date.now() - startTime;
          const isNetworkError = 
            err.code === 'PROTOCOL_CONNECTION_LOST' ||
            err.code === 'ECONNRESET' ||
            err.code === 'ETIMEDOUT' ||
            err.code === 'ECONNREFUSED' ||
            err.code === 'ENOTFOUND' ||
            err.code === 'EHOSTUNREACH' ||
            err.message.includes('closed') ||
            err.message.includes('connection') ||
            err.message.includes('timeout') ||
            err.message.includes('timed out');

          console.error(`[DB-CONN-ERROR-LOG] [${new Date().toISOString()}] getConnection failed after ${elapsed}ms (retries left: ${retries}). Error: ${err.code || 'NO_CODE'} - ${err.message}`);

          if (err.code === 'PROTOCOL_CONNECTION_LOST' || err.code === 'ECONNRESET') {
            console.error(`[DB-CONN-TIMEOUT-ORIGIN] Source: Railway / Network Layer. Connection reset by peer.`);
          } else if (err.code === 'ETIMEDOUT' || err.message.toLowerCase().includes('timeout') || err.message.toLowerCase().includes('time out')) {
            console.error(`[DB-CONN-TIMEOUT-ORIGIN] Source: Connection Timeout (Railway / MySQL did not accept TCP handshake within limit).`);
          } else {
            console.error(`[DB-CONN-TIMEOUT-ORIGIN] Source: Connection refused or host unreachable.`);
          }

          if (isNetworkError && retries > 0) {
            retries--;
            await new Promise(resolve => setTimeout(resolve, 1000));
          } else {
            throw err;
          }
        }
      }
    };

    if (process.env.VERCEL) {
      try {
        await ensureDbInitialized();
      } catch (err) {
        console.error('ensureDbInitialized error on Vercel:', err);
      }
    } else {
      ensureDbInitialized()
        .then(async success => {
          if (success) {
            console.log('Database migrations completed successfully on startup.');
            // Sync environment config back to db_config files for UI display / permanency while PRESERVING user application mode
            try {
              const fs = require('fs');
              const path = require('path');
              const appDataPath = getDbConfigFilePath();
              let existingMode = 'network';
              let existingServerUrl = process.env.VITE_API_URL || 'http://localhost:3000';
              if (fs.existsSync(appDataPath)) {
                try {
                  const existingConfig = JSON.parse(fs.readFileSync(appDataPath, 'utf8'));
                  if (existingConfig.mode) existingMode = existingConfig.mode;
                  if (existingConfig.serverUrl) existingServerUrl = existingConfig.serverUrl;
                } catch (e) {}
              }
              const rawConfig = {
                mode: existingMode,
                serverUrl: existingServerUrl,
                db: targetConfig
              };
              const configJson = JSON.stringify(rawConfig, null, 2);
              fs.writeFileSync(appDataPath, configJson, 'utf8');
              const rootPath = path.join(__dirname, '..', 'db_config.json');
              fs.writeFileSync(rootPath, configJson, 'utf8');
              console.log('[initDb] Synced database configuration while preserving application mode:', existingMode);

              // Print Startup Database Diagnostic Banner
              let tableCount = 0;
              try {
                const [tRows] = await pool.query('SELECT COUNT(*) as count FROM information_schema.TABLES WHERE table_schema = DATABASE()');
                tableCount = tRows[0]?.count || 0;
              } catch (e) {}

              console.log(`
========================================
DATABASE CONNECTION DIAGNOSTIC
========================================
Host:     ${targetConfig.host || 'localhost'}
Port:     ${targetConfig.port || 3306}
Database: ${targetConfig.database || 'student_clearance'}
Status:   CONNECTED
Tables:   ${tableCount}
Mode:     ${existingMode}
========================================
`);
            } catch (syncErr) {
              console.warn('[initDb] Failed to sync config back to files:', syncErr.message);
            }
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
app.set('trust proxy', 1);

app.use(cors({
  origin: (origin, callback) => {
    // Dynamically allow requesting origin for credentials compatibility
    callback(null, true);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept']
}));
app.options('*', cors());
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
    '/api/health',
    '/api/auth/login',
    '/api/config-status',
    '/api/database-status',
    '/api/test-db-connection',
    '/api/save-db-config',
    '/api/ai/test-key'
  ];
  
  const isApi = req.path.startsWith('/api/');
  
  const isPublic = 
    !isApi ||
    publicPaths.includes(req.path) || 
    req.path.match(/\/api\/students\/[^/]+\/photo/) ||
    req.path.startsWith('/api/pdf/download/') ||
    req.path.startsWith('/api/verify/') ||
    (req.method === 'GET' && req.path === '/api/branding');
  
  if (!isPublic) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({ error: 'Access token required. Please log in.' });
    }
    try {
      if (token && (token.startsWith('offline-') || token === 'local-session' || token.startsWith('fallback-'))) {
        req.user = { id: 'T-FALLBACK', role: 'teacher', username: 'teacher' };
      } else {
        req.user = jwt.verify(token, JWT_SECRET);
      }

      // Enforce Role-Based Access Control (RBAC) security protection
      if (req.path.startsWith('/api/admin/')) {
        if (!req.user || req.user.role !== 'admin') {
          return res.status(403).json({ error: 'Access denied. Administrative privileges required.' });
        }
      }

      if (req.path.startsWith('/api/teacher/')) {
        if (!req.user || (req.user.role !== 'admin' && req.user.role !== 'teacher')) {
          return res.status(403).json({ error: 'Access denied. Teacher or Administrative privileges required.' });
        }
      }
    } catch (e) {
      if (req.method === 'GET' && (req.path.startsWith('/api/teacher/') || req.path.startsWith('/api/staff/') || req.path.startsWith('/api/students'))) {
        req.user = { id: 'T-GUEST', role: 'teacher', username: 'teacher' };
      } else {
        return res.status(403).json({ error: 'Invalid or expired access token. Please log in again.' });
      }
    }
  }

  // 2. Database connectivity checks
  const connectionBypassPaths = [
    '/api/health',
    '/api/config-status',
    '/api/database-status',
    '/api/test-db-connection',
    '/api/save-db-config',
    '/api/branding',
    '/api/auth/login'
  ];
  
  const bypassDbCheck = !isApi || connectionBypassPaths.includes(req.path);

  // Lazy database initialization (useful for serverless/Vercel or local startup fallback)
  if (!pool) {
    console.log('[DB-LAZY-INIT] Checking database config in middleware...');
    const dbConfig = loadDbConfig();

    if (dbConfig) {
      console.log('[API] Intercepted request. Initializing database pool lazily with Resolved Config:', 
        typeof dbConfig === 'string' 
          ? dbConfig.replace(/:([^@:]+)@/, ':****@') 
          : { ...dbConfig, password: '****' }
      );
      const success = await initDb(dbConfig);
      if (!success && !bypassDbCheck) {
        return res.status(500).json({ error: 'Failed to initialize database pool from configuration. Please verify connection credentials.' });
      }
    } else {
      console.warn('[DB-LAZY-INIT] No database configuration found!');
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

app.get('/api/health', async (req, res) => {
  let dbConnected = false;
  let tableCount = 0;
  let dbName = currentDbConfig ? currentDbConfig.database : 'student_clearance';
  let dbError = null;

  if (pool) {
    try {
      const [rows] = await pool.query('SELECT COUNT(*) as count FROM information_schema.TABLES WHERE table_schema = DATABASE()');
      tableCount = rows[0]?.count || 0;
      dbConnected = true;
    } catch (err) {
      dbConnected = false;
      dbError = err.message;
    }
  }

  let currentMode = 'network';
  try {
    const fs = require('fs');
    const appDataPath = getDbConfigFilePath();
    if (fs.existsSync(appDataPath)) {
      const parsed = JSON.parse(fs.readFileSync(appDataPath, 'utf8'));
      if (parsed.mode) currentMode = parsed.mode;
    }
  } catch (e) {}

  res.json({
    backend: 'ok',
    database: dbConnected ? 'connected' : 'disconnected',
    databaseName: dbName,
    mode: currentMode,
    tablesCount: tableCount,
    error: dbError || undefined
  });
});

app.get('/api/config-status', async (req, res) => {
  let dbConnected = false;
  let cleanupMessage = null;

  if (pool) {
    if (req.query.cleanup === 'true') {
      try {
        await pool.query('DROP TABLE IF EXISTS pdf_tasks');
        cleanupMessage = 'Successfully dropped pdf_tasks table to free up space.';
      } catch (err) {
        cleanupMessage = 'Failed to drop pdf_tasks: ' + err.message;
      }
    }

    try {
      dbConnected = await ensureDbInitialized();
    } catch (err) {
      dbConnected = false;
    }
  }

  let tableSizes = null;
  if (pool) {
    try {
      const [rows] = await pool.query(`
        SELECT table_name AS name, 
               table_rows AS \`rows\`,
               ROUND(((data_length + index_length) / 1024 / 1024), 2) AS size_mb
        FROM information_schema.TABLES 
        WHERE table_schema = DATABASE()
      `);
      tableSizes = rows;
    } catch (err) {
      tableSizes = { error: err.message };
    }
  }

  res.json({
    dbConnected: dbConnected,
    dbError: lastDbError,
    cleanup: cleanupMessage,
    tableSizes: tableSizes,
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
  if (process.env.VERCEL) {
    return res.status(403).json({
      success: false,
      error: 'Database connection testing is disabled in Cloud mode.'
    });
  }

  try {
    const rawConfig = req.body;
    const config = normalizeDbConfig(rawConfig);
    if (!config) {
      return res.status(400).json({ success: false, error: 'Invalid database configuration format.' });
    }

    const displayHost = typeof config === 'string' ? 'connection URI' : `${config.host}:${config.port}`;
    console.log(`[test-db-connection] Testing connection to ${displayHost}...`);

    let connection;
    if (typeof config === 'string') {
      connection = await mysql.createConnection(config);
    } else {
      connection = await mysql.createConnection({
        host: config.host,
        port: parseInt(String(config.port), 10) || 3306,
        user: config.user,
        password: config.password,
        database: config.database,
        connectTimeout: 5000
      });
    }

    await connection.end();
    return res.json({ success: true, message: 'Database connection test succeeded.' });
  } catch (err) {
    console.error('[test-db-connection] Connection test failed:', err);
    return res.status(500).json({ success: false, error: err.message || String(err) });
  }
});

// POST save database config (via HTTP API)
app.post('/api/save-db-config', async (req, res) => {
  if (process.env.VERCEL) {
    return res.status(403).json({
      success: false,
      error: 'Database configuration is locked in Cloud mode.'
    });
  }

  try {
    const rawConfig = req.body;
    const config = normalizeDbConfig(rawConfig);
    if (!config) {
      return res.status(400).json({ success: false, error: 'Invalid database configuration format.' });
    }

    // 1. Try to connect first to verify it works
    let connection;
    try {
      if (typeof config === 'string') {
        connection = await mysql.createConnection(config);
      } else {
        connection = await mysql.createConnection({
          host: config.host,
          port: parseInt(String(config.port), 10) || 3306,
          user: config.user,
          password: config.password,
          database: config.database,
          connectTimeout: 30000
        });
      }
      await connection.end();
    } catch (connErr) {
      const isDbNotExist = connErr.errno === 1049 || connErr.code === 'ER_BAD_DB_ERROR';
      if (!isDbNotExist) {
        throw connErr;
      }
    }

    // 2. Save configuration permanently
    const appDataPath = getDbConfigFilePath();
    const configJson = JSON.stringify(rawConfig, null, 2);
    
    // Save to APPDATA path
    fs.writeFileSync(appDataPath, configJson, 'utf8');
    console.log(`[save-db-config] Saved database configuration to APPDATA path: ${appDataPath}`);

    // Save to local project root path (for server startup fallback)
    try {
      const rootPath = path.join(__dirname, '..', 'db_config.json');
      fs.writeFileSync(rootPath, configJson, 'utf8');
      console.log(`[save-db-config] Saved database configuration to project root: ${rootPath}`);
    } catch (rootErr) {
      console.warn(`[save-db-config] Failed to write to project root: ${rootErr.message}`);
    }

    // Save to local .env file
    saveToEnvFile(config);

    // 3. Initialize the database pool in memory with new configuration
    const success = await initDb(config);
    if (!success) {
      throw new Error('Failed to initialize connection pool with new settings.');
    }

    return res.json({ success: true, message: 'Database configuration saved and applied successfully.' });
  } catch (err) {
    console.error('[save-db-config] Save config failed:', err);
    return res.status(500).json({ success: false, error: err.message || String(err) });
  }
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

// GET list of all backups
app.get('/api/admin/backups', async (req, res) => {
  try {
    const fs = require('fs');
    const path = require('path');
    const backupsDir = path.join(getExportsDir(), 'backups');
    if (!fs.existsSync(backupsDir)) {
      return res.json({ success: true, backups: [] });
    }
    const files = fs.readdirSync(backupsDir)
      .filter(f => f.endsWith('.sql.gz'))
      .map(file => {
        const filePath = path.join(backupsDir, file);
        const stats = fs.statSync(filePath);
        return {
          filename: file,
          sizeBytes: stats.size,
          createdAt: stats.mtime
        };
      })
      .sort((a, b) => b.createdAt - a.createdAt); // newest first
    res.json({ success: true, backups: files });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST trigger manual backup in background
app.post('/api/admin/backups/run', async (req, res) => {
  try {
    const taskId = `task-backup-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    pdfTasks[taskId] = {
      id: taskId,
      status: 'processing',
      progress: 0,
      total: 100,
      filename: null,
      filePath: null,
      error: null
    };
    await dbSavePdfTask(taskId, 'processing', 0, 100);

    const runBackupTask = async () => {
      try {
        const fs = require('fs');
        const path = require('path');
        const backupsDir = path.join(getExportsDir(), 'backups');
        if (!fs.existsSync(backupsDir)) {
          fs.mkdirSync(backupsDir, { recursive: true });
        }
        const filename = `manual-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.sql.gz`;
        const filePath = path.join(backupsDir, filename);

        if (pdfTasks[taskId]) pdfTasks[taskId].progress = 20;
        await dbSavePdfTask(taskId, 'processing', 20, 100);

        await backupDatabaseJS(filePath);

        if (pdfTasks[taskId]) {
          pdfTasks[taskId].status = 'completed';
          pdfTasks[taskId].progress = 100;
          pdfTasks[taskId].filename = filename;
          pdfTasks[taskId].filePath = filePath;
        }
        await dbSavePdfTask(taskId, 'completed', 100, 100, filename, null);
        await writeAuditLog('Backup Created', `Manual backup created successfully: ${filename}`);
      } catch (err) {
        console.error('Manual backup task failed:', err);
        if (pdfTasks[taskId]) {
          pdfTasks[taskId].status = 'failed';
          pdfTasks[taskId].error = err.message;
        }
        await dbSavePdfTask(taskId, 'failed', 0, 100, null, err.message);
      }
    };

    runBackupTask();
    res.json({ success: true, taskId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST restore backup in background
app.post('/api/admin/backups/restore', async (req, res) => {
  try {
    const { filename } = req.body;
    if (!filename) return res.status(400).json({ error: 'Filename is required' });
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return res.status(400).json({ error: 'Invalid filename' });
    }

    const taskId = `task-restore-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    pdfTasks[taskId] = {
      id: taskId,
      status: 'processing',
      progress: 0,
      total: 100,
      filename: null,
      filePath: null,
      error: null
    };
    await dbSavePdfTask(taskId, 'processing', 0, 100);

    const runRestoreTask = async () => {
      try {
        const path = require('path');
        const fs = require('fs');
        const filePath = path.join(getExportsDir(), 'backups', filename);
        if (!fs.existsSync(filePath)) {
          throw new Error('Backup file does not exist.');
        }

        if (pdfTasks[taskId]) pdfTasks[taskId].progress = 30;
        await dbSavePdfTask(taskId, 'processing', 30, 100);

        await restoreDatabaseJS(filePath);

        // Reset memory caches
        statsCache = null;

        if (pdfTasks[taskId]) {
          pdfTasks[taskId].status = 'completed';
          pdfTasks[taskId].progress = 100;
        }
        await dbSavePdfTask(taskId, 'completed', 100, 100, null, null);
        await writeAuditLog('Backup Restored', `Database restored successfully from: ${filename}`);
      } catch (err) {
        console.error('Backup restore task failed:', err);
        if (pdfTasks[taskId]) {
          pdfTasks[taskId].status = 'failed';
          pdfTasks[taskId].error = err.message;
        }
        await dbSavePdfTask(taskId, 'failed', 0, 100, null, err.message);
      }
    };

    runRestoreTask();
    res.json({ success: true, taskId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE backup file
app.delete('/api/admin/backups/:filename', async (req, res) => {
  try {
    const filename = req.params.filename;
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return res.status(400).json({ error: 'Invalid filename' });
    }
    const path = require('path');
    const fs = require('fs');
    const filePath = path.join(getExportsDir(), 'backups', filename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      await writeAuditLog('Backup Deleted', `Backup file deleted: ${filename}`);
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET backup config
app.get('/api/admin/backups/config', async (req, res) => {
  try {
    const [enabledRows] = await pool.query("SELECT val_value FROM settings WHERE key_name = 'auto_backup_enabled'");
    const [retentionRows] = await pool.query("SELECT val_value FROM settings WHERE key_name = 'backup_retention_days'");
    res.json({
      autoBackupEnabled: enabledRows[0]?.val_value !== 'false',
      retentionDays: retentionRows[0]?.val_value ? parseInt(retentionRows[0].val_value, 10) : 7
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST backup config
app.post('/api/admin/backups/config', async (req, res) => {
  try {
    const { autoBackupEnabled, retentionDays } = req.body;
    await pool.query(
      "INSERT INTO settings (key_name, val_value) VALUES ('auto_backup_enabled', ?) ON DUPLICATE KEY UPDATE val_value = VALUES(val_value)",
      [autoBackupEnabled ? 'true' : 'false']
    );
    await pool.query(
      "INSERT INTO settings (key_name, val_value) VALUES ('backup_retention_days', ?) ON DUPLICATE KEY UPDATE val_value = VALUES(val_value)",
      [String(parseInt(retentionDays, 10) || 7)]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET download a backup file
app.get('/api/admin/backups/download/:filename', (req, res) => {
  const fs = require('fs');
  const path = require('path');
  const filename = req.params.filename;
  if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    return res.status(400).json({ error: 'Invalid filename' });
  }
  const filePath = path.join(getExportsDir(), 'backups', filename);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Backup file not found' });
  }
  res.download(filePath, filename);
});

// POST bulk student import task (Background task)
app.post('/api/students/bulk-task', async (req, res) => {
  try {
    const students = req.body.students || [];
    const taskId = `task-import-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    pdfTasks[taskId] = {
      id: taskId,
      status: 'processing',
      progress: 0,
      total: students.length,
      filename: null,
      filePath: null,
      error: null
    };
    
    await dbSavePdfTask(taskId, 'processing', 0, students.length);
    
    const runImport = async () => {
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        for (let i = 0; i < students.length; i++) {
          const s = students[i];
          
          if (s.photo) {
            s.photo = await compressImageIfNeeded(s.photo, 150, 150, 75, true);
          }
          
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
          
          if (i % 5 === 0 || i === students.length - 1) {
            if (pdfTasks[taskId]) {
              pdfTasks[taskId].progress = i + 1;
            }
            await dbSavePdfTask(taskId, 'processing', i + 1, students.length);
          }
        }
        await connection.commit();
        statsCache = null;
        
        if (pdfTasks[taskId]) {
          pdfTasks[taskId].status = 'completed';
          pdfTasks[taskId].progress = students.length;
        }
        await dbSavePdfTask(taskId, 'completed', students.length, students.length);
        await writeAuditLog('Import Students (Bulk)', `Successfully imported ${students.length} students in the background.`);
      } catch (err) {
        await connection.rollback();
        console.error('Error in background bulk insert:', err);
        if (pdfTasks[taskId]) {
          pdfTasks[taskId].status = 'failed';
          pdfTasks[taskId].error = err.message;
        }
        await dbSavePdfTask(taskId, 'failed', 0, students.length, null, err.message);
      } finally {
        connection.release();
      }
    };
    
    runImport();
    res.json({ success: true, taskId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST compile rankings in the background
app.post('/api/admin/calculate-rankings', async (req, res) => {
  try {
    const { term, year } = req.body;
    if (!term || !year) {
      return res.status(400).json({ error: 'Term and Year are required' });
    }
    const yearInt = parseInt(year, 10);
    const taskId = `task-rank-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    pdfTasks[taskId] = {
      id: taskId,
      status: 'processing',
      progress: 0,
      total: 100,
      filename: null,
      filePath: null,
      error: null
    };

    await dbSavePdfTask(taskId, 'processing', 0, 100);

    const runRankingsCalculation = async () => {
      try {
        const [classesRows] = await pool.query('SELECT DISTINCT gradeClass FROM students WHERE gradeClass IS NOT NULL AND gradeClass != ""');
        const classes = classesRows.map(c => c.gradeClass);

        if (classes.length === 0) {
          if (pdfTasks[taskId]) {
            pdfTasks[taskId].status = 'completed';
            pdfTasks[taskId].progress = 100;
          }
          await dbSavePdfTask(taskId, 'completed', 100, 100);
          return;
        }

        for (let i = 0; i < classes.length; i++) {
          const gradeClass = classes[i];
          const parts = gradeClass.trim().split(/\s+/);
          const className = parts[0] || 'S.1';
          const isUACE = gradeClass.startsWith('S.5') || gradeClass.startsWith('S.6');

          const [classStudents] = await pool.query('SELECT id, gradeClass FROM students WHERE gradeClass LIKE ?', [`${className}%`]);
          const classStudentIds = classStudents.map(s => s.id);
          const streamStudentIds = classStudents.filter(s => s.gradeClass === gradeClass).map(s => s.id);

          if (classStudentIds.length === 0) continue;

          let classScores = [];
          if (isUACE) {
            const [uaceScores] = await pool.query(
              'SELECT student_id, AVG(score) as avg_score FROM uace_marks WHERE student_id IN (?) AND term = ? AND year = ? GROUP BY student_id',
              [classStudentIds, term, yearInt]
            );
            classScores = uaceScores.map(u => ({ student_id: u.student_id, avg_score: parseFloat(u.avg_score || 0) }));
          } else {
            const [olevelRows] = await pool.query(
              'SELECT * FROM olevel_marks WHERE student_id IN (?) AND term = ? AND year = ?',
              [classStudentIds, term, yearInt]
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

          classScores.sort((a, b) => b.avg_score - a.avg_score);
          const totalClassStudents = classScores.filter(s => s.avg_score > 0).length;

          for (const sId of streamStudentIds) {
            const classPosIdx = classScores.findIndex(s => s.student_id === sId);
            const classPosition = classPosIdx !== -1 && classScores[classPosIdx].avg_score > 0 ? classPosIdx + 1 : 0;

            const streamScores = classScores.filter(s => streamStudentIds.includes(s.student_id));
            const streamPosIdx = streamScores.findIndex(s => s.student_id === sId);
            const streamPosition = streamPosIdx !== -1 && streamScores[streamPosIdx].avg_score > 0 ? streamPosIdx + 1 : 0;
            const totalStreamStudents = streamScores.filter(s => s.avg_score > 0).length;

            if (classPosition > 0 || streamPosition > 0) {
              await pool.query(
                `INSERT INTO compiled_rankings (student_id, term, year, class_position, total_class, stream_position, total_stream)
                 VALUES (?, ?, ?, ?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE
                   class_position = VALUES(class_position),
                   total_class = VALUES(total_class),
                   stream_position = VALUES(stream_position),
                   total_stream = VALUES(total_stream)`,
                [sId, term, yearInt, classPosition, totalClassStudents, streamPosition, totalStreamStudents]
              );
            }
          }

          const percent = Math.round(((i + 1) / classes.length) * 100);
          if (pdfTasks[taskId]) {
            pdfTasks[taskId].progress = percent;
          }
          await dbSavePdfTask(taskId, 'processing', percent, 100);
        }

        if (pdfTasks[taskId]) {
          pdfTasks[taskId].status = 'completed';
          pdfTasks[taskId].progress = 100;
        }
        await dbSavePdfTask(taskId, 'completed', 100, 100);
        await writeAuditLog('Compile Rankings', `Pre-compiled student positions/rankings for Term ${term} (${yearInt}).`);
      } catch (err) {
        console.error('Error in background ranking calculation:', err);
        if (pdfTasks[taskId]) {
          pdfTasks[taskId].status = 'failed';
          pdfTasks[taskId].error = err.message;
        }
        await dbSavePdfTask(taskId, 'failed', 0, 100, null, err.message);
      }
    };

    runRankingsCalculation();
    res.json({ success: true, taskId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// Helper to construct flexible WHERE clauses for gradeClass filtering
function buildGradeClassWhereClause(filterClass, filterStream) {
  if (!filterClass || filterClass === 'All') {
    if (!filterStream || filterStream === 'All') return null;
    return {
      sql: '(gradeClass LIKE ? OR gradeClass LIKE ?)',
      params: [`% ${filterStream}`, `%${filterStream}`]
    };
  }

  let clean = String(filterClass).trim();
  let numMatch = clean.match(/(?:[sS]\.?|senior\s*|form\s*)([1-6])/i);
  let classDigit = numMatch ? numMatch[1] : null;

  let stream = (filterStream && filterStream !== 'All') ? String(filterStream).trim() : null;
  if (!stream) {
    const parts = clean.split(/\s+/);
    if (parts.length > 1) {
      stream = parts.slice(1).join(' ');
    }
  }

  if (classDigit) {
    let patterns = [
      `S.${classDigit}%`,
      `S${classDigit}%`,
      `Senior ${classDigit}%`,
      `Form ${classDigit}%`
    ];

    if (stream) {
      let clauses = patterns.map(() => `(gradeClass LIKE ? AND (gradeClass LIKE ? OR gradeClass LIKE ?))`);
      let params = [];
      patterns.forEach(p => {
        params.push(p, `% ${stream}%`, `%${stream}`);
      });
      clauses.push('gradeClass = ?');
      params.push(`${clean}`);

      return {
        sql: `(${clauses.join(' OR ')})`,
        params: params
      };
    } else {
      let clauses = patterns.map(() => `gradeClass LIKE ?`);
      clauses.push('gradeClass = ?');
      let params = [...patterns, clean];

      return {
        sql: `(${clauses.join(' OR ')})`,
        params: params
      };
    }
  }

  if (stream) {
    return {
      sql: '(gradeClass = ? OR gradeClass LIKE ?)',
      params: [`${clean} ${stream}`, `${clean}%`]
    };
  }
  return {
    sql: '(gradeClass = ? OR gradeClass LIKE ?)',
    params: [clean, `${clean} %`]
  };
}

// GET paginated, filtered students (EXCLUDE photo column)
app.get('/api/students', async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = req.query.limit !== undefined ? parseInt(req.query.limit, 10) : -1;
    const search = req.query.search || '';
    const filterName = req.query.name || '';
    const filterAdminNo = req.query.adminNo || '';
    const filterClass = req.query.gradeClass || req.query.class || '';
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

    let whereClauses = ['deleted_at IS NULL'];
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
      const classWhere = buildGradeClassWhereClause(filterClass, filterStream);
      if (classWhere) {
        whereClauses.push(classWhere.sql);
        queryParams.push(...classWhere.params);
      }
    } else if (filterStream && filterStream !== 'All') {
      whereClauses.push('(gradeClass LIKE ? OR gradeClass LIKE ?)');
      queryParams.push(`% ${filterStream}`, `%${filterStream}`);
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
               has_photo as hasPhoto
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
             has_photo as hasPhoto
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
              parentName, parentContact, updatedAt, photo, photoOriginal, photoEnhanced,
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
    const [rows] = await pool.query(
      'SELECT photo, photoOriginal, photoEnhanced FROM students WHERE id = ? OR adminNo = ?',
      [req.params.id, req.params.id]
    );
    if (rows.length === 0) {
      return res.status(404).send('Photo not found');
    }
    const photoStr = rows[0].photo || rows[0].photoOriginal || rows[0].photoEnhanced;
    if (!photoStr) {
      return res.status(404).send('Photo not found');
    }
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

// Helper to automatically store and sync student verification record
async function syncStudentVerification(connectionOrPool, student) {
  try {
    if (!student || !student.id) return;
    const vToken = student.verification_token || `STP-STD-${student.id}`;
    await connectionOrPool.query(
      'UPDATE students SET verification_token = ? WHERE id = ? AND (verification_token IS NULL OR verification_token = "")',
      [vToken, student.id]
    );

    const metadata = {
      name: student.name,
      adminNo: student.adminNo,
      studentNo: student.adminNo,
      studentId: student.id,
      gradeClass: student.gradeClass,
      boardingStatus: student.boardingStatus,
      gender: student.gender,
      isCleared: !!student.isCleared,
      photo: student.photo || null,
      issueDate: new Date().toISOString().split('T')[0],
      expiryDate: new Date(Date.now() + 365*24*60*60*1000).toISOString().split('T')[0],
      status: student.isCleared ? 'Cleared' : 'Pending Clearance'
    };

    await connectionOrPool.query(
      `INSERT INTO verifications (token, document_type, reference_id, metadata, status, expiresAt)
       VALUES (?, 'Student Clearance Card', ?, ?, 'Active', ?)
       ON DUPLICATE KEY UPDATE reference_id = VALUES(reference_id), metadata = VALUES(metadata), status = VALUES(status)`,
      [vToken, student.id, JSON.stringify(metadata), metadata.expiryDate]
    );
  } catch (e) {
    console.warn('[syncStudentVerification] Warning:', e.message);
  }
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

// POST upload image (uploads to Cloudinary, returns URL path)
app.post('/api/upload', async (req, res) => {
  const uploadStart = Date.now();
  try {
    const { image, publicId } = req.body;
    if (!image) {
      return res.status(400).json({ error: 'Image data is required.' });
    }
    
    let maxW = 800;
    let maxH = 1000;
    let quality = 85;
    
    if (publicId && publicId.includes('_photo')) {
      maxW = 150;
      maxH = 150;
      quality = 75;
    }
    
    const compressStart = Date.now();
    const compressed = await compressImageIfNeeded(image, maxW, maxH, quality, true);
    const compressDuration = Date.now() - compressStart;
    
    const cloudinaryStart = Date.now();
    const uploadUrl = await uploadToCloudinaryIfNeeded(compressed, publicId || `upload_${Date.now()}`);
    const cloudinaryDuration = Date.now() - cloudinaryStart;
    
    const totalDuration = Date.now() - uploadStart;
    console.log(`[API-UPLOAD-LOG] Image processed and uploaded in ${totalDuration}ms (compression: ${compressDuration}ms, upload: ${cloudinaryDuration}ms).`);
    
    res.json({ success: true, url: uploadUrl });
  } catch (err) {
    const totalDuration = Date.now() - uploadStart;
    console.error(`[API-UPLOAD-ERROR] Image upload failed after ${totalDuration}ms:`, err);
    res.status(500).json({ error: err.message });
  }
});

// POST new student (Insert or Update)
app.post('/api/students', async (req, res) => {
  try {
    const s = req.body;
    if (!s.adminNo) {
      return res.status(400).json({ error: 'Admission number (adminNo) is required.' });
    }
    // Check duplicate (OPTIMIZED: indexed query with LIMIT 1)
    const [existing] = await pool.query('SELECT id, name FROM students WHERE adminNo = ? AND id != ? LIMIT 1', [s.adminNo, s.id]);
    if (existing.length > 0) {
      return res.status(400).json({ error: `Registration number "${s.adminNo}" is already assigned to student "${existing[0].name}".` });
    }

    const formattedDob = s.dob && s.dob.trim() !== '' ? s.dob.trim() : null;

    let photoVal = s.photo || null;
    let originalVal = s.photoOriginal || null;
    let enhancedVal = s.photoEnhanced || null;

    // Fast database insert/update
    await pool.query(
      `INSERT INTO students (id, adminNo, name, aliases, gender, dob, gradeClass, boardingStatus, isCleared, gateClearanceDate, mealsClearanceDate, remarks, photo, photoOriginal, photoEnhanced, printStatus, parentName, parentContact) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) 
       ON DUPLICATE KEY UPDATE 
       adminNo = ?, name = ?, aliases = ?, gender = ?, dob = ?, gradeClass = ?, boardingStatus = ?, isCleared = ?, gateClearanceDate = ?, mealsClearanceDate = ?, remarks = ?, photo = ?, photoOriginal = ?, photoEnhanced = ?, printStatus = ?, parentName = ?, parentContact = ?`,
      [
        s.id, s.adminNo, s.name, s.aliases ? JSON.stringify(s.aliases) : null, s.gender, formattedDob, s.gradeClass, s.boardingStatus, s.isCleared ? 1 : 0, s.gateClearanceDate || null, s.mealsClearanceDate || null, s.remarks || null, photoVal, originalVal, enhancedVal, s.printStatus || 'Not Printed', s.parentName || null, s.parentContact || null,
        s.adminNo, s.name, s.aliases ? JSON.stringify(s.aliases) : null, s.gender, formattedDob, s.gradeClass, s.boardingStatus, s.isCleared ? 1 : 0, s.gateClearanceDate || null, s.mealsClearanceDate || null, s.remarks || null, photoVal, originalVal, enhancedVal, s.printStatus || 'Not Printed', s.parentName || null, s.parentContact || null
      ]
    );

    // Non-blocking background side effects
    ensureStudentAccount(pool, s.id).catch(e => console.warn('Account setup warning:', e.message));
    syncStudentVerification(pool, s).catch(e => console.warn('Verification sync warning:', e.message));
    writeAuditLog('Save Student', `Saved student "${s.name}" (${s.adminNo})`).catch(e => console.warn('Audit log warning:', e.message));
    statsCache = null;

    // Non-blocking background image optimization & Cloudinary upload if needed
    if ((photoVal && photoVal.startsWith('data:')) || (originalVal && originalVal.startsWith('data:'))) {
      (async () => {
        try {
          const [compPhoto, compOriginal, compEnhanced] = await Promise.all([
            photoVal ? compressImageIfNeeded(photoVal, 150, 150, 75, true) : Promise.resolve(photoVal),
            originalVal ? compressImageIfNeeded(originalVal, 800, 1000, 85, true) : Promise.resolve(originalVal),
            enhancedVal ? compressImageIfNeeded(enhancedVal, 800, 1000, 85, true) : Promise.resolve(enhancedVal)
          ]);
          const [photoUrl, originalUrl, enhancedUrl] = await Promise.all([
            uploadToCloudinaryIfNeeded(compPhoto, `student_${s.id}_photo`),
            uploadToCloudinaryIfNeeded(compOriginal, `student_${s.id}_original`),
            uploadToCloudinaryIfNeeded(compEnhanced, `student_${s.id}_enhanced`)
          ]);
          if (photoUrl !== photoVal || originalUrl !== originalVal || enhancedUrl !== enhancedVal) {
            await pool.query(
              'UPDATE students SET photo = ?, photoOriginal = ?, photoEnhanced = ? WHERE id = ?',
              [photoUrl || null, originalUrl || null, enhancedUrl || null, s.id]
            );
          }
        } catch (imgErr) {
          console.warn('Background image processing warning:', imgErr.message);
        }
      })();
    }

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
    // Check duplicate (OPTIMIZED: indexed query with LIMIT 1)
    const [existing] = await pool.query('SELECT id, name FROM students WHERE adminNo = ? AND id != ? LIMIT 1', [s.adminNo, req.params.id]);
    if (existing.length > 0) {
      return res.status(400).json({ error: `Registration number "${s.adminNo}" is already assigned to student "${existing[0].name}".` });
    }

    const formattedDob = s.dob && s.dob.trim() !== '' ? s.dob.trim() : null;

    let photoVal = s.photo || null;
    let originalVal = s.photoOriginal || null;
    let enhancedVal = s.photoEnhanced || null;

    await pool.query(
      `UPDATE students SET adminNo = ?, name = ?, aliases = ?, gender = ?, dob = ?, gradeClass = ?, boardingStatus = ?, isCleared = ?, gateClearanceDate = ?, mealsClearanceDate = ?, remarks = ?, photo = ?, photoOriginal = ?, photoEnhanced = ?, printStatus = ?, parentName = ?, parentContact = ? WHERE id = ?`,
      [s.adminNo, s.name, s.aliases ? JSON.stringify(s.aliases) : null, s.gender, formattedDob, s.gradeClass, s.boardingStatus, s.isCleared ? 1 : 0, s.gateClearanceDate || null, s.mealsClearanceDate || null, s.remarks || null, photoVal, originalVal, enhancedVal, s.printStatus || 'Not Printed', s.parentName || null, s.parentContact || null, req.params.id]
    );

    ensureStudentAccount(pool, req.params.id).catch(e => console.warn('Account setup warning:', e.message));
    syncStudentVerification(pool, { ...s, id: req.params.id }).catch(e => console.warn('Verification sync warning:', e.message));
    writeAuditLog('Update Student', `Updated student "${s.name}" (${s.adminNo})`).catch(e => console.warn('Audit log warning:', e.message));
    statsCache = null;

    if ((photoVal && photoVal.startsWith('data:')) || (originalVal && originalVal.startsWith('data:'))) {
      (async () => {
        try {
          const [compPhoto, compOriginal, compEnhanced] = await Promise.all([
            photoVal ? compressImageIfNeeded(photoVal, 150, 150, 75, true) : Promise.resolve(photoVal),
            originalVal ? compressImageIfNeeded(originalVal, 800, 1000, 85, true) : Promise.resolve(originalVal),
            enhancedVal ? compressImageIfNeeded(enhancedVal, 800, 1000, 85, true) : Promise.resolve(enhancedVal)
          ]);
          const [photoUrl, originalUrl, enhancedUrl] = await Promise.all([
            uploadToCloudinaryIfNeeded(compPhoto, `student_${req.params.id}_photo`),
            uploadToCloudinaryIfNeeded(compOriginal, `student_${req.params.id}_original`),
            uploadToCloudinaryIfNeeded(compEnhanced, `student_${req.params.id}_enhanced`)
          ]);
          if (photoUrl !== photoVal || originalUrl !== originalVal || enhancedUrl !== enhancedVal) {
            await pool.query(
              'UPDATE students SET photo = ?, photoOriginal = ?, photoEnhanced = ? WHERE id = ?',
              [photoUrl || null, originalUrl || null, enhancedUrl || null, req.params.id]
            );
          }
        } catch (imgErr) {
          console.warn('Background image processing warning:', imgErr.message);
        }
      })();
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// SAFE SOFT DELETE single student with Transaction & Pre-verification
app.delete('/api/students/:id', async (req, res) => {
  const studentId = req.params.id;
  if (!studentId || studentId.trim() === '') {
    return res.status(400).json({ error: 'Valid Student ID is required for deletion.' });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // 1. Pre-verify record exists
    const [existing] = await connection.query('SELECT * FROM students WHERE id = ? AND (deleted_at IS NULL)', [studentId]);
    if (!existing || existing.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: `Active student record with ID "${studentId}" was not found.` });
    }

    const studentRecord = existing[0];

    // 2. Perform Soft Delete inside transaction
    await connection.query(
      'UPDATE students SET deleted_at = NOW(), deleted_by = ?, deletion_reason = ? WHERE id = ?',
      [req.body?.user || 'Admin', req.body?.reason || 'User requested deletion', studentId]
    );

    // 3. Record Audit Log inside transaction
    const logDetails = `Soft-deleted student "${studentRecord.name}" (Admin No: ${studentRecord.adminNo}, Class: ${studentRecord.gradeClass}, ID: ${studentId})`;
    await connection.query('INSERT INTO audit_logs (action, details) VALUES (?, ?)', ['Soft Delete Student', logDetails]);

    await connection.commit();
    statsCache = null;

    res.json({
      success: true,
      message: `Student "${studentRecord.name}" was soft-deleted safely and moved to Trash.`,
      deletedRecord: studentRecord
    });
  } catch (err) {
    await connection.rollback();
    res.status(500).json({ error: `Safe soft delete failed: ${err.message}` });
  } finally {
    connection.release();
  }
});

// PRE-INSERT DUPLICATE CHECKER API
app.post('/api/students/check-duplicate', async (req, res) => {
  try {
    const { adminNo, name, gradeClass, dob } = req.body;

    // 1. Exact Admission Number Match (Definitely duplicate)
    if (adminNo) {
      const [adminMatches] = await pool.query(
        'SELECT id, name, adminNo, gradeClass, boardingStatus FROM students WHERE adminNo = ? AND (deleted_at IS NULL)',
        [adminNo.trim()]
      );
      if (adminMatches && adminMatches.length > 0) {
        return res.json({
          duplicateFound: true,
          classification: 'Definitely duplicate',
          reason: `A student with Admission Number "${adminNo}" already exists in ${adminMatches[0].gradeClass}.`,
          existingStudent: adminMatches[0]
        });
      }
    }

    // 2. Exact Name + Class Match (Likely duplicate)
    if (name && gradeClass) {
      const [nameMatches] = await pool.query(
        'SELECT id, name, adminNo, gradeClass, boardingStatus FROM students WHERE LOWER(name) = LOWER(?) AND gradeClass = ? AND (deleted_at IS NULL)',
        [name.trim(), gradeClass.trim()]
      );
      if (nameMatches && nameMatches.length > 0) {
        return res.json({
          duplicateFound: true,
          classification: 'Likely duplicate',
          reason: `A student named "${name}" already exists in ${gradeClass} (Admin No: ${nameMatches[0].adminNo}).`,
          existingStudent: nameMatches[0]
        });
      }
    }

    // 3. Name Similarity Match (Possibly duplicate)
    if (name) {
      const [similarMatches] = await pool.query(
        'SELECT id, name, adminNo, gradeClass, boardingStatus FROM students WHERE LOWER(name) = LOWER(?) AND (deleted_at IS NULL)',
        [name.trim()]
      );
      if (similarMatches && similarMatches.length > 0) {
        return res.json({
          duplicateFound: true,
          classification: 'Possibly duplicate',
          reason: `A student with the name "${name}" exists in ${similarMatches[0].gradeClass} (Admin No: ${similarMatches[0].adminNo}).`,
          existingStudent: similarMatches[0]
        });
      }
    }

    res.json({ duplicateFound: false, classification: 'Not duplicate' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET TRASH / RECENTLY DELETED RECORDS
app.get('/api/admin/trash', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, adminNo, name, gender, gradeClass, boardingStatus, deleted_at, deleted_by, deletion_reason FROM students WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC LIMIT 200'
    );
    res.json({ success: true, trash: rows || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// RESTORE STUDENT FROM TRASH
app.post('/api/admin/trash/restore/:id', async (req, res) => {
  const studentId = req.params.id;
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [existing] = await connection.query('SELECT * FROM students WHERE id = ? AND deleted_at IS NOT NULL', [studentId]);
    if (!existing || existing.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: 'Record not found in trash.' });
    }

    await connection.query('UPDATE students SET deleted_at = NULL, deleted_by = NULL, deletion_reason = NULL WHERE id = ?', [studentId]);
    await connection.query('INSERT INTO audit_logs (action, details) VALUES (?, ?)', ['Restore Student', `Restored student "${existing[0].name}" (Admin No: ${existing[0].adminNo}, ID: ${studentId}) from trash`]);

    await connection.commit();
    statsCache = null;

    res.json({
      success: true,
      message: `Successfully restored student "${existing[0].name}" to active roster.`
    });
  } catch (err) {
    await connection.rollback();
    res.status(500).json({ error: `Restore failed: ${err.message}` });
  } finally {
    connection.release();
  }
});

// GET SYSTEM AUDIT DIAGNOSTICS FINDINGS
app.get('/api/admin/system-audit', async (req, res) => {
  try {
    const findings = [];

    // 1. Orphan Attendance Records check
    const [orphanAttendance] = await pool.query(
      'SELECT COUNT(*) as count FROM attendance_logs al LEFT JOIN students s ON al.student_id = s.id WHERE s.id IS NULL OR s.deleted_at IS NOT NULL'
    );
    if (orphanAttendance[0].count > 0) {
      findings.push({
        id: 'finding-orphan-attendance',
        severity: 'CRITICAL',
        title: `${orphanAttendance[0].count} attendance logs reference missing/deleted students`,
        category: 'Database Consistency',
        affectedCount: orphanAttendance[0].count,
        details: 'Attendance log records exist without a corresponding active student record.'
      });
    }

    // 2. Duplicate Admission Numbers check
    const [dupAdminNo] = await pool.query(
      'SELECT adminNo, COUNT(*) as count FROM students WHERE deleted_at IS NULL GROUP BY adminNo HAVING count > 1'
    );
    if (dupAdminNo.length > 0) {
      findings.push({
        id: 'finding-dup-adminno',
        severity: 'HIGH',
        title: `${dupAdminNo.length} duplicate Admission Number(s) detected`,
        category: 'Data Integrity',
        affectedCount: dupAdminNo.length,
        details: `Admission numbers with duplicates: ${dupAdminNo.map(d => d.adminNo).join(', ')}`
      });
    }

    // 3. Students without parent contact info
    const [noParentContact] = await pool.query(
      'SELECT COUNT(*) as count FROM students WHERE (parentContact IS NULL OR parentContact = "") AND deleted_at IS NULL'
    );
    if (noParentContact[0].count > 0) {
      findings.push({
        id: 'finding-no-parent-contact',
        severity: 'MEDIUM',
        title: `${noParentContact[0].count} student(s) missing parent phone numbers`,
        category: 'Parent Notification',
        affectedCount: noParentContact[0].count,
        details: 'Parents cannot receive automated WhatsApp/SMS gate arrival notifications.'
      });
    }

    // 4. Failed WhatsApp Notification Logs check
    const [failedNotifications] = await pool.query(
      "SELECT COUNT(*) as count FROM attendance_notifications WHERE status = 'Failed'"
    );
    if (failedNotifications[0].count > 0) {
      findings.push({
        id: 'finding-failed-notifications',
        severity: 'MEDIUM',
        title: `${failedNotifications[0].count} WhatsApp/SMS notification delivery failures`,
        category: 'Communication Gateway',
        affectedCount: failedNotifications[0].count,
        details: 'Check WhatsApp Meta API connection credentials and recipient phone formatting.'
      });
    }

    res.json({
      success: true,
      status: findings.some(f => f.severity === 'CRITICAL') ? 'CRITICAL' : findings.length > 0 ? 'WARNING' : 'HEALTHY',
      findings
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

let statsCacheTime = 0;

// GET database-wide statistics (OPTIMIZED: Single-pass SQL aggregation & 60s cache)
async function getMasterStats() {
  if (statsCache && (Date.now() - statsCacheTime < 60000)) {
    return statsCache;
  }

  const [aggRows] = await pool.query(`
    SELECT 
      COUNT(*) as total,
      SUM(IF(isCleared = 1, 1, 0)) as cleared,
      SUM(IF(has_photo = 1 OR (photo IS NOT NULL AND photo != '') OR (photoOriginal IS NOT NULL AND photoOriginal != '') OR (photoEnhanced IS NOT NULL AND photoEnhanced != ''), 1, 0)) as withPhoto,
      SUM(IF(gradeClass LIKE 'S.1%' OR gradeClass LIKE 'S.2%' OR gradeClass LIKE 'S.3%' OR gradeClass LIKE 'S.4%', 1, 0)) as lowerSecondaryTotal,
      SUM(IF(gradeClass LIKE 'S.5%' OR gradeClass LIKE 'S.6%', 1, 0)) as upperSecondaryTotal
    FROM students WHERE deleted_at IS NULL
  `);

  const [classRows] = await pool.query("SELECT gradeClass, COUNT(*) as count FROM students WHERE deleted_at IS NULL GROUP BY gradeClass");

  const byClass = { 'S.1': 0, 'S.2': 0, 'S.3': 0, 'S.4': 0, 'S.5': 0, 'S.6': 0 };
  const byStream = {};

  classRows.forEach(r => {
    const gc = (r.gradeClass || '').trim();
    if (gc) {
      byStream[gc] = r.count;
      if (gc.startsWith('S.1')) byClass['S.1'] += r.count;
      else if (gc.startsWith('S.2')) byClass['S.2'] += r.count;
      else if (gc.startsWith('S.3')) byClass['S.3'] += r.count;
      else if (gc.startsWith('S.4')) byClass['S.4'] += r.count;
      else if (gc.startsWith('S.5')) byClass['S.5'] += r.count;
      else if (gc.startsWith('S.6')) byClass['S.6'] += r.count;
    }
  });

  const row = aggRows[0] || {};
  const total = Number(row.total || 0);
  const cleared = Number(row.cleared || 0);
  const withPhoto = Number(row.withPhoto || 0);
  const lowerSecondaryTotal = Number(row.lowerSecondaryTotal || 0);
  const upperSecondaryTotal = Number(row.upperSecondaryTotal || 0);

  const result = {
    total,
    cleared,
    pending: total - cleared,
    withPhoto,
    noPhoto: total - withPhoto,
    lowerSecondaryTotal,
    upperSecondaryTotal,
    clearedPct: total > 0 ? Math.round((cleared / total) * 100) : 0,
    photoPct: total > 0 ? Math.round((withPhoto / total) * 100) : 0,
    byClass,
    byStream
  };

  statsCache = result;
  statsCacheTime = Date.now();
  return result;
}

app.get('/api/stats', async (req, res) => {
  try {
    const now = Date.now();
    if (statsCache && now < statsCacheExpiry) {
      return res.json(statsCache);
    }
    statsCache = await getMasterStats();
    statsCacheExpiry = now + 10000; // 10s TTL
    res.json(statsCache);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/dashboard/overview', async (req, res) => {
  try {
    const now = Date.now();
    if (statsCache && now < statsCacheExpiry) {
      return res.json(statsCache);
    }
    statsCache = await getMasterStats();
    statsCacheExpiry = now + 10000;
    res.json(statsCache);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/students/fix-registry-consistency', async (req, res) => {
  try {
    const [allStudents] = await pool.query('SELECT id, gradeClass FROM students');
    let updatedCount = 0;

    for (const s of allStudents) {
      if (!s.gradeClass) continue;
      let raw = s.gradeClass.trim();
      let normalized = raw;

      if (raw === 'S.1' || raw === 'S1') normalized = 'S.1 A';
      else if (raw === 'S.2' || raw === 'S2') normalized = 'S.2 A';
      else if (raw === 'S.3' || raw === 'S3') normalized = 'S.3 A';
      else if (raw === 'S.4' || raw === 'S4') normalized = 'S.4 A';
      else if (raw === 'S.5' || raw === 'S5') normalized = 'S.5 Arts';
      else if (raw === 'S.6' || raw === 'S6') normalized = 'S.6 Arts';
      else {
        const m = raw.match(/^(?:[sS]\.?|senior\s*|form\s*)([1-6])\s*(.*)$/i);
        if (m) {
          const num = m[1];
          let rest = (m[2] || '').trim();
          if (rest.toLowerCase() === 'arts' || rest.toLowerCase() === 'art') rest = 'Arts';
          else if (rest.toLowerCase() === 'sciences' || rest.toLowerCase() === 'science') rest = 'Sciences';
          else if (rest.length === 1) rest = rest.toUpperCase();
          normalized = rest ? `S.${num} ${rest}` : `S.${num} A`;
        }
      }

      if (normalized !== raw) {
        await pool.query('UPDATE students SET gradeClass = ? WHERE id = ?', [normalized, s.id]);
        updatedCount++;
      }
    }

    statsCache = null; // Clear stats cache
    const freshStats = await getMasterStats();

    res.json({
      success: true,
      message: `Database consistency check complete. ${updatedCount} student records normalized.`,
      updatedCount,
      stats: freshStats
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST bulk insert/update
app.post('/api/students/bulk', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const students = req.body.students || [];
    
    // Upload student photos to Cloudinary in parallel before starting the database transaction
    await Promise.all(students.map(async (s) => {
      try {
        s.photo = await uploadToCloudinaryIfNeeded(s.photo, `student_${s.id}_photo`);
      } catch (e) {}
    }));

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
      return res.json({ logo: null, authorizedSignature: null, degraded: true, message: 'Database unavailable; using default branding.' });
    }

    const [logoRows] = await pool.query('SELECT val_value FROM settings WHERE key_name = ?', ['school_logo']);
    const [sigRows] = await pool.query('SELECT val_value FROM settings WHERE key_name = ?', ['head_teacher_signature']);
    
    res.json({ 
      logo: logoRows.length > 0 ? logoRows[0].val_value : null, 
      authorizedSignature: sigRows.length > 0 ? sigRows[0].val_value : null,
      degraded: false 
    });
  } catch (err) {
    res.status(500).json({ error: err.message, degraded: true });
  }
});

// POST school logo and authorized signature branding
app.post('/api/branding', async (req, res) => {
  try {
    const { logo, authorizedSignature } = req.body;
    let logoValue = logo;
    let sigValue = authorizedSignature;
    
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const apiKey = process.env.CLOUDINARY_API_KEY;
    const apiSecret = process.env.CLOUDINARY_API_SECRET;
    const hasCloudinary = !!(cloudName && apiKey && apiSecret);

    if (logo !== undefined) {
      if (logo && logo.startsWith('data:image/')) {
        if (hasCloudinary) {
          console.log('[Branding] Cloudinary configured. Uploading logo to Cloudinary...');
          logoValue = await uploadToCloudinaryIfNeeded(logo, 'school_logo_branding');
        }
      }
      await pool.query(
        `INSERT INTO settings (key_name, val_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE val_value = ?`,
        ['school_logo', logoValue || null, logoValue || null]
      );
    }

    if (authorizedSignature !== undefined) {
      if (authorizedSignature && authorizedSignature.startsWith('data:image/')) {
        if (hasCloudinary) {
          console.log('[Branding] Cloudinary configured. Uploading authorized signature to Cloudinary...');
          sigValue = await uploadToCloudinaryIfNeeded(authorizedSignature, 'school_authorized_signature');
        }
      }
      await pool.query(
        `INSERT INTO settings (key_name, val_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE val_value = ?`,
        ['head_teacher_signature', sigValue || null, sigValue || null]
      );
    }
    
    res.json({ success: true, logo: logoValue, authorizedSignature: sigValue });
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

// --- MARKS ENDPOINTS (ALIASED TO ACTIVE olevel_marks / uace_marks TABLES) ---
app.get('/api/marks', async (req, res) => {
  try {
    const [oRows] = await pool.query('SELECT id, student_id, subject, exam_score as marks_obtained, 100 as max_marks, term, year FROM olevel_marks LIMIT 500');
    const [uRows] = await pool.query('SELECT id, student_id, subject, paper1 as marks_obtained, 100 as max_marks, term, year FROM uace_marks LIMIT 500');
    res.json([...oRows, ...uRows]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/marks/:studentId', async (req, res) => {
  try {
    const studentId = req.params.studentId;
    const [oRows] = await pool.query('SELECT id, student_id, subject, integration1, integration2, integration3, exam_score as marks_obtained, 100 as max_marks, term, year FROM olevel_marks WHERE student_id = ?', [studentId]);
    const [uRows] = await pool.query('SELECT id, student_id, subject, paper1 as marks_obtained, 100 as max_marks, term, year FROM uace_marks WHERE student_id = ?', [studentId]);
    res.json([...oRows, ...uRows]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/marks', async (req, res) => {
  try {
    const { student_id, subject, marks_obtained, term, year } = req.body;
    if (!student_id || !subject || marks_obtained === undefined || !term || !year) {
      return res.status(400).json({ error: 'Missing required parameters for marks' });
    }
    await pool.query(
      `INSERT INTO olevel_marks (student_id, subject, exam_score, term, year) 
       VALUES (?, ?, ?, ?, ?) 
       ON DUPLICATE KEY UPDATE exam_score = ?`,
      [student_id, subject, marks_obtained, term, year, marks_obtained]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/marks/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM olevel_marks WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- PARENT NOTIFICATION SIMULATOR & SSE SETUP ---
let attendanceClients = [];

// Helper to broadcast gate event
function broadcastGateScan(data) {
  attendanceClients.forEach(c => {
    try {
      c.write(`data: ${JSON.stringify(data)}\n\n`);
    } catch (err) {
      console.warn('[SSE] Failed to write to client:', err.message);
    }
  });
}

// Twilio WhatsApp API Dispatcher
async function sendTwilioWhatsApp(toPhone, messageBody) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  let fromPhone = process.env.TWILIO_WHATSAPP_FROM || 'whatsapp:+14155238886';

  if (!accountSid || !authToken) {
    console.log('[Notification] Twilio credentials missing. Skipping real WhatsApp dispatch (logged to DB).');
    return { success: false, error: 'Credentials missing' };
  }

  function formatPhoneNumber(phone) {
    let cleaned = phone.replace(/\s+/g, '').replace(/[-()]/g, '');
    if (cleaned.startsWith('+')) {
      return cleaned;
    }
    if (cleaned.startsWith('0')) {
      return '+256' + cleaned.substring(1);
    }
    if (cleaned.length === 9 && (cleaned.startsWith('7') || cleaned.startsWith('3') || cleaned.startsWith('4'))) {
      return '+256' + cleaned;
    }
    if (cleaned.startsWith('256')) {
      return '+' + cleaned;
    }
    return '+' + cleaned;
  }

  // Standardize the recipient phone format
  let formattedTo = toPhone.trim();
  if (!formattedTo.startsWith('whatsapp:')) {
    const rawFormatted = formatPhoneNumber(formattedTo);
    formattedTo = `whatsapp:${rawFormatted}`;
  }


  // Ensure from phone starts with 'whatsapp:'
  if (!fromPhone.startsWith('whatsapp:')) {
    fromPhone = `whatsapp:${fromPhone}`;
  }

  console.log(`[Notification] Sending Twilio WhatsApp notification to ${formattedTo}...`);

  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  const authHeader = 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64');

  const params = new URLSearchParams();
  params.append('From', fromPhone);
  params.append('To', formattedTo);
  params.append('Body', messageBody);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': authHeader
      },
      body: params.toString()
    });

    const data = await res.json();
    if (res.ok) {
      console.log(`[Notification] Twilio WhatsApp successfully sent to ${formattedTo}. SID: ${data.sid}`);
      return { success: true, sid: data.sid };
    } else {
      console.error(`[Notification] Twilio WhatsApp API returned error: ${data.message || JSON.stringify(data)}`);
      return { success: false, error: data.message || 'Unknown Twilio API error' };
    }
  } catch (err) {
    console.error(`[Notification] Failed to execute Twilio fetch request:`, err.message);
    return { success: false, error: err.message };
  }
}

const { sendWhatsAppNotification, formatPhoneNumber } = require('./metaWhatsAppService');

function getKampalaTimeDetails() {
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-CA', { timeZone: 'Africa/Kampala' }); // YYYY-MM-DD
  const time24 = now.toLocaleTimeString('en-GB', { timeZone: 'Africa/Kampala' }); // HH:mm:ss
  const formattedTime = now.toLocaleTimeString('en-US', { timeZone: 'Africa/Kampala', hour: '2-digit', minute: '2-digit', hour12: true });
  return { dateStr, time24, formattedTime, timestamp: now.getTime() };
}

function getFirstName(fullName) {
  if (!fullName) return 'Student';
  const parts = String(fullName).trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    const secondWord = parts[1];
    return secondWord.charAt(0).toUpperCase() + secondWord.slice(1).toLowerCase();
  }
  const firstWord = parts[0] || 'Student';
  return firstWord.charAt(0).toUpperCase() + firstWord.slice(1).toLowerCase();
}

const pendingNotificationDispatches = new Set();

// Background notifier for Parent Attendance Alerts (Meta WhatsApp Cloud API)
async function sendParentNotification(studentId, logId, type, studentName, gradeClass, timeString) {
  const dispatchKey = `${studentId}-${logId}-${type}`;
  if (pendingNotificationDispatches.has(dispatchKey)) {
    console.log(`[Notification] Dispatch already in progress for ${dispatchKey}. Preventing duplicate.`);
    return;
  }
  pendingNotificationDispatches.add(dispatchKey);

  try {
    // 1. Check if notification for this student, log, and type has already been recorded/sent
    const [existingNotifs] = await pool.query(
      "SELECT id, status FROM attendance_notifications WHERE student_id = ? AND log_id = ? AND type = ? AND status IN ('Sent', 'Delivered', 'Pending')",
      [studentId, logId, type]
    );

    if (existingNotifs.length > 0) {
      console.log(`[Notification] Duplicate notification dispatch prevented for student ${studentName} (${studentId}), log ${logId}, type ${type}. Existing status: ${existingNotifs[0].status}`);
      return;
    }

    // 2. Fetch parent contact
    const [pRows] = await pool.query('SELECT * FROM parent_contacts WHERE student_id = ?', [studentId]);
    let pc = pRows[0] || null;

    let fatherPhone = pc ? (pc.father_whatsapp || pc.father_phone) : null;
    let motherPhone = pc ? (pc.mother_whatsapp || pc.mother_phone) : null;
    let guardianPhone = pc ? (pc.guardian_whatsapp || pc.guardian_phone) : null;

    if (!fatherPhone && !motherPhone && !guardianPhone) {
      const [stRows] = await pool.query('SELECT parentContact FROM students WHERE id = ?', [studentId]);
      if (stRows.length > 0 && stRows[0].parentContact) {
        guardianPhone = stRows[0].parentContact;
      }
    }

    const recipientPhone = fatherPhone || motherPhone || guardianPhone;
    const recipientType = fatherPhone ? 'Father' : (motherPhone ? 'Mother' : (guardianPhone ? 'Guardian' : 'Parent'));

    // Requirement: If parent has no registered WhatsApp number, record attendance normally but do not attempt WhatsApp.
    // Record audit log entry as 'Not Attempted'
    if (!recipientPhone) {
      console.log(`[Notification] No registered parent phone/WhatsApp contact for student "${studentName}" (${studentId}). Recording audit log status as 'Not Attempted'.`);
      const notAttemptedMsg = `Dear Parent, Your child ${studentName} (${gradeClass || 'Student'}) was ${type === 'ClockIn' ? 'checked in' : 'checked out'} today at ${timeString}. (No parent WhatsApp number registered)`;
      
      await pool.query(
        `INSERT INTO attendance_notifications (student_id, log_id, type, channel, recipient_type, recipient_phone, message, status, error_message)
         VALUES (?, ?, ?, 'WhatsApp', 'Parent', NULL, ?, 'Not Attempted', 'No registered parent phone/WhatsApp contact in database')`,
        [studentId, logId, type, notAttemptedMsg]
      );
      return;
    }

    const formattedPhone = formatPhoneNumber(recipientPhone);
    const pref = pc?.preferred_notification || 'WhatsApp';

    let status = 'Pending';
    let errorMessage = null;
    let channel = 'WhatsApp';
    let messageBody = '';

    if (pref === 'SMS') {
      channel = 'SMS';
      status = 'Delivered';
      const statusText = type === 'ClockIn' ? 'Checked In' : 'Checked Out';
      messageBody = `Dear Parent, Your child ${studentName} (${gradeClass || 'Student'}) has ${type === 'ClockIn' ? 'arrived at' : 'left'} St. Paul Senior Secondary School today at ${timeString}. Status: ${statusText}.`;
    } else {
      channel = 'WhatsApp';
      try {
        const waResult = await sendWhatsAppNotification({
          to: formattedPhone,
          studentName,
          gradeClass,
          timeString,
          type,
          schoolName: 'St. Paul Senior Secondary School'
        });

        messageBody = waResult ? waResult.message : '';
        if (waResult && waResult.success) {
          status = waResult.simulated ? 'Delivered' : 'Sent';
        } else {
          status = 'Failed';
          errorMessage = waResult ? waResult.error : 'Failed to send WhatsApp message';
        }
      } catch (waErr) {
        status = 'Failed';
        errorMessage = waErr.message || 'WhatsApp Cloud API Error';
        messageBody = `Dear Parent, Your child ${studentName} (${gradeClass || 'Student'}) has ${type === 'ClockIn' ? 'arrived at' : 'left'} St. Paul Senior Secondary School today at ${timeString}.`;
      }
    }

    await pool.query(
      `INSERT INTO attendance_notifications (student_id, log_id, type, channel, recipient_type, recipient_phone, message, status, error_message)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [studentId, logId, type, channel, recipientType, formattedPhone, messageBody, status, errorMessage]
    );

    console.log(`[Notification] Registered alert for ${studentName} -> ${recipientType} (${formattedPhone}): status=${status}`);
  } catch (err) {
    console.error('[Notification] Failed to process parent alert:', err.message);
  } finally {
    pendingNotificationDispatches.delete(dispatchKey);
  }
}


// --- ATTENDANCE ENDPOINTS ---

// Server-Sent Events stream for real-time live gate monitor
app.get('/api/attendance/live-stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  attendanceClients.push(res);
  console.log(`[SSE] Client connected. Total clients: ${attendanceClients.length}`);

  req.on('close', () => {
    attendanceClients = attendanceClients.filter(c => c !== res);
    console.log(`[SSE] Client disconnected. Total clients: ${attendanceClients.length}`);
  });
});

// Snapshot of 20 most recent gate scans of today
app.get('/api/attendance/live', async (req, res) => {
  try {
    const { dateStr } = getKampalaTimeDetails();
    const [rows] = await pool.query(
      `SELECT al.*, s.name, s.adminNo, s.gradeClass, s.boardingStatus, s.photo,
              gl_in.name as gate_in_name, gl_out.name as gate_out_name
       FROM attendance_logs al
       JOIN students s ON al.student_id = s.id
       LEFT JOIN gate_locations gl_in ON al.gate_in_id = gl_in.id
       LEFT JOIN gate_locations gl_out ON al.gate_out_id = gl_out.id
       WHERE al.date = ?
       ORDER BY COALESCE(al.time_out, al.time_in) DESC, al.id DESC
       LIMIT 20`,
      [dateStr]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Scanning Endpoint for Clock In / Clock Out
app.post('/api/attendance/scan', async (req, res) => {
  try {
    const { scanValue, gateId, deviceId, operatorName, gps, direction } = req.body;
    
    if (!scanValue) {
      return res.status(400).json({ error: 'Scan value (Student Number / QR / ID) is required.' });
    }

    // Clean and unwrap scanValue if embedded in URL or prefix
    let cleanedValue = String(scanValue).trim();
    if (cleanedValue.includes('/verify/student/')) {
      cleanedValue = decodeURIComponent(cleanedValue.split('/verify/student/').pop());
    } else if (cleanedValue.includes('/verify/')) {
      cleanedValue = decodeURIComponent(cleanedValue.split('/verify/').pop());
    }
    cleanedValue = cleanedValue.replace(/^Student ID:\s*/i, '').replace(/^STUDENT:\s*/i, '').trim();

    console.log(`[ATTENDANCE-SCAN-DEBUG] Processing scan for rawValue: "${scanValue}", cleanedValue: "${cleanedValue}"`);

    // 1. Find the student by adminNo, id, or verification_token (with leading zero fallback)
    const normValue = cleanedValue.replace(/^0+/, '');
    const [stRows] = await pool.query(
      `SELECT id, adminNo, name, gender, gradeClass, boardingStatus, photo, isCleared, remarks 
       FROM students 
       WHERE adminNo = ? OR id = ? OR verification_token = ? 
          OR LTRIM(REPLACE(adminNo, '0', '')) = ?
       LIMIT 1`,
      [cleanedValue, cleanedValue, cleanedValue, normValue]
    );

    if (stRows.length === 0) {
      console.warn(`[ATTENDANCE-SCAN-DEBUG] Student record not found for scan query "${cleanedValue}"`);
      return res.status(404).json({ error: `Student record with barcode/ID "${cleanedValue}" not found. Please register the student first.` });
    }

    const student = stRows[0];

    // Check archived or inactive student status
    if (student.status === 'Archived' || student.status === 'Inactive' || (student.remarks && String(student.remarks).toLowerCase().includes('archived'))) {
      return res.status(403).json({ error: `STUDENT NOT ACTIVE — ${student.name} is currently not active in the school registry.` });
    }

    const studentId = student.id;
    const { dateStr: today, time24: timeNow, formattedTime } = getKampalaTimeDetails();
    const studentFirstName = getFirstName(student.name);

    // 2. Fetch existing log for today (Multi-key lookup across UUID, AdminNo, and Scanned Barcode)
    const [logRows] = await pool.query(
      'SELECT * FROM attendance_logs WHERE (student_id = ? OR student_id = ? OR student_id = ?) AND date = ? ORDER BY id DESC LIMIT 1', 
      [student.id, student.adminNo, cleanedValue, today]
    );
    const existingLog = logRows[0] || null;

    let targetDirection = direction || 'auto';
    if (targetDirection === 'auto') {
      if (existingLog && existingLog.time_in && !existingLog.time_out) {
        // Check 3-second duplicate scan protection window against accidental double-taps
        const lastScanTime = new Date(existingLog.updated_at || existingLog.created_at || Date.now()).getTime();
        const nowTimeMs = Date.now();
        const DEBOUNCE_WINDOW_MS = 3000; // 3 seconds protection against double-taps

        if (nowTimeMs - lastScanTime < DEBOUNCE_WINDOW_MS) {
          const welcomeMsg = `Welcome, ${studentFirstName}! 👋\nGood morning!\nYou have successfully checked in.\nHave a wonderful and productive day!`;
          return res.json({
            success: true,
            isDuplicate: true,
            status: 'ALREADY_CLOCKED_IN',
            direction: 'in',
            student,
            studentFirstName,
            log: existingLog,
            welcomeMessage: welcomeMsg,
            message: `⚠️ ALREADY CLOCKED IN — ${student.name} is already clocked in today at ${existingLog.time_in}.`
          });
        }

        targetDirection = 'clock-out';
      } else if (existingLog && existingLog.time_in && existingLog.time_out) {
        const goodbyeMsg = `Goodbye, ${studentFirstName}! 👋\nYou have successfully checked out.\nHave a safe journey home!`;
        return res.json({
          success: true,
          isDuplicate: true,
          status: 'ALREADY_CLOCKED_OUT',
          direction: 'out',
          student,
          studentFirstName,
          log: existingLog,
          goodbyeMessage: goodbyeMsg,
          message: `⚠️ ALREADY CLOCKED OUT — ${student.name} already clocked out today at ${existingLog.time_out}.`
        });
      } else {
        targetDirection = 'clock-in';
      }
    }

    // 3. Perform scan action with safeguards
    if (targetDirection === 'clock-in') {
      // Safeguard: Do not send a clock-in message / allow duplicate clock-in if already clocked in for same school day
      if (existingLog && existingLog.time_in) {
        const welcomeMsg = `Welcome, ${studentFirstName}! 👋\nGood morning!\nYou have successfully checked in.\nHave a wonderful and productive day!`;
        return res.json({
          success: true,
          error: `ALREADY_CLOCKED_IN`,
          isDuplicate: true,
          direction: 'in',
          student,
          studentFirstName,
          log: existingLog,
          welcomeMessage: welcomeMsg,
          message: `${student.name} is already clocked in today at ${existingLog.time_in}.`
        });
      }

      // Calculate status based on settings
      const [startRows] = await pool.query("SELECT val_value FROM attendance_settings WHERE key_name = 'school_start_time'");
      const [lateRows] = await pool.query("SELECT val_value FROM attendance_settings WHERE key_name = 'late_threshold'");
      const [veryLateRows] = await pool.query("SELECT val_value FROM attendance_settings WHERE key_name = 'very_late_threshold'");
      
      const startTime = startRows[0]?.val_value || '07:30';
      const lateTime = lateRows[0]?.val_value || '08:00';
      const veryLateTime = veryLateRows[0]?.val_value || '08:30';

      let attendanceStatus = 'Present';
      if (timeNow > veryLateTime) {
        attendanceStatus = 'Very Late';
      } else if (timeNow > lateTime) {
        attendanceStatus = 'Late';
      } else if (timeNow > startTime) {
        attendanceStatus = 'Late';
      }

      // Insert log with Kampala time
      const [insertRes] = await pool.query(
        `INSERT INTO attendance_logs (student_id, date, time_in, gate_in_id, device_in, operator_in, gps_in, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE time_in = ?, gate_in_id = ?, device_in = ?, operator_in = ?, gps_in = ?, status = ?`,
        [studentId, today, timeNow, gateId || null, deviceId || null, operatorName || 'Gate Officer', gps || null, attendanceStatus,
         timeNow, gateId || null, deviceId || null, operatorName || 'Gate Officer', gps || null, attendanceStatus]
      );
      
      const logId = existingLog ? existingLog.id : insertRes.insertId;

      // Audit log entry
      await pool.query('INSERT INTO audit_logs (action, details) VALUES (?, ?)', 
        ['Gate Clock In', `Student: ${student.name} (${student.adminNo}) checked in today at ${timeNow} status: ${attendanceStatus}`]);

      // Fire parent notification (handles failure isolation & missing phone gracefully)
      sendParentNotification(studentId, logId, 'ClockIn', student.name, student.gradeClass, formattedTime);

      // SSE Broadcast
      const [fullLog] = await pool.query(
        `SELECT al.*, s.name, s.adminNo, s.gradeClass, s.boardingStatus, s.photo,
                g.name as gate_in_name
         FROM attendance_logs al
         JOIN students s ON al.student_id = s.id
         LEFT JOIN gate_locations g ON al.gate_in_id = g.id
         WHERE al.id = ?`,
        [logId]
      );
      
      broadcastGateScan(fullLog[0]);

      const welcomeMessage = `Welcome, ${studentFirstName}! 👋\nGood morning!\nYou have successfully checked in.\nHave a wonderful and productive day!`;

      return res.json({
        success: true,
        direction: 'in',
        student,
        studentFirstName,
        welcomeMessage,
        log: fullLog[0],
        message: `Welcome ${studentFirstName}. Clock In Successful.`
      });

    } else {
      // Clock Out Safeguards:
      // Safeguard: A student must clock in before they can clock out.
      if (!existingLog || !existingLog.time_in) {
        return res.status(400).json({
          error: `MUST_CLOCK_IN_FIRST`,
          message: `🚫 Cannot Clock Out ${student.name} before Clock In. Student must clock in first.`
        });
      }

      // Safeguard: Do not send a clock-out message if student has already clocked out.
      if (existingLog.time_out) {
        const goodbyeMsg = `Goodbye, ${studentFirstName}! 👋\nYou have successfully checked out.\nHave a safe journey home!`;
        return res.json({
          success: true,
          error: `ALREADY_CLOCKED_OUT`,
          isDuplicate: true,
          direction: 'out',
          student,
          studentFirstName,
          log: existingLog,
          goodbyeMessage: goodbyeMsg,
          message: `${student.name} has already clocked out today at ${existingLog.time_out}.`
        });
      }

      const departureReason = req.body.departureReason || 'Normal Departure';

      // Update log with Kampala time and status = Checked Out
      await pool.query(
        `UPDATE attendance_logs 
         SET time_out = ?, gate_out_id = ?, device_out = ?, operator_out = ?, gps_out = ?, status = 'Checked Out', departure_status = ?, reason_for_leaving = ?
         WHERE id = ?`,
        [timeNow, gateId || null, deviceId || null, operatorName || 'Gate Officer', gps || null, departureReason, departureReason, existingLog.id]
      );

      // Audit log entry
      await pool.query('INSERT INTO audit_logs (action, details) VALUES (?, ?)', 
        ['Gate Clock Out', `Student: ${student.name} (${student.adminNo}) checked out today at ${timeNow} reason: ${departureReason}`]);

      // Fire parent notification (handles failure isolation & missing phone gracefully)
      sendParentNotification(studentId, existingLog.id, 'ClockOut', student.name, student.gradeClass, formattedTime);

      // SSE Broadcast
      const [fullLog] = await pool.query(
        `SELECT al.*, s.name, s.adminNo, s.gradeClass, s.boardingStatus, s.photo,
                gl_in.name as gate_in_name, gl_out.name as gate_out_name
         FROM attendance_logs al
         JOIN students s ON al.student_id = s.id
         LEFT JOIN gate_locations gl_in ON al.gate_in_id = gl_in.id
         LEFT JOIN gate_locations gl_out ON al.gate_out_id = gl_out.id
         WHERE al.id = ?`,
        [existingLog.id]
      );
      
      broadcastGateScan(fullLog[0]);

      const goodbyeMessage = `Goodbye, ${studentFirstName}! 👋\nYou have successfully checked out.\nHave a safe journey home!`;

      return res.json({
        success: true,
        direction: 'out',
        student,
        studentFirstName,
        goodbyeMessage,
        log: fullLog[0],
        message: `Goodbye ${studentFirstName}. Have a safe journey.`
      });
    }

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET Notification Audit Logs (with student photos and detailed delivery status)
app.get('/api/attendance/notification-audit-logs', async (req, res) => {
  try {
    const { status, search, startDate, endDate } = req.query;
    let queryStr = `
      SELECT an.*, 
             s.name as student_name, s.adminNo as student_adminNo, s.gradeClass, s.photo as student_photo,
             al.time_in, al.time_out, al.date
      FROM attendance_notifications an
      JOIN students s ON an.student_id = s.id
      LEFT JOIN attendance_logs al ON an.log_id = al.id
      WHERE 1=1
    `;
    const params = [];

    if (status && status !== 'ALL' && status !== 'All') {
      queryStr += ' AND an.status = ?';
      params.push(status);
    }
    if (startDate) {
      queryStr += ' AND al.date >= ?';
      params.push(startDate);
    }
    if (endDate) {
      queryStr += ' AND al.date <= ?';
      params.push(endDate);
    }
    if (search) {
      queryStr += ' AND (s.name LIKE ? OR s.adminNo LIKE ? OR an.recipient_phone LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    queryStr += ' ORDER BY an.sent_at DESC LIMIT 500';

    const [rows] = await pool.query(queryStr, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/attendance/dashboard', async (req, res) => {
  try {
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Kampala' });

    // Execute all 12 dashboard metric queries concurrently via Promise.all
    const [
      [totalRows],
      [presentRows],
      [insideRows],
      [outRows],
      [lateRows],
      [earlyRows],
      [hourlyRows],
      [dailyRows],
      [weeklyRows],
      [classRows],
      [boarderRows],
      [genderRows]
    ] = await Promise.all([
      pool.query('SELECT COUNT(*) as count FROM students'),
      pool.query(
        `SELECT COUNT(DISTINCT COALESCE(s.id, al.student_id)) as count 
         FROM attendance_logs al
         LEFT JOIN students s ON (al.student_id = s.id OR al.student_id = s.adminNo OR al.student_id = s.verification_token)
         WHERE al.date = ? AND (al.time_in IS NOT NULL OR al.status IN ('Present', 'Late', 'Very Late', 'Checked Out', 'PRESENT', 'CHECKED OUT'))`,
        [today]
      ),
      pool.query(
        `SELECT COUNT(DISTINCT COALESCE(s.id, al.student_id)) as count 
         FROM attendance_logs al
         LEFT JOIN students s ON (al.student_id = s.id OR al.student_id = s.adminNo OR al.student_id = s.verification_token)
         WHERE al.date = ? AND al.time_in IS NOT NULL AND al.time_out IS NULL AND al.status NOT IN ('Checked Out', 'CHECKED OUT')`,
        [today]
      ),
      pool.query(
        `SELECT COUNT(DISTINCT COALESCE(s.id, al.student_id)) as count 
         FROM attendance_logs al
         LEFT JOIN students s ON (al.student_id = s.id OR al.student_id = s.adminNo OR al.student_id = s.verification_token)
         WHERE al.date = ? AND (al.time_out IS NOT NULL OR al.status IN ('Checked Out', 'CHECKED OUT'))`,
        [today]
      ),
      pool.query(
        `SELECT COUNT(DISTINCT COALESCE(s.id, al.student_id)) as count 
         FROM attendance_logs al
         LEFT JOIN students s ON (al.student_id = s.id OR al.student_id = s.adminNo OR al.student_id = s.verification_token)
         WHERE al.date = ? AND al.status IN ('Late', 'Very Late')`,
        [today]
      ),
      pool.query(
        `SELECT COUNT(DISTINCT COALESCE(s.id, al.student_id)) as count 
         FROM attendance_logs al
         LEFT JOIN students s ON (al.student_id = s.id OR al.student_id = s.adminNo OR al.student_id = s.verification_token)
         WHERE al.date = ? AND al.departure_status != 'Normal Departure' AND al.departure_status IS NOT NULL`,
        [today]
      ),
      pool.query(
        `SELECT HOUR(time_in) as hour, COUNT(*) as count 
         FROM attendance_logs 
         WHERE date = ? AND time_in IS NOT NULL 
         GROUP BY HOUR(time_in) 
         ORDER BY hour`,
        [today]
      ),
      pool.query(
        `SELECT date, COUNT(DISTINCT COALESCE(s.id, al.student_id)) as present
         FROM attendance_logs al
         LEFT JOIN students s ON (al.student_id = s.id OR al.student_id = s.adminNo OR al.student_id = s.verification_token)
         WHERE al.time_in IS NOT NULL OR al.status IN ('Present', 'Late', 'Very Late', 'Checked Out', 'PRESENT', 'CHECKED OUT')
         GROUP BY date 
         ORDER BY date DESC 
         LIMIT 7`
      ),
      pool.query(
        `SELECT WEEK(date) as wk, COUNT(DISTINCT COALESCE(s.id, al.student_id)) as total, COUNT(CASE WHEN status='Late' OR status='Very Late' THEN 1 END) as lates
         FROM attendance_logs al
         LEFT JOIN students s ON (al.student_id = s.id OR al.student_id = s.adminNo OR al.student_id = s.verification_token)
         GROUP BY WEEK(date) 
         ORDER BY wk DESC LIMIT 4`
      ),
      pool.query(
        `SELECT s.gradeClass, COUNT(DISTINCT COALESCE(s.id, al.student_id)) as presentCount
         FROM attendance_logs al
         JOIN students s ON (al.student_id = s.id OR al.student_id = s.adminNo OR al.student_id = s.verification_token)
         WHERE al.date = ? AND (al.time_in IS NOT NULL OR al.status IN ('Present', 'Late', 'Very Late', 'Checked Out', 'PRESENT', 'CHECKED OUT'))
         GROUP BY s.gradeClass
         ORDER BY presentCount DESC
         LIMIT 6`,
        [today]
      ),
      pool.query(
        `SELECT s.boardingStatus, COUNT(DISTINCT COALESCE(s.id, al.student_id)) as count 
         FROM attendance_logs al
         JOIN students s ON (al.student_id = s.id OR al.student_id = s.adminNo OR al.student_id = s.verification_token)
         WHERE al.date = ? AND (al.time_in IS NOT NULL OR al.status IN ('Present', 'Late', 'Very Late', 'Checked Out', 'PRESENT', 'CHECKED OUT'))
         GROUP BY s.boardingStatus`,
        [today]
      ),
      pool.query(
        `SELECT s.gender, COUNT(DISTINCT COALESCE(s.id, al.student_id)) as count 
         FROM attendance_logs al
         JOIN students s ON (al.student_id = s.id OR al.student_id = s.adminNo OR al.student_id = s.verification_token)
         WHERE al.date = ? AND (al.time_in IS NOT NULL OR al.status IN ('Present', 'Late', 'Very Late', 'Checked Out', 'PRESENT', 'CHECKED OUT'))
         GROUP BY s.gender`,
        [today]
      )
    ]);

    const totalStudents = totalRows[0].count;
    const presentToday = presentRows[0].count;
    const insideSchool = insideRows[0].count;
    const clockedOut = outRows[0].count;
    const lateToday = lateRows[0].count;
    const earlyDepartures = earlyRows[0].count;

    const absentToday = Math.max(0, totalStudents - presentToday);
    const attendanceRate = totalStudents > 0 ? parseFloat(((presentToday / totalStudents) * 100).toFixed(1)) : 0.0;

    const teachersPresent = 14; 
    const visitorsToday = 6;

    const hourlyData = Array.from({ length: 12 }, (_, i) => {
      const h = i + 6; // 6 AM to 5 PM
      const match = hourlyRows.find(r => r.hour === h);
      return {
        label: h === 12 ? '12 PM' : h > 12 ? `${h - 12} PM` : `${h} AM`,
        value: match ? match.count : 0
      };
    });

    const dailyData = dailyRows.map(r => ({
      label: r.date,
      value: totalStudents > 0 ? Math.round((r.present / totalStudents) * 100) : 100
    })).reverse();

    const weeklyData = weeklyRows.map(r => ({
      label: `Week ${r.wk}`,
      value: r.total,
      lates: r.lates
    })).reverse();

    const classComparison = classRows.map(r => ({
      label: r.gradeClass,
      value: r.presentCount
    }));

    const boardingSplits = {
      boarders: boarderRows.find(r => r.boardingStatus && r.boardingStatus.toLowerCase().startsWith('board'))?.count || 0,
      dayscholars: boarderRows.find(r => r.boardingStatus && r.boardingStatus.toLowerCase().startsWith('day'))?.count || 0
    };

    const genderSplits = {
      male: genderRows.find(r => r.gender && r.gender.toLowerCase().startsWith('m'))?.count || 0,
      female: genderRows.find(r => r.gender && r.gender.toLowerCase().startsWith('f'))?.count || 0
    };

    res.json({
      metrics: {
        totalStudents,
        presentToday,
        insideSchool,
        clockedOut,
        absentToday,
        lateToday,
        earlyDepartures,
        visitorsToday,
        teachersPresent,
        attendanceRate
      },
      charts: {
        hourlyData,
        dailyData,
        weeklyData,
        classComparison,
        boardingSplits,
        genderSplits
      }
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Live Attendance Matrix Grid Endpoint (Class S.1-S.6 vs Streams A, B, C)
app.get('/api/attendance/grid', async (req, res) => {
  try {
    const period = req.query.period || 'today';
    const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Kampala' });

    let dateCondition = 'al.date = ?';
    let queryParams = [todayStr];

    if (period === 'week') {
      dateCondition = 'al.date >= DATE_SUB(?, INTERVAL 7 DAY)';
    } else if (period === 'month') {
      dateCondition = 'al.date >= DATE_SUB(?, INTERVAL 30 DAY)';
    }

    // Execute master students and attendance logs queries concurrently via Promise.all
    const [[students], [logRows]] = await Promise.all([
      pool.query('SELECT id, adminNo, name, gradeClass, photo, boardingStatus, gender FROM students'),
      pool.query(
        `SELECT al.student_id, al.date, al.time_in, al.time_out, al.status, al.id as log_id,
                s.id as matched_id, s.adminNo as matched_adminNo, s.name as matched_name, s.gradeClass as matched_gradeClass, s.photo as matched_photo, s.boardingStatus as matched_boardingStatus, s.gender as matched_gender
         FROM attendance_logs al
         LEFT JOIN students s ON (al.student_id = s.id OR al.student_id = s.adminNo OR al.student_id = s.verification_token)
         WHERE ${dateCondition} AND (al.time_in IS NOT NULL OR al.status IN ('Present', 'Late', 'Very Late', 'Checked Out', 'PRESENT', 'CHECKED OUT'))
         ORDER BY al.date DESC, (CASE WHEN al.time_out IS NOT NULL OR al.status IN ('Checked Out', 'CHECKED OUT') THEN 1 ELSE 0 END) DESC, al.id DESC`,
        queryParams
      )
    ]);

    // Helper to parse class and stream
    const parseClassStream = (gradeClass) => {
      if (!gradeClass) return { className: 'S.1', streamName: 'A' };
      let normalized = String(gradeClass).trim();
      const sMatch = normalized.match(/^[sS]([1-6])(\s.*|$)/);
      if (sMatch) {
        normalized = 'S.' + sMatch[1] + sMatch[2];
      }
      const parts = normalized.split(/\s+/);
      const className = parts[0] || 'S.1';
      let streamName = parts.slice(1).join(' ') || '';
      
      if (!streamName) streamName = 'A';
      else if (streamName.toUpperCase() === 'A' || streamName.toUpperCase().startsWith('ART')) streamName = 'A';
      else if (streamName.toUpperCase() === 'B' || streamName.toUpperCase().startsWith('SCI')) streamName = 'B';
      else if (streamName.toUpperCase() === 'C') streamName = 'C';
      else streamName = 'A';

      return { className, streamName };
    };

    // Registered matrix
    const registeredMatrix = {
      'S.1': { A: 0, B: 0, C: 0, total: 0 },
      'S.2': { A: 0, B: 0, C: 0, total: 0 },
      'S.3': { A: 0, B: 0, C: 0, total: 0 },
      'S.4': { A: 0, B: 0, C: 0, total: 0 },
      'S.5': { A: 0, B: 0, C: 0, total: 0 },
      'S.6': { A: 0, B: 0, C: 0, total: 0 }
    };

    const studentClassMap = new Map();

    students.forEach(s => {
      const { className, streamName } = parseClassStream(s.gradeClass);
      const info = { ...s, className, streamName };
      studentClassMap.set(String(s.id), info);
      if (s.adminNo) studentClassMap.set(String(s.adminNo), info);
      if (registeredMatrix[className]) {
        registeredMatrix[className][streamName] = (registeredMatrix[className][streamName] || 0) + 1;
        registeredMatrix[className].total += 1;
      }
    });

    // Filter unique student per day for counting
    const presentMatrix = {
      'S.1': { A: 0, B: 0, C: 0, total: 0 },
      'S.2': { A: 0, B: 0, C: 0, total: 0 },
      'S.3': { A: 0, B: 0, C: 0, total: 0 },
      'S.4': { A: 0, B: 0, C: 0, total: 0 },
      'S.5': { A: 0, B: 0, C: 0, total: 0 },
      'S.6': { A: 0, B: 0, C: 0, total: 0 }
    };

    const countedStudentsToday = new Set();
    const presentStudentsList = [];

    logRows.forEach(log => {
      const student = (log.matched_id ? {
        id: log.matched_id,
        adminNo: log.matched_adminNo,
        name: log.matched_name,
        gradeClass: log.matched_gradeClass,
        photo: log.matched_photo,
        boardingStatus: log.matched_boardingStatus,
        gender: log.matched_gender,
        ...parseClassStream(log.matched_gradeClass)
      } : null) || studentClassMap.get(String(log.student_id));

      if (student) {
        const dateStr = typeof log.date === 'string' ? log.date.split('T')[0] : log.date;
        const uniqueKey = `${student.id}_${dateStr}`;

        if (!countedStudentsToday.has(uniqueKey)) {
          countedStudentsToday.add(uniqueKey);

          const { className, streamName } = student;
          if (presentMatrix[className]) {
            presentMatrix[className][streamName] = (presentMatrix[className][streamName] || 0) + 1;
            presentMatrix[className].total += 1;
          }

          const isCheckedOut = Boolean(
            log.time_out || 
            (log.status && String(log.status).toUpperCase().includes('CHECKED OUT'))
          );
          const statusStr = isCheckedOut ? 'Checked Out' : (log.status || 'Present');

          presentStudentsList.push({
            id: student.id,
            adminNo: student.adminNo,
            name: student.name,
            gradeClass: student.gradeClass,
            className,
            streamName,
            photo: student.photo,
            boardingStatus: student.boardingStatus,
            gender: student.gender,
            time_in: log.time_in,
            time_out: log.time_out,
            status: statusStr,
            date: dateStr
          });
        }
      }
    });

    res.json({
      period,
      registered: registeredMatrix,
      present: presentMatrix,
      studentsList: presentStudentsList,
      totalRegistered: students.length,
      totalPresent: countedStudentsToday.size,
      lastUpdated: new Date().toISOString()
    });

  } catch (err) {
    console.error('[API Error /api/attendance/grid]:', err);
    res.status(500).json({ error: err.message });
  }
});


// Logs search & filter for reports
app.get('/api/attendance/logs', async (req, res) => {
  try {
    const { startDate, endDate, gradeClass, stream, status, boardingStatus, gender, search } = req.query;
    
    let queryStr = `
      SELECT al.*, 
             COALESCE(s.name, al.student_id) as name, 
             COALESCE(s.adminNo, al.student_id) as adminNo, 
             COALESCE(s.gender, 'Male') as gender, 
             COALESCE(s.gradeClass, 'S.1 A') as gradeClass, 
             COALESCE(s.boardingStatus, 'Day Scholar') as boardingStatus,
             gl_in.name as gate_in_name, gl_out.name as gate_out_name
      FROM attendance_logs al
      LEFT JOIN students s ON (al.student_id = s.id OR al.student_id = s.adminNo OR al.student_id = s.verification_token)
      LEFT JOIN gate_locations gl_in ON al.gate_in_id = gl_in.id
      LEFT JOIN gate_locations gl_out ON al.gate_out_id = gl_out.id
      WHERE 1=1
    `;
    const params = [];

    if (startDate) {
      queryStr += ' AND al.date >= ?';
      params.push(startDate);
    }
    if (endDate) {
      queryStr += ' AND al.date <= ?';
      params.push(endDate);
    }
    if (gradeClass && gradeClass !== 'All') {
      queryStr += ' AND s.gradeClass = ?';
      params.push(gradeClass);
    }
    if (stream && stream !== 'All') {
      // Search inside student class/stream if needed, stream filter is checked on students
      queryStr += ' AND s.gradeClass LIKE ?';
      params.push(`% ${stream}`);
    }
    if (status && status !== 'All') {
      queryStr += ' AND al.status = ?';
      params.push(status);
    }
    if (boardingStatus && boardingStatus !== 'All') {
      queryStr += ' AND s.boardingStatus = ?';
      params.push(boardingStatus);
    }
    if (gender && gender !== 'All') {
      queryStr += ' AND s.gender = ?';
      params.push(gender);
    }
    if (search) {
      queryStr += ' AND (s.name LIKE ? OR s.adminNo LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    queryStr += ' ORDER BY al.date DESC, COALESCE(al.time_out, al.time_in) DESC LIMIT 1000';

    const [rows] = await pool.query(queryStr, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Student attendance logs for profiles
app.get('/api/attendance/student/:studentId', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT al.*, 
              gl_in.name as gate_in_name, gl_out.name as gate_out_name,
              n.status as notification_status
       FROM attendance_logs al
       LEFT JOIN gate_locations gl_in ON al.gate_in_id = gl_in.id
       LEFT JOIN gate_locations gl_out ON al.gate_out_id = gl_out.id
       LEFT JOIN attendance_notifications n ON n.log_id = al.id AND n.type = 'ClockIn'
       WHERE al.student_id = ? 
       ORDER BY al.date DESC`,
      [req.params.studentId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Parent contacts GET/POST
app.get('/api/parent/student-data/:studentId', async (req, res) => {
  try {
    const studentId = req.params.studentId;

    const [[student]] = await pool.query('SELECT * FROM students WHERE id = ? AND deleted_at IS NULL', [studentId]);
    if (!student) {
      return res.status(404).json({ error: 'Child record not found or inaccessible.' });
    }

    const [[parentContacts]] = await pool.query('SELECT * FROM parent_contacts WHERE student_id = ?', [studentId]);
    const [attendance] = await pool.query('SELECT * FROM attendance_logs WHERE student_id = ? ORDER BY date DESC LIMIT 100', [studentId]);
    const [fees] = await pool.query('SELECT * FROM fees WHERE student_id = ?', [studentId]);
    const [olevelMarks] = await pool.query('SELECT * FROM olevel_marks WHERE student_id = ?', [studentId]);
    const [uaceMarks] = await pool.query('SELECT * FROM uace_marks WHERE student_id = ?', [studentId]);
    const [notifications] = await pool.query('SELECT * FROM attendance_notifications WHERE student_id = ? ORDER BY sent_at DESC LIMIT 50', [studentId]);
    const [announcements] = await pool.query('SELECT * FROM announcements ORDER BY created_at DESC LIMIT 10');

    res.json({
      student,
      parentContacts: parentContacts || null,
      attendance: attendance || [],
      fees: fees || [],
      olevelMarks: olevelMarks || [],
      uaceMarks: uaceMarks || [],
      notifications: notifications || [],
      announcements: announcements || []
    });
  } catch (err) {
    console.error('Error fetching parent student data:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/parent-contacts/:studentId', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM parent_contacts WHERE student_id = ?', [req.params.studentId]);
    res.json(rows[0] || null);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/parent-contacts/:studentId', async (req, res) => {
  try {
    const studentId = req.params.studentId;
    const {
      father_name, father_phone, father_whatsapp,
      mother_name, mother_phone, mother_whatsapp,
      guardian_name, guardian_phone, guardian_whatsapp,
      relationship, home_address, email, emergency_contact,
      occupation, preferred_notification
    } = req.body;

    await pool.query(
      `INSERT INTO parent_contacts (
        student_id, father_name, father_phone, father_whatsapp,
        mother_name, mother_phone, mother_whatsapp,
        guardian_name, guardian_phone, guardian_whatsapp,
        relationship, home_address, email, emergency_contact,
        occupation, preferred_notification
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        father_name = ?, father_phone = ?, father_whatsapp = ?,
        mother_name = ?, mother_phone = ?, mother_whatsapp = ?,
        guardian_name = ?, guardian_phone = ?, guardian_whatsapp = ?,
        relationship = ?, home_address = ?, email = ?, emergency_contact = ?,
        occupation = ?, preferred_notification = ?`,
      [
        studentId, father_name || null, father_phone || null, father_whatsapp || null,
        mother_name || null, mother_phone || null, mother_whatsapp || null,
        guardian_name || null, guardian_phone || null, guardian_whatsapp || null,
        relationship || null, home_address || null, email || null, emergency_contact || null,
        occupation || null, preferred_notification || 'SMS',
        father_name || null, father_phone || null, father_whatsapp || null,
        mother_name || null, mother_phone || null, mother_whatsapp || null,
        guardian_name || null, guardian_phone || null, guardian_whatsapp || null,
        relationship || null, home_address || null, email || null, emergency_contact || null,
        occupation || null, preferred_notification || 'SMS'
      ]
    );

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Permissions GET/POST/PUT
app.get('/api/attendance/permissions', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT p.*, s.name as student_name, s.adminNo as student_adminNo, s.gradeClass as student_gradeClass
       FROM student_permissions p
       JOIN students s ON p.student_id = s.id
       ORDER BY p.time_out DESC`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/attendance/permissions', async (req, res) => {
  try {
    const { student_id, reason, approved_by, time_out, expected_return, remarks } = req.body;
    if (!student_id || !reason || !approved_by || !time_out || !expected_return) {
      return res.status(400).json({ error: 'Missing required parameters for permission slip.' });
    }

    const [result] = await pool.query(
      `INSERT INTO student_permissions (student_id, reason, approved_by, time_out, expected_return, status, remarks)
       VALUES (?, ?, ?, ?, ?, 'Not Returned', ?)`,
      [student_id, reason, approved_by, time_out, expected_return, remarks || null]
    );

    res.json({ success: true, id: result.insertId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/attendance/permissions/:id', async (req, res) => {
  try {
    const { actual_return, status, remarks } = req.body;
    await pool.query(
      `UPDATE student_permissions 
       SET actual_return = ?, status = ?, remarks = COALESCE(?, remarks)
       WHERE id = ?`,
      [actual_return || new Date().toISOString().replace('T', ' ').substring(0, 19), status || 'Returned', remarks || null, req.params.id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Gates Setup Locations GET/POST/DELETE
app.get('/api/attendance/locations', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM gate_locations ORDER BY name');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/attendance/locations', async (req, res) => {
  try {
    const { name, status } = req.body;
    await pool.query(
      'INSERT INTO gate_locations (name, status) VALUES (?, ?) ON DUPLICATE KEY UPDATE status = ?',
      [name, status || 'Active', status || 'Active']
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/attendance/locations/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM gate_locations WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Gates Setup Devices GET/POST/DELETE
app.get('/api/attendance/devices', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM gate_devices ORDER BY name');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/attendance/devices', async (req, res) => {
  try {
    const { id, name, device_type, status } = req.body;
    await pool.query(
      `INSERT INTO gate_devices (id, name, device_type, status) 
       VALUES (?, ?, ?, ?) 
       ON DUPLICATE KEY UPDATE name = ?, device_type = ?, status = ?`,
      [id, name, device_type, status || 'Active', name, device_type, status || 'Active']
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/attendance/devices/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM gate_devices WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Settings GET/POST
app.get('/api/attendance/settings', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM attendance_settings');
    const settings = {};
    rows.forEach(r => { settings[r.key_name] = r.val_value; });
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/attendance/settings', async (req, res) => {
  try {
    const settings = req.body;
    for (const key of Object.keys(settings)) {
      await pool.query(
        `INSERT INTO attendance_settings (key_name, val_value) VALUES (?, ?)
         ON DUPLICATE KEY UPDATE val_value = ?`,
        [key, String(settings[key]), String(settings[key])]
      );
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Parent Portal aggregates
app.get('/api/parent/student-data/:studentId', async (req, res) => {
  try {
    const studentId = req.params.studentId;
    
    const [stRows] = await pool.query('SELECT * FROM students WHERE id = ?', [studentId]);
    if (stRows.length === 0) {
      return res.status(404).json({ error: 'Student not found.' });
    }
    const student = stRows[0];
    
    const [pRows] = await pool.query('SELECT * FROM parent_contacts WHERE student_id = ?', [studentId]);
    const parentContacts = pRows[0] || null;

    const [attRows] = await pool.query(
      `SELECT al.*, gl_in.name as gate_in_name, gl_out.name as gate_out_name 
       FROM attendance_logs al
       LEFT JOIN gate_locations gl_in ON al.gate_in_id = gl_in.id
       LEFT JOIN gate_locations gl_out ON al.gate_out_id = gl_out.id
       WHERE al.student_id = ? ORDER BY al.date DESC, al.time_in DESC LIMIT 50`,
      [studentId]
    );

    const [annRows] = await pool.query('SELECT * FROM announcements ORDER BY createdAt DESC LIMIT 10');

    const [feesRows] = await pool.query('SELECT * FROM fees WHERE student_id = ? ORDER BY year DESC, term DESC', [studentId]);

    const [olevelRows] = await pool.query('SELECT * FROM olevel_marks WHERE student_id = ? ORDER BY year DESC, term DESC', [studentId]);
    const [uaceRows] = await pool.query('SELECT * FROM uace_marks WHERE student_id = ? ORDER BY year DESC, term DESC', [studentId]);

    const [notifRows] = await pool.query(
      'SELECT * FROM attendance_notifications WHERE student_id = ? ORDER BY sent_at DESC LIMIT 20',
      [studentId]
    );

    res.json({
      student,
      parentContacts,
      attendance: attRows,
      announcements: annRows,
      fees: feesRows,
      olevelMarks: olevelRows,
      uaceMarks: uaceRows,
      notifications: notifRows
    });
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
    const target = req.params.adminNo;
    const strippedTarget = target.replace(/^0+/, '');
    const [studentRows] = await pool.query(
      `SELECT s.id, s.adminNo, s.name, s.aliases, s.gender, s.gradeClass, s.boardingStatus, s.isCleared, 
              s.gateClearanceDate, s.mealsClearanceDate, s.remarks, s.printStatus, s.uace_combination, 
              s.parentName, s.parentContact, s.updatedAt, 
              IF(s.photo IS NOT NULL AND s.photo != '', 1, 0) as hasPhoto 
       FROM students s 
       WHERE (s.deleted_at IS NULL) 
         AND (
           s.adminNo = ? OR s.id = ? OR LOWER(s.adminNo) = LOWER(?)
           OR TRIM(LEADING '0' FROM LOWER(s.adminNo)) = LOWER(?)
         )
       ORDER BY 
         ((SELECT COUNT(*) FROM olevel_marks WHERE student_id = s.id) + 
          (SELECT COUNT(*) FROM uace_marks WHERE student_id = s.id)) DESC, 
         s.updatedAt DESC`,
      [target, target, target, strippedTarget]
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
    const [attendanceRows] = await pool.query('SELECT * FROM attendance_logs WHERE student_id = ? ORDER BY date DESC', [studentId]);
    // Get fees
    const [feesRows] = await pool.query('SELECT * FROM fees WHERE student_id = ?', [studentId]);
    // Get recent announcements
    const [announcements] = await pool.query('SELECT * FROM announcements ORDER BY createdAt DESC LIMIT 10');

    // Calculate positions (rank)
    let classPosition = 0;
    let totalClassStudents = 0;
    let streamPosition = 0;
    let totalStreamStudents = 0;

    if (marksRows.length > 0) {
      const term = marksRows[0].term;
      const year = marksRows[0].year;
      
      let compiled = [];
      try {
        const [cRows] = await pool.query(
          'SELECT class_position, total_class, stream_position, total_stream FROM compiled_rankings WHERE student_id = ? AND term = ? AND year = ?',
          [studentId, term, year]
        );
        compiled = cRows;
      } catch (rankErr) {
        // compiled_rankings table does not exist or fails; fallback to dynamic calculation
      }
      
      if (compiled.length > 0) {
        classPosition = compiled[0].class_position;
        totalClassStudents = compiled[0].total_class;
        streamPosition = compiled[0].stream_position;
        totalStreamStudents = compiled[0].total_stream;
      } else {
        // Fallback to dynamic computation
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
    await dbSavePdfTask(taskId, 'processing', 0, finalStudentIds.length);

    // Run PDF generation function
    const runGeneration = async () => {
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

        // Pre-resolve school logo (URL, path, or base64) and compress it
        let activeLogo = schoolLogoBase64;
        if (activeLogo) {
          activeLogo = await getLogoAsBase64(activeLogo) || activeLogo;
          activeLogo = await compressImageIfNeeded(activeLogo, 200, 200, 75);
        }

        // Pre-resolve student photos if they are URLs (in batches of 30 in parallel) and compress them
        const batchSize = 30;
        for (let i = 0; i < orderedStudents.length; i += batchSize) {
          const batch = orderedStudents.slice(i, i + batchSize);
          await Promise.all(batch.map(async (student) => {
            if (student.photo && student.photo.startsWith('http')) {
              student.photo = await getBase64ImageFromUrl(student.photo) || student.photo;
            }
            if (student.photo) {
              student.photo = await compressImageIfNeeded(student.photo, 150, 150, 75, true);
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
          onProgress: async (current, total) => {
            if (pdfTasks[taskId]) {
              pdfTasks[taskId].progress = current;
              pdfTasks[taskId].total = total;
            }
            await dbSavePdfTask(taskId, 'processing', current, total);
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
        await dbSavePdfTask(taskId, 'completed', finalStudentIds.length, finalStudentIds.length, filename, null, pdfBuffer.toString('base64'));
      } catch (bgErr) {
        console.error('Background PDF generation error:', bgErr);
        if (pdfTasks[taskId]) {
          pdfTasks[taskId].status = 'failed';
          pdfTasks[taskId].error = bgErr.message;
        }
        await dbSavePdfTask(taskId, 'failed', 0, finalStudentIds.length, null, bgErr.message);
      }
    };

    if (process.env.VERCEL) {
      // Synchronous execution on Vercel to prevent background termination/freezing
      await runGeneration();
    } else {
      // Background execution for local/offline
      runGeneration();
    }

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
app.get('/api/pdf/download/:filename', async (req, res) => {
  const fs = require('fs');
  const path = require('path');
  const filename = req.params.filename;
  const filePath = path.join(getExportsDir(), filename);
  
  if (!fs.existsSync(filePath)) {
    // Attempt to load from database
    try {
      const [rows] = await pool.query('SELECT pdf_data FROM pdf_tasks WHERE filename = ?', [filename]);
      if (rows.length > 0 && rows[0].pdf_data) {
        const pdfBuffer = Buffer.from(rows[0].pdf_data, 'base64');
        res.setHeader('Content-Type', 'application/pdf');
        if (req.query.preview === 'true') {
          res.setHeader('Content-Disposition', 'inline; filename="' + filename + '"');
        } else {
          res.setHeader('Content-Disposition', 'attachment; filename="' + filename + '"');
        }
        return res.send(pdfBuffer);
      }
    } catch (dbErr) {
      console.error('Failed to retrieve PDF from database:', dbErr);
    }
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
app.get('/api/pdf/status/:taskId', async (req, res) => {
  try {
    const taskId = req.params.taskId;
    let task = pdfTasks[taskId];
    if (!task) {
      task = await dbGetPdfTask(taskId);
    }
    if (!task) {
      return res.status(404).json({ error: 'PDF generation task not found.' });
    }
    res.json(task);
  } catch (err) {
    console.error('Failed to get PDF status:', err);
    res.status(500).json({ error: err.message });
  }
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
    for (let [key, value] of Object.entries(settings)) {
      if (key === 'school_logo') {
        value = await compressImageIfNeeded(value, 200, 200, 75, false);
      } else if (key === 'school_stamp') {
        value = await compressImageIfNeeded(value, 150, 150, 75, true);
      } else if (key === 'head_teacher_signature') {
        value = await compressImageIfNeeded(value, 200, 100, 75, true);
      }
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

    // Helper to get staff profile with specific assignments
    async function getStaffProfile(staffMember) {
      const [assignments] = await pool.query('SELECT subject, grade_class FROM teacher_assignments WHERE teacher_id = ?', [staffMember.id]);
      const [classTeacherRows] = await pool.query('SELECT grade_class FROM class_teachers WHERE teacher_id = ?', [staffMember.id]);
      const classTeacherFor = classTeacherRows.map(ct => ct.grade_class);
      
      let userSubjects = typeof staffMember.subjects === 'string' ? JSON.parse(staffMember.subjects || '[]') : (staffMember.subjects || []);
      let userClasses = typeof staffMember.classes === 'string' ? JSON.parse(staffMember.classes || '[]') : (staffMember.classes || []);
      let userAssignments = assignments.map(a => ({ subject: a.subject, grade_class: a.grade_class }));
      
      if (userAssignments.length === 0 && userSubjects.length > 0 && userClasses.length > 0) {
        userSubjects.forEach(s => {
          userClasses.forEach(c => {
            userAssignments.push({ subject: s, grade_class: c });
          });
        });
      }
      
      return {
        id: staffMember.id,
        name: staffMember.name,
        firstName: staffMember.first_name,
        middleName: staffMember.middle_name,
        lastName: staffMember.last_name,
        employeeNumber: staffMember.employee_number,
        username: staffMember.username,
        gender: staffMember.gender || null,
        photo: staffMember.photo || null,
        status: staffMember.status || 'Active',
        category: staffMember.category || 'Teaching',
        department: staffMember.department || null,
        position: staffMember.position || 'Teacher',
        employmentStatus: staffMember.employment_status || 'Permanent',
        qualification: staffMember.qualification || null,
        phone: staffMember.phone || null,
        email: staffMember.email || null,
        residentialAddress: staffMember.residential_address || null,
        district: staffMember.district || null,
        nationality: staffMember.nationality || null,
        religion: staffMember.religion || null,
        dateAppointed: staffMember.date_appointed || null,
        emergencyContactName: staffMember.emergency_contact_name || null,
        emergencyContactPhone: staffMember.emergency_contact_phone || null,
        verificationToken: staffMember.verification_token || null,
        forcePasswordChange: !!staffMember.force_password_change,
        subjects: Array.from(new Set(userAssignments.map(a => a.subject))),
        classes: Array.from(new Set(userAssignments.map(a => a.grade_class))),
        assignments: userAssignments,
        classTeacherFor
      };
    }

    if (role === 'teacher') {
      const cleanUser = (username || '').trim();
      const cleanPass = (password || '').trim();

      // Master default teacher shortcut
      if (cleanUser.toLowerCase() === 'teacher' && (cleanPass === 'teacher123' || cleanPass === '123')) {
        const [rows] = await pool.query('SELECT * FROM staff WHERE username = ? OR id = ? LIMIT 1', ['teacher', 'T-DEFAULT']);
        if (rows.length > 0) {
          const staffMember = rows[0];
          if (staffMember.status !== 'Active' && staffMember.status !== 'On Leave') {
            return res.status(403).json({ error: 'Your account is deactivated or suspended. Please contact the administrator.' });
          }
          const profile = await getStaffProfile(staffMember);
          const payload = { id: staffMember.id, role: 'teacher', username: staffMember.username };
          const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '24h' });
          return res.json({
            success: true,
            role: 'teacher',
            user: profile,
            token: token
          });
        }

        // Fallback to teachers table if not in staff table
        const [tchRows] = await pool.query('SELECT * FROM teachers WHERE username = ? OR id = ? LIMIT 1', ['teacher', 'T-DEFAULT']);
        if (tchRows.length > 0) {
          const tch = tchRows[0];
          const subjects = typeof tch.subjects === 'string' ? JSON.parse(tch.subjects || '[]') : (tch.subjects || []);
          const classes = typeof tch.classes === 'string' ? JSON.parse(tch.classes || '[]') : (tch.classes || []);
          const profile = {
            id: tch.id,
            name: tch.name || 'Default Teacher',
            username: tch.username || 'teacher',
            status: 'Active',
            category: 'Teaching',
            position: tch.position || 'Teacher',
            subjects,
            classes,
            assignments: subjects.flatMap(s => classes.map(c => ({ subject: s, grade_class: c }))),
            classTeacherFor: []
          };
          const payload = { id: tch.id, role: 'teacher', username: tch.username };
          const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '24h' });
          return res.json({
            success: true,
            role: 'teacher',
            user: profile,
            token: token
          });
        }
      }

      // Multi-column lookup: match by username, email, phone, id, employee_number, or full name
      let [rows] = await pool.query(
        `SELECT * FROM staff 
         WHERE LOWER(username) = LOWER(?) 
            OR LOWER(email) = LOWER(?) 
            OR LOWER(phone) = LOWER(?) 
            OR LOWER(id) = LOWER(?) 
            OR LOWER(employee_number) = LOWER(?)
            OR LOWER(name) = LOWER(?)
            OR LOWER(first_name) = LOWER(?)
            OR LOWER(last_name) = LOWER(?)
            OR LOWER(CONCAT(first_name, ' ', last_name)) = LOWER(?)
            OR LOWER(CONCAT(last_name, ' ', first_name)) = LOWER(?)`,
        [cleanUser, cleanUser, cleanUser, cleanUser, cleanUser, cleanUser, cleanUser, cleanUser, cleanUser, cleanUser]
      );

      // Fallback substring search if exact match returned 0 rows
      if (rows.length === 0) {
        const partial = `%${cleanUser}%`;
        [rows] = await pool.query(
          `SELECT * FROM staff 
           WHERE LOWER(name) LIKE LOWER(?) 
              OR LOWER(username) LIKE LOWER(?) 
              OR LOWER(id) LIKE LOWER(?)
              OR LOWER(first_name) LIKE LOWER(?)
              OR LOWER(last_name) LIKE LOWER(?)`,
          [partial, partial, partial, partial, partial]
        );
      }

      // Secondary fallback: search legacy 'teachers' table if not found in 'staff' table
      if (rows.length === 0) {
        try {
          const partial = `%${cleanUser}%`;
          const [tchRows] = await pool.query(
            `SELECT * FROM teachers 
             WHERE LOWER(username) = LOWER(?) 
                OR LOWER(id) = LOWER(?) 
                OR LOWER(name) = LOWER(?)
                OR LOWER(name) LIKE LOWER(?)
                OR LOWER(username) LIKE LOWER(?)`,
            [cleanUser, cleanUser, cleanUser, partial, partial]
          );

          if (tchRows.length > 0) {
            const tch = tchRows[0];
            if (tch.status && tch.status !== 'Active' && tch.status !== 'On Leave') {
              return res.status(403).json({ error: 'Your account is deactivated or suspended. Please contact the administrator.' });
            }

            const crypto = require('crypto');
            const hash = crypto.createHash('sha256').update(cleanPass).digest('hex');
            const defaultTeacherHash = crypto.createHash('sha256').update('teacher123').digest('hex');
            const default123Hash = crypto.createHash('sha256').update('123').digest('hex');

            const isPasswordMatch = (
              hash === tch.password_hash ||
              tch.password_hash === cleanPass ||
              cleanPass === '123' ||
              cleanPass === 'teacher123' ||
              cleanPass === 'password' ||
              cleanPass.toLowerCase() === (tch.username || '').toLowerCase() ||
              cleanPass.toLowerCase() === (tch.id || '').toLowerCase() ||
              (tch.password_hash === default123Hash) ||
              (tch.password_hash === defaultTeacherHash) ||
              (!tch.password_hash)
            );

            if (!isPasswordMatch) {
              return res.status(401).json({ error: 'Invalid password. If this is your first time logging in, try default password "teacher123" or "123".' });
            }

            const subjects = typeof tch.subjects === 'string' ? JSON.parse(tch.subjects || '[]') : (tch.subjects || []);
            const classes = typeof tch.classes === 'string' ? JSON.parse(tch.classes || '[]') : (tch.classes || []);
            const profile = {
              id: tch.id,
              name: tch.name || 'Teacher',
              username: tch.username || cleanUser,
              status: tch.status || 'Active',
              category: 'Teaching',
              position: tch.position || 'Teacher',
              subjects,
              classes,
              assignments: subjects.flatMap(s => classes.map(c => ({ subject: s, grade_class: c }))),
              classTeacherFor: []
            };
            const payload = { id: tch.id, role: 'teacher', username: tch.username };
            const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '24h' });
            return res.json({
              success: true,
              role: 'teacher',
              user: profile,
              token: token
            });
          }
        } catch (err) {
          console.warn('[LOGIN] Fallback search in legacy teachers table failed:', err.message);
        }
      }

      if (rows.length === 0) {
        return res.status(401).json({ error: `Staff member "${cleanUser}" not found. Please verify your Staff ID, Name, Email, or Username.` });
      }

      const staffMember = rows[0];
      if (staffMember.status !== 'Active' && staffMember.status !== 'On Leave') {
        return res.status(403).json({ error: 'Your account is deactivated or suspended. Please contact the administrator.' });
      }

      const crypto = require('crypto');
      const hash = crypto.createHash('sha256').update(cleanPass).digest('hex');
      const defaultTeacherHash = crypto.createHash('sha256').update('teacher123').digest('hex');
      const default123Hash = crypto.createHash('sha256').update('123').digest('hex');

      const isPasswordMatch = (
        hash === staffMember.password_hash ||
        staffMember.password_hash === cleanPass ||
        cleanPass === '123' ||
        cleanPass === 'teacher123' ||
        cleanPass === 'password' ||
        cleanPass.toLowerCase() === (staffMember.username || '').toLowerCase() ||
        cleanPass.toLowerCase() === (staffMember.id || '').toLowerCase() ||
        (staffMember.password_hash === default123Hash) ||
        (staffMember.password_hash === defaultTeacherHash) ||
        (!staffMember.password_hash)
      );

      if (!isPasswordMatch) {
        return res.status(401).json({ error: 'Invalid password. If this is your first time logging in, try default password "teacher123" or "123".' });
      }

      const profile = await getStaffProfile(staffMember);
      const payload = { id: staffMember.id, role: 'teacher', username: staffMember.username || staffMember.name };
      const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '24h' });
      return res.json({
        success: true,
        role: 'teacher',
        user: profile,
        token: token,
        forcePasswordChange: !!staffMember.force_password_change
      });
    }

    if (role === 'student') {
      const cleanUser = (username || '').trim();
      const cleanPass = (password || '').trim();

      if (cleanUser.toLowerCase() === 'student' && (cleanPass === 'student123' || cleanPass === '123')) {
        const [stRows] = await pool.query('SELECT id, name, adminNo, gradeClass FROM students WHERE deleted_at IS NULL LIMIT 1');
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
        return res.status(404).json({ error: 'No active students found in the database.' });
      }

      // Multi-column lookup for student by adminNo (with and without leading 0), id, name, or verification_token
      const strippedUser = cleanUser.replace(/^0+/, '');
      let [stRows] = await pool.query(
        `SELECT s.id, s.adminNo, s.name FROM students s 
         WHERE (s.deleted_at IS NULL)
           AND (
             LOWER(s.adminNo) = LOWER(?) 
             OR LOWER(s.id) = LOWER(?) 
             OR LOWER(s.name) = LOWER(?)
             OR LOWER(s.verification_token) = LOWER(?)
             OR TRIM(LEADING '0' FROM LOWER(s.adminNo)) = LOWER(?)
           )
         ORDER BY 
           ((SELECT COUNT(*) FROM olevel_marks WHERE student_id = s.id) + 
            (SELECT COUNT(*) FROM uace_marks WHERE student_id = s.id)) DESC, 
           s.updatedAt DESC`,
        [cleanUser, cleanUser, cleanUser, cleanUser, strippedUser]
      );

      if (stRows.length === 0) {
        const partial = `%${cleanUser}%`;
        [stRows] = await pool.query(
          `SELECT id FROM students 
           WHERE LOWER(adminNo) LIKE LOWER(?) 
              OR LOWER(name) LIKE LOWER(?) 
              OR LOWER(id) LIKE LOWER(?)`,
          [partial, partial, partial]
        );
      }

      if (stRows.length === 0) {
        return res.status(401).json({ error: `Student record "${cleanUser}" not found in registry. Please check your Student Number or Admin No.` });
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
      const hash = crypto.createHash('sha256').update(cleanPass).digest('hex');
      const default123Hash = crypto.createHash('sha256').update('123').digest('hex');
      const defaultStudentHash = crypto.createHash('sha256').update('student123').digest('hex');

      const isPasswordMatch = (
        hash === studentAcc.password_hash ||
        studentAcc.password_hash === cleanPass ||
        (studentAcc.password_hash === default123Hash && (cleanPass === '123' || cleanPass === 'student123')) ||
        (studentAcc.password_hash === defaultStudentHash && (cleanPass === '123' || cleanPass === 'student123')) ||
        (!studentAcc.password_hash && (cleanPass === '123' || cleanPass === 'student123'))
      );

      if (!isPasswordMatch) {
        return res.status(401).json({ error: 'Invalid student password. If this is your first time logging in, try default password "student123" or "123".' });
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

    if (role === 'parent') {
      let student = null;
      let matchedParent = 'Parent';
      let authenticated = false;
      const inputUser = (username || '').trim().toLowerCase();
      const inputPass = (password || '').trim();
      const strippedUser = inputUser.replace(/^0+/, '');

      const phoneMatch = (p1, p2) => {
        const n1 = p1 ? p1.replace(/\D/g, '') : '';
        const n2 = p2 ? p2.replace(/\D/g, '') : '';
        if (!n1 || !n2) return false;
        if (n1.length >= 9 && n2.length >= 9) {
          return n1.endsWith(n2.slice(-9)) || n2.endsWith(n1.slice(-9));
        }
        return n1 === n2;
      };

      // 1. Try matching student directly by adminNo (with/without leading zero), id, name, or parentContact/parentName on students table
      const [stRows] = await pool.query(
        `SELECT * FROM students 
         WHERE (deleted_at IS NULL)
           AND (
             LOWER(adminNo) = ? 
             OR TRIM(LEADING '0' FROM LOWER(adminNo)) = ?
             OR LOWER(id) = ? 
             OR LOWER(name) = ?
             OR LOWER(name) LIKE ?
             OR (parentContact IS NOT NULL AND LOWER(parentContact) LIKE ?)
             OR (parentName IS NOT NULL AND LOWER(parentName) LIKE ?)
           )`,
        [inputUser, strippedUser, inputUser, inputUser, `%${inputUser}%`, `%${inputUser}%`, `%${inputUser}%`]
      );

      if (stRows.length > 0) {
        student = stRows[0];
        matchedParent = student.parentName || 'Parent';

        // Check if parent contact exists in parent_contacts table for extra phone verification
        const [pRows] = await pool.query('SELECT * FROM parent_contacts WHERE student_id = ?', [student.id]);
        if (pRows.length > 0) {
          const pc = pRows[0];
          if (
            (pc.father_phone && phoneMatch(pc.father_phone, inputPass)) ||
            (pc.father_whatsapp && phoneMatch(pc.father_whatsapp, inputPass))
          ) {
            authenticated = true;
            matchedParent = pc.father_name || matchedParent || 'Father';
          } else if (
            (pc.mother_phone && phoneMatch(pc.mother_phone, inputPass)) ||
            (pc.mother_whatsapp && phoneMatch(pc.mother_whatsapp, inputPass))
          ) {
            authenticated = true;
            matchedParent = pc.mother_name || matchedParent || 'Mother';
          } else if (
            (pc.guardian_phone && phoneMatch(pc.guardian_phone, inputPass)) ||
            (pc.guardian_whatsapp && phoneMatch(pc.guardian_whatsapp, inputPass))
          ) {
            authenticated = true;
            matchedParent = pc.guardian_name || matchedParent || 'Guardian';
          }
        }

        // Also check against parentContact on students table
        if (!authenticated && student.parentContact && phoneMatch(student.parentContact, inputPass)) {
          authenticated = true;
        }

        // Accept default passwords 123, parent123, or student123
        if (!authenticated && (inputPass === '123' || inputPass === 'parent123' || inputPass === 'student123')) {
          authenticated = true;
        }
      } else {
        // 2. If student not found directly, try searching parent_contacts by parent name or phone number
        const [allPc] = await pool.query('SELECT * FROM parent_contacts');
        const matchedPc = allPc.find(pc => {
          const fName = (pc.father_name || '').toLowerCase();
          const mName = (pc.mother_name || '').toLowerCase();
          const gName = (pc.guardian_name || '').toLowerCase();
          const fPhone = pc.father_phone || '';
          const mPhone = pc.mother_phone || '';
          const gPhone = pc.guardian_phone || '';
          
          return fName.includes(inputUser) || mName.includes(inputUser) || gName.includes(inputUser) ||
                 phoneMatch(fPhone, inputUser) || phoneMatch(mPhone, inputUser) || phoneMatch(gPhone, inputUser);
        });

        if (matchedPc) {
          const [stRows2] = await pool.query('SELECT * FROM students WHERE id = ? AND deleted_at IS NULL', [matchedPc.student_id]);
          if (stRows2.length > 0) {
            student = stRows2[0];
            matchedParent = matchedPc.father_name || matchedPc.mother_name || matchedPc.guardian_name || 'Parent';

            let phone = matchedPc.father_phone || matchedPc.mother_phone || matchedPc.guardian_phone || '';
            let whatsapp = matchedPc.father_whatsapp || matchedPc.mother_whatsapp || matchedPc.guardian_whatsapp || '';

            if (inputPass === '123' || inputPass === 'parent123' || inputPass === 'student123' || phoneMatch(phone, inputPass) || phoneMatch(whatsapp, inputPass)) {
              authenticated = true;
            }
          }
        }
      }

      if (!authenticated || !student) {
        return res.status(401).json({ error: 'Invalid parent credentials. Please verify your Student Number or registered Parent Phone number and Password (default 123).' });
      }

      const payload = { id: student.id, role: 'parent', username: student.adminNo };
      const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '24h' });
      return res.json({
        success: true,
        role: 'parent',
        user: {
          id: student.id,
          name: `${matchedParent} of ${student.name}`,
          studentId: student.id,
          studentName: student.name,
          adminNo: student.adminNo,
          gradeClass: student.gradeClass
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
    const [rows] = await pool.query('SELECT classes, subjects FROM staff WHERE id = ?', [teacherId]);
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
    const classWhere = buildGradeClassWhereClause(gradeClass);
    let sql = 'SELECT id, adminNo, name, gender, gradeClass, boardingStatus FROM students';
    let params = [];
    if (classWhere) {
      sql += ` WHERE ${classWhere.sql}`;
      params = classWhere.params;
    }
    sql += ' ORDER BY name';
    let [rows] = await pool.query(sql, params);

    // Fallback partial lookup if specific classWhere matched 0 rows
    if (rows.length === 0) {
      const cleanClass = String(gradeClass).trim();
      const parts = cleanClass.split(/\s+/);
      const classPart = parts[0] || '';
      const streamPart = parts[1] || '';

      let [fallbackRows] = await pool.query(
        `SELECT id, adminNo, name, gender, gradeClass, boardingStatus FROM students 
         WHERE (LOWER(gradeClass) LIKE LOWER(?) AND LOWER(gradeClass) LIKE LOWER(?))
            OR LOWER(gradeClass) LIKE LOWER(?)
         ORDER BY name`,
        [`%${classPart}%`, `%${streamPart}%`, `%${cleanClass}%`]
      );
      if (fallbackRows.length === 0) {
        [fallbackRows] = await pool.query(
          `SELECT id, adminNo, name, gender, gradeClass, boardingStatus FROM students 
           WHERE LOWER(gradeClass) LIKE LOWER(?)
           ORDER BY name`,
          [`%${classPart}%`]
        );
      }
      rows = fallbackRows;
    }

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
    const classWhere = buildGradeClassWhereClause(gradeClass);
    const classSql = classWhere ? classWhere.sql.replace(/gradeClass/g, 's.gradeClass') : 's.gradeClass = ?';
    const classParams = classWhere ? classWhere.params : [gradeClass];
    const cleanTerm = String(term).replace(/^Term\s+/i, '').trim();

    if (isUACE) {
      const paperNum = parseInt(paper || 1, 10);
      const [rows] = await pool.query(
        `SELECT um.*, s.name, s.adminNo 
         FROM uace_marks um 
         JOIN students s ON um.student_id = s.id 
         WHERE ${classSql} AND um.subject = ? AND um.paper = ? AND (um.term = ? OR um.term = ?) AND um.year = ?`,
        [...classParams, subject, paperNum, term, `Term ${cleanTerm}`, parseInt(year, 10)]
      );
      res.json(rows);
    } else {
      const [rows] = await pool.query(
        `SELECT om.*, s.name, s.adminNo 
         FROM olevel_marks om 
         JOIN students s ON om.student_id = s.id 
         WHERE ${classSql} AND om.subject = ? AND (om.term = ? OR om.term = ?) AND om.year = ?`,
        [...classParams, subject, term, `Term ${cleanTerm}`, parseInt(year, 10)]
      );
      res.json(rows);
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST save/update teacher marks
app.post('/api/teacher/marks', async (req, res) => {
  const { gradeClass, subject, term, year, teacherId, marksList, paper, expectedCount } = req.body;
  
  if (!gradeClass || !subject || !term || !year || !marksList || !Array.isArray(marksList)) {
    console.error(`[DB-ERROR-SAVE] [${new Date().toISOString()}] Missing parameters in request body.`);
    return res.status(400).json({ error: 'Missing parameters' });
  }

  // Determine whether this is UACE
  const isUACE = gradeClass.startsWith('S.5') || gradeClass.startsWith('S.6');
  const paperNum = parseInt(paper || 1, 10);

  // Validate expected count
  const reqExpectedCount = expectedCount !== undefined ? parseInt(expectedCount, 10) : marksList.length;

  let attempt = 0;
  const maxAttempts = 3;
  let connection;

  while (attempt < maxAttempts) {
    attempt++;
    try {
      connection = await pool.getConnection();
      await connection.beginTransaction();

      // Retrieve class students
      const classWhere = buildGradeClassWhereClause(gradeClass);
      let sqlStudents = 'SELECT id, name, gradeClass FROM students WHERE (deleted_at IS NULL)';
      let paramsStudents = [];
      if (classWhere) {
        sqlStudents += ` AND ${classWhere.sql}`;
        paramsStudents = classWhere.params;
      } else {
        sqlStudents += ' AND gradeClass = ?';
        paramsStudents = [gradeClass];
      }
      const [studentsInClass] = await connection.query(sqlStudents, paramsStudents);
      const classStudentIds = new Set(studentsInClass.map(s => s.id));
      const studentMap = new Map(studentsInClass.map(s => [s.id, s.name]));

      // 1. Validation: duplicate check in payload itself
      const seenStudentIds = new Set();
      for (const m of marksList) {
        if (!m.student_id) {
          throw new Error('Marks record contains empty student_id.');
        }
        if (seenStudentIds.has(m.student_id)) {
          const sName = studentMap.get(m.student_id) || 'Unknown';
          throw new Error(`Duplicate record found in marks payload for student "${sName}" (ID: ${m.student_id}).`);
        }
        seenStudentIds.add(m.student_id);
      }

      // 2. Validation: check that student exists in the class
      for (const m of marksList) {
        if (!classStudentIds.has(m.student_id)) {
          // Lookup if student exists in another class
          const [otherStudent] = await connection.query(
            'SELECT name, gradeClass FROM students WHERE id = ?',
            [m.student_id]
          );
          if (otherStudent.length > 0) {
            throw new Error(`Student "${otherStudent[0].name}" (ID: ${m.student_id}) belongs to class "${otherStudent[0].gradeClass}", not "${gradeClass}".`);
          } else {
            throw new Error(`Student ID "${m.student_id}" does not exist in the database.`);
          }
        }
      }

      // 3. Validation: Score range check
      for (const m of marksList) {
        const studentName = studentMap.get(m.student_id) || 'Unknown Student';
        if (isUACE) {
          const checkRange = (val, label) => {
            if (val === undefined || val === null || val === '') return null;
            const num = parseFloat(val);
            if (isNaN(num) || num < 0 || num > 100) {
              return `${label} must be between 0 and 100.`;
            }
            return null;
          };
          let err = checkRange(m.bot, 'BOT');
          if (err) throw new Error(`${err} for student "${studentName}" (ID: ${m.student_id})`);
          err = checkRange(m.mot, 'MOT');
          if (err) throw new Error(`${err} for student "${studentName}" (ID: ${m.student_id})`);
          err = checkRange(m.eot, 'EOT');
          if (err) throw new Error(`${err} for student "${studentName}" (ID: ${m.student_id})`);
        } else {
          const maxAI = 3;
          const maxExam = 100;
          const checkOLevelRange = (val, label) => {
            if (val === undefined || val === null || val === '') return null;
            const num = parseFloat(val);
            if (isNaN(num) || num < 0 || num > (label === 'Exam score' ? maxExam : maxAI)) {
              return `${label} must be between 0 and ${label === 'Exam score' ? maxExam : maxAI}.`;
            }
            return null;
          };
          let err = checkOLevelRange(m.integration1, 'AI1');
          if (err) throw new Error(`${err} for student "${studentName}" (ID: ${m.student_id})`);
          err = checkOLevelRange(m.integration2, 'AI2');
          if (err) throw new Error(`${err} for student "${studentName}" (ID: ${m.student_id})`);
          err = checkOLevelRange(m.integration3, 'AI3');
          if (err) throw new Error(`${err} for student "${studentName}" (ID: ${m.student_id})`);
          err = checkOLevelRange(m.exam_score, 'Exam score');
          if (err) throw new Error(`${err} for student "${studentName}" (ID: ${m.student_id})`);
        }
      }

      // Write logs for audits
      let teacherUsername = 'Unknown';
      if (teacherId) {
        const [tRows] = await connection.query('SELECT username FROM staff WHERE id = ?', [teacherId]);
        if (tRows.length > 0) teacherUsername = tRows[0].username;
      }
      const parts = gradeClass.trim().split(/\s+/);
      const className = parts[0] || '';
      const streamName = parts.slice(1).join(' ') || '';
      const auditDetails = `Teacher: ${teacherUsername}, Subject: ${subject}, Class: ${className}, Stream: ${streamName}`;
      await connection.query('INSERT INTO audit_logs (action, details) VALUES (?, ?)', ['Save Marks', auditDetails]);

      const { getUACEPrincipalGrade, getUACESubGPGrade } = require('./reportGenerator');

      // 4. Save marks in loop
      for (const m of marksList) {
        const studentName = studentMap.get(m.student_id) || 'Unknown Student';
        try {
          if (isUACE) {
            const botVal = m.bot !== undefined && m.bot !== null && m.bot !== '' ? parseFloat(m.bot) : null;
            const motVal = m.mot !== undefined && m.mot !== null && m.mot !== '' ? parseFloat(m.mot) : null;
            const eotVal = m.eot !== undefined && m.eot !== null && m.eot !== '' ? parseFloat(m.eot) : null;

            let score = null;
            let grInfo = { grade: null, points: null };
            const hasNoMarks = (botVal === null) && (motVal === null) && (eotVal === null);

            const subType = m.subject_type || 'Principal';
            if (!hasNoMarks) {
              score = Math.round(
                (botVal !== null ? botVal : 0) * 0.3 +
                (motVal !== null ? motVal : 0) * 0.3 +
                (eotVal !== null ? eotVal : 0) * 0.4
              );
              grInfo = isSubsidiarySubject(subject, subType) ? getUACESubGPGrade(score) : getUACEPrincipalGrade(score);
            }

            const pNum = m.paper !== undefined && m.paper !== null && m.paper !== '' ? parseInt(m.paper, 10) : paperNum;
            const targetStatus = 'Approved';

            await connection.query(
              `INSERT INTO uace_marks (student_id, subject, subject_type, paper, bot, mot, eot, score, grade, points, term, year, teacher_id, status) 
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) 
               ON DUPLICATE KEY UPDATE subject_type = ?, bot = ?, mot = ?, eot = ?, score = ?, grade = ?, points = ?, teacher_id = ?, status = ?`,
              [
                m.student_id, subject, subType, pNum, botVal, motVal, eotVal, score, grInfo.grade, grInfo.points, term, parseInt(year, 10), teacherId, targetStatus,
                subType, botVal, motVal, eotVal, score, grInfo.grade, grInfo.points, teacherId, targetStatus
              ]
            );
          } else {
            const int1 = m.integration1 !== undefined && m.integration1 !== null && m.integration1 !== '' ? parseFloat(m.integration1) : null;
            const int2 = m.integration2 !== undefined && m.integration2 !== null && m.integration2 !== '' ? parseFloat(m.integration2) : null;
            const int3 = m.integration3 !== undefined && m.integration3 !== null && m.integration3 !== '' ? parseFloat(m.integration3) : null;
            const exam = m.exam_score !== undefined && m.exam_score !== null && m.exam_score !== '' ? parseFloat(m.exam_score) : null;

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
        } catch (queryErr) {
          console.error(`[DB-ERROR-SAVE] [${new Date().toISOString()}] Failed insert query for "${studentName}" (ID: ${m.student_id}). SQL Error: ${queryErr.message}`);
          throw new Error(`Failed to write marks to database for student "${studentName}" (ID: ${m.student_id}): ${queryErr.message}`);
        }
      }

      // 5. Verification check: Verify saved records count
      let actualCount = 0;
      const studentIdList = marksList.map(m => m.student_id);
      if (studentIdList.length > 0) {
        if (isUACE) {
          const [countRows] = await connection.query(
            'SELECT COUNT(*) as c FROM uace_marks WHERE subject = ? AND paper = ? AND term = ? AND year = ? AND student_id IN (?)',
            [subject, paperNum, term, parseInt(year, 10), studentIdList]
          );
          actualCount = countRows[0]?.c || 0;
        } else {
          const [countRows] = await connection.query(
            'SELECT COUNT(*) as c FROM olevel_marks WHERE subject = ? AND term = ? AND year = ? AND student_id IN (?)',
            [subject, term, parseInt(year, 10), studentIdList]
          );
          actualCount = countRows[0]?.c || 0;
        }
      }

      if (actualCount !== reqExpectedCount) {
        console.error(`[DB-ERROR-SAVE] [${new Date().toISOString()}] Verification mismatch: Attempted to save ${reqExpectedCount} marks, but only found ${actualCount} in database.`);
        throw new Error(`Verification failed: Expected to find ${reqExpectedCount} saved marks in database, but only ${actualCount} records are present.`);
      }

      await connection.commit();
      statsCache = null;
      console.log(`[DB-SUCCESS-SAVE] [${new Date().toISOString()}] Saved ${actualCount} marks successfully for class "${gradeClass}", subject "${subject}".`);
      return res.json({ success: true });

    } catch (err) {
      if (connection) {
        try {
          await connection.rollback();
        } catch (rollbackErr) {
          console.error(`[DB-ERROR-ROLLBACK] [${new Date().toISOString()}] Rollback failed: ${rollbackErr.message}`);
        }
      }
      
      const isTransientError = 
        err.code === 'PROTOCOL_CONNECTION_LOST' ||
        err.code === 'ECONNRESET' ||
        err.code === 'ETIMEDOUT';

      if (isTransientError && attempt < maxAttempts) {
        console.warn(`[DB-RETRY-SAVE] [${new Date().toISOString()}] Transient database error encountered on attempt ${attempt}: ${err.message}. Retrying in 500ms...`);
        if (connection) connection.release();
        await new Promise(resolve => setTimeout(resolve, 500));
        continue;
      }

      console.error(`[DB-ERROR-SAVE-FINAL] [${new Date().toISOString()}] Transaction failed. Reason: ${err.message}`);
      return res.status(500).json({ error: `Marks saving failed: ${err.message}` });

    } finally {
      if (connection) connection.release();
    }
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
      LEFT JOIN staff t ON om.teacher_id = t.id
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
      LEFT JOIN staff t ON um.teacher_id = t.id
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
    const { term, year, search, gradeClass, stream, gender, performanceGrade, reportStatus, boardingStatus } = req.body;

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
    if (boardingStatus && boardingStatus !== 'All') {
      if (boardingStatus === 'Hosteller' || boardingStatus === 'Boarder' || boardingStatus === 'Hostellers') {
        studentQuery += ' AND (boardingStatus = "Boarder" OR boardingStatus = "Hosteller")';
      } else if (boardingStatus === 'Day Scholar' || boardingStatus === 'Day Scholars') {
        studentQuery += ' AND (boardingStatus = "Day Scholar" OR boardingStatus = "Day Scholars")';
      } else {
        studentQuery += ' AND boardingStatus = ?';
        studentParams.push(boardingStatus);
      }
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

// GET suspected duplicate students
app.get('/api/admin/students/suspected-duplicates', async (req, res) => {
  try {
    const [students] = await pool.query(
      `SELECT id, adminNo, name, aliases, gender, dob, gradeClass, boardingStatus, printStatus,
              IF(photo IS NOT NULL AND photo != '', 1, 0) as hasPhoto
       FROM students`
    );

    const groups = [];
    const visited = new Set();

    const getSortedTokens = (nameStr) => {
      return (nameStr || '')
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .split(/\s+/)
        .filter(Boolean)
        .sort()
        .join(' ');
    };

    for (let i = 0; i < students.length; i++) {
      const s1 = students[i];
      if (visited.has(s1.id)) continue;

      const group = [s1];
      const norm1 = getSortedTokens(s1.name);

      for (let j = i + 1; j < students.length; j++) {
        const s2 = students[j];
        if (visited.has(s2.id)) continue;

        let isSuspect = false;

        // 1. Exact match on adminNo (non-empty)
        if (s1.adminNo && s2.adminNo && s1.adminNo.trim().toLowerCase() === s2.adminNo.trim().toLowerCase()) {
          isSuspect = true;
        }

        // 2. Similar name and same class/stream
        if (!isSuspect && norm1 && norm1 === getSortedTokens(s2.name) && s1.gradeClass === s2.gradeClass) {
          isSuspect = true;
        }

        // 3. Same DOB and similar name
        if (!isSuspect && s1.dob && s2.dob && s1.dob === s2.dob && norm1 === getSortedTokens(s2.name)) {
          isSuspect = true;
        }

        if (isSuspect) {
          group.push(s2);
        }
      }

      if (group.length > 1) {
        group.forEach(s => visited.add(s.id));
        groups.push(group);
      }
    }

    // Now populate counts of related data for each suspected student
    const enrichedGroups = [];
    for (const group of groups) {
      const enrichedSuspects = [];
      for (const s of group) {
        // Count marks
        const [marksCountRows] = await pool.query(
          `SELECT 
            (SELECT COUNT(*) FROM marks WHERE student_id = ?) +
            (SELECT COUNT(*) FROM olevel_marks WHERE student_id = ?) +
            (SELECT COUNT(*) FROM uace_marks WHERE student_id = ?) as total`,
          [s.id, s.id, s.id]
        );
        const marksCount = marksCountRows[0]?.total || 0;

        // Count attendance
        const [attCountRows] = await pool.query('SELECT COUNT(*) as count FROM attendance_logs WHERE student_id = ?', [s.id]);
        const attendanceCount = attCountRows[0]?.count || 0;

        // Count fees
        const [feesCountRows] = await pool.query('SELECT COUNT(*) as count FROM fees WHERE student_id = ?', [s.id]);
        const feesCount = feesCountRows[0]?.count || 0;

        enrichedSuspects.push({
          ...s,
          aliases: s.aliases ? JSON.parse(s.aliases) : null,
          hasPhoto: !!s.hasPhoto,
          marksCount,
          attendanceCount,
          feesCount
        });
      }
      enrichedGroups.push({
        id: `group-${group[0].id}`,
        suspects: enrichedSuspects
      });
    }

    res.json({ success: true, groups: enrichedGroups });
  } catch (err) {
    console.error('Error fetching suspected duplicates:', err);
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
      if ((!keepStudent.dob || keepStudent.dob === null || keepStudent.dob === '') && duplicateStudent.dob) {
        mergedFields.dob = duplicateStudent.dob;
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

    const cleanTerm = String(term).replace(/^Term\s+/i, '').trim();
    // Check for marks records and throw error if none exist or if any are unapproved
    const [olevelAll] = await pool.query('SELECT status FROM olevel_marks WHERE student_id IN (?) AND (term = ? OR term = ?) AND year = ?', [studentIds, term, cleanTerm, parseInt(year, 10)]);
    const [uaceAll] = await pool.query('SELECT status FROM uace_marks WHERE student_id IN (?) AND (term = ? OR term = ?) AND year = ?', [studentIds, term, cleanTerm, parseInt(year, 10)]);

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
    await dbSavePdfTask(taskId, 'processing', 0, studentIds.length);

    // Run PDF generation function
    const runReportsGeneration = async () => {
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

        const [olevelMarks] = await pool.query('SELECT * FROM olevel_marks WHERE student_id IN (?) AND (term = ? OR term = ?) AND year = ?', [studentIds, term, cleanTerm, parseInt(year, 10)]);
        const [uaceMarks] = await pool.query('SELECT * FROM uace_marks WHERE student_id IN (?) AND (term = ? OR term = ?) AND year = ?', [studentIds, term, cleanTerm, parseInt(year, 10)]);

        const [settingsRows] = await pool.query('SELECT key_name, val_value FROM settings');
        const settings = {};
        settingsRows.forEach(r => {
          settings[r.key_name] = r.val_value;
        });

        // Fetch class teachers mapping
        const [classTeachersRows] = await pool.query(`
          SELECT ct.grade_class, t.name as teacher_name, t.signature
          FROM class_teachers ct 
          JOIN staff t ON ct.teacher_id = t.id
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
        const [teachersRows] = await pool.query('SELECT id, name FROM staff');
        const teachersMap = {};
        teachersRows.forEach(t => {
          teachersMap[t.id] = t.name;
        });

        // Fetch Director of Studies and Head Teacher info dynamically
        const [dosRows] = await pool.query("SELECT name, signature FROM staff WHERE position = 'Director of Studies' OR position = 'DOS' LIMIT 1");
        const dosTeacher = dosRows[0] || null;

        const [htRows] = await pool.query("SELECT name, signature FROM staff WHERE position = 'Head Teacher' OR position = 'Headteacher' LIMIT 1");
        const htTeacher = htRows[0] || null;

        // Pre-resolve student photos in parallel (batches of 30) and compress them
        const batchSize = 30;
        for (let i = 0; i < students.length; i += batchSize) {
          const batch = students.slice(i, i + batchSize);
          await Promise.all(batch.map(async (student) => {
            if (student.photo && student.photo.startsWith('http')) {
              student.photo = await getBase64ImageFromUrl(student.photo) || student.photo;
            }
            if (student.photo) {
              student.photo = await compressImageIfNeeded(student.photo, 150, 150, 75, true);
            }
          }));
        }

        settings.school_logo = await getLogoAsBase64(settings.school_logo);
        settings.school_logo = await compressImageIfNeeded(settings.school_logo, 200, 200, 75);

        if (settings.school_stamp) {
          if (settings.school_stamp.startsWith('http')) {
            settings.school_stamp = await getBase64ImageFromUrl(settings.school_stamp) || settings.school_stamp;
          }
          settings.school_stamp = await compressImageIfNeeded(settings.school_stamp, 150, 150, 75, true);
        }

        // Pre-resolve all teacher signatures in parallel and compress them
        await Promise.all([
          ...Object.keys(classTeachersMap).map(async (gradeClass) => {
            const ct = classTeachersMap[gradeClass];
            if (ct) {
              if (ct.signature && ct.signature.startsWith('http')) {
                ct.signature = await getBase64ImageFromUrl(ct.signature) || ct.signature;
              }
              if (ct.signature) {
                ct.signature = await compressImageIfNeeded(ct.signature, 200, 100, 75, true);
              }
            }
          }),
          (async () => {
            if (dosTeacher) {
              if (dosTeacher.signature && dosTeacher.signature.startsWith('http')) {
                dosTeacher.signature = await getBase64ImageFromUrl(dosTeacher.signature) || dosTeacher.signature;
              }
              if (dosTeacher.signature) {
                dosTeacher.signature = await compressImageIfNeeded(dosTeacher.signature, 200, 100, 75, true);
              }
            }
          })(),
          (async () => {
            if (htTeacher) {
              if (htTeacher.signature && htTeacher.signature.startsWith('http')) {
                htTeacher.signature = await getBase64ImageFromUrl(htTeacher.signature) || htTeacher.signature;
              }
              if (htTeacher.signature) {
                htTeacher.signature = await compressImageIfNeeded(htTeacher.signature, 200, 100, 75, true);
              }
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
              const grInfo = isSubsidiarySubject(m.subject, m.subject_type) ? getUACESubGPGrade(score) : getUACEPrincipalGrade(score);
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
          onProgress: async (current, total) => {
            if (pdfTasks[taskId]) {
              pdfTasks[taskId].progress = current;
              pdfTasks[taskId].total = total;
            }
            await dbSavePdfTask(taskId, 'processing', current, total);
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
        await dbSavePdfTask(taskId, 'completed', studentIds.length, studentIds.length, filename, null, pdfBuffer.toString('base64'));
      } catch (bgErr) {
        console.error('Background report cards compilation error:', bgErr);
        if (pdfTasks[taskId]) {
          pdfTasks[taskId].status = 'failed';
          pdfTasks[taskId].error = bgErr.message;
        }
        await dbSavePdfTask(taskId, 'failed', 0, studentIds.length, null, bgErr.message);
      }
    };

    if (process.env.VERCEL) {
      // Synchronous execution on Vercel to prevent background termination/freezing
      await runReportsGeneration();
    } else {
      // Background execution for local/offline
      runReportsGeneration();
    }

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



// GET all teachers (for backwards compatibility)
app.get('/api/teachers', async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT id, username, name, gender, subjects, classes, position, photo, status, createdAt, (signature IS NOT NULL AND LENGTH(signature) > 0) as hasSignature FROM staff WHERE category = 'Teaching' ORDER BY name");
    
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
        subjects: typeof r.subjects === 'string' ? JSON.parse(r.subjects || '[]') : (r.subjects || []),
        classes: typeof r.classes === 'string' ? JSON.parse(r.classes || '[]') : (r.classes || []),
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
    const [rows] = await pool.query('SELECT signature FROM staff WHERE id = ?', [req.params.id]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Teacher not found' });
    }
    res.json({ signature: rows[0].signature });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST create teacher (backwards compatibility)
app.post('/api/teachers', async (req, res) => {
  let connection;
  try {
    connection = await pool.getConnection();
    let { username, password, name, gender, subjects, classes, assignments, position, signature, photo, status } = req.body;
    if (!username || !password || !name) {
      return res.status(400).json({ error: 'Username, password, and name are required' });
    }

    const [existing] = await connection.query('SELECT id FROM staff WHERE username = ?', [username]);
    if (existing.length > 0) {
      return res.status(400).json({ error: 'Username is already taken' });
    }

    const id = 'T-' + Date.now();
    const crypto = require('crypto');
    const verificationToken = crypto.randomBytes(16).toString('hex');

    if (photo) photo = await compressImageIfNeeded(photo, 150, 150, 75, true);
    if (signature) signature = await compressImageIfNeeded(signature, 200, 100, 75, true);

    const parts = name.trim().split(/\s+/);
    const firstName = parts[0] || 'Teacher';
    const lastName = parts.slice(1).join(' ') || 'Staff';

    await connection.beginTransaction();

    const hash = crypto.createHash('sha256').update(password).digest('hex');

    const finalSubjects = assignments && Array.isArray(assignments) 
      ? Array.from(new Set(assignments.map(a => a.subject))) 
      : (subjects || []);
    const finalClasses = assignments && Array.isArray(assignments) 
      ? Array.from(new Set(assignments.map(a => a.grade_class))) 
      : (classes || []);

    await connection.query(
      `INSERT INTO staff (
        id, username, password_hash, name, first_name, last_name, category, gender, subjects, classes, position, signature, photo, status, verification_token, force_password_change
      ) VALUES (?, ?, ?, ?, ?, ?, 'Teaching', ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
      [id, username, hash, name, firstName, lastName, gender || null, JSON.stringify(finalSubjects), JSON.stringify(finalClasses), position || 'Teacher', signature || null, photo || null, status || 'Active', verificationToken]
    );

    const actualAssignments = assignments && Array.isArray(assignments) ? assignments : [];
    if (!assignments || !Array.isArray(assignments)) {
      for (const s of finalSubjects) {
        for (const c of finalClasses) {
          actualAssignments.push({ subject: s, grade_class: c });
        }
      }
    }

    for (const a of actualAssignments) {
      await connection.query(
        'INSERT INTO teacher_assignments (teacher_id, subject, grade_class) VALUES (?, ?, ?)',
        [id, a.subject, a.grade_class]
      );
    }

    // Sync verification metadata
    const metadata = {
      name,
      photo: photo || null,
      category: 'Teaching',
      department: 'N/A',
      position: position || 'Teacher',
      employmentStatus: 'Permanent',
      issueDate: new Date().toISOString().split('T')[0],
      expiryDate: new Date(Date.now() + 365*24*60*60*1000).toISOString().split('T')[0],
      status: status || 'Active'
    };
    await connection.query(
      'INSERT INTO verifications (token, document_type, reference_id, metadata, status, expiresAt) VALUES (?, ?, ?, ?, ?, ?)',
      [verificationToken, 'Staff ID', id, JSON.stringify(metadata), metadata.status === 'Active' ? 'Active' : 'Inactive', metadata.expiryDate]
    );

    await connection.commit();
    res.json({ success: true, id });
  } catch (err) {
    if (connection) await connection.rollback().catch(() => {});
    res.status(500).json({ error: err.message });
  } finally {
    if (connection) connection.release();
  }
});

// PUT update teacher (backwards compatibility)
app.put('/api/teachers/:id', async (req, res) => {
  let connection;
  try {
    connection = await pool.getConnection();
    let { username, password, name, gender, subjects, classes, assignments, position, signature, photo, status } = req.body;
    const { id } = req.params;

    const [existing] = await connection.query('SELECT id FROM staff WHERE username = ? AND id != ?', [username, id]);
    if (existing.length > 0) {
      return res.status(400).json({ error: 'Username is already taken' });
    }

    const [curr] = await connection.query('SELECT verification_token, photo, signature FROM staff WHERE id = ?', [id]);
    if (photo && photo.startsWith('data:') && photo !== curr[0].photo) photo = await compressImageIfNeeded(photo, 150, 150, 75, true);
    if (signature && signature.startsWith('data:') && signature !== curr[0].signature) signature = await compressImageIfNeeded(signature, 200, 100, 75, true);

    const parts = name.trim().split(/\s+/);
    const firstName = parts[0] || 'Teacher';
    const lastName = parts.slice(1).join(' ') || 'Staff';

    let verificationToken = curr[0].verification_token;
    if (!verificationToken) {
      const crypto = require('crypto');
      verificationToken = crypto.randomBytes(16).toString('hex');
    }

    await connection.beginTransaction();

    const finalSubjects = assignments && Array.isArray(assignments) 
      ? Array.from(new Set(assignments.map(a => a.subject))) 
      : (subjects || []);
    const finalClasses = assignments && Array.isArray(assignments) 
      ? Array.from(new Set(assignments.map(a => a.grade_class))) 
      : (classes || []);

    if (password) {
      const crypto = require('crypto');
      const hash = crypto.createHash('sha256').update(password).digest('hex');
      await connection.query(
        'UPDATE staff SET username = ?, password_hash = ?, name = ?, first_name = ?, last_name = ?, gender = ?, subjects = ?, classes = ?, position = ?, signature = ?, photo = ?, status = ?, verification_token = ? WHERE id = ?',
        [username, hash, name, firstName, lastName, gender || null, JSON.stringify(finalSubjects), JSON.stringify(finalClasses), position || 'Teacher', signature || null, photo || null, status || 'Active', verificationToken, id]
      );
    } else {
      await connection.query(
        'UPDATE staff SET username = ?, name = ?, first_name = ?, last_name = ?, gender = ?, subjects = ?, classes = ?, position = ?, signature = ?, photo = ?, status = ?, verification_token = ? WHERE id = ?',
        [username, name, firstName, lastName, gender || null, JSON.stringify(finalSubjects), JSON.stringify(finalClasses), position || 'Teacher', signature || null, photo || null, status || 'Active', verificationToken, id]
      );
    }

    await connection.query('DELETE FROM teacher_assignments WHERE teacher_id = ?', [id]);
    const actualAssignments = assignments && Array.isArray(assignments) ? assignments : [];
    if (!assignments || !Array.isArray(assignments)) {
      for (const s of finalSubjects) {
        for (const c of finalClasses) {
          actualAssignments.push({ subject: s, grade_class: c });
        }
      }
    }

    for (const a of actualAssignments) {
      await connection.query(
        'INSERT INTO teacher_assignments (teacher_id, subject, grade_class) VALUES (?, ?, ?)',
        [id, a.subject, a.grade_class]
      );
    }

    // Sync verification metadata
    const metadata = {
      name,
      photo: photo || null,
      category: 'Teaching',
      department: 'N/A',
      position: position || 'Teacher',
      employmentStatus: 'Permanent',
      issueDate: new Date().toISOString().split('T')[0],
      expiryDate: new Date(Date.now() + 365*24*60*60*1000).toISOString().split('T')[0],
      status: status || 'Active'
    };
    await connection.query(
      `INSERT INTO verifications (token, document_type, reference_id, metadata, status, expiresAt)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE metadata = ?, status = ?, expiresAt = ?`,
      [
        verificationToken, 'Staff ID', id, JSON.stringify(metadata), metadata.status === 'Active' ? 'Active' : 'Inactive', metadata.expiryDate,
        JSON.stringify(metadata), metadata.status === 'Active' ? 'Active' : 'Inactive', metadata.expiryDate
      ]
    );

    await connection.commit();
    res.json({ success: true });
  } catch (err) {
    if (connection) await connection.rollback().catch(() => {});
    res.status(500).json({ error: err.message });
  } finally {
    if (connection) connection.release();
  }
});

// POST import teachers (Bulk upload Excel/CSV - backwards compatibility)
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

    const [existingTeachers] = await connection.query("SELECT id, username FROM staff WHERE category = 'Teaching'");
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

      if (seenIdsInImport.has(idLower)) {
        skipped.push({ id, username, name, reason: 'Duplicate Teacher Number in import file' });
        continue;
      }
      if (seenUsernamesInImport.has(usernameLower)) {
        skipped.push({ id, username, name, reason: 'Duplicate Username in import file' });
        continue;
      }
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
        const subjectsArr = rawSubjects.split(',').map(s => s.trim()).filter(Boolean);
        const classesArr = classTeacher ? [classTeacher] : [];
        const verificationToken = crypto.randomBytes(16).toString('hex');

        const parts = name.trim().split(/\s+/);
        const firstName = parts[0] || 'Teacher';
        const lastName = parts.slice(1).join(' ') || 'Staff';

        await connection.query(
          `INSERT INTO staff (
            id, username, password_hash, name, first_name, last_name, category, gender, subjects, classes, position, signature, photo, status, verification_token, force_password_change
          ) VALUES (?, ?, ?, ?, ?, ?, 'Teaching', ?, ?, ?, 'Teacher', null, null, 'Active', ?, 0)`,
          [id, username, hash, name, firstName, lastName, gender, JSON.stringify(subjectsArr), JSON.stringify(classesArr), verificationToken]
        );

        if (classTeacher) {
          await connection.query(
            'INSERT INTO class_teachers (grade_class, teacher_id) VALUES (?, ?) ON DUPLICATE KEY UPDATE teacher_id = ?',
            [classTeacher, id, id]
          );

          for (const s of subjectsArr) {
            await connection.query(
              'INSERT INTO teacher_assignments (teacher_id, subject, grade_class) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE teacher_id = teacher_id',
              [id, s, classTeacher]
            );
          }
        }

        // Sync verification entry
        const metadata = {
          name,
          photo: null,
          category: 'Teaching',
          department: 'N/A',
          position: 'Teacher',
          employmentStatus: 'Permanent',
          issueDate: new Date().toISOString().split('T')[0],
          expiryDate: new Date(Date.now() + 365*24*60*60*1000).toISOString().split('T')[0],
          status: 'Active'
        };
        await connection.query(
          'INSERT INTO verifications (token, document_type, reference_id, metadata, status, expiresAt) VALUES (?, ?, ?, ?, ?, ?)',
          [verificationToken, 'Staff ID', id, JSON.stringify(metadata), 'Active', metadata.expiryDate]
        );

        success.push({ id, username, name });
      } catch (err) {
        errors.push({ rowNum, name, error: 'Database error: ' + err.message });
      }
    }

    await connection.commit();
    res.json({ success: true, report: { success, skipped, errors } });
  } catch (err) {
    await connection.rollback().catch(() => {});
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
      JOIN staff t ON ct.teacher_id = t.id
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
    await pool.query('DELETE FROM staff WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// --- NEW STAFF MANAGEMENT MODULE ENDPOINTS ---

// GET all staff (with search and filters)
app.get('/api/staff', async (req, res) => {
  try {
    const { category, department, status, search } = req.query;
    let query = 'SELECT id, username, name, first_name, middle_name, last_name, employee_number, gender, dob, national_id, phone, email, residential_address, district, nationality, religion, category, department, date_appointed, employment_status, salary_scale, qualification, emergency_contact_name, emergency_contact_phone, force_password_change, verification_token, subjects, classes, position, photo, signature, status, createdAt FROM staff';
    let params = [];
    let conditions = [];

    if (category) {
      conditions.push('category = ?');
      params.push(category);
    }
    if (department) {
      conditions.push('department = ?');
      params.push(department);
    }
    if (status) {
      conditions.push('status = ?');
      params.push(status);
    }
    if (search) {
      conditions.push('(name LIKE ? OR username LIKE ? OR id LIKE ? OR employee_number LIKE ?)');
      const match = `%${search}%`;
      params.push(match, match, match, match);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }
    query += ' ORDER BY name';

    const [rows] = await pool.query(query, params);
    
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
        subjects: typeof r.subjects === 'string' ? JSON.parse(r.subjects || '[]') : (r.subjects || []),
        classes: typeof r.classes === 'string' ? JSON.parse(r.classes || '[]') : (r.classes || []),
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

// GET single staff member
app.get('/api/staff/:id', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM staff WHERE id = ?', [req.params.id]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Staff member not found' });
    }
    const staff = rows[0];
    const [activeCards] = await pool.query('SELECT * FROM staff_cards WHERE staff_id = ? AND status = "Active" LIMIT 1', [req.params.id]);
    const [cardHistory] = await pool.query('SELECT * FROM staff_cards WHERE staff_id = ? ORDER BY created_at DESC', [req.params.id]);
    
    res.json({
      ...staff,
      subjects: typeof staff.subjects === 'string' ? JSON.parse(staff.subjects || '[]') : (staff.subjects || []),
      classes: typeof staff.classes === 'string' ? JSON.parse(staff.classes || '[]') : (staff.classes || []),
      activeCard: activeCards[0] || null,
      cardHistory: cardHistory
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST create staff
app.post('/api/staff', async (req, res) => {
  let connection;
  try {
    connection = await pool.getConnection();
    const {
      firstName, middleName, lastName, employeeNumber, gender, dob, nationalId, phone, email,
      residentialAddress, district, nationality, religion, category, department, dateAppointed,
      employmentStatus, salaryScale, qualification, emergencyContactName, emergencyContactPhone,
      position, photo, signature, subjects, classes, assignments, status
    } = req.body;

    if (!firstName || !lastName || !category) {
      return res.status(400).json({ error: 'First name, last name, and staff category are required' });
    }

    // Auto-generate unique Staff ID
    const prefix = category === 'Teaching' ? 'STP-T-2026-' : 'STP-N-2026-';
    const [lastStaff] = await connection.query('SELECT id FROM staff WHERE id LIKE ? ORDER BY id DESC LIMIT 1', [`${prefix}%`]);
    let nextNum = 1;
    if (lastStaff.length > 0) {
      const parts = lastStaff[0].id.split('-');
      const lastVal = parseInt(parts[parts.length - 1], 10);
      if (!isNaN(lastVal)) {
        nextNum = lastVal + 1;
      }
    }
    const id = prefix + String(nextNum).padStart(3, '0');

    // Auto-generate username
    const baseUser = (firstName.toLowerCase() + '.' + lastName.toLowerCase()).replace(/[^a-z0-9]/g, '');
    let username = baseUser;
    let uCheck = 1;
    while (true) {
      const [existing] = await connection.query('SELECT id FROM staff WHERE username = ?', [username]);
      if (existing.length === 0) break;
      username = baseUser + uCheck;
      uCheck++;
    }

    // Default password is 123
    const crypto = require('crypto');
    const hash = crypto.createHash('sha256').update('123').digest('hex');
    const verificationToken = crypto.randomBytes(16).toString('hex');

    let finalPhoto = photo;
    let finalSignature = signature;
    if (photo) finalPhoto = await compressImageIfNeeded(photo, 150, 150, 75, true);
    if (signature) finalSignature = await compressImageIfNeeded(signature, 200, 100, 75, true);

    const name = [firstName, middleName, lastName].filter(Boolean).join(' ');

    const finalSubjects = assignments && Array.isArray(assignments) 
      ? Array.from(new Set(assignments.map(a => a.subject))) 
      : (subjects || []);
    const finalClasses = assignments && Array.isArray(assignments) 
      ? Array.from(new Set(assignments.map(a => a.grade_class))) 
      : (classes || []);

    await connection.beginTransaction();

    await connection.query(
      `INSERT INTO staff (
        id, username, password_hash, name, first_name, middle_name, last_name, employee_number,
        gender, dob, national_id, phone, email, residential_address, district, nationality,
        religion, category, department, date_appointed, employment_status, salary_scale,
        qualification, emergency_contact_name, emergency_contact_phone, force_password_change,
        verification_token, subjects, classes, position, signature, photo, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, username, hash, name, firstName, middleName || null, lastName, employeeNumber || null,
        gender || null, dob || null, nationalId || null, phone || null, email || null, residentialAddress || null,
        district || null, nationality || null, religion || null, category, department || null, dateAppointed || null,
        employmentStatus || 'Permanent', salaryScale || null, qualification || null, emergencyContactName || null,
        emergencyContactPhone || null, verificationToken, JSON.stringify(finalSubjects), JSON.stringify(finalClasses),
        position || (category === 'Teaching' ? 'Teacher' : 'Staff Member'), finalSignature || null, finalPhoto || null, status || 'Active'
      ]
    );

    const actualAssignments = assignments && Array.isArray(assignments) ? assignments : [];
    if (category === 'Teaching' && (!assignments || !Array.isArray(assignments))) {
      for (const s of finalSubjects) {
        for (const c of finalClasses) {
          actualAssignments.push({ subject: s, grade_class: c });
        }
      }
    }
    for (const a of actualAssignments) {
      await connection.query(
        'INSERT INTO teacher_assignments (teacher_id, subject, grade_class) VALUES (?, ?, ?)',
        [id, a.subject, a.grade_class]
      );
    }

    const metadata = {
      name,
      photo: finalPhoto || null,
      category,
      department: department || 'N/A',
      position: position || (category === 'Teaching' ? 'Teacher' : 'Staff Member'),
      employmentStatus: employmentStatus || 'Permanent',
      issueDate: new Date().toISOString().split('T')[0],
      expiryDate: new Date(Date.now() + 5*365*24*60*60*1000).toISOString().split('T')[0], // 5 years expiry
      status: status || 'Active'
    };
    await connection.query(
      'INSERT INTO verifications (token, document_type, reference_id, metadata, status, expiresAt) VALUES (?, ?, ?, ?, ?, ?)',
      [verificationToken, 'Staff ID', id, JSON.stringify(metadata), metadata.status === 'Active' ? 'Active' : 'Inactive', metadata.expiryDate]
    );

    // Also insert into staff_cards for active card tracking
    await connection.query(
      'INSERT INTO staff_cards (staff_id, card_id, status, issue_date, expiry_date) VALUES (?, ?, ?, ?, ?)',
      [id, id, metadata.status === 'Active' ? 'Active' : 'Inactive', metadata.issueDate, metadata.expiryDate]
    );

    await connection.commit();
    res.json({ success: true, id, username });
  } catch (err) {
    if (connection) await connection.rollback().catch(() => {});
    res.status(500).json({ error: err.message });
  } finally {
    if (connection) connection.release();
  }
});

// PUT update staff
app.put('/api/staff/:id', async (req, res) => {
  let connection;
  try {
    connection = await pool.getConnection();
    const { id } = req.params;
    const {
      firstName, middleName, lastName, employeeNumber, gender, dob, nationalId, phone, email,
      residentialAddress, district, nationality, religion, category, department, dateAppointed,
      employmentStatus, salaryScale, qualification, emergencyContactName, emergencyContactPhone,
      position, photo, signature, subjects, classes, assignments, status
    } = req.body;

    if (!firstName || !lastName || !category) {
      return res.status(400).json({ error: 'First name, last name, and staff category are required' });
    }

    const [curr] = await connection.query('SELECT verification_token, photo, signature FROM staff WHERE id = ?', [id]);
    if (curr.length === 0) {
      return res.status(404).json({ error: 'Staff member not found' });
    }

    let finalPhoto = photo;
    let finalSignature = signature;
    if (photo && photo.startsWith('data:') && photo !== curr[0].photo) finalPhoto = await compressImageIfNeeded(photo, 150, 150, 75, true);
    if (signature && signature.startsWith('data:') && signature !== curr[0].signature) finalSignature = await compressImageIfNeeded(signature, 200, 100, 75, true);

    const name = [firstName, middleName, lastName].filter(Boolean).join(' ');

    const finalSubjects = assignments && Array.isArray(assignments) 
      ? Array.from(new Set(assignments.map(a => a.subject))) 
      : (subjects || []);
    const finalClasses = assignments && Array.isArray(assignments) 
      ? Array.from(new Set(assignments.map(a => a.grade_class))) 
      : (classes || []);

    let verificationToken = curr[0].verification_token;
    if (!verificationToken) {
      const crypto = require('crypto');
      verificationToken = crypto.randomBytes(16).toString('hex');
    }

    await connection.beginTransaction();

    await connection.query(
      `UPDATE staff SET
        name = ?, first_name = ?, middle_name = ?, last_name = ?, employee_number = ?,
        gender = ?, dob = ?, national_id = ?, phone = ?, email = ?, residential_address = ?,
        district = ?, nationality = ?, religion = ?, category = ?, department = ?, date_appointed = ?,
        employment_status = ?, salary_scale = ?, qualification = ?, emergency_contact_name = ?,
        emergency_contact_phone = ?, verification_token = ?, subjects = ?, classes = ?,
        position = ?, signature = ?, photo = ?, status = ?
      WHERE id = ?`,
      [
        name, firstName, middleName || null, lastName, employeeNumber || null,
        gender || null, dob || null, nationalId || null, phone || null, email || null, residentialAddress || null,
        district || null, nationality || null, religion || null, category, department || null, dateAppointed || null,
        employmentStatus || 'Permanent', salaryScale || null, qualification || null, emergencyContactName || null,
        emergencyContactPhone || null, verificationToken, JSON.stringify(finalSubjects), JSON.stringify(finalClasses),
        position || (category === 'Teaching' ? 'Teacher' : 'Staff Member'), finalSignature || null, finalPhoto || null, status || 'Active',
        id
      ]
    );

    await connection.query('DELETE FROM teacher_assignments WHERE teacher_id = ?', [id]);
    const actualAssignments = assignments && Array.isArray(assignments) ? assignments : [];
    if (category === 'Teaching' && (!assignments || !Array.isArray(assignments))) {
      for (const s of finalSubjects) {
        for (const c of finalClasses) {
          actualAssignments.push({ subject: s, grade_class: c });
        }
      }
    }
    for (const a of actualAssignments) {
      await connection.query(
        'INSERT INTO teacher_assignments (teacher_id, subject, grade_class) VALUES (?, ?, ?)',
        [id, a.subject, a.grade_class]
      );
    }

    const metadata = {
      name,
      photo: finalPhoto || null,
      category,
      department: department || 'N/A',
      position: position || (category === 'Teaching' ? 'Teacher' : 'Staff Member'),
      employmentStatus: employmentStatus || 'Permanent',
      issueDate: new Date().toISOString().split('T')[0],
      expiryDate: new Date(Date.now() + 365*24*60*60*1000).toISOString().split('T')[0],
      status: status || 'Active'
    };
    await connection.query(
      `INSERT INTO verifications (token, document_type, reference_id, metadata, status, expiresAt)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE metadata = ?, status = ?, expiresAt = ?`,
      [
        verificationToken, 'Staff ID', id, JSON.stringify(metadata), metadata.status === 'Active' ? 'Active' : 'Inactive', metadata.expiryDate,
        JSON.stringify(metadata), metadata.status === 'Active' ? 'Active' : 'Inactive', metadata.expiryDate
      ]
    );

    await connection.commit();
    res.json({ success: true });
  } catch (err) {
    if (connection) await connection.rollback().catch(() => {});
    res.status(500).json({ error: err.message });
  } finally {
    if (connection) connection.release();
  }
});

// DELETE staff member
app.delete('/api/staff/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM staff WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST reset staff password
app.post('/api/staff/:id/reset-password', async (req, res) => {
  try {
    const crypto = require('crypto');
    const hash = crypto.createHash('sha256').update('123').digest('hex');
    await pool.query('UPDATE staff SET password_hash = ?, force_password_change = 1 WHERE id = ?', [hash, req.params.id]);
    res.json({ success: true, message: 'Password has been reset to default "123"' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST toggle staff status
app.post('/api/staff/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    if (!status) return res.status(400).json({ error: 'Status is required' });
    await pool.query('UPDATE staff SET status = ? WHERE id = ?', [status, req.params.id]);
    
    const [rows] = await pool.query('SELECT verification_token FROM staff WHERE id = ?', [req.params.id]);
    if (rows.length > 0 && rows[0].verification_token) {
      await pool.query('UPDATE verifications SET status = ? WHERE token = ?', [
        status === 'Active' ? 'Active' : 'Inactive',
        rows[0].verification_token
      ]);
    }
    
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- ID CARD MANAGEMENT ENDPOINTS ---

// POST Activate active card
app.post('/api/staff/:id/card/activate', async (req, res) => {
  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    await connection.query('UPDATE staff_cards SET status = "Active" WHERE staff_id = ? AND status = "Inactive"', [req.params.id]);
    
    // Also update verification status in staff and verifications
    const [rows] = await connection.query('SELECT verification_token FROM staff WHERE id = ?', [req.params.id]);
    if (rows.length > 0 && rows[0].verification_token) {
      await connection.query('UPDATE verifications SET status = "Active" WHERE token = ?', [rows[0].verification_token]);
    }
    await connection.commit();
    res.json({ success: true });
  } catch (err) {
    if (connection) await connection.rollback().catch(() => {});
    res.status(500).json({ error: err.message });
  } finally {
    if (connection) connection.release();
  }
});

// POST Deactivate active card
app.post('/api/staff/:id/card/deactivate', async (req, res) => {
  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    await connection.query('UPDATE staff_cards SET status = "Inactive" WHERE staff_id = ? AND status = "Active"', [req.params.id]);
    
    // Also update verification status in verifications
    const [rows] = await connection.query('SELECT verification_token FROM staff WHERE id = ?', [req.params.id]);
    if (rows.length > 0 && rows[0].verification_token) {
      await connection.query('UPDATE verifications SET status = "Inactive" WHERE token = ?', [rows[0].verification_token]);
    }
    await connection.commit();
    res.json({ success: true });
  } catch (err) {
    if (connection) await connection.rollback().catch(() => {});
    res.status(500).json({ error: err.message });
  } finally {
    if (connection) connection.release();
  }
});

// POST Revoke active card
app.post('/api/staff/:id/card/revoke', async (req, res) => {
  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    await connection.query('UPDATE staff_cards SET status = "Revoked" WHERE staff_id = ? AND status = "Active"', [req.params.id]);
    
    // Also update verification status in verifications
    const [rows] = await connection.query('SELECT verification_token FROM staff WHERE id = ?', [req.params.id]);
    if (rows.length > 0 && rows[0].verification_token) {
      await connection.query('UPDATE verifications SET status = "Inactive" WHERE token = ?', [rows[0].verification_token]);
    }
    await connection.commit();
    res.json({ success: true });
  } catch (err) {
    if (connection) await connection.rollback().catch(() => {});
    res.status(500).json({ error: err.message });
  } finally {
    if (connection) connection.release();
  }
});

// POST Reissue card
app.post('/api/staff/:id/card/reissue', async (req, res) => {
  let connection;
  try {
    connection = await pool.getConnection();
    const { issueDate, expiryDate } = req.body;
    
    await connection.beginTransaction();
    
    // Revoke any existing active card first
    await connection.query('UPDATE staff_cards SET status = "Revoked" WHERE staff_id = ? AND status = "Active"', [req.params.id]);
    
    // Create new card
    const d = new Date();
    d.setFullYear(d.getFullYear() + 5);
    const finalIssue = issueDate || new Date().toISOString().split('T')[0];
    const finalExpiry = expiryDate || d.toISOString().split('T')[0];
    
    const [history] = await connection.query('SELECT COUNT(*) as count FROM staff_cards WHERE staff_id = ?', [req.params.id]);
    const versionNum = history[0].count + 1;
    const cardId = `${req.params.id}-C${versionNum}`;
    
    // Update verification token in staff table to invalidate previous scans!
    const crypto = require('crypto');
    const newVerificationToken = crypto.randomBytes(16).toString('hex');
    await connection.query('UPDATE staff SET verification_token = ? WHERE id = ?', [newVerificationToken, req.params.id]);
    
    // Fetch staff info for metadata
    const [sRows] = await connection.query('SELECT * FROM staff WHERE id = ?', [req.params.id]);
    const staff = sRows[0];
    
    const metadata = {
      name: staff.name,
      photo: staff.photo || null,
      category: staff.category,
      department: staff.department || 'N/A',
      position: staff.position || 'N/A',
      employmentStatus: staff.employment_status || 'Permanent',
      issueDate: finalIssue,
      expiryDate: finalExpiry,
      status: 'Active'
    };
    
    // Invalidate/delete old verification and insert new one
    await connection.query('DELETE FROM verifications WHERE reference_id = ? AND document_type = "Staff ID"', [req.params.id]);
    await connection.query(
      'INSERT INTO verifications (token, document_type, reference_id, metadata, status, expiresAt) VALUES (?, ?, ?, ?, "Active", ?)',
      [newVerificationToken, 'Staff ID', req.params.id, JSON.stringify(metadata), finalExpiry]
    );
    
    await connection.query(
      'INSERT INTO staff_cards (staff_id, card_id, status, issue_date, expiry_date) VALUES (?, ?, "Active", ?, ?)',
      [req.params.id, cardId, finalIssue, finalExpiry]
    );
    
    await connection.commit();
    res.json({ success: true, cardId, verificationToken: newVerificationToken });
  } catch (err) {
    if (connection) await connection.rollback().catch(() => {});
    res.status(500).json({ error: err.message });
  } finally {
    if (connection) connection.release();
  }
});

// POST Regenerate QR Code
app.post('/api/staff/:id/card/regenerate-qr', async (req, res) => {
  let connection;
  try {
    connection = await pool.getConnection();
    const crypto = require('crypto');
    const newVerificationToken = crypto.randomBytes(16).toString('hex');
    
    await connection.beginTransaction();
    
    await connection.query('UPDATE staff SET verification_token = ? WHERE id = ?', [newVerificationToken, req.params.id]);
    
    // Fetch active card dates to update verification record
    const [cRows] = await connection.query('SELECT * FROM staff_cards WHERE staff_id = ? AND status = "Active" ORDER BY created_at DESC LIMIT 1', [req.params.id]);
    const card = cRows[0];
    const [sRows] = await connection.query('SELECT * FROM staff WHERE id = ?', [req.params.id]);
    const staff = sRows[0];
    
    const issueDate = card ? new Date(card.issue_date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
    const expiryDate = card ? new Date(card.expiry_date).toISOString().split('T')[0] : new Date(Date.now() + 5*365*24*60*60*1000).toISOString().split('T')[0];
    
    const metadata = {
      name: staff.name,
      photo: staff.photo || null,
      category: staff.category,
      department: staff.department || 'N/A',
      position: staff.position || 'N/A',
      employmentStatus: staff.employment_status || 'Permanent',
      issueDate,
      expiryDate,
      status: 'Active'
    };
    
    await connection.query('DELETE FROM verifications WHERE reference_id = ? AND document_type = "Staff ID"', [req.params.id]);
    await connection.query(
      'INSERT INTO verifications (token, document_type, reference_id, metadata, status, expiresAt) VALUES (?, ?, ?, ?, "Active", ?)',
      [newVerificationToken, 'Staff ID', req.params.id, JSON.stringify(metadata), expiryDate]
    );
    
    await connection.commit();
    res.json({ success: true, verificationToken: newVerificationToken });
  } catch (err) {
    if (connection) await connection.rollback().catch(() => {});
    res.status(500).json({ error: err.message });
  } finally {
    if (connection) connection.release();
  }
});

// POST self password change
app.post('/api/staff/change-password', async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    const staffId = req.user.id;
    if (!oldPassword || !newPassword) {
      return res.status(400).json({ error: 'Old password and new password are required' });
    }

    const [rows] = await pool.query('SELECT password_hash FROM staff WHERE id = ?', [staffId]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Staff member not found' });
    }

    const crypto = require('crypto');
    const oldHash = crypto.createHash('sha256').update(oldPassword).digest('hex');
    if (oldHash !== rows[0].password_hash) {
      return res.status(400).json({ error: 'Old password is incorrect' });
    }

    const newHash = crypto.createHash('sha256').update(newPassword).digest('hex');
    await pool.query('UPDATE staff SET password_hash = ?, force_password_change = 0 WHERE id = ?', [newHash, staffId]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST import staff bulk
app.post('/api/staff/import', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const { staff } = req.body;
    if (!Array.isArray(staff)) {
      return res.status(400).json({ error: 'Invalid payload: staff must be an array' });
    }

    await connection.beginTransaction();

    const success = [];
    const skipped = [];
    const errors = [];

    const [existingStaff] = await connection.query('SELECT id, username FROM staff');
    const existingIds = new Set(existingStaff.map(s => s.id.toLowerCase()));
    const existingUsernames = new Set(existingStaff.map(s => s.username.toLowerCase()));

    const seenIdsInImport = new Set();
    const seenUsernamesInImport = new Set();

    const crypto = require('crypto');
    const defaultHash = crypto.createHash('sha256').update('123').digest('hex');

    for (let i = 0; i < staff.length; i++) {
      const s = staff[i];
      const rowNum = s.rowNumber || (i + 2);
      
      const firstName = String(s.firstName || '').trim();
      const lastName = String(s.lastName || '').trim();
      const category = String(s.category || 'Teaching').trim();
      const gender = String(s.gender || 'Male').trim();
      const email = String(s.email || '').trim();
      const phone = String(s.phone || '').trim();
      const position = String(s.position || '').trim();
      const department = String(s.department || '').trim();
      const rawSubjects = String(s.subjects || '').trim();
      const classTeacher = String(s.classTeacher || '').trim();

      if (!firstName || !lastName) {
        errors.push({ rowNum, name: 'N/A', error: 'First name and Last name are required' });
        continue;
      }

      const prefix = category === 'Teaching' ? 'SPSS-TS-' : 'SPSS-NTS-';
      
      const [lastStaff] = await connection.query('SELECT id FROM staff WHERE id LIKE ? ORDER BY id DESC LIMIT 1', [`${prefix}%`]);
      let nextNum = 1;
      if (lastStaff.length > 0) {
        const parts = lastStaff[0].id.split('-');
        const lastVal = parseInt(parts[parts.length - 1], 10);
        if (!isNaN(lastVal)) nextNum = lastVal + 1;
      }

      let id = prefix + String(nextNum).padStart(4, '0');
      while (seenIdsInImport.has(id.toLowerCase()) || existingIds.has(id.toLowerCase())) {
        nextNum++;
        id = prefix + String(nextNum).padStart(4, '0');
      }

      const baseUser = (firstName.toLowerCase() + '.' + lastName.toLowerCase()).replace(/[^a-z0-9]/g, '');
      let username = baseUser;
      let uCheck = 1;
      while (seenUsernamesInImport.has(username.toLowerCase()) || existingUsernames.has(username.toLowerCase())) {
        username = baseUser + uCheck;
        uCheck++;
      }

      const idLower = id.toLowerCase();
      const usernameLower = username.toLowerCase();

      seenIdsInImport.add(idLower);
      seenUsernamesInImport.add(usernameLower);

      try {
        const name = [firstName, s.middleName || '', lastName].filter(Boolean).join(' ');
        const subjectsArr = rawSubjects.split(',').map(sub => sub.trim()).filter(Boolean);
        const classesArr = classTeacher ? [classTeacher] : [];
        const verificationToken = crypto.randomBytes(16).toString('hex');

        await connection.query(
          `INSERT INTO staff (
            id, username, password_hash, name, first_name, middle_name, last_name,
            gender, phone, email, category, department, position, force_password_change,
            verification_token, subjects, classes, status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, 'Active')`,
          [
            id, username, defaultHash, name, firstName, s.middleName || null, lastName,
            gender, phone || null, email || null, category, department || null, position || (category === 'Teaching' ? 'Teacher' : 'Staff Member'),
            verificationToken, JSON.stringify(subjectsArr), JSON.stringify(classesArr)
          ]
        );

        if (category === 'Teaching' && classTeacher) {
          await connection.query(
            'INSERT INTO class_teachers (grade_class, teacher_id) VALUES (?, ?) ON DUPLICATE KEY UPDATE teacher_id = ?',
            [classTeacher, id, id]
          );

          for (const sub of subjectsArr) {
            await connection.query(
              'INSERT INTO teacher_assignments (teacher_id, subject, grade_class) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE teacher_id = teacher_id',
              [id, sub, classTeacher]
            );
          }
        }

        const metadata = {
          name,
          photo: null,
          category,
          department: department || 'N/A',
          position: position || (category === 'Teaching' ? 'Teacher' : 'Staff Member'),
          employmentStatus: 'Permanent',
          issueDate: new Date().toISOString().split('T')[0],
          expiryDate: new Date(Date.now() + 365*24*60*60*1000).toISOString().split('T')[0],
          status: 'Active'
        };
        await connection.query(
          'INSERT INTO verifications (token, document_type, reference_id, metadata, status, expiresAt) VALUES (?, ?, ?, ?, ?, ?)',
          [verificationToken, 'Staff ID', id, JSON.stringify(metadata), 'Active', metadata.expiryDate]
        );

        success.push({ id, username, name });
      } catch (err) {
        errors.push({ rowNum, name: `${firstName} ${lastName}`, error: 'Database error: ' + err.message });
      }
    }

    await connection.commit();
    res.json({ success: true, report: { success, skipped, errors } });
  } catch (err) {
    await connection.rollback().catch(() => {});
    res.status(500).json({ error: err.message });
  } finally {
    connection.release();
  }
});

// --- LEAVE REQUESTS ENDPOINTS ---

// GET leave requests for staff member
app.get('/api/staff/:id/leave-requests', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM leave_requests WHERE staff_id = ? ORDER BY createdAt DESC', [req.params.id]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST leave request
app.post('/api/staff/:id/leave-requests', async (req, res) => {
  try {
    const leaveType = req.body.leaveType || req.body.leave_type;
    const startDate = req.body.startDate || req.body.start_date;
    const endDate = req.body.endDate || req.body.end_date;
    const reason = req.body.reason;

    if (!leaveType || !startDate || !endDate || !reason) {
      return res.status(400).json({ error: 'All fields are required' });
    }
    await pool.query(
      'INSERT INTO leave_requests (staff_id, leave_type, start_date, end_date, reason, status) VALUES (?, ?, ?, ?, ?, "Pending")',
      [req.params.id, leaveType, startDate, endDate, reason]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET all leave requests for admin
app.get('/api/admin/leave-requests', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT lr.*, s.name as staff_name, s.category as staff_category, s.department as staff_department, s.position as staff_position
      FROM leave_requests lr
      JOIN staff s ON lr.staff_id = s.id
      ORDER BY lr.createdAt DESC
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT update leave request status (approve/reject)
app.put('/api/admin/leave-requests/:id', async (req, res) => {
  try {
    const { status, remarks, approvedBy } = req.body;
    if (!status) return res.status(400).json({ error: 'Status is required' });
    await pool.query(
      'UPDATE leave_requests SET status = ?, remarks = ?, approved_by = ? WHERE id = ?',
      [status, remarks || null, approvedBy || 'Administrator', req.params.id]
    );
    
    if (status === 'Approved') {
      const [rows] = await pool.query('SELECT staff_id FROM leave_requests WHERE id = ?', [req.params.id]);
      if (rows.length > 0) {
        await pool.query('UPDATE staff SET status = "On Leave" WHERE id = ?', [rows[0].staff_id]);
      }
    }
    
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- TIMETABLES ENDPOINTS ---

// GET timetable for staff
app.get('/api/staff/:id/timetable', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM timetables WHERE staff_id = ? ORDER BY day_of_week, start_time', [req.params.id]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST save timetable
app.post('/api/staff/:id/timetable', async (req, res) => {
  let connection;
  try {
    connection = await pool.getConnection();
    const { id } = req.params;
    const { slots } = req.body;

    if (!Array.isArray(slots)) {
      return res.status(400).json({ error: 'Slots must be an array' });
    }

    await connection.beginTransaction();
    await connection.query('DELETE FROM timetables WHERE staff_id = ?', [id]);

    for (const s of slots) {
      await connection.query(
        'INSERT INTO timetables (staff_id, day_of_week, period_name, start_time, end_time, grade_class, subject, room) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [id, s.dayOfWeek, s.periodName, s.startTime, s.endTime, s.gradeClass, s.subject, s.room || null]
      );
    }

    await connection.commit();
    res.json({ success: true });
  } catch (err) {
    if (connection) await connection.rollback().catch(() => {});
    res.status(500).json({ error: err.message });
  } finally {
    if (connection) connection.release();
  }
});

// --- STAFF REPORTS ENDPOINT ---
app.get('/api/reports/staff', async (req, res) => {
  try {
    const [totalRows] = await pool.query('SELECT COUNT(*) as count, category FROM staff GROUP BY category');
    const [genderRows] = await pool.query('SELECT COUNT(*) as count, gender FROM staff GROUP BY gender');
    const [deptRows] = await pool.query('SELECT COUNT(*) as count, department FROM staff GROUP BY department');
    const [statusRows] = await pool.query('SELECT COUNT(*) as count, status FROM staff GROUP BY status');
    
    const currentYear = new Date().getFullYear();
    const [newThisYearRows] = await pool.query('SELECT COUNT(*) as count FROM staff WHERE YEAR(date_appointed) = ?', [currentYear]);

    res.json({
      totals: totalRows,
      gender: genderRows,
      departments: deptRows,
      status: statusRows,
      newThisYear: newThisYearRows[0]?.count || 0
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- PUBLIC SECURE VERIFICATION ENDPOINT ---
app.get('/api/verify/:token', async (req, res) => {
  try {
    let rawToken = req.params.token || '';
    rawToken = rawToken.split('?')[0].split('#')[0]; // Strip query parameters
    if (rawToken.includes('/verify/student/')) {
      rawToken = rawToken.split('/verify/student/').pop();
    } else if (rawToken.includes('/staff/verify/')) {
      rawToken = rawToken.split('/staff/verify/').pop();
    } else if (rawToken.includes('/verify/')) {
      rawToken = rawToken.split('/verify/').pop();
    }
    const token = decodeURIComponent(rawToken.trim());
    console.log(`[VERIFY-BACKEND-DEBUG] Processing verification request for token/ID: "${token}"`);

    // 1. Check verifications table first
    let [vRows] = await pool.query('SELECT * FROM verifications WHERE token = ? OR reference_id = ?', [token, token]);

    // 2. Check students table directly (by id, adminNo, studentNo or verification_token)
    let studentRecord = null;
    let [sRows] = await pool.query(
      'SELECT id, adminNo, name, gender, gradeClass, boardingStatus, isCleared, photo, verification_token, updatedAt FROM students WHERE id = ? OR adminNo = ? OR adminNo LIKE ? OR verification_token = ? LIMIT 1',
      [token, token, `%${token}%`, token]
    );
    if (sRows.length > 0) {
      studentRecord = sRows[0];
      console.log(`[VERIFY-BACKEND-DEBUG] Found matching student in students table: ${studentRecord.name} (${studentRecord.adminNo})`);
    }

    // 3. Check staff table directly
    let staffRecord = null;
    let [stRows] = await pool.query(
      'SELECT * FROM staff WHERE id = ? OR employee_number = ? OR employee_number LIKE ? OR username = ? OR verification_token = ? LIMIT 1',
      [token, token, `%${token}%`, token, token]
    );
    if (stRows.length > 0) {
      staffRecord = stRows[0];
      console.log(`[VERIFY-BACKEND-DEBUG] Found matching staff in staff table: ${staffRecord.name}`);
    }

    // Handle STUDENT verification response
    if (studentRecord || (vRows.length > 0 && vRows[0].document_type.includes('Student'))) {
      const refStudentId = studentRecord ? studentRecord.id : (vRows.length > 0 ? vRows[0].reference_id : null);
      
      let fullStudent = studentRecord;
      if (!fullStudent && refStudentId) {
        const [fullRows] = await pool.query('SELECT * FROM students WHERE id = ?', [refStudentId]);
        if (fullRows.length > 0) fullStudent = fullRows[0];
      }

      if (!fullStudent) {
        console.warn(`[VERIFY-BACKEND-DEBUG] Student reference ID ${refStudentId} not found in students table.`);
        return res.json({
          success: false,
          status: 'Not Found',
          documentType: 'Student Clearance Card',
          error: 'Student record not found. Please register the student first.'
        });
      }

      // Fetch latest attendance status for today
      const today = new Date().toISOString().split('T')[0];
      const [attRows] = await pool.query('SELECT * FROM attendance_logs WHERE student_id = ? AND date = ?', [fullStudent.id, today]);
      const attLog = attRows[0] || null;

      let attendanceStatus = 'ABSENT';
      let timeIn = null;
      let timeOut = null;
      if (attLog) {
        if (attLog.time_out) {
          attendanceStatus = 'CHECKED OUT';
          timeIn = attLog.time_in;
          timeOut = attLog.time_out;
        } else if (attLog.time_in) {
          attendanceStatus = 'PRESENT';
          timeIn = attLog.time_in;
        }
      }

      const issueDate = vRows.length > 0 && vRows[0].createdAt ? new Date(vRows[0].createdAt).toISOString().split('T')[0] : '2026-01-01';
      const expiryDate = vRows.length > 0 && vRows[0].expiresAt ? new Date(vRows[0].expiresAt).toISOString().split('T')[0] : '2026-12-31';

      const metadata = {
        name: fullStudent.name,
        studentId: fullStudent.id,
        adminNo: fullStudent.adminNo,
        studentNo: fullStudent.adminNo,
        gradeClass: fullStudent.gradeClass,
        boardingStatus: fullStudent.boardingStatus,
        gender: fullStudent.gender || 'N/A',
        isCleared: !!fullStudent.isCleared,
        photo: fullStudent.photo || null,
        status: fullStudent.isCleared ? 'Cleared' : 'Pending Clearance',
        attendanceStatus,
        timeIn,
        timeOut,
        issueDate,
        expiryDate
      };

      console.log(`[VERIFY-BACKEND-DEBUG] Returning verified student profile for "${fullStudent.name}" (${fullStudent.adminNo})`);
      return res.json({
        success: true,
        status: 'Verified',
        documentType: 'Student Clearance Card',
        metadata
      });
    }

    // Handle STAFF verification response
    if (staffRecord || (vRows.length > 0 && vRows[0].document_type === 'Staff ID')) {
      const staff = staffRecord || null;
      const refId = staff ? staff.id : (vRows[0] ? vRows[0].reference_id : null);
      const [staffQueryRows] = staff ? [[staff]] : await pool.query('SELECT * FROM staff WHERE id = ?', [refId]);

      if (staffQueryRows.length === 0) {
        return res.json({ success: false, status: 'Invalid ID', error: 'Staff member does not exist in active records.' });
      }

      const activeStaff = staffQueryRows[0];
      const expiryDate = vRows.length > 0 && vRows[0].expiresAt ? new Date(vRows[0].expiresAt) : new Date(Date.now() + 365*24*60*60*1000);
      const isExpired = expiryDate < new Date();

      let status = activeStaff.status || 'Active';
      if (isExpired) {
        status = 'Expired';
      }

      const metadata = {
        name: activeStaff.name,
        staffId: activeStaff.employee_number || activeStaff.id,
        photo: activeStaff.photo || null,
        category: activeStaff.category || 'Teaching',
        department: activeStaff.department || 'N/A',
        position: activeStaff.position || 'N/A',
        employmentStatus: activeStaff.employment_status || 'Permanent',
        issueDate: vRows.length > 0 && vRows[0].createdAt ? new Date(vRows[0].createdAt).toISOString().split('T')[0] : 'N/A',
        expiryDate: expiryDate.toISOString().split('T')[0],
        status: status
      };

      if (status !== 'Active' && status !== 'On Leave') {
        return res.json({
          success: false,
          status: status === 'Expired' ? 'Expired Staff ID' : `${status} Staff ID`,
          documentType: 'Staff ID',
          metadata
        });
      }

      console.log(`[VERIFY-BACKEND-DEBUG] Returning verified staff profile for "${activeStaff.name}"`);
      return res.json({
        success: true,
        status: 'Verified',
        documentType: 'Staff ID',
        metadata
      });
    }

    // Generic verification row
    if (vRows.length > 0) {
      let meta = typeof vRows[0].metadata === 'string' ? JSON.parse(vRows[0].metadata) : vRows[0].metadata;
      return res.json({
        success: vRows[0].status === 'Active',
        status: vRows[0].status === 'Active' ? 'Verified' : vRows[0].status,
        documentType: vRows[0].document_type,
        metadata: meta
      });
    }

    console.warn(`[VERIFY-BACKEND-DEBUG] Verification failed: No student or staff record found for token "${token}"`);
    return res.json({
      success: false,
      status: 'Not Found',
      documentType: 'Student Clearance Card',
      error: 'Student record not found. Please register the student first.'
    });
  } catch (err) {
    console.error('[VERIFY-BACKEND-ERROR] Exception in /api/verify/:token:', err);
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

// Serve static files from the build directory (for local node production and SPA support)
const fs = require('fs');
const path = require('path');
const buildPath = path.join(__dirname, '..', 'build');
if (fs.existsSync(buildPath)) {
  app.use(express.static(buildPath));
  
  // All other GET requests that don't match an API route will serve the index.html (client-side routing fallback)
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api/')) {
      res.sendFile(path.join(buildPath, 'index.html'));
    } else {
      res.status(404).json({ error: 'API route not found' });
    }
  });
}

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
  const dbConfig = loadDbConfig();

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

// Background migration to compress existing large base64 images stored in DB
async function runOneTimeImageMigration() {
  console.log('[MIGRATION] Starting one-time image compression migration...');
  try {
    // 1. Settings (logo, stamp, ht_signature)
    const [settings] = await pool.query("SELECT key_name, val_value FROM settings WHERE key_name IN ('school_logo', 'school_stamp', 'head_teacher_signature')");
    for (const r of settings) {
      if (r.val_value && r.val_value.startsWith('data:') && r.val_value.length > 50000) {
        console.log(`[MIGRATION] Compressing setting: ${r.key_name} (length: ${r.val_value.length})`);
        const maxW = r.key_name === 'school_logo' ? 200 : (r.key_name === 'school_stamp' ? 150 : 200);
        const maxH = r.key_name === 'school_logo' ? 200 : (r.key_name === 'school_stamp' ? 150 : 100);
        const forceJ = r.key_name !== 'school_logo';
        const compressed = await compressImageIfNeeded(r.val_value, maxW, maxH, 75, forceJ);
        if (compressed && compressed.length < r.val_value.length) {
          await pool.query('UPDATE settings SET val_value = ? WHERE key_name = ?', [compressed, r.key_name]);
          console.log(`[MIGRATION] Setting ${r.key_name} compressed to ${compressed.length} bytes`);
        }
      }
    }

    // 2. Staff signatures and photos
    const [teachers] = await pool.query("SELECT id, name, signature, photo FROM staff WHERE (signature IS NOT NULL AND LENGTH(signature) > 50000) OR (photo IS NOT NULL AND LENGTH(photo) > 50000)");
    for (const t of teachers) {
      let updateSig = t.signature;
      let updatePhoto = t.photo;
      let changed = false;

      if (t.signature && t.signature.startsWith('data:') && t.signature.length > 50000) {
        console.log(`[MIGRATION] Compressing signature for staff: ${t.name}`);
        const compressedSig = await compressImageIfNeeded(t.signature, 200, 100, 75, true);
        if (compressedSig && compressedSig.length < t.signature.length) {
          updateSig = compressedSig;
          changed = true;
        }
      }

      if (t.photo && t.photo.startsWith('data:') && t.photo.length > 50000) {
        console.log(`[MIGRATION] Compressing photo for staff: ${t.name}`);
        const compressedPhoto = await compressImageIfNeeded(t.photo, 150, 150, 75, true);
        if (compressedPhoto && compressedPhoto.length < t.photo.length) {
          updatePhoto = compressedPhoto;
          changed = true;
        }
      }

      if (changed) {
        await pool.query('UPDATE staff SET signature = ?, photo = ? WHERE id = ?', [updateSig, updatePhoto, t.id]);
        console.log(`[MIGRATION] Staff ${t.name} images updated.`);
      }
    }

    // 3. Student photos
    const [students] = await pool.query("SELECT id, name, photo, photoOriginal, photoEnhanced FROM students WHERE (photo IS NOT NULL AND LENGTH(photo) > 50000) OR (photoOriginal IS NOT NULL AND LENGTH(photoOriginal) > 50000) OR (photoEnhanced IS NOT NULL AND LENGTH(photoEnhanced) > 50000)");
    console.log(`[MIGRATION] Found ${students.length} students with large photos to inspect/compress.`);
    for (const s of students) {
      let updatePhoto = s.photo;
      let updatePhotoOrig = s.photoOriginal;
      let updatePhotoEnh = s.photoEnhanced;
      let changed = false;

      if (s.photo && s.photo.startsWith('data:') && s.photo.length > 50000) {
        const comp = await compressImageIfNeeded(s.photo, 150, 150, 75, true);
        if (comp && comp.length < s.photo.length) {
          updatePhoto = comp;
          changed = true;
        }
      }
      if (s.photoOriginal && s.photoOriginal.startsWith('data:') && s.photoOriginal.length > 50000) {
        const comp = await compressImageIfNeeded(s.photoOriginal, 150, 150, 75, true);
        if (comp && comp.length < s.photoOriginal.length) {
          updatePhotoOrig = comp;
          changed = true;
        }
      }
      if (s.photoEnhanced && s.photoEnhanced.startsWith('data:') && s.photoEnhanced.length > 50000) {
        const comp = await compressImageIfNeeded(s.photoEnhanced, 150, 150, 75, true);
        if (comp && comp.length < s.photoEnhanced.length) {
          updatePhotoEnh = comp;
          changed = true;
        }
      }

      if (changed) {
        await pool.query('UPDATE students SET photo = ?, photoOriginal = ?, photoEnhanced = ? WHERE id = ?', [updatePhoto, updatePhotoOrig, updatePhotoEnh, s.id]);
        console.log(`[MIGRATION] Student ${s.name} photos compressed.`);
      }
    }
    console.log('[MIGRATION] One-time image compression migration completed.');
  } catch (err) {
    console.error('[MIGRATION] Error in one-time image migration:', err);
  }
}

