import { app, BrowserWindow, ipcMain, shell } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import os from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

process.env.APP_ROOT = path.join(__dirname, '..');
export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL'];
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron');
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist');

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, 'public') : RENDERER_DIST;

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  if (VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(RENDERER_DIST, 'index.html'));
  }
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.whenReady().then(createWindow);

import { exec } from 'child_process';
import util from 'util';
import diskinfo from 'node-disk-info';

const execAsync = util.promisify(exec);

// Helper to run PowerShell
async function runPowerShell(script) {
  const { stdout } = await execAsync(`powershell -NoProfile -NonInteractive -Command "${script}"`);
  return stdout;
}

// IPC Handlers for File System Access
ipcMain.handle('fs:readdir', async (event, dirPath) => {
  try {
    const targetPath = dirPath || os.homedir();

    // Special case for 'This PC' which lists MTP and regular drives
    if (targetPath === 'This PC') {
      const script = `$shell = New-Object -ComObject Shell.Application; $computer = $shell.Namespace(17); $items = $computer.Items() | Select-Object Name, Path, IsFileSystem, IsFolder; ConvertTo-Json -InputObject @($items) -Compress`;
      const stdout = await runPowerShell(script);
      const items = JSON.parse(stdout || '[]');
      return items.map(item => ({
        name: item.Name,
        path: item.Path,
        isDirectory: item.IsFolder,
        isFile: !item.IsFolder,
        isSymlink: false,
        size: 0,
        mtime: null,
        ext: '',
        isMTP: !item.IsFileSystem
      }));
    }

    // Special case for MTP paths (which don't have a drive letter, e.g. ::{...})
    if (!targetPath.includes(':\\') && !targetPath.startsWith('\\\\')) {
       // It's a shell path, query it via PowerShell
       const script = `$shell = New-Object -ComObject Shell.Application; $folder = $shell.Namespace('${targetPath.replace(/'/g, "''")}'); if ($folder) { $items = $folder.Items() | Select-Object Name, Path, IsFileSystem, IsFolder; ConvertTo-Json -InputObject @($items) -Compress } else { '[]' }`;
       const stdout = await runPowerShell(script);
       const items = JSON.parse(stdout || '[]');
       return items.map(item => ({
         name: item.Name,
         path: item.Path,
         isDirectory: item.IsFolder,
         isFile: !item.IsFolder,
         isSymlink: false,
         size: 0,
         mtime: null,
         ext: item.Name.includes('.') ? path.extname(item.Name).toLowerCase() : '',
         isMTP: !item.IsFileSystem
       }));
    }

    // Standard local file system
    const files = await fs.promises.readdir(targetPath, { withFileTypes: true });
    
    return files.map(file => {
      const filePath = path.join(targetPath, file.name);
      let stat = null;
      try {
        stat = fs.statSync(filePath);
      } catch(e) {}

      return {
        name: file.name,
        path: filePath,
        isDirectory: file.isDirectory(),
        isFile: file.isFile(),
        isSymlink: file.isSymbolicLink(),
        size: stat ? stat.size : 0,
        mtime: stat ? stat.mtime : null,
        ext: path.extname(file.name).toLowerCase(),
        isMTP: false
      };
    });
  } catch (error) {
    throw new Error(error.message);
  }
});

ipcMain.handle('fs:getHomeDir', () => 'This PC'); // Default to This PC to show phones

ipcMain.handle('fs:getDrives', async () => {
  try {
    const drives = await diskinfo.getDiskInfo();
    return drives.map(d => ({
      name: d.mounted,
      path: d.mounted + '\\'
    }));
  } catch (e) {
    return [{ name: 'C:', path: 'C:\\' }];
  }
});
