const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const mysql = require('mysql2/promise');

function normalizeDbConfig(rawConfig) {
  if (!rawConfig || typeof rawConfig !== 'object') return null;

  const host = rawConfig.db?.host || rawConfig.host || rawConfig.databaseHost || '';
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

async function testDatabaseConnection() {
  let dbConfig = {
    host: '192.168.0.155',
    port: 3306,
    user: 'root',
    password: '',
    database: 'school_system'
  };

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
          console.log(`[Start-Dev] Loaded DB configuration from: ${p}`);
          break;
        }
      } catch (err) {
        // ignore
      }
    }
  }

  console.log(`[Start-Dev] Testing database reachability at ${dbConfig.host}:${dbConfig.port}...`);
  try {
    // Connect to server (without DB name to check if MySQL is running)
    const connection = await mysql.createConnection({
      host: dbConfig.host,
      port: dbConfig.port,
      user: dbConfig.user,
      password: dbConfig.password,
      connectTimeout: 5000
    });
    await connection.end();
    console.log(`[Start-Dev] Database server is reachable.`);
    return true;
  } catch (err) {
    console.error(`[Start-Dev] DATABASE CONNECTION FAILED: ${err.message}`);
    console.error(`Please verify that your MySQL server is running and the credentials in db_config.json are correct.`);
    return false;
  }
}

(async () => {
  // 1. Verify database is online first
  const dbOk = await testDatabaseConnection();
  if (!dbOk) {
    console.error('[Start-Dev] Aborting startup because database is offline or misconfigured.');
    process.exit(1);
  }

  // 2. Start Express API Server
  console.log('[Start-Dev] Starting backend Express API server...');
  const serverPath = path.join(__dirname, '..', 'electron', 'server.js');
  const serverProcess = spawn('node', [`"${serverPath}"`], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, NODE_ENV: 'development' },
    shell: true
  });

  let serverStarted = false;

  const waitForServer = new Promise((resolve, reject) => {
    serverProcess.stdout.on('data', (data) => {
      const output = data.toString();
      process.stdout.write(data);
      if (output.includes('Express API Server listening on')) {
        serverStarted = true;
        resolve();
      }
    });

    serverProcess.stderr.on('data', (data) => {
      process.stderr.write(data);
    });

    serverProcess.on('exit', (code) => {
      if (!serverStarted) {
        reject(new Error(`Backend server exited early with code ${code}`));
      } else {
        console.log(`[Start-Dev] Backend server exited with code ${code}`);
        process.exit(code || 0);
      }
    });

    serverProcess.on('error', (err) => {
      reject(err);
    });
  });

  try {
    await waitForServer;
    console.log('[Start-Dev] Backend server started successfully. Starting Vite frontend...');

    // 3. Start Vite dev server
    const viteProcess = spawn('npx', ['vite'], {
      cwd: path.join(__dirname, '..'),
      stdio: 'inherit',
      shell: true
    });

    viteProcess.on('exit', (code) => {
      console.log(`[Start-Dev] Vite exited with code ${code}. Stopping backend server...`);
      serverProcess.kill('SIGTERM');
      process.exit(code || 0);
    });

    // Handle shutdown signal to stop backend
    const handleShutdown = () => {
      console.log('\n[Start-Dev] Shutting down development processes...');
      viteProcess.kill('SIGTERM');
      serverProcess.kill('SIGTERM');
      process.exit(0);
    };

    process.on('SIGINT', handleShutdown);
    process.on('SIGTERM', handleShutdown);

  } catch (err) {
    console.error(`[Start-Dev] Failed to start backend: ${err.message}`);
    serverProcess.kill('SIGTERM');
    process.exit(1);
  }
})();
