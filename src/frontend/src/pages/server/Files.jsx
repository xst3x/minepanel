import { useState, useEffect, useRef } from 'react';
import { useOutletContext } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { toast, showConfirm, showPrompt } from '../../components/Toast.jsx';
import CodeEditor from '../../components/CodeEditor.jsx';
import '../../styles/pages/server/Files.css';

const FOLDER_SVG = (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="var(--accent)" strokeWidth="2">
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
  </svg>
);

const FILE_SVG = (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="var(--text-secondary)" strokeWidth="2">
    <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/>
    <polyline points="13 2 13 9 20 9"/>
  </svg>
);

export default function ServerFiles() {
  const { serverId, hasPerm } = useOutletContext();
  const [currentPath, setCurrentPath] = useState('/');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  // File editing modal state
  const [editingPath, setEditingPath] = useState(null); // string or null
  const [editorContent, setEditorContent] = useState('');
  const [savingFile, setSavingFile] = useState(false);

  const fileInputRef = useRef(null);

  // Load files list
  const loadFiles = async (path = currentPath) => {
    setLoading(true);
    try {
      let cleanPath = path;
      if (!cleanPath.startsWith('/')) cleanPath = '/' + cleanPath;
      if (cleanPath.length > 1 && cleanPath.endsWith('/')) cleanPath = cleanPath.slice(0, -1);
      
      const res = await api(`/api/servers/${serverId}/files/list?path=${encodeURIComponent(cleanPath)}`);
      setItems(res || []);
      setCurrentPath(cleanPath);
    } catch (e) {
      toast(e.message || 'Failed to load files.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFiles('/');
  }, [serverId]);

  const handleFolderClick = (name) => {
    const nextPath = currentPath === '/' ? `/${name}` : `${currentPath}/${name}`;
    loadFiles(nextPath);
  };

  const handleGoUp = () => {
    const parts = currentPath.split('/').filter(Boolean);
    parts.pop();
    const nextPath = '/' + parts.join('/');
    loadFiles(nextPath);
  };

  const handleDownload = async (item, e) => {
    e.stopPropagation();
    const filePath = currentPath === '/' ? `/${item.name}` : `${currentPath}/${item.name}`;
    const dlName = item.name + (item.isDirectory ? '.zip' : '');

    try {
      if (item.isDirectory) {
        // Prepare zip download link
        const r = await api(`/api/servers/${serverId}/files/download?path=${encodeURIComponent(filePath)}`);
        if (r.downloadUrl) {
          window.open(r.downloadUrl, '_blank');
        } else {
          toast('Failed to prepare download.', 'error');
        }
      } else {
        // Direct download file blob
        const token = localStorage.getItem('mp_token');
        const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
        const res = await fetch(`/api/servers/${serverId}/files/download?path=${encodeURIComponent(filePath)}`, { headers });
        if (!res.ok) throw new Error('Download failed');
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = dlName;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
      }
    } catch (err) {
      toast(err.message || 'Download failed.', 'error');
    }
  };

  const handleDelete = async (name, e) => {
    e.stopPropagation();
    if (!await showConfirm(`Delete "${name}"?`, 'Delete File')) return;
    const filePath = currentPath === '/' ? `/${name}` : `${currentPath}/${name}`;
    try {
      await api(`/api/servers/${serverId}/files/delete`, {
        method: 'POST',
        body: { path: filePath }
      });
      loadFiles();
    } catch (err) {
      toast(err.message || 'Delete failed.', 'error');
    }
  };

  const handleMkdir = async () => {
    const name = await showPrompt('Folder name:', 'New Folder', 'New Folder');
    if (!name) return;
    const filePath = currentPath === '/' ? `/${name}` : `${currentPath}/${name}`;
    try {
      await api(`/api/servers/${serverId}/files/mkdir`, { method: 'POST', body: { path: filePath } });
      loadFiles();
    } catch (err) {
      toast(err.message || 'Failed to create directory.', 'error');
    }
  };

  const handleNewFile = async () => {
    const name = await showPrompt('File name:', 'NewFile.txt', 'New File');
    if (!name) return;
    const filePath = currentPath === '/' ? `/${name}` : `${currentPath}/${name}`;
    try {
      await api(`/api/servers/${serverId}/files/create`, { method: 'POST', body: { path: filePath } });
      loadFiles();
    } catch (err) {
      toast(err.message || 'Failed to create file.', 'error');
    }
  };

  const handleOpenFile = async (item) => {
    const filePath = currentPath === '/' ? `/${item.name}` : `${currentPath}/${item.name}`;
    try {
      const r = await api(`/api/servers/${serverId}/files/read?path=${encodeURIComponent(filePath)}`);
      setEditingPath(filePath);
      setEditorContent(r.content || '');
    } catch (err) {
      toast(err.message || 'Failed to read file.', 'error');
    }
  };

  const handleSaveFile = async () => {
    if (!editingPath) return;
    setSavingFile(true);
    try {
      await api(`/api/servers/${serverId}/files/write`, { method: 'POST', body: { path: editingPath, content: editorContent } });
      setEditingPath(null);
      loadFiles();
    } catch (err) {
      toast(err.message || 'Failed to save file.', 'error');
    } finally {
      setSavingFile(false);
    }
  };

  const handleUpload = async (e) => {
    const files = e.target.files;
    if (!files || !files.length) return;
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const fd = new FormData();
      fd.append('file', f);
      fd.append('path', currentPath);
      try {
        await api(`/api/servers/${serverId}/files/upload`, { method: 'POST', body: fd });
      } catch (err) {
        toast(`Failed to upload ${f.name}: ${err.message}`, 'error');
      }
    }
    loadFiles();
    e.target.value = '';
  };

  const formatBytes = (b) => {
    if (!+b) return '0 B';
    const k = 1024, s = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(b) / Math.log(k));
    return `${parseFloat((b / Math.pow(k, i)).toFixed(1))} ${s[i]}`;
  };

  const sortedItems = [...items].sort((a, b) => {
    if (a.isDirectory && !b.isDirectory) return -1;
    if (!a.isDirectory && b.isDirectory) return 1;
    return a.name.localeCompare(b.name);
  });

  return (
    <div className="file-manager">
      <div className="fm-toolbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-card)', padding: '0.75rem 1rem', borderRadius: 'var(--radius)', border: '1px solid var(--border-color)', marginBottom: '1rem' }}>
        <div className="fm-breadcrumb" id="fm-path" style={{ fontWeight: '500', color: 'var(--text)' }}>
          {currentPath}
        </div>
        {hasPerm('server.files.edit') && (
          <div className="fm-actions" style={{ display: 'flex', gap: '0.5rem' }}>
            <button className="btn outline small" onClick={handleMkdir}>New Folder</button>
            <button className="btn outline small" onClick={handleNewFile}>New File</button>
            <button className="btn outline small" onClick={() => fileInputRef.current?.click()}>Upload</button>
            <input 
              type="file" 
              ref={fileInputRef} 
              multiple 
              onChange={handleUpload} 
              style={{ display: 'none' }}
            />
          </div>
        )}
      </div>

      <div className="card" style={{ padding: 0 }}>
        <div className="list-header" style={{ display: 'grid', gridTemplateColumns: 'auto 2fr 1fr 1fr 1fr', padding: '0.75rem 1rem', borderBottom: '1px solid var(--border-color)', fontWeight: '600', color: 'var(--text-secondary)' }}>
          <div style={{ width: '24px' }}></div>
          <div>Name</div>
          <div>Size</div>
          <div>Modified</div>
          <div style={{ textAlign: 'right' }}>Actions</div>
        </div>

        <div className="list-body" id="fm-list">
          {loading ? (
            <p className="text-muted" style={{ padding: '1rem' }}>Loading files...</p>
          ) : (
            <>
              {currentPath !== '/' && (
                <div 
                  className="fm-item" 
                  onClick={handleGoUp}
                  style={{ display: 'grid', gridTemplateColumns: 'auto 2fr 1fr 1fr 1fr', padding: '0.75rem 1rem', borderBottom: '1px solid var(--border-color)', cursor: 'pointer', alignItems: 'center' }}
                >
                  <div className="fm-icon">{FOLDER_SVG}</div>
                  <div className="fm-col name fm-item-name" style={{ fontWeight: '500' }}>..</div>
                  <div>--</div>
                  <div>--</div>
                  <div></div>
                </div>
              )}

              {sortedItems.map((item) => {
                const icon = item.isDirectory ? FOLDER_SVG : FILE_SVG;
                const sz = item.isDirectory ? '--' : formatBytes(item.size);
                return (
                  <div 
                    key={item.name} 
                    className="fm-item" 
                    onClick={() => item.isDirectory ? handleFolderClick(item.name) : handleOpenFile(item)}
                    style={{ display: 'grid', gridTemplateColumns: 'auto 2fr 1fr 1fr 1fr', padding: '0.75rem 1rem', borderBottom: '1px solid var(--border-color)', cursor: 'pointer', alignItems: 'center' }}
                  >
                    <div className="fm-icon">{icon}</div>
                    <div className="fm-col name fm-item-name">{item.name}</div>
                    <div className="fm-col size">{sz}</div>
                    <div className="fm-col date">{new Date(item.modifiedAt).toLocaleString()}</div>
                    <div className="fm-col actions" style={{ display: 'flex', gap: '0.25rem', justifyContent: 'flex-end' }}>
                      <button className="btn outline small" onClick={(e) => handleDownload(item, e)}>Download</button>
                      {hasPerm('server.files.edit') && (
                        <button className="btn danger small" onClick={(e) => handleDelete(item.name, e)}>Del</button>
                      )}
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>
      </div>

      {/* Editor Modal */}
      {editingPath && (
        <div className="modal-overlay active" id="modal-file-editor">
          <div className="modal large">
            <div className="modal-header">
              <h3 id="editor-filename">editing: {editingPath}</h3>
              <div className="modal-header-actions" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <button className="btn primary small" onClick={handleSaveFile} disabled={savingFile}>
                  {savingFile ? 'Saving...' : 'Save'}
                </button>
                <button className="close-btn" onClick={() => setEditingPath(null)} disabled={savingFile}>&times;</button>
              </div>
            </div>
            <div className="modal-body no-pad" style={{ padding: 0 }}>
              <CodeEditor
                filename={editingPath?.split('/').pop()}
                value={editorContent}
                onChange={setEditorContent}
                height="62vh"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
