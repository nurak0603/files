import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  readDir: (dirPath) => ipcRenderer.invoke('fs:readdir', dirPath),
  getHomeDir: () => ipcRenderer.invoke('fs:getHomeDir'),
  getDrives: () => ipcRenderer.invoke('fs:getDrives'),
  copyFile: (src, dest) => ipcRenderer.invoke('fs:copy', src, dest),
  deleteFile: (target) => ipcRenderer.invoke('fs:delete', target),
  openFile: (target) => ipcRenderer.invoke('fs:openFile', target),
  getSpecialFolders: () => ipcRenderer.invoke('fs:getSpecialFolders'),
  getStorageStats: () => ipcRenderer.invoke('fs:getStorageStats'),
  getCleanSuggestions: () => ipcRenderer.invoke('fs:getCleanSuggestions'),
});
