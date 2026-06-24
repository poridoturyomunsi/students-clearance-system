const { app, BrowserWindow, ipcMain, dialog } = require('electron')
const os = require('os')
const path = require('path')
const fs = require('fs')
const { startServer, stopServer, initDb } = require('./server')

const CONFIG_FILE = 'db_config.json'

// Disable GPU hardware acceleration BEFORE app is ready to prevent GPU crashes
try {
  app.disableHardwareAcceleration();
} catch (e) {
  console.warn('Could not disable hardware acceleration:', e);
}

// Helper to safely get the user data path after Electron is initialized
function getUserDataPath() {
  return app.getPath('userData')
}

// Attempt to clear and recreate Chromium cache and related directories.
// Gracefully skip EPERM (permission denied) errors on Windows.
function clearChromiumCacheDirs() {
  try {
    const userData = getUserDataPath();
    
    // Ensure userData directory exists first
    if (!fs.existsSync(userData)) {
      try {
        fs.mkdirSync(userData, { recursive: true });
      } catch (err) {
        console.warn(`Failed to create userData directory: ${userData}`, err);
        return; // Can't proceed if userData doesn't exist or can't be created
      }
    }
    
    const cachePaths = [
      path.join(userData, 'Cache'),
      path.join(userData, 'GPUCache'),
      path.join(userData, 'Code Cache'),
      path.join(userData, 'IndexedDB'),
      path.join(userData, 'Local Storage'),
      path.join(userData, 'databases')
    ];

    cachePaths.forEach(p => {
      try {
        if (fs.existsSync(p)) {
          fs.rmSync(p, { recursive: true, force: true });
        }
        // Recreate directory to ensure Chromium has a clean place to write
        fs.mkdirSync(p, { recursive: true });
      } catch (err) {
        // Skip permission errors (EPERM) on Windows; log but don't crash
        if (err.code === 'EPERM') {
          console.warn(`Skipped cache cleanup (permission denied): ${p}`);
        } else if (err.code === 'EACCES') {
          console.warn(`Skipped cache cleanup (access denied): ${p}`);
        } else {
          console.warn(`Failed to clear/recreate cache dir ${p}:`, err.message);
        }
      }
    });
  } catch (err) {
    console.warn('Unexpected error while clearing Chromium cache directories:', err.message);
    // Don't crash the app, just log the warning
  }
}

// Attempt early cache clearance before app 'ready' if possible
try {
  clearChromiumCacheDirs();
} catch (e) {
  console.warn('Pre-ready cache clearance failed, will retry after ready.', e.message);
}

function getDbConfigPath() {
  return path.join(getUserDataPath(), CONFIG_FILE)
}

function normalizeDbConfig(rawConfig) {
  if (!rawConfig || typeof rawConfig !== 'object') return null

  const serverIp = rawConfig.serverIp || rawConfig.host || ''
  const serverPort = parseInt(String(rawConfig.serverPort || rawConfig.port || 3000), 10) || 3000

  const dbHost = rawConfig.db?.host || rawConfig.host || rawConfig.databaseHost || ''
  const dbPort = parseInt(String(rawConfig.db?.port || rawConfig.port || rawConfig.databasePort || 3306), 10) || 3306
  const dbUser = rawConfig.db?.user || rawConfig.user || rawConfig.databaseUsername || ''
  const dbPassword = rawConfig.db?.password || rawConfig.password || rawConfig.databasePassword || ''
  const dbName = rawConfig.db?.database || rawConfig.database || rawConfig.databaseName || 'school_system'

  return {
    mode: rawConfig.mode || 'network',
    serverUrl: rawConfig.serverUrl || `http://${serverIp}:${serverPort}`,
    db: {
      host: dbHost || '192.168.0.155',
      port: dbPort,
      user: dbUser || 'root',
      password: dbPassword,
      database: dbName
    }
  }
}

function loadDbConfig() {
  try {
    const filePath = getDbConfigPath()
    if (fs.existsSync(filePath)) {
      const rawConfig = JSON.parse(fs.readFileSync(filePath, 'utf8'))
      const normalized = normalizeDbConfig(rawConfig)
      if (normalized) {
        return normalized
      }
      return rawConfig
    }
  } catch (err) {
    console.error('Error loading DB config:', err)
  }
  
  // Default Config
  const defaultConfig = {
    mode: 'network', // 'network' or 'client'
    serverUrl: 'http://192.168.0.155:3000',
    db: {
      host: '192.168.0.155',
      port: 3306,
      user: 'root',
      password: '',
      database: 'school_system'
    }
  }
  
  saveDbConfig(defaultConfig)
  return defaultConfig
}

function saveDbConfig(config) {
  try {
    const filePath = getDbConfigPath()
    fs.writeFileSync(filePath, JSON.stringify(config, null, 2), 'utf8')
    return true
  } catch (err) {
    console.error('Error saving DB config:', err)
    return false
  }
}

let activeServerUrl = 'http://192.168.0.155:3000';

function getLocalIPv4() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return null;
}

