const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electron', {
  platform: process.platform,
  readData: (key) => ipcRenderer.invoke('read-data', key),
  writeData: (key, data) => ipcRenderer.invoke('write-data', key, data),
  readDataSync: (key) => ipcRenderer.sendSync('read-data-sync', key),
  writeDataSync: (key, data) => ipcRenderer.sendSync('write-data-sync', key, data),
  getDbConfig: () => ipcRenderer.invoke('get-db-config'),
  saveDbConfig: (config) => ipcRenderer.invoke('save-db-config', config),
  testDbConnection: (dbConfig) => ipcRenderer.invoke('test-db-connection', dbConfig),
  testApiConnection: (serverUrl) => ipcRenderer.invoke('test-api-connection', serverUrl),
  saveFileBase64: (filename, base64Data, filters) => ipcRenderer.invoke('save-file-base64', { filename, base64Data, filters }),
})

// Loading screen progress API
contextBridge.exposeInMainWorld('electronAPI', {
  onLoadingProgress: (callback) => ipcRenderer.on('loading-progress', (event, stage) => callback(stage)),
  onLoadingComplete: (callback) => ipcRenderer.on('loading-complete', () => callback()),
  signalAppReady: () => ipcRenderer.send('app-ready'),
})