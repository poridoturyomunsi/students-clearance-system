/**
 * St. Paul School Management System
 * Production Deployment Validation Script
 * 
 * Run this script on your server using: node scripts/validate-deployment.js
 * It will verify that all required environment variables are set, database is reachable,
 * Cloudinary is accessible, and the Gemini API can be queried successfully.
 */

try {
  const path = require('path');
  require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
} catch (e) {
  // Ignore
}

const mysql = require('mysql2/promise');
const cloudinary = require('cloudinary').v2;
const { GoogleGenAI } = require('@google/genai');

async function validateEnv() {
  console.log('\n--- 1. Checking Environment Variables ---');
  const required = [
    'DATABASE_URL',
    'JWT_SECRET',
    'ALLOWED_ORIGINS',
    'CLOUDINARY_CLOUD_NAME',
    'CLOUDINARY_API_KEY',
    'CLOUDINARY_API_SECRET',
    'GEMINI_API_KEY'
  ];

  let missing = 0;
  for (const env of required) {
    if (!process.env[env]) {
      console.error(`❌ Missing variable: ${env}`);
      missing++;
    } else {
      const val = process.env[env];
      const displayVal = env.includes('SECRET') || env.includes('KEY') || env.includes('PASSWORD') || env.includes('URL')
        ? `${val.substring(0, 6)}... (Secured)`
        : val;
      console.log(`✅ Loaded: ${env} = ${displayVal}`);
    }
  }

  if (missing > 0) {
    console.error(`⚠️  Warning: ${missing} required variables are missing. Please configure them.`);
    return false;
  }
  return true;
}

async function validateDatabase() {
  console.log('\n--- 2. Checking Database Connectivity ---');
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('❌ Cannot test database: DATABASE_URL is not set.');
    return false;
  }

  try {
    const connection = await mysql.createConnection(dbUrl);
    console.log('✅ Successfully connected to MySQL database.');
    
    // Check tables
    const [tables] = await connection.query('SHOW TABLES');
    console.log(`✅ Database online. Found ${tables.length} tables.`);
    
    await connection.end();
    return true;
  } catch (err) {
    console.error(`❌ Database connection failed: ${err.message}`);
    return false;
  }
}

async function validateCloudinary() {
  console.log('\n--- 3. Checking Cloudinary Configuration ---');
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) {
    console.error('❌ Cannot test Cloudinary: Credentials are not fully set.');
    return false;
  }

  try {
    cloudinary.config({
      cloud_name: cloudName,
      api_key: apiKey,
      api_secret: apiSecret
    });
    
    // Check config
    const api = cloudinary.api;
    const result = await api.ping();
    if (result.status === 'ok') {
      console.log('✅ Successfully connected to Cloudinary API.');
      return true;
    } else {
      throw new Error(`Cloudinary ping returned status: ${result.status}`);
    }
  } catch (err) {
    console.error(`❌ Cloudinary API check failed: ${err.message}`);
    return false;
  }
}

async function validateGemini() {
  console.log('\n--- 4. Checking Google Gemini AI Connectivity ---');
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    console.error('❌ Cannot test Gemini API: GEMINI_API_KEY is not set.');
    return false;
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [{ role: 'user', parts: [{ text: 'Respond with "OK" if online.' }] }]
    });

    const text = response.text ? response.text.trim() : '';
    if (text) {
      console.log(`✅ Successfully queried Google Gemini. Response: "${text}"`);
      return true;
    } else {
      throw new Error('Gemini API returned an empty response.');
    }
  } catch (err) {
    console.error(`❌ Google Gemini connection failed: ${err.message}`);
    return false;
  }
}

(async () => {
  console.log('==================================================');
  console.log('St. Paul Secondary School - Cloud Deployment Check');
  console.log('==================================================');
  
  const envOk = await validateEnv();
  const dbOk = await validateDatabase();
  const cloudOk = await validateCloudinary();
  const aiOk = await validateGemini();
  
  console.log('\n==================================================');
  console.log('Validation Results:');
  console.log(`- Env Loading:   ${envOk ? 'PASS' : 'FAIL'}`);
  console.log(`- Database:      ${dbOk ? 'PASS' : 'FAIL'}`);
  console.log(`- Cloudinary:    ${cloudOk ? 'PASS' : 'FAIL'}`);
  console.log(`- Gemini AI:     ${aiOk ? 'PASS' : 'FAIL'}`);
  console.log('==================================================');
  
  if (envOk && dbOk && cloudOk && aiOk) {
    console.log('🎉 Your deployment environment is 100% ready!');
    process.exit(0);
  } else {
    console.warn('⚠️  Some validations failed. Please check the logs above.');
    process.exit(1);
  }
})();