// Configuration IPC Handlers
ipcMain.handle('get-db-config', async () => {
  const config = loadDbConfig()
  if (config.mode === 'host' || config.mode === 'network') {
    config.serverUrl = activeServerUrl;
  }
  return config
})

ipcMain.handle('save-file-base64', async (event, { filename, base64Data, filters }) => {
  const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
  const { filePath } = await dialog.showSaveDialog(win, {
    title: 'Save File',
    defaultPath: filename,
    filters: filters || []
  });

  if (filePath) {
    try {
      const buffer = Buffer.from(base64Data, 'base64');
      fs.writeFileSync(filePath, buffer);
      return { success: true, filePath };
    } catch (err) {
      console.error('Failed to save file via IPC:', err);
      return { success: false, error: err.message };
    }
  }
  return { success: false, error: 'Cancelled' };
})

ipcMain.handle('save-db-config', async (event, config) => {
  const normalizedConfig = normalizeDbConfig(config) || config
  const success = saveDbConfig(normalizedConfig)
  if (success) {
    if (normalizedConfig.mode === 'host' || normalizedConfig.mode === 'network') {
      try {
        const result = await startServer(3000)
        const lan = getLocalIPv4() || 'localhost'
        activeServerUrl = `http://${lan}:${result.port}`
        await initDb(normalizedConfig.db)
      } catch (err) {
        console.error('Error starting server or database:', err)
      }
    } else {
      await stopServer()
    }
  }
  return success
})

