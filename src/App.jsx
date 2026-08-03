import { useState, useEffect } from 'react';
import { 
  Folder, File, HardDrive, Home, Star, Monitor, ChevronRight, 
  ArrowLeft, ArrowRight, ArrowUp, RotateCw, Search, Plus, 
  Scissors, Copy, ClipboardPaste, Trash2, Edit3, MoreHorizontal, LayoutGrid 
} from 'lucide-react';
import './App.css';

function App() {
  const [currentPath, setCurrentPath] = useState('');
  const [files, setFiles] = useState([]);
  const [drives, setDrives] = useState([]);

  useEffect(() => {
    // Initialize
    if (window.electronAPI) {
      window.electronAPI.getHomeDir().then(home => {
        setCurrentPath(home);
        loadFiles(home);
      });
      window.electronAPI.getDrives().then(d => setDrives(d));
    } else {
      // Mock for browser environment
      setCurrentPath('C:\\Users\\MockUser');
      setFiles([
        { name: 'Documents', isDirectory: true, path: 'C:\\Users\\MockUser\\Documents' },
        { name: 'Downloads', isDirectory: true, path: 'C:\\Users\\MockUser\\Downloads' },
        { name: 'resume.pdf', isFile: true, path: 'C:\\Users\\MockUser\\resume.pdf' }
      ]);
    }
  }, []);

  const loadFiles = async (dirPath) => {
    if (window.electronAPI) {
      try {
        const newFiles = await window.electronAPI.readDir(dirPath);
        setFiles(newFiles);
        setCurrentPath(dirPath);
      } catch (err) {
        console.error("Failed to read dir:", err);
      }
    }
  };

  const handleDoubleClick = (file) => {
    if (file.isDirectory) {
      loadFiles(file.path);
    }
  };

  const handleNavUp = () => {
    if (!currentPath) return;
    const parts = currentPath.split('\\');
    if (parts.length > 1) {
      parts.pop();
      let parentPath = parts.join('\\');
      if (parentPath.endsWith(':')) parentPath += '\\'; // Handle root drive C: -> C:\
      if (parentPath !== currentPath) {
        loadFiles(parentPath);
      }
    }
  };

  return (
    <div className="app-container">
      {/* Custom Titlebar Region */}
      <div className="titlebar-drag-region"></div>
      <div className="titlebar-spacer">
        <div className="title">
          <Folder size={16} />
          <span>File Explorer</span>
        </div>
      </div>

      <div className="app-header">
        {/* Command Bar */}
        <div className="command-bar">
          <button className="toolbar-btn"><Plus size={18} /> <span>New</span></button>
          <div className="toolbar-separator" style={{ width: '1px', height: '24px', background: 'var(--fluent-border)', margin: '0 8px' }}></div>
          <button className="toolbar-btn"><Scissors size={18} /></button>
          <button className="toolbar-btn"><Copy size={18} /></button>
          <button className="toolbar-btn"><ClipboardPaste size={18} /></button>
          <button className="toolbar-btn"><Edit3 size={18} /></button>
          <button className="toolbar-btn"><Trash2 size={18} /></button>
          <div className="toolbar-separator" style={{ width: '1px', height: '24px', background: 'var(--fluent-border)', margin: '0 8px' }}></div>
          <button className="toolbar-btn"><LayoutGrid size={18} /> <span>View</span></button>
          <button className="toolbar-btn"><MoreHorizontal size={18} /></button>
        </div>

        {/* Address Bar */}
        <div className="address-bar-container">
          <div className="nav-buttons" style={{ display: 'flex', gap: '4px' }}>
            <button className="toolbar-btn"><ArrowLeft size={16} /></button>
            <button className="toolbar-btn"><ArrowRight size={16} /></button>
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
              style={{ 
                flex: 1, 
                border: 'none', 
                background: 'transparent', 
                color: 'var(--fluent-text)',
                outline: 'none',
                fontFamily: 'inherit'
              }} 
            />
          </div>

          <div className="search-bar" style={{
            width: '240px',
            display: 'flex', 
            alignItems: 'center', 
            background: 'var(--fluent-control-bg)',
            border: '1px solid var(--fluent-border)',
            borderRadius: '4px',
            padding: '4px 8px',
            gap: '8px'
          }}>
            <Search size={16} color="var(--fluent-secondary-text)" />
            <input 
              type="text" 
              placeholder="Search..." 
              style={{ 
                flex: 1, 
                border: 'none', 
                background: 'transparent', 
                color: 'var(--fluent-text)',
                outline: 'none',
                fontFamily: 'inherit'
              }} 
            />
          </div>
        </div>
      </div>

      <div className="app-body">
        <div className="app-sidebar">
          <div className="sidebar-section" style={{ padding: '8px 0' }}>
            <div className="sidebar-item active">
              <Home /> <span>Home</span>
            </div>
            <div className="sidebar-item">
              <Star /> <span>Gallery</span>
            </div>
          </div>
          <div className="sidebar-separator" style={{ height: '1px', background: 'var(--fluent-border)', margin: '4px 16px' }}></div>
          <div className="sidebar-section" style={{ padding: '8px 0' }}>
            {drives.map(drive => (
              <div 
                key={drive.path} 
                className={`sidebar-item ${currentPath.startsWith(drive.path) ? 'active' : ''}`}
                onClick={() => loadFiles(drive.path)}
              >
                <HardDrive /> <span>{drive.name}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="app-main">
          <div className="file-grid">
            {files.map((file, idx) => (
              <div 
                key={idx} 
                className="file-item"
                onDoubleClick={() => handleDoubleClick(file)}
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
