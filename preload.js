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
});