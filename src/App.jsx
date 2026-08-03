import { useState, useEffect } from 'react';
import { 
  Folder, File, HardDrive, Home, Star, Monitor, ChevronRight, 
  ArrowLeft, ArrowRight, ArrowUp, RotateCw, Search, Plus, 
  Scissors, Copy, ClipboardPaste, Trash2, Edit3, MoreHorizontal, LayoutGrid,
  Image as ImageIcon, Music, Video, FileText, Download, Sparkles, Share2, Shield, Smartphone
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
  const [activeTab, setActiveTab] = useState('browse');
  const [contextMenu, setContextMenu] = useState(null);

  const categories = [
    { name: 'Desktop', icon: <Monitor size={18} /> },
    { name: 'Documents', icon: <FileText size={18} /> },
    { name: 'Downloads', icon: <Download size={18} /> },
    { name: 'Pictures', icon: <ImageIcon size={18} /> },
    { name: 'Music', icon: <Music size={18} /> },
    { name: 'Videos', icon: <Video size={18} /> },
  ];

  const [storageStats, setStorageStats] = useState({ total: 100, used: 65, free: 35, capacity: '65%' });
  const [suggestions, setSuggestions] = useState([]);

  useEffect(() => {
    if (window.electronAPI) {
      navigateTo('This PC');
      window.electronAPI.getDrives().then(d => setDrives(d));
      window.electronAPI.getSpecialFolders().then(sf => setSpecialFolders(sf));
      window.electronAPI.getStorageStats().then(s => setStorageStats(s));
      window.electronAPI.getCleanSuggestions().then(s => setSuggestions(s));
    } else {
      navigateTo('C:\\Users\\MockUser');
      setFiles([
        { name: 'Documents', isDirectory: true, path: 'C:\\Users\\MockUser\\Documents' },
        { name: 'Downloads', isDirectory: true, path: 'C:\\Users\\MockUser\\Downloads' }
      ]);
    }
  }, []);

  const formatBytes = (bytes) => {
    if (!bytes) return '0 B';
    const k = 1024, sizes = ['B', 'KB', 'MB', 'GB', 'TB'], i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

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
    if (currentPath.startsWith('Category://')) {
      const pathParts = currentPath.split('|');
      if (pathParts.length > 1) {
        if (pathParts[1] === 'Local' || pathParts[1] === 'Global') navigateTo('This PC');
        else navigateTo(pathParts[1]); // Navigate back to the device root
        return;
      }
    }
    
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

  const handleContextMenu = (e, file) => {
    e.preventDefault();
    e.stopPropagation();
    setSelectedFile(file);
    setContextMenu({ x: e.pageX, y: e.pageY, type: 'file', file });
  };

  const handleBackgroundContextMenu = (e) => {
    e.preventDefault();
    if (currentPath !== 'This PC' && !currentPath.startsWith('Category://')) {
      setContextMenu({ x: e.pageX, y: e.pageY, type: 'background' });
    }
  };

  const closeContextMenu = () => setContextMenu(null);

  const handleCategoryClick = async (catName) => {
    // Check if we are inside an MTP phone partition
    if (currentPath.startsWith('This PC\\') && !currentPath.match(/^This PC\\[A-Z]:/i)) {
      const parts = currentPath.split('\\');
      if (parts.length >= 2) {
        const deviceRoot = parts[0] + '\\' + parts[1];
        // Trigger Category Aggregation View
        navigateTo(`Category://${catName}|${deviceRoot}`);
        return;
      }
    }
    
    // Default fallback to PC local folders
    if (specialFolders[catName]) {
      navigateTo(`Category://${catName}|Global`);
    }
  };

  const renderCleanTab = () => (
    <div className="tab-content clean-tab">
      <div className="storage-summary">
        <h2>Storage</h2>
        <div className="storage-bar">
          <div className="storage-used" style={{ width: storageStats.capacity }}></div>
        </div>
        <p>{formatBytes(storageStats.used)} used • {formatBytes(storageStats.free)} free</p>
      </div>
      
      <h3 className="section-title">Clean suggestions</h3>
      <div className="suggestions-list">
        {suggestions.length > 0 ? suggestions.map(s => (
          <div key={s.id} className="suggestion-card">
            <div className="suggestion-icon">
              {s.id === 'junk' ? <Trash2 size={24} color="#1a73e8" /> : <ImageIcon size={24} color="#1a73e8" />}
            </div>
            <div className="suggestion-info">
              <h4>{s.type}</h4>
              <p>{s.description}</p>
            </div>
            <button className="clean-btn">{s.action} {formatBytes(s.size)}</button>
          </div>
        )) : (
          <p style={{ color: 'var(--gf-text-secondary)', marginTop: '8px' }}>Looking good! No suggestions at the moment.</p>
        )}
      </div>
    </div>
  );

  const renderShareTab = () => (
    <div className="tab-content share-tab">
      <div className="share-hero">
        <Share2 size={80} color="#1a73e8" />
        <h2>Nearby Share</h2>
        <p>Fast, offline sharing with nearby devices</p>
        
        <div className="share-buttons">
          <button className="share-btn send"><ArrowUp size={24} /> Send</button>
          <button className="share-btn receive"><ArrowDown size={24} /> Receive</button>
        </div>
      </div>
    </div>
  );

  const renderBrowseTab = () => (
    <div className="tab-content browse-tab">
      {currentPath !== 'This PC' && (
        <div className="browse-nav-bar">
          <button className="icon-btn" onClick={handleNavUp}><ArrowLeft size={20} /></button>
          <div className="breadcrumb">{currentPath}</div>
        </div>
      )}
      
      {currentPath === 'This PC' ? (
        <div className="dashboard-container">
          <div className="dashboard-section-title">Categories</div>
          <div className="categories-grid">
            <div className="category-card" onClick={() => navigateTo('Category://Downloads|Global')}>
              <Download /> <span>Downloads</span>
            </div>
            <div className="category-card" onClick={() => navigateTo('Category://Pictures|Global')}>
              <ImageIcon /> <span>Images</span>
            </div>
            <div className="category-card" onClick={() => navigateTo('Category://Videos|Global')}>
              <Video /> <span>Videos</span>
            </div>
            <div className="category-card" onClick={() => navigateTo('Category://Audio|Global')}>
              <Music /> <span>Audio</span>
            </div>
            <div className="category-card" onClick={() => navigateTo('Category://Documents|Global')}>
              <FileText /> <span>Documents</span>
            </div>
          </div>
          
          <div className="dashboard-section-title">Collections</div>
          <div className="collections-list">
             <div className="storage-card" onClick={() => navigateTo('Category://Favorites|Local')}>
               <Star color="#fbbc04" fill="#fbbc04" />
               <div className="storage-info"><span className="storage-name">Favorites</span></div>
             </div>
             <div className="storage-card" onClick={() => navigateTo('Category://SafeFolder|Local')}>
               <Shield color="#1a73e8" />
               <div className="storage-info"><span className="storage-name">Safe folder</span></div>
             </div>
          </div>
          
          <div className="dashboard-section-title">Storage devices</div>
          <div className="storage-list">
            {files.map((file, idx) => (
              <div key={idx} className="storage-card" onClick={() => handleDoubleClick(file)}>
                {file.isMTP ? <Smartphone color="#1a73e8" /> : <HardDrive color="#1a73e8" />}
                <div className="storage-info">
                  <span className="storage-name">{file.name}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="file-grid" onContextMenu={handleBackgroundContextMenu}>
          {files.map((file, idx) => (
            <div 
              key={idx} 
              className={`file-item ${selectedFile === file ? 'selected' : ''}`}
              onClick={(e) => { e.stopPropagation(); setSelectedFile(file); }}
              onDoubleClick={() => handleDoubleClick(file)}
              onContextMenu={(e) => handleContextMenu(e, file)}
            >
              {file.isDirectory ? (
                <Folder fill="#fbbc04" stroke="#fbbc04" />
              ) : (
                <File color="#5f6368" />
              )}
              <span className="file-name" title={file.name}>{file.name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="google-app-container" onClick={closeContextMenu}>
      {contextMenu && (
        <div className="context-menu" style={{ top: contextMenu.y, left: contextMenu.x }}>
          {contextMenu.type === 'file' ? (
            <>
              <div className="context-menu-item" onClick={() => { handleDoubleClick(contextMenu.file); closeContextMenu(); }}>Open</div>
              <div className="context-menu-item" onClick={() => { handleCopy(); closeContextMenu(); }}>Copy</div>
              <div className="context-menu-item" style={{ color: 'var(--google-red)' }} onClick={() => { handleDelete(); closeContextMenu(); }}>Delete</div>
            </>
          ) : (
            <>
              <div className="context-menu-item" onClick={() => { handlePaste(); closeContextMenu(); }}>Paste</div>
              <div className="context-menu-item" onClick={() => { loadFiles(currentPath); closeContextMenu(); }}>Refresh</div>
            </>
          )}
        </div>
      )}
      <div className="google-sidebar">
        <div className="sidebar-logo">
          <Folder fill="#1a73e8" stroke="#1a73e8" size={32} />
        </div>
        <div 
          className={`nav-item ${activeTab === 'clean' ? 'active' : ''}`}
          onClick={() => setActiveTab('clean')}
        >
          <Sparkles size={24} />
          <span>Clean</span>
        </div>
        <div 
          className={`nav-item ${activeTab === 'browse' ? 'active' : ''}`}
          onClick={() => { setActiveTab('browse'); navigateTo('This PC'); }}
        >
          <Search size={24} />
          <span>Browse</span>
        </div>
        <div 
          className={`nav-item ${activeTab === 'share' ? 'active' : ''}`}
          onClick={() => setActiveTab('share')}
        >
          <Share2 size={24} />
          <span>Share</span>
        </div>
      </div>

      <div className="google-main">
        <div className="google-topbar">
          <div className="search-box">
            <Search size={20} color="#5f6368" />
            <input type="text" placeholder="Search in Files" />
          </div>
        </div>

        <div className="google-content-area">
          {activeTab === 'clean' && renderCleanTab()}
          {activeTab === 'browse' && renderBrowseTab()}
          {activeTab === 'share' && renderShareTab()}
        </div>
      </div>
    </div>
  );
}

export default App;
