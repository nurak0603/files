import { useState, useEffect } from 'react';
import { 
  Folder, File, HardDrive, Home, Star, Monitor, ChevronRight, 
  ArrowLeft, ArrowRight, ArrowUp, RotateCw, Search, Plus, 
  Scissors, Copy, ClipboardPaste, Trash2, Edit3, MoreHorizontal, LayoutGrid,
  Image as ImageIcon, Music, Video, FileText, Download
} from 'lucide-react';
import './App.css';

function App() {
  const [currentPath, setCurrentPath] = useState('');
  const [files, setFiles] = useState([]);
  const [drives, setDrives] = useState([]);
  const [specialFolders, setSpecialFolders] = useState({});
  const [selectedFile, setSelectedFile] = useState(null);
  const [clipboard, setClipboard] = useState(null); // { type: 'copy'|'cut', path: string }
  const [history, setHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  const categories = [
    { name: 'Desktop', icon: <Monitor size={18} /> },
    { name: 'Documents', icon: <FileText size={18} /> },
    { name: 'Downloads', icon: <Download size={18} /> },
    { name: 'Pictures', icon: <ImageIcon size={18} /> },
    { name: 'Music', icon: <Music size={18} /> },
    { name: 'Videos', icon: <Video size={18} /> },
  ];

  useEffect(() => {
    if (window.electronAPI) {
      window.electronAPI.getHomeDir().then(home => {
        navigateTo(home);
      });
      window.electronAPI.getDrives().then(d => setDrives(d));
      window.electronAPI.getSpecialFolders().then(sf => setSpecialFolders(sf));
    } else {
      navigateTo('C:\\Users\\MockUser');
      setFiles([
        { name: 'Documents', isDirectory: true, path: 'C:\\Users\\MockUser\\Documents' },
        { name: 'Downloads', isDirectory: true, path: 'C:\\Users\\MockUser\\Downloads' }
      ]);
    }
  }, []);

  const loadFiles = async (dirPath) => {
    if (window.electronAPI) {
      try {
        const newFiles = await window.electronAPI.readDir(dirPath);
        setFiles(newFiles);
        setCurrentPath(dirPath);
        setSelectedFile(null);
      } catch (err) {
        console.error("Failed to read dir:", err);
      }
    }
  };

  const navigateTo = (path) => {
    if (!path) return;
    loadFiles(path);
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(path);
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  };

  const handleBack = () => {
    if (historyIndex > 0) {
      setHistoryIndex(historyIndex - 1);
      loadFiles(history[historyIndex - 1]);
    }
  };

  const handleForward = () => {
    if (historyIndex < history.length - 1) {
      setHistoryIndex(historyIndex + 1);
      loadFiles(history[historyIndex + 1]);
    }
  };

  const handleDoubleClick = async (file) => {
    if (file.isDirectory) {
      navigateTo(file.path);
    } else if (window.electronAPI) {
      try {
        await window.electronAPI.openFile(file.path);
      } catch (e) {
        alert(e.message || "Cannot open file.");
      }
    }
  };

  const handleNavUp = () => {
    if (!currentPath) return;
    const parts = currentPath.split('\\');
    if (parts.length > 1) {
      parts.pop();
      let parentPath = parts.join('\\');
      if (parentPath.endsWith(':')) parentPath += '\\';
      if (parentPath === '' && currentPath.startsWith('This PC')) parentPath = 'This PC';
      if (parentPath !== currentPath && parentPath !== '') {
        navigateTo(parentPath);
      }
    }
  };

  // Toolbar Actions
  const handleCopy = () => {
    if (selectedFile) {
      setClipboard({ type: 'copy', path: selectedFile.path });
    }
  };

  const handleDelete = async () => {
    if (selectedFile && window.electronAPI) {
      try {
        await window.electronAPI.deleteFile(selectedFile.path);
        loadFiles(currentPath); // Refresh
      } catch (e) {
        alert(e.message || "Cannot delete file.");
      }
    }
  };

  const handlePaste = async () => {
    if (clipboard && window.electronAPI) {
      try {
        const fileName = clipboard.path.split('\\').pop();
        const destPath = currentPath + '\\' + fileName;
        await window.electronAPI.copyFile(clipboard.path, destPath);
        loadFiles(currentPath); // Refresh
      } catch (e) {
        alert(e.message || "Cannot paste file.");
      }
    }
  };

  return (
    <div className="app-container">
      <div className="titlebar-drag-region"></div>
      <div className="titlebar-spacer">
        <div className="title">
          <Folder size={16} />
          <span>File Explorer</span>
        </div>
      </div>

      <div className="app-header">
        <div className="command-bar">
          <button className="toolbar-btn"><Plus size={18} /> <span>New</span></button>
          <div className="toolbar-separator" style={{ width: '1px', height: '24px', background: 'var(--fluent-border)', margin: '0 8px' }}></div>
          <button className="toolbar-btn" onClick={handleCopy} disabled={!selectedFile}><Copy size={18} /></button>
          <button className="toolbar-btn" onClick={handlePaste} disabled={!clipboard}><ClipboardPaste size={18} /></button>
          <button className="toolbar-btn" onClick={handleDelete} disabled={!selectedFile}><Trash2 size={18} /></button>
          <div className="toolbar-separator" style={{ width: '1px', height: '24px', background: 'var(--fluent-border)', margin: '0 8px' }}></div>
          <button className="toolbar-btn"><LayoutGrid size={18} /> <span>View</span></button>
        </div>

        <div className="address-bar-container">
          <div className="nav-buttons" style={{ display: 'flex', gap: '4px' }}>
            <button className="toolbar-btn" onClick={handleBack} disabled={historyIndex <= 0}><ArrowLeft size={16} /></button>
            <button className="toolbar-btn" onClick={handleForward} disabled={historyIndex >= history.length - 1}><ArrowRight size={16} /></button>
            <button className="toolbar-btn" onClick={handleNavUp}><ArrowUp size={16} /></button>
            <button className="toolbar-btn" onClick={() => loadFiles(currentPath)}><RotateCw size={16} /></button>
          </div>
          
          <div className="address-bar" style={{ 
            flex: 1, 
            display: 'flex', 
            alignItems: 'center', 
            background: 'var(--fluent-control-bg)',
            border: '1px solid var(--fluent-border)',
            borderRadius: '4px',
            padding: '4px 8px',
            gap: '8px'
          }}>
            <Monitor size={16} color="var(--fluent-secondary-text)" />
            <ChevronRight size={16} color="var(--fluent-secondary-text)" />
            <input 
              type="text" 
              value={currentPath} 
              readOnly 
              style={{ flex: 1, border: 'none', background: 'transparent', color: 'var(--fluent-text)', outline: 'none', fontFamily: 'inherit' }} 
            />
          </div>
        </div>
      </div>

      <div className="app-body">
        <div className="app-sidebar">
          <div className="sidebar-section" style={{ padding: '8px 0' }}>
            <div className="sidebar-item" onClick={() => navigateTo('This PC')}>
              <Home size={18} /> <span>Home</span>
            </div>
          </div>
          <div className="sidebar-separator" style={{ height: '1px', background: 'var(--fluent-border)', margin: '4px 16px' }}></div>
          <div className="sidebar-section" style={{ padding: '8px 0' }}>
            {categories.map(cat => (
              <div 
                key={cat.name} 
                className={`sidebar-item ${currentPath === specialFolders[cat.name] ? 'active' : ''}`} 
                onClick={() => navigateTo(specialFolders[cat.name])}
              >
                {cat.icon} <span>{cat.name}</span>
              </div>
            ))}
          </div>
          <div className="sidebar-separator" style={{ height: '1px', background: 'var(--fluent-border)', margin: '4px 16px' }}></div>
          <div className="sidebar-section" style={{ padding: '8px 0' }}>
            {drives.map(drive => (
              <div 
                key={drive.path} 
                className={`sidebar-item ${currentPath.startsWith(drive.path) ? 'active' : ''}`}
                onClick={() => navigateTo(drive.path)}
              >
                <HardDrive size={18} /> <span>{drive.name}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="app-main">
          <div className="file-grid">
            {files.map((file, idx) => (
              <div 
                key={idx} 
                className={`file-item ${selectedFile === file ? 'selected' : ''}`}
                onClick={() => setSelectedFile(file)}
                onDoubleClick={() => handleDoubleClick(file)}
                style={{
                  backgroundColor: selectedFile === file ? 'var(--fluent-selected-bg)' : 'transparent',
                }}
              >
                {file.isDirectory ? (
                  <Folder fill="#F9CB44" stroke="#D19C10" />
                ) : (
                  <File color="var(--fluent-secondary-text)" />
                )}
                <span className="file-name" title={file.name}>{file.name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
