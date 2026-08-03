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
  const tmpPath = path.join(os.tmpdir(), `gf_mtp_${Date.now()}.ps1`);
  await fs.promises.writeFile(tmpPath, script, 'utf8');
  try {
    const { stdout } = await execAsync(`powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "${tmpPath}"`, { maxBuffer: 1024 * 1024 * 50 });
    return stdout;
  } finally {
    fs.promises.unlink(tmpPath).catch(() => {});
  }
}

// IPC Handlers for File System Access
ipcMain.handle('fs:readdir', async (event, dirPath) => {
  try {
    const targetPath = dirPath || os.homedir();

    if (targetPath.startsWith('Category://')) {
      const [categoryUrl, deviceRoot] = targetPath.split('|');
      const category = categoryUrl.replace('Category://', '');
      
      const foldersToScan = [];
      if (category === 'Pictures') {
        foldersToScan.push('DCIM', 'Pictures', 'DCIM\\Camera', 'WhatsApp\\Media\\WhatsApp Images', 'Android\\media\\com.whatsapp\\WhatsApp\\Media\\WhatsApp Images', 'Download');
      } else if (category === 'Videos') {
        foldersToScan.push('DCIM', 'Movies', 'Video', 'DCIM\\Camera', 'WhatsApp\\Media\\WhatsApp Video', 'Android\\media\\com.whatsapp\\WhatsApp\\Media\\WhatsApp Video', 'Download', 'Snapchat', 'Movies\\Telegram', 'Movies\\Instagram');
      } else if (category === 'Audio' || category === 'Music') {
        foldersToScan.push('Music', 'Audio', 'Recordings', 'WhatsApp\\Media\\WhatsApp Audio', 'Android\\media\\com.whatsapp\\WhatsApp\\Media\\WhatsApp Audio', 'Download');
      } else if (category === 'Documents') {
        foldersToScan.push('Documents', 'Download', 'WhatsApp\\Media\\WhatsApp Documents', 'Android\\media\\com.whatsapp\\WhatsApp\\Media\\WhatsApp Documents');
      } else {
        foldersToScan.push('Download');
      }

      let localFilesPromise = Promise.resolve([]);
      if (deviceRoot === 'Local' || deviceRoot === 'Global') {
        localFilesPromise = (async () => {
          const homeDir = os.homedir();
          const searchDirs = [];
          
          try {
            const stdout = await runPowerShell(`Get-CimInstance Win32_LogicalDisk | Select-Object DeviceID | ConvertTo-Json`);
            if (stdout) {
              const data = JSON.parse(stdout);
              const drives = Array.isArray(data) ? data : [data];
              for (const d of drives) {
                if (!d.DeviceID) continue;
                const driveRoot = d.DeviceID + '\\';
                if (category === 'Pictures') searchDirs.push(`${driveRoot}Pictures`, `${driveRoot}Downloads`, `${driveRoot}DCIM`);
                else if (category === 'Videos') searchDirs.push(`${driveRoot}Videos`, `${driveRoot}Downloads`, `${driveRoot}Movies`);
                else if (category === 'Audio' || category === 'Music') searchDirs.push(`${driveRoot}Music`, `${driveRoot}Downloads`, `${driveRoot}Audio`);
                else if (category === 'Documents') searchDirs.push(`${driveRoot}Documents`, `${driveRoot}Downloads`);
                else if (category === 'Downloads') searchDirs.push(`${driveRoot}Downloads`);
              }
            }
          } catch(e) {}
          
          // Also append standard home folders just in case they aren't on C root
          if (category === 'Pictures') searchDirs.push(`${homeDir}\\Pictures`, `${homeDir}\\Downloads`);
          else if (category === 'Videos') searchDirs.push(`${homeDir}\\Videos`, `${homeDir}\\Downloads`);
          else if (category === 'Audio' || category === 'Music') searchDirs.push(`${homeDir}\\Music`, `${homeDir}\\Downloads`);
          else if (category === 'Documents') searchDirs.push(`${homeDir}\\Documents`, `${homeDir}\\Downloads`);
          else if (category === 'Downloads') searchDirs.push(`${homeDir}\\Downloads`);
          else if (category === 'Favorites') {
            const favDir = path.join(homeDir, 'Favorites');
            if (!fs.existsSync(favDir)) fs.mkdirSync(favDir);
            searchDirs.push(favDir);
          } else if (category === 'SafeFolder') {
            const safeDir = path.join(homeDir, 'SafeFolder');
            if (!fs.existsSync(safeDir)) fs.mkdirSync(safeDir);
            searchDirs.push(safeDir);
          }
          
          const exts = {
            'Pictures': ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.heic'],
            'Videos': ['.mp4', '.mkv', '.avi', '.mov', '.webm'],
            'Audio': ['.mp3', '.wav', '.ogg', '.m4a', '.flac', '.aac'],
            'Documents': ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.txt']
          };
          const validExts = exts[category] || [];
          
          const dirPromises = searchDirs.map(async (dir) => {
            let dirFiles = [];
            try {
              const items = await fs.promises.readdir(dir, { withFileTypes: true });
              for (const item of items) {
                if (!item.isDirectory()) {
                  const ext = path.extname(item.name).toLowerCase();
                  if (validExts.length === 0 || validExts.includes(ext)) {
                    dirFiles.push({
                      name: item.name,
                      path: path.join(dir, item.name),
                      isDirectory: false,
                      isFile: true,
                      isSymlink: false,
                      size: 0,
                      mtime: null,
                      ext: ext,
                      isMTP: false
                    });
                  }
                }
              }
            } catch (e) {
              // Ignore missing folders
            }
            return dirFiles;
          });
          
          const results = await Promise.all(dirPromises);
          return results.flat();
        })();
      }

      let mtpFilesPromise = Promise.resolve([]);
      if (deviceRoot === 'Global' || deviceRoot.startsWith('This PC\\')) {
        mtpFilesPromise = (async () => {
          let deviceTarget = deviceRoot === 'Global' ? '' : deviceRoot.replace('This PC\\', '').replace(/'/g, "''");
          
          let script = `
            $shell = New-Object -ComObject Shell.Application;
            $pc = $shell.Namespace(17);
            $devices = @();
            foreach ($item in $pc.Items()) {
              if (-not $item.IsFileSystem) {
                if ('${deviceTarget}' -eq '' -or $item.Name -eq '${deviceTarget}') {
                  $devices += @{ Name = $item.Name; Folder = $item.GetFolder }
                }
              }
            }
            
            $results = @();
            if ($devices.Count -gt 0) {
              $searchFolders = @(${foldersToScan.map(f => `'${f.replace(/'/g, "''")}'`).join(', ')});
              
              foreach ($deviceObj in $devices) {
                $deviceName = $deviceObj.Name
                $device = $deviceObj.Folder
                foreach ($storage in $device.Items()) {
                  if ($storage.IsFolder) {
                    $storageFolder = $storage.GetFolder;
                    
                    foreach ($subpath in $searchFolders) {
                      $parts = $subpath -split '\\\\';
                      $curr = $storageFolder;
                      $valid = $true;
                      
                      foreach ($part in $parts) {
                         $found = $false;
                         if (-not $curr) { $valid = $false; break; }
                         foreach ($item in $curr.Items()) {
                           if ($item.Name -eq $part) {
                             $curr = $item.GetFolder;
                             $found = $true;
                             break;
                           }
                         }
                         if (-not $found) { $valid = $false; break; }
                      }
                      
                      if ($valid -and $curr) {
                         foreach ($file in $curr.Items()) {
                           if (-not $file.IsFolder) {
                             $ext = [System.IO.Path]::GetExtension($file.Name).ToLower()
                             $isValidExt = $true
                             if ('${category}' -eq 'Pictures' -and $ext -ne '' -and $ext -notmatch '\\.(jpg|jpeg|png|gif|bmp|webp|heic)$') { $isValidExt = $false }
                             if ('${category}' -eq 'Videos' -and $ext -ne '' -and $ext -notmatch '\\.(mp4|mkv|avi|mov|webm)$') { $isValidExt = $false }
                             if (('${category}' -eq 'Audio' -or '${category}' -eq 'Music') -and $ext -ne '' -and $ext -notmatch '\\.(mp3|wav|ogg|m4a|flac|aac)$') { $isValidExt = $false }
                             if ('${category}' -eq 'Documents' -and $ext -ne '' -and $ext -notmatch '\\.(pdf|doc|docx|xls|xlsx|txt)$') { $isValidExt = $false }
                             
                             if ($isValidExt) {
                               $results += @{
                                 Name = $file.Name
                                 IsFolder = $file.IsFolder
                                 IsFileSystem = $file.IsFileSystem
                                 VirtualPath = 'This PC\\' + $deviceName + '\\' + $storage.Name + '\\' + $subpath + '\\' + $file.Name
                               }
                             }
                           }
                         }
                      }
                    }
                  }
                }
              }
            }
            ConvertTo-Json -InputObject @($results) -Compress
          `;
          
          try {
            const stdout = await runPowerShell(script);
            const items = JSON.parse(stdout || '[]');
            const itemArray = Array.isArray(items) ? items : (items.Name ? [items] : []);

            const uniqueItemsMap = new Map();
            itemArray.forEach(item => uniqueItemsMap.set(item.VirtualPath, item));
            const uniqueItems = Array.from(uniqueItemsMap.values());

            return uniqueItems.map(item => ({
              name: item.Name,
              path: item.VirtualPath,
              isDirectory: item.IsFolder,
              isFile: !item.IsFolder,
              isSymlink: false,
              size: 0,
              mtime: null,
              ext: item.Name && item.Name.includes('.') ? path.extname(item.Name).toLowerCase() : '',
              isMTP: !item.IsFileSystem
            }));
          } catch(e) {
            console.error("MTP PowerShell Error:", e);
            return [];
          }
        })();
      }

      const [localFiles, mtpFiles] = await Promise.all([localFilesPromise, mtpFilesPromise]);
      return [...localFiles, ...mtpFiles];
    }

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
    const script = `Get-CimInstance Win32_LogicalDisk | Select-Object DeviceID, VolumeName | ConvertTo-Json`;
    const stdout = await runPowerShell(script);
    if (stdout) {
      const data = JSON.parse(stdout);
      const drives = Array.isArray(data) ? data : [data];
      return drives.map(d => ({
        name: d.VolumeName ? `${d.VolumeName} (${d.DeviceID})` : `Local Disk (${d.DeviceID})`,
        path: d.DeviceID + '\\'
      }));
    }
  } catch (e) {
    console.error("Drives error:", e);
  }
  return [{ name: 'Local Disk (C:)', path: 'C:\\' }];
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

ipcMain.handle('fs:getStorageStats', async () => {
  try {
    const script = `Get-Volume -DriveLetter C | Select-Object Size, SizeRemaining | ConvertTo-Json`;
    const stdout = await runPowerShell(script);
    if (stdout) {
      const data = JSON.parse(stdout);
      const total = data.Size;
      const free = data.SizeRemaining;
      const used = total - free;
      const capacity = Math.round((used / total) * 100) + '%';
      
      return {
        total,
        used,
        free,
        capacity
      };
    }
  } catch (e) {
    console.error("Storage stats error:", e);
  }
  return { total: 0, used: 0, free: 0, capacity: '0%' };
});

ipcMain.handle('fs:getCleanSuggestions', async () => {
  const suggestions = [];
  
  // 1. Junk Files (Temp dir)
  try {
    const tmpDir = os.tmpdir();
    let junkSize = 0;
    const files = await fs.promises.readdir(tmpDir, { withFileTypes: true });
    const statPromises = files.filter(f => f.isFile()).map(f => 
      fs.promises.stat(path.join(tmpDir, f.name)).catch(() => null)
    );
    const stats = await Promise.all(statPromises);
    for (const stat of stats) {
      if (stat) junkSize += stat.size;
    }
    
    if (junkSize > 0) {
      suggestions.push({
        id: 'junk',
        type: 'Junk files',
        description: 'Temporary app files and cache',
        size: junkSize,
        action: 'Clean'
      });
    }
  } catch (e) {
    console.error(e);
  }

  // 2. Large Downloads
  try {
    const downloads = path.join(os.homedir(), 'Downloads');
    const files = await fs.promises.readdir(downloads, { withFileTypes: true });
    let largeSize = 0;
    const statPromises = files.filter(f => f.isFile()).map(f => 
      fs.promises.stat(path.join(downloads, f.name)).catch(() => null)
    );
    const stats = await Promise.all(statPromises);
    for (const stat of stats) {
      if (stat && stat.size > 50 * 1024 * 1024) { // > 50MB
        largeSize += stat.size;
      }
    }
    
    if (largeSize > 0) {
      suggestions.push({
        id: 'large',
        type: 'Large files',
        description: 'Files taking up the most space',
        size: largeSize,
        action: 'Select files'
      });
    }
  } catch (e) {
    console.error(e);
  }

  return suggestions;
});