ipcMain.handle('test-db-connection', async (event, dbConfig) => {
  const normalizedConfig = normalizeDbConfig(dbConfig) || { db: dbConfig }
  const mysql = require('mysql2/promise')
  try {
    const connection = await mysql.createConnection({
      host: normalizedConfig.db.host,
      port: normalizedConfig.db.port,
      user: normalizedConfig.db.user,
      password: normalizedConfig.db.password,
      database: normalizedConfig.db.database,
      connectTimeout: 5000
    })
    await connection.end()
    return { success: true }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('test-api-connection', async (event, serverUrl) => {
  const http = require('http')
  const url = require('url')
  return new Promise((resolve) => {
    try {
      const parsedUrl = url.parse(serverUrl + '/api/config-status')
      const options = {
        host: parsedUrl.hostname,
        port: parsedUrl.port || 80,
        path: parsedUrl.path,
        method: 'GET',
        timeout: 4000
      }
      
      const req = http.request(options, (res) => {
        let body = ''
        res.on('data', (chunk) => body += chunk)
        res.on('end', () => {
          if (res.statusCode === 200) {
            resolve({ success: true })
          } else {
            resolve({ success: false, error: `Server returned status code ${res.statusCode}` })
          }
        })
      })
      
      req.on('error', (err) => {
        resolve({ success: false, error: err.message })
      })
      
      req.on('timeout', () => {
        req.destroy()
        resolve({ success: false, error: 'Connection timed out' })
      })
      
      req.end()
    } catch (err) {
      resolve({ success: false, error: err.message })
    }
  })
})

// Kept legacy handlers for backward compatibility/graceful failover during first startup migration
ipcMain.on('read-data-sync', (event, key) => {
  try {
    const userDataPath = getUserDataPath()
    const filePath = path.join(userDataPath, `${key}.json`)
    if (fs.existsSync(filePath)) {
      event.returnValue = fs.readFileSync(filePath, 'utf8')
      return
    }
  } catch (err) {
    console.error(`Error reading data sync for ${key}:`, err)
  }
  event.returnValue = null
})

ipcMain.on('write-data-sync', (event, key, data) => {
  try {
    const userDataPath = getUserDataPath()
    const filePath = path.join(userDataPath, `${key}.json`)
    fs.writeFileSync(filePath, data, 'utf8')
    event.returnValue = true
  } catch (err) {
    console.error(`Error writing data sync for ${key}:`, err)
    event.returnValue = false
  }
})

ipcMain.handle('read-data', async (event, key) => {
  try {
    const userDataPath = getUserDataPath()
    const filePath = path.join(userDataPath, `${key}.json`)
    if (fs.existsSync(filePath)) {
      return fs.readFileSync(filePath, 'utf8')
    }
  } catch (err) {
    console.error(`Error reading data async for ${key}:`, err)
  }
  return null
})

ipcMain.handle('write-data', async (event, key, data) => {
  try {
    const userDataPath = getUserDataPath()
    const filePath = path.join(userDataPath, `${key}.json`)
    fs.writeFileSync(filePath, data, 'utf8')
    return true
  } catch (err) {
    console.error(`Error writing data async for ${key}:`, err)
    return false
  }
})

function findVitePort() {
  const http = require('http');
  return new Promise((resolve) => {
    let port = 5173;
    function next() {
      if (port > 5180) {
        resolve(null);
        return;
      }
      const req = http.get(`http://localhost:${port}`, (res) => {
        resolve(port);
        req.destroy();
      });
      req.on('error', () => {
        port++;
        next();
      });
      req.setTimeout(200, () => {
        req.destroy();
        port++;
        next();
      });
    }
    next();
  });
}

async function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 1000,
    minWidth: 1000,
    minHeight: 720,
    icon: path.join(__dirname, '..', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    show: false, // Don't show until React is ready
  })

  let startUrl = process.env.ELECTRON_START_URL;
  if (!startUrl && !app.isPackaged) {
    const vitePort = await findVitePort();
    if (vitePort) {
      startUrl = `http://localhost:${vitePort}`;
    }
  }

  if (startUrl) {
    win.loadURL(startUrl)
  } else {
    win.loadFile(path.join(__dirname, '..', 'build', 'index.html'))
  }

  return win;
}

// Create splash (loading) screen window
function createSplashWindow() {
  const splash = new BrowserWindow({
    width: 600,
    height: 500,
    minWidth: 400,
    minHeight: 300,
    frame: false,
    alwaysOnTop: true,
    icon: path.join(__dirname, '..', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  const splashPath = path.join(__dirname, '..', 'public', 'loading.html');
  splash.loadFile(splashPath);
  
  return splash;
}

app.whenReady().then(async () => {
  // Re-run cache clearance after ready to handle any locks held until initialization
  try { clearChromiumCacheDirs(); } catch (e) { console.warn('Cache clearance after ready failed:', e); }
  
  // Create and show splash window
  const splash = createSplashWindow();
  let mainWindow = null;
  
  // Track if main window has been shown yet
  let mainWindowShown = false;

  const config = loadDbConfig()
  
  // Stage 0: Initializing
  splash.webContents.send('loading-progress', 0);
  
  if (config.mode === 'host' || config.mode === 'network') {
    try {
      // Stage 1: Connecting to Database
      splash.webContents.send('loading-progress', 1);
      
      // Check if backend is already running (e.g. started by start-dev.js orchestrator)
      let activePort = 3000;
      try {
        const portPath = path.join(__dirname, '..', '.port');
        if (fs.existsSync(portPath)) {
          const content = fs.readFileSync(portPath, 'utf8').trim();
          if (content) {
            activePort = parseInt(content, 10) || 3000;
          }
        }
      } catch (e) {}

      const backendUrl = `http://localhost:${activePort}`;
      const isAlreadyRunning = await new Promise((resolve) => {
        const http = require('http');
        const req = http.get(`${backendUrl}/api/config-status`, (res) => {
          resolve(res.statusCode === 200);
          res.destroy();
        });
        req.on('error', () => resolve(false));
        req.setTimeout(500, () => {
          req.destroy();
          resolve(false);
        });
      });

      if (isAlreadyRunning) {
        console.log(`Backend server is already running on port ${activePort}. Reusing it.`);
        activeServerUrl = backendUrl;
      } else {
        const result = await startServer(3000)
        const lan = getLocalIPv4() || 'localhost'
        activeServerUrl = `http://${lan}:${result.port}`
        await initDb(config.db)
      }
      
      // Stage 2: Loading Student Records
      splash.webContents.send('loading-progress', 2);
    } catch (err) {
      console.error('Failed to start API server:', err)
    }
  }
  
  // Stage 3: Loading Modules
  splash.webContents.send('loading-progress', 3);
  
  mainWindow = await createWindow();
  
  // Listen for React to signal it's ready
  ipcMain.once('app-ready', () => {
    if (!mainWindowShown) {
      mainWindowShown = true;
      // Stage 4: Ready
      splash.webContents.send('loading-progress', 4);
      
      // Close splash screen
      setTimeout(() => {
        splash.webContents.send('loading-complete');
        splash.close();
      }, 300);
      
      // Show main window
      mainWindow.show();
    }
  });
  
  // Fallback: show main window after 8 seconds if React doesn't signal ready
  setTimeout(() => {
    if (!mainWindowShown && mainWindow) {
      mainWindowShown = true;
      console.warn('Main window shown by fallback timeout (React did not signal ready)');
      splash.close();
      mainWindow.show();
    }
  }, 8000);
})

// Monitor GPU process and child process failures; disable GPU and continue running.
app.on('gpu-process-crashed', (event, killed) => {
  console.warn('GPU process crashed (killed=%s). Disabling hardware acceleration and continuing.', killed);
  try { app.disableHardwareAcceleration(); app.commandLine.appendSwitch('disable-gpu'); } catch (e) { console.error(e); }
});

app.on('child-process-gone', (event, details) => {
  // details.reason may include 'killed' or other signals. Log and continue.
  console.warn('Child process gone:', details);
});

// Ignore quota DB or cache reset warnings to avoid stopping the app.
process.on('uncaughtException', (err) => {
  if (err && typeof err.message === 'string' && (err.message.includes('Quota') || err.message.includes('IndexedDB') || err.message.includes('cache'))) {
    console.warn('Non-fatal storage/cache error ignored:', err.message);
    return;
  }
  console.error('Uncaught exception:', err);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('will-quit', async () => {
  await stopServer()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})