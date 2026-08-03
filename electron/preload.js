import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  readDir: (dirPath) => ipcRenderer.invoke('fs:readdir', dirPath),
  getHomeDir: () => ipcRenderer.invoke('fs:getHomeDir'),
  getDrives: () => ipcRenderer.invoke('fs:getDrives'),
});
