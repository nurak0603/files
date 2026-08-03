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
  const singleLineScript = script.replace(/\n/g, ' ').replace(/\r/g, '');
  const { stdout } = await execAsync(`powershell -NoProfile -NonInteractive -Command "${singleLineScript}"`);
  return stdout;
}

// IPC Handlers for File System Access
ipcMain.handle('fs:readdir', async (event, dirPath) => {
  try {
    const targetPath = dirPath || os.homedir();

    // Custom MTP Traversal for paths starting with 'This PC'
    if (targetPath.startsWith('This PC')) {
      const parts = targetPath.split('\\').filter(p => p !== 'This PC' && p !== '');
      
      let script = `$shell = New-Object -ComObject Shell.Application; $current = $shell.Namespace(17);`;
      
      if (parts.length > 0) {
        // Build powershell array of parts safely
        const partsStr = parts.map(p => `'${p.replace(/'/g, "''")}'`).join(', ');
        script += `
          $parts = @(${partsStr});
          foreach ($part in $parts) {
            $found = $false;
            foreach ($item in $current.Items()) {
              if ($item.Name -eq $part) {
                $current = $item.GetFolder;
                $found = $true;
                break;
              }
            }
            if (-not $found) { break }
          }
        `;
      }
      
      script += `
        if ($current) {
          $items = $current.Items() | Select-Object Name, Path, IsFileSystem, IsFolder;
          ConvertTo-Json -InputObject @($items) -Compress
        } else { '[]' }
      `;

      const stdout = await runPowerShell(script);
      const items = JSON.parse(stdout || '[]');
      const itemArray = Array.isArray(items) ? items : (items.Name ? [items] : []);

      return itemArray.map(item => {
        // If it's a real file system drive/folder, use its real path (e.g. D:\)
        let finalPath = '';
        if (item.IsFileSystem && item.Path && item.Path.includes(':\\')) {
          finalPath = item.Path;
        } else {
          finalPath = targetPath === 'This PC' ? `This PC\\${item.Name}` : `${targetPath}\\${item.Name}`;
        }
        
        return {
          name: item.Name,
          path: finalPath,
          isDirectory: item.IsFolder,
          isFile: !item.IsFolder,
          isSymlink: false,
          size: 0,
          mtime: null,
          ext: item.Name && item.Name.includes('.') ? path.extname(item.Name).toLowerCase() : '',
          isMTP: !item.IsFileSystem
        };
      });
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

// File Operations (Local files only for now)
ipcMain.handle('fs:copy', async (event, source, dest) => {
  if (source.startsWith('This PC') || dest.startsWith('This PC')) throw new Error("MTP writing not supported yet.");
  await fs.promises.cp(source, dest, { recursive: true });
});

ipcMain.handle('fs:delete', async (event, target) => {
  if (target.startsWith('This PC')) throw new Error("MTP deletion not supported yet.");
  await fs.promises.rm(target, { recursive: true, force: true });
});

ipcMain.handle('fs:openFile', async (event, targetPath) => {
  if (targetPath.startsWith('This PC')) {
    // MTP file opening: copy to os.tmpdir() first
    const parts = targetPath.split('\\').filter(p => p !== 'This PC' && p !== '');
    if (parts.length === 0) return;
    
    const fileName = parts[parts.length - 1];
    const tmpDir = os.tmpdir();
    
    const partsStr = parts.map(p => `'${p.replace(/'/g, "''")}'`).join(', ');
    const script = `
      $shell = New-Object -ComObject Shell.Application;
      $dest = $shell.Namespace('${tmpDir.replace(/'/g, "''")}');
      $current = $shell.Namespace(17);
      $parts = @(${partsStr});
      foreach ($part in $parts) {
        $found = $false;
        foreach ($item in $current.Items()) {
          if ($item.Name -eq $part) {
            $current = $item;
            $found = $true;
            break;
          }
        }
        if (-not $found) { break }
        if ($part -ne $parts[-1]) { $current = $current.GetFolder }
      }
      if ($current -and $found) {
        $dest.CopyHere($current, 4 -bOr 16 -bOr 512)
      }
    `;
    await runPowerShell(script);
    
    // The copy is asynchronous and the file name might gain an extension (e.g. .jpg)
    // Wait for the file to appear and stabilize
    let matchedFile = null;
    let destPath = null;
    
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 200)); // poll every 200ms
      const tmpFiles = await fs.promises.readdir(tmpDir);
      matchedFile = tmpFiles.find(f => f.startsWith(fileName) && !f.endsWith('.tmp'));
      if (matchedFile) {
        destPath = path.join(tmpDir, matchedFile);
        const stat = await fs.promises.stat(destPath).catch(() => null);
        if (stat && stat.size > 0) {
          // Check if size is stable
          await new Promise(r => setTimeout(r, 300));
          const stat2 = await fs.promises.stat(destPath).catch(() => null);
          if (stat2 && stat.size === stat2.size) {
            break; // stable
          }
        }
      }
    }

    if (!destPath) {
      throw new Error("Failed to download file from phone.");
    }
    
    const errorMessage = await shell.openPath(destPath);
    if (errorMessage) throw new Error(errorMessage);
    return;
  }
  
  const errorMessage = await shell.openPath(targetPath);
  if (errorMessage) {
    throw new Error(errorMessage);
  }
});

ipcMain.handle('fs:getSpecialFolders', () => {
  const home = os.homedir();
  return {
    Desktop: path.join(home, 'Desktop'),
    Documents: path.join(home, 'Documents'),
    Downloads: path.join(home, 'Downloads'),
    Pictures: path.join(home, 'Pictures'),
    Music: path.join(home, 'Music'),
    Videos: path.join(home, 'Videos'),
  };
});
