const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  openFiles: () => ipcRenderer.invoke('open-files'),
  parseSrts: (files) => ipcRenderer.invoke('parse-srts', files),
  saveExcel: (parsedFiles) => ipcRenderer.invoke('save-excel', parsedFiles),
  windowMinimize: () => ipcRenderer.send('window-minimize'),
  windowMaximize: () => ipcRenderer.send('window-maximize'),
  windowClose: () => ipcRenderer.send('window-close'),
  onMaximize:   (cb) => ipcRenderer.on('window-maximized',   cb),
  onUnmaximize: (cb) => ipcRenderer.on('window-unmaximized', cb),
  onUpdateAvailable: (cb) => ipcRenderer.on('update-available', (_, data) => cb(data)),
  onUpdateProgress: (cb) => ipcRenderer.on('update-progress', (_, data) => cb(data)),
  onUpdateDownloaded: (cb) => ipcRenderer.on('update-downloaded', (_, data) => cb(data)),
  downloadUpdateNow: () => ipcRenderer.send('update-download-now'),
});