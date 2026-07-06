import { useState, useEffect, useRef, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import { api } from '../../lib/api.ts';
import { toast, showConfirm, showPrompt, toastProgress } from '../../components/Toast.tsx';
import CodeEditor from '../../components/CodeEditor.tsx';
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

  // ── Multi-select state ────────────────────────────────────────────────────
  const [selectMode, setSelectMode] = useState(false);
  const [selectedItems, setSelectedItems] = useState(new Set());

  // ── Clipboard state ───────────────────────────────────────────────────────
  const clipboardRef = useRef({ items: [], isCut: false });
  const [clipboardHasItems, setClipboardHasItems] = useState(false);

  // ── Archive modal state ───────────────────────────────────────────────────
  const [showArchiveModal, setShowArchiveModal] = useState(false);
  const [archiveModalName, setArchiveModalName] = useState('archive');
  const [archiveModalLoading, setArchiveModalLoading] = useState(false);

  // ── File preview state (images, archive tree) ─────────────────────────────
  const [previewPath, setPreviewPath] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [archiveTree, setArchiveTree] = useState(null);

  // File editing modal state
  const [editingPath, setEditingPath] = useState(null);
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

  const toggleSelect = (name) => {
    setSelectedItems(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const selectAll = () => {
    setSelectedItems(new Set(items.map(i => i.name)));
  };

  const deselectAll = () => {
    setSelectedItems(new Set());
  };

  // Build absolute-style relative paths from selected item names
  const makeRelPaths = () =>
    Array.from(selectedItems).map(n => currentPath === '/' ? `/${n}` : `${currentPath}/${n}`);

  const handleBatchDelete = async () => {
    const names = Array.from(selectedItems);
    if (!names.length) return;
    if (!await showConfirm(`Delete ${names.length} selected item${names.length !== 1 ? 's' : ''}?`, 'Delete Selected')) return;
    const dismiss = toastProgress('Deleting...');
    try {
      await api(`/api/servers/${serverId}/files/batch-delete`, { method: 'POST', body: { paths: makeRelPaths() } });
      dismiss(null, `Deleted ${names.length} item(s).`);
      deselectAll();
      loadFiles();
    } catch (e) { dismiss(e.message); }
  };

  const handleBatchDownload = async () => {
    const names = Array.from(selectedItems);
    if (!names.length) return;
    const dismiss = toastProgress('Preparing download...');
    try {
      const r = await api(`/api/servers/${serverId}/files/batch-download`, { method: 'POST', body: { paths: makeRelPaths() } });
      dismiss(null, 'Download ready.');
      if (r.downloadUrl) window.open(r.downloadUrl, '_blank');
      deselectAll();
    } catch (e) { dismiss(e.message); }
  };

  const handleArchive = async () => {
    const names = Array.from(selectedItems);
    if (!names.length) return;
    try {
      setArchiveModalLoading(true);
      await api(`/api/servers/${serverId}/files/archive`, { method: 'POST', body: { paths: makeRelPaths(), archiveName: archiveModalName } });
      toast(`Archive ${archiveModalName}.zip created.`, 'success');
      setShowArchiveModal(false);
      deselectAll();
      loadFiles();
    } catch (e) { toast(e.message, 'error'); }
    finally { setArchiveModalLoading(false); }
  };

  const handleClipboardCopy = () => {
    const names = Array.from(selectedItems);
    if (!names.length) return;
    const paths = names.map(n => currentPath === '/' ? `/${n}` : `${currentPath}/${n}`);
    clipboardRef.current = { items: paths, isCut: false };
    setClipboardHasItems(true);
    toast(`Copied ${names.length} item(s) to clipboard.`, 'info');
    deselectAll();
  };

  const handleClipboardCut = () => {
    const names = Array.from(selectedItems);
    if (!names.length) return;
    const paths = names.map(n => currentPath === '/' ? `/${n}` : `${currentPath}/${n}`);
    clipboardRef.current = { items: paths, isCut: true };
    setClipboardHasItems(true);
    toast(`Cut ${names.length} item(s) to clipboard.`, 'info');
    deselectAll();
  };

  const handleClipboardPaste = async () => {
    const { items: clipItems, isCut } = clipboardRef.current;
    if (!clipItems.length) return;
    const dismiss = toastProgress(isCut ? 'Moving...' : 'Copying...');
    // destination is always the currently viewed directory
    const destination = currentPath;
    try {
      if (isCut) {
        await api(`/api/servers/${serverId}/files/move`, { method: 'POST', body: { paths: clipItems, destination } });
      } else {
        await api(`/api/servers/${serverId}/files/copy`, { method: 'POST', body: { paths: clipItems, destination } });
      }
      clipboardRef.current = { items: [], isCut: false };
      setClipboardHasItems(false);
      dismiss(null, isCut ? 'Moved item(s).' : 'Copied item(s).');
      loadFiles();
    } catch (e) { dismiss(e.message); }
  };

  // ── Per-file single actions ───────────────────────────────────────────────

  const handleSingleArchive = async (name) => {
    const stem = name.replace(/\.[^.]+$/, '');
    const itemPath = currentPath === '/' ? `/${name}` : `${currentPath}/${name}`;
    const dismiss = toastProgress(`Archiving ${name}...`);
    try {
      await api(`/api/servers/${serverId}/files/archive`, { method: 'POST', body: { paths: [itemPath], archiveName: stem } });
      dismiss(null, `Archive ${stem}.zip created.`);
      loadFiles();
    } catch (e) { dismiss(e.message); }
  };

  const handleSingleCopy = (name) => {
    const itemPath = currentPath === '/' ? `/${name}` : `${currentPath}/${name}`;
    clipboardRef.current = { items: [itemPath], isCut: false };
    setClipboardHasItems(true);
    toast(`Copied "${name}" to clipboard.`, 'info');
  };

  const handleSingleCut = (name) => {
    const itemPath = currentPath === '/' ? `/${name}` : `${currentPath}/${name}`;
    clipboardRef.current = { items: [itemPath], isCut: true };
    setClipboardHasItems(true);
    toast(`Cut "${name}" to clipboard.`, 'info');
  };

  const handleSingleDelete = async (name) => {
    if (!await showConfirm(`Delete "${name}"?`, 'Delete File')) return;
    const filePath = currentPath === '/' ? `/${name}` : `${currentPath}/${name}`;
    const dismiss = toastProgress(`Deleting ${name}...`);
    try {
      await api(`/api/servers/${serverId}/files/delete`, { method: 'POST', body: { path: filePath } });
      dismiss(null, `Deleted ${name}.`);
      loadFiles();
    } catch (e) { dismiss(e.message); }
  };

  const handleSingleDownload = async (item) => {
    const filePath = currentPath === '/' ? `/${item.name}` : `${currentPath}/${item.name}`;
    const dlName = item.name + (item.isDirectory ? '.zip' : '');
    try {
      if (item.isDirectory) {
        const r = await api(`/api/servers/${serverId}/files/download?path=${encodeURIComponent(filePath)}`);
        if (r.downloadUrl) window.open(r.downloadUrl, '_blank');
        else toast('Failed to prepare download.', 'error');
      } else {
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

  const openPreview = async (item) => {
    const filePath = currentPath === '/' ? `/${item.name}` : `${currentPath}/${item.name}`;
    const ext = item.name.split('.').pop()?.toLowerCase();
    const imageExts = ['png', 'jpg', 'jpeg', 'webp', 'ico', 'gif', 'svg', 'bmp'];

    if (ext === 'zip' && !item.isDirectory) {
      setPreviewPath(filePath);
      setArchiveTree(null);
      try {
        const data = await api(`/api/servers/${serverId}/files/archive-tree?path=${encodeURIComponent(filePath)}`);
        setArchiveTree(data);
      } catch (e) { toast(e.message, 'error'); }
      return;
    }

    if (imageExts.includes(ext) && !item.isDirectory) {
      const token = localStorage.getItem('mp_token');
      const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
      const res = await fetch(`/api/servers/${serverId}/files/download?path=${encodeURIComponent(filePath)}`, { headers });
      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        setPreviewPath(filePath);
        setPreviewUrl(url);
        setArchiveTree(null);
      }
      return;
    }

    handleOpenFile(item);
  };

  const closePreview = () => {
    if (previewUrl) window.URL.revokeObjectURL(previewUrl);
    setPreviewPath(null);
    setPreviewUrl(null);
    setArchiveTree(null);
  };

  const handleExtractArchive = async () => {
    if (!previewPath) return;
    const dismiss = toastProgress('Extracting...');
    try {
      await api(`/api/servers/${serverId}/files/extract`, { method: 'POST', body: { path: previewPath } });
      dismiss(null, 'Archive extracted.');
      closePreview();
      loadFiles();
    } catch (e) { dismiss(e.message); }
  };

  // ── Multi-select keyboard shortcuts ──────────────────────────────────────
  useEffect(() => {
    if (!selectMode) return;
    const onKey = (e) => {
      if (e.key === 'Escape') { setSelectMode(false); deselectAll(); }
      if ((e.ctrlKey || e.metaKey) && e.key === 'a') { e.preventDefault(); selectAll(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectMode, items]);

  const sortedItems = [...items].sort((a, b) => {
    if (a.isDirectory && !b.isDirectory) return -1;
    if (!a.isDirectory && b.isDirectory) return 1;
    return a.name.localeCompare(b.name);
  });

  const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'webp', 'ico', 'gif', 'svg', 'bmp']);
  const selCount = selectedItems.size;

  return (
    <div className="file-manager">
      {/* ── Toolbar ──────────────────────────────────────────────────────── */}
      <div className="fm-toolbar">
        <div className="fm-breadcrumb" id="fm-path">{currentPath}</div>
        <div className="fm-actions">
          {hasPerm('server.files.edit') && (
            <>
              <button className="btn outline small" onClick={handleMkdir}>New Folder</button>
              <button className="btn outline small" onClick={handleNewFile}>New File</button>
              <button className="btn outline small" onClick={() => fileInputRef.current?.click()}>Upload</button>
              <input type="file" ref={fileInputRef} multiple onChange={handleUpload} style={{ display:'none' }} />
            </>
          )}
          <button
            className={`btn ${selectMode ? 'primary' : 'outline'} small`}
            onClick={() => { setSelectMode(!selectMode); if (selectMode) deselectAll(); }}
          >
            {selectMode ? 'Done' : 'Select'}
          </button>
          {clipboardHasItems && (
            <button className="btn primary small" onClick={handleClipboardPaste}>
              Paste ({clipboardRef.current.items.length})
            </button>
          )}
        </div>
      </div>

      {/* ── Batch action bar ─────────────────────────────────────────────── */}
      {selCount > 0 && (
        <div className="fm-batch-bar">
          <span className="fm-batch-count">{selCount} selected</span>
          <button className="btn outline small" onClick={deselectAll}>Clear</button>
          <div className="fm-batch-spacer" />
          <button className="btn outline small" onClick={handleBatchDownload}>Download</button>
          <button className="btn outline small" onClick={handleClipboardCopy}>Copy</button>
          <button className="btn outline small" onClick={handleClipboardCut}>Cut</button>
          <button className="btn outline small" onClick={() => setShowArchiveModal(true)} disabled={archiveModalLoading}>Archive</button>
          <button className="btn danger small" onClick={handleBatchDelete}>Delete</button>
        </div>
      )}

      <div className="card" style={{ padding: 0 }}>
        <div className="list-header" style={{ display: 'grid', gridTemplateColumns: 'auto 2fr 1fr 1fr auto', padding: '0.75rem 1rem', borderBottom: '1px solid var(--border-color)', fontWeight: '600', color: 'var(--text-secondary)' }}>
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
                <div className="fm-item" onClick={handleGoUp}>
                  {selectMode && <div className="fm-chk" />}
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
                const ext = item.name.split('.').pop()?.toLowerCase();
                const isImage = !item.isDirectory && IMAGE_EXTS.has(ext);
                const isZip = !item.isDirectory && ext === 'zip';
                const isSelected = selectedItems.has(item.name);

                return (
                  <div
                    key={item.name}
                    className={`fm-item${isSelected ? ' fm-selected' : ''}`}
                    onClick={() => {
                      if (selectMode) {
                        toggleSelect(item.name);
                      } else if (item.isDirectory) {
                        handleFolderClick(item.name);
                      } else if (isImage || isZip) {
                        openPreview(item);
                      } else {
                        handleOpenFile(item);
                      }
                    }}
                  >
                    {selectMode && (
                      <div className="fm-chk" onClick={e => { e.stopPropagation(); toggleSelect(item.name); }}>
                        <input type="checkbox" checked={isSelected} readOnly />
                      </div>
                    )}
                    <div className="fm-icon">{icon}</div>
                    <div className="fm-col name fm-item-name">{item.name}</div>
                    <div className="fm-col size">{sz}</div>
                    <div className="fm-col date">{new Date(item.modifiedAt).toLocaleString()}</div>
                    <div className="fm-col actions fm-item-actions" onClick={e => e.stopPropagation()}>
                      <button
                        className="btn outline small fm-action-btn"
                        onClick={() => handleSingleDownload(item)}
                      >Download</button>
                      {hasPerm('server.files.edit') && (
                        <>
                          <button
                            className="btn outline small fm-action-btn"
                            onClick={() => handleSingleCopy(item.name)}
                          >Copy</button>
                          <button
                            className="btn outline small fm-action-btn"
                            onClick={() => handleSingleCut(item.name)}
                          >Cut</button>
                          {isZip ? (
                            <button
                              className="btn outline small fm-action-btn"
                              onClick={() => openPreview(item)}
                            >Extract</button>
                          ) : (
                            <button
                              className="btn outline small fm-action-btn"
                              onClick={() => handleSingleArchive(item.name)}
                            >Archive</button>
                          )}
                          <button
                            className="btn danger small fm-action-btn"
                            onClick={() => handleSingleDelete(item.name)}
                          >Delete</button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>
      </div>

      {/* ── Archive naming modal ────────────────────────────────────────── */}
      {showArchiveModal && (
        <div className="modal-overlay active" onClick={() => { if (!archiveModalLoading) setShowArchiveModal(false); }}>
          <div className="modal" style={{ maxWidth: 420 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Archive Selected</h3>
              <button className="close-btn" onClick={() => { if (!archiveModalLoading) setShowArchiveModal(false); }}>&times;</button>
            </div>
            <div className="modal-body">
              <p style={{ margin: '0 0 1rem', color: 'var(--text-secondary)', fontSize: '0.88rem', lineHeight: 1.6 }}>
                Create a .zip archive with {selCount} selected item{selCount !== 1 ? 's' : ''} in the current directory.
              </p>
              <label style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.3rem', display: 'block' }}>Archive name</label>
              <input
                type="text"
                value={archiveModalName}
                onChange={e => setArchiveModalName(e.target.value.replace(/[^a-zA-Z0-9.\-_]/g, '_').replace(/\.zip$/i, ''))}
                onKeyDown={e => { if (e.key === 'Enter' && !archiveModalLoading) handleArchive(); }}
                autoFocus
                style={{ width: '100%', boxSizing: 'border-box' }}
                placeholder="archive"
              />
              <p style={{ margin: '0.5rem 0 0', fontSize: '0.78rem', color: 'var(--text-muted)' }}>Will be saved as: {archiveModalName || 'archive'}.zip</p>
            </div>
            <div className="modal-footer">
              <button className="btn outline" onClick={() => setShowArchiveModal(false)} disabled={archiveModalLoading}>Cancel</button>
              <button className="btn primary" onClick={handleArchive} disabled={archiveModalLoading}>
                {archiveModalLoading ? 'Creating...' : 'Create Archive'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Preview modal (archive tree / image viewer) ──────────────────── */}
      {previewPath && (
        <div className="modal-overlay active" onClick={closePreview}>
          <div className={`modal ${archiveTree ? '' : 'large'}`} style={archiveTree ? { maxWidth: 520 } : {}} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 id="preview-filename">
                {archiveTree ? `📦 ${archiveTree.archiveName}` : (previewUrl ? `🖼 ${previewPath?.split('/').pop()}` : previewPath?.split('/').pop())}
              </h3>
              <div className="modal-header-actions" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                {archiveTree && (
                  <button className="btn primary small" onClick={handleExtractArchive}>Extract Here</button>
                )}
                <button className="close-btn" onClick={closePreview}>&times;</button>
              </div>
            </div>
            <div className="modal-body" style={{ padding: 0, maxHeight: '65vh', overflow: 'auto' }}>
              {archiveTree ? (
                <div className="archive-tree">
                  <div className="archive-tree-header">{archiveTree.totalEntries} entr{archiveTree.totalEntries === 1 ? 'y' : 'ies'}</div>
                  {archiveTree.entries.map((entry, i) => (
                    <div key={i} className={`archive-tree-item${entry.isDirectory ? ' dir' : ''}`}>
                      <span className="archive-tree-icon">{entry.isDirectory ? '📁' : '📄'}</span>
                      <span className="archive-tree-name">{entry.name}</span>
                      {!entry.isDirectory && (
                        <span className="archive-tree-size">
                          {entry.size < 1024 ? `${entry.size} B` : `${(entry.size / 1024).toFixed(1)} KB`}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              ) : previewUrl ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem', background: '#00000008' }}>
                  <img
                    src={previewUrl}
                    alt={previewPath?.split('/').pop()}
                    style={{ maxWidth: '100%', maxHeight: '62vh', borderRadius: 'var(--radius)', objectFit: 'contain', boxShadow: 'var(--shadow-md)' }}
                  />
                </div>
              ) : (
                <p className="text-muted" style={{ padding: '2rem', textAlign: 'center' }}>Loading preview...</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Editor Modal ────────────────────────────────────────────────── */}
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
