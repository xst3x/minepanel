import type { ServerContext } from '../../lib/serverContext';
import { getToken } from '../../lib/api';
import { assetUrl, request } from '../../lib/api';
import Section from '../../components/Section.tsx';
import ModalOverlay from '../../components/ModalOverlay.tsx';
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
  const { serverId, hasPerm } = useOutletContext<ServerContext>();
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
  const [savedContentRef, setSavedContentRef] = useState('');
  const [savingFile, setSavingFile] = useState(false);

  const editorDirty = editingPath != null && editorContent !== savedContentRef;

  const fileInputRef = useRef(null);
  const [showActionsMenu, setShowActionsMenu] = useState(false);
  const actionsMenuRef = useRef(null);
  const [openRowMenu, setOpenRowMenu] = useState(null);
  const [infoItem, setInfoItem] = useState(null);
  const [infoData, setInfoData] = useState(null);
  const [infoLoading, setInfoLoading] = useState(false);
  const [infoError, setInfoError] = useState('');
  const rowMenuRef = useRef(null);

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
      setSavedContentRef(r.content || '');
    } catch (err) {
      toast(err.message || 'Failed to read file.', 'error');
    }
  };

  // HIG Modality — confirm before closing the editor when unsaved edits would be lost
  const closeEditor = async () => {
    if (editorDirty) {
      const ok = await showConfirm(
        `Discard unsaved changes to "${editingPath?.split('/').pop()}"?`,
        'Unsaved Changes',
        { danger: true, confirmLabel: 'Discard' }
      );
      if (!ok) return;
    }
    setEditingPath(null);
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
    const dismiss = toastProgress(`Uploading ${files.length} file${files.length !== 1 ? 's' : ''}…`);
    let failed = 0;
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const fd = new FormData();
      fd.append('file', f);
      fd.append('path', currentPath);
      try {
        await api(`/api/servers/${serverId}/files/upload`, { method: 'POST', body: fd });
      } catch (err) {
        failed++;
        toast(`Failed to upload ${f.name}: ${err.message}`, 'error');
      }
    }
    if (failed === 0) dismiss(null, `Uploaded ${files.length} file${files.length !== 1 ? 's' : ''}.`);
    else dismiss();
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
      if (r.downloadUrl) window.open(assetUrl(r.downloadUrl), '_blank');
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

  const itemPath = (name) => currentPath === '/' ? `/${name}` : `${currentPath}/${name}`;
  const handleSingleRename = async (item) => {
    const name = (await showPrompt('New name', item.name, 'Rename'))?.trim();
    if (!name || name === item.name) return;
    if (name === '.' || name === '..' || /[/\\]/.test(name)) return toast('Enter a name without folder separators.', 'error');
    try {
      await api(`/api/servers/${serverId}/files/rename`, { method: 'POST', body: { oldPath: itemPath(item.name), newPath: itemPath(name) } });
      toast(`Renamed to ${name}.`, 'success');
      loadFiles();
    } catch (error) { toast(error.message || 'Rename failed.', 'error'); }
  };
  const handleSingleMove = async (item) => {
    const destination = (await showPrompt('Destination folder path', '/', 'Move'))?.trim();
    if (!destination || destination === currentPath) return;
    try {
      const result = await api(`/api/servers/${serverId}/files/move`, { method: 'POST', body: { paths: [itemPath(item.name)], destination } });
      if (result.results?.[0]?.status === 'error') throw new Error(result.results[0].error);
      toast(`Moved ${item.name}.`, 'success');
      loadFiles();
    } catch (error) { toast(error.message || 'Move failed.', 'error'); }
  };
  const openInfo = async (item) => {
    setInfoItem(item);
    setInfoData(null);
    setInfoError('');
    setInfoLoading(true);
    try {
      setInfoData(await api(`/api/servers/${serverId}/files/info?path=${encodeURIComponent(itemPath(item.name))}`));
    } catch (error) { setInfoError(error.message || 'Could not load file information.'); }
    finally { setInfoLoading(false); }
  };

  const handleSingleDownload = async (item) => {
    const filePath = currentPath === '/' ? `/${item.name}` : `${currentPath}/${item.name}`;
    const dlName = item.name + (item.isDirectory ? '.zip' : '');
    try {
      if (item.isDirectory) {
        const r = await api(`/api/servers/${serverId}/files/download?path=${encodeURIComponent(filePath)}`);
        if (r.downloadUrl) window.open(assetUrl(r.downloadUrl), '_blank');
        else toast('Failed to prepare download.', 'error');
      } else {
        const token = getToken();
        const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
        const res = await request(`/api/servers/${serverId}/files/download?path=${encodeURIComponent(filePath)}`, { headers });
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
      const token = getToken();
      const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
      const res = await request(`/api/servers/${serverId}/files/download?path=${encodeURIComponent(filePath)}`, { headers });
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

  // ── Close actions menu on outside click ──────────────────────────────────
  useEffect(() => {
    if (!showActionsMenu) return;
    const onClick = (e) => {
      if (actionsMenuRef.current && !actionsMenuRef.current.contains(e.target)) {
        setShowActionsMenu(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [showActionsMenu]);

  // ── Close per-row action menu on outside click ───────────────────────────
  // (handled by the bottom-sheet overlay's own onClick instead)

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

  // ── Editor modal: Escape asks before discarding unsaved edits ────────────
  useEffect(() => {
    if (!editingPath) return;
    const onKey = (e) => {
      if (e.key === 'Escape' && !savingFile) { e.preventDefault(); closeEditor(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

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
          <button className="btn outline small" onClick={handleBatchDownload}>Download</button>
          <button className="btn outline small" onClick={handleClipboardCopy}>Copy</button>
          <button className="btn outline small" onClick={handleClipboardCut}>Cut</button>
          <button className="btn outline small" onClick={() => setShowArchiveModal(true)} disabled={archiveModalLoading}>Archive</button>
          <button className="btn danger small" onClick={handleBatchDelete}>Delete</button>
          <button className="btn outline small" onClick={deselectAll}>Clear</button>
        </div>
      )}

      <Section className="" style={{  }}>
        <div className="fm-list-header">
          <div style={{ width: '20px', flexShrink: 0 }} />
          <div className="fm-col name">Name</div>
          <div style={{ flex: '0 0 auto', textAlign: 'right' }}>Actions</div>
        </div>

        <div className="list-body" id="fm-list">
          {loading ? (
            <p className="text-muted" style={{ padding: '1rem' }}>Loading files...</p>
          ) : (
            <>
              {!sortedItems.length && (
                <div style={{ padding: '2.5rem 1rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                  <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-secondary)' }}>This folder is empty.</p>
                  {hasPerm('server.files.edit') && (
                    <p style={{ margin: '0.35rem 0 0', fontSize: '0.875rem' }}>
                      Use <strong>New Folder</strong>, <strong>New File</strong> or <strong>Upload</strong> to add content.
                    </p>
                  )}
                </div>
              )}
              {currentPath !== '/' && (
                <div
                  className="fm-item"
                  role="button"
                  tabIndex={0}
                  aria-label="Go up one directory"
                  onClick={handleGoUp}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleGoUp(); } }}
                >
                  <div className="fm-icon">{FOLDER_SVG}</div>
                  <div className="fm-col name fm-item-name" style={{ fontWeight: '500' }}>..</div>
                  <div className="fm-col actions" />
                </div>
              )}

              {sortedItems.map((item) => {
                const icon = item.isDirectory ? FOLDER_SVG : FILE_SVG;
                const ext = item.name.split('.').pop()?.toLowerCase();
                const isImage = !item.isDirectory && IMAGE_EXTS.has(ext);
                const isZip = !item.isDirectory && ext === 'zip';
                const isSelected = selectedItems.has(item.name);

                return (
                  <div
                    key={item.name}
                    className={`fm-item${isSelected ? ' fm-selected' : ''}`}
                    role={selectMode ? 'checkbox' : 'button'}
                    aria-checked={selectMode ? isSelected : undefined}
                    tabIndex={0}
                    aria-label={item.name}
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
                    onKeyDown={e => {
                      if (e.key !== 'Enter' && e.key !== ' ') return;
                      e.preventDefault();
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
                    <div className="fm-col actions fm-item-actions fm-row-menu-wrap" onClick={e => e.stopPropagation()}>
                      <button
                        className="btn outline small fm-row-menu-btn"
                        onClick={() => setOpenRowMenu(item.name)}
                        aria-label={`Actions for ${item.name}`}
                        aria-haspopup="dialog"
                      >
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
                          <circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/>
                        </svg>
                      </button>
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>
      </Section>

      {/* One action menu on all viewports; the overlay handles focus and Escape. */}
      {openRowMenu && (() => {
        const item = items.find(entry => entry.name === openRowMenu);
        if (!item) return null;
        const ext = item.name.split('.').pop()?.toLowerCase();
        const isZip = !item.isDirectory && ext === 'zip';
        const close = () => setOpenRowMenu(null);
        const action = (callback) => () => { close(); callback(); };
        return (
          <ModalOverlay className="fm-sheet-overlay" onClick={close}>
            <div className="fm-sheet" onClick={event => event.stopPropagation()}>
              <div className="fm-sheet-handle" />
              <div className="fm-sheet-title">{item.name}</div>
              <button className="fm-sheet-item" onClick={action(() => openInfo(item))}>Info</button>
              {!item.isDirectory && <button className="fm-sheet-item" onClick={action(() => isZip ? openPreview(item) : handleOpenFile(item))}>{isZip ? 'View archive' : 'Edit / Open'}</button>}
              <button className="fm-sheet-item" onClick={action(() => handleSingleDownload(item))}>Download</button>
              {hasPerm('server.files.edit') && <>
                <button className="fm-sheet-item" onClick={action(() => handleSingleRename(item))}>Rename</button>
                <button className="fm-sheet-item" onClick={action(() => handleSingleMove(item))}>Move</button>
                <button className="fm-sheet-item" onClick={action(() => handleSingleCopy(item.name))}>Copy</button>
                <button className="fm-sheet-item" onClick={action(() => handleSingleCut(item.name))}>Cut</button>
                <button className="fm-sheet-item" onClick={action(() => isZip ? openPreview(item) : handleSingleArchive(item.name))}>{isZip ? 'Extract' : 'Archive'}</button>
                <button className="fm-sheet-item fm-sheet-danger fm-sheet-separator" onClick={action(() => handleSingleDelete(item.name))}>Delete</button>
              </>}
              <button className="fm-sheet-item fm-sheet-cancel" onClick={close}>Cancel</button>
            </div>
          </ModalOverlay>
        );
      })()}

      {infoItem && (
        <ModalOverlay className="fm-sheet-overlay" onClick={() => setInfoItem(null)}>
          <div className="fm-sheet fm-info-sheet" onClick={event => event.stopPropagation()}>
            <div className="fm-sheet-handle" />
            <div className="fm-sheet-title">File information</div>
            {infoLoading ? <p role="status">Loading information…</p> : infoError ? <p role="alert">{infoError}</p> : infoData && (
              <dl className="fm-info-list">
                <div><dt>Name</dt><dd>{infoData.name}</dd></div>
                <div><dt>Type</dt><dd>{infoData.isDirectory ? 'Folder' : (infoData.extension ? `${infoData.extension.toUpperCase()} file` : 'File')}</dd></div>
                <div><dt>Created</dt><dd>{infoData.createdAt ? new Date(infoData.createdAt).toLocaleString() : 'Unavailable'}</dd></div>
                <div><dt>Size</dt><dd>{formatBytes(infoData.size)}</dd></div>
                {infoData.isDirectory ? <>
                  <div><dt>Subfolders</dt><dd>{infoData.folderCount}</dd></div>
                  <div><dt>Files</dt><dd>{infoData.fileCount}</dd></div>
                </> : <div><dt>Last modified</dt><dd>{infoData.modifiedAt ? new Date(infoData.modifiedAt).toLocaleString() : 'Unavailable'}</dd></div>}
              </dl>
            )}
            <button className="fm-sheet-item fm-sheet-cancel" onClick={() => setInfoItem(null)}>Close</button>
          </div>
        </ModalOverlay>
      )}

      {/* ── Archive naming modal ────────────────────────────────────────── */}
      {showArchiveModal && (
        <ModalOverlay className="modal-overlay active" onClick={() => { if (!archiveModalLoading) setShowArchiveModal(false); }}>
          <div className="modal" style={{ maxWidth: 420 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Archive Selected</h3>
              <button aria-label="Close dialog" className="close-btn" onClick={() => { if (!archiveModalLoading) setShowArchiveModal(false); }}>&times;</button>
            </div>
            <div className="modal-body">
              <p style={{ margin: '0 0 1rem', color: 'var(--text-secondary)', fontSize: '0.88rem', lineHeight: 1.6 }}>
                Create a .zip archive with {selCount} selected item{selCount !== 1 ? 's' : ''} in the current directory.
              </p>
              <label style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.3rem', display: 'block' }}>Archive name</label>
              <input aria-label="Archive name"
                type="text"
                value={archiveModalName}
                onChange={e => setArchiveModalName(e.target.value.replace(/[^a-zA-Z0-9.\-_]/g, '_').replace(/\.zip$/i, ''))}
                onKeyDown={e => { if (e.key === 'Enter' && !archiveModalLoading) handleArchive(); }}
                autoFocus
                style={{ width: '100%', boxSizing: 'border-box' }}
                placeholder="archive"
              />
              <p style={{ margin: '0.5rem 0 0', fontSize: '0.875rem', color: 'var(--text-muted)' }}>Will be saved as: {archiveModalName || 'archive'}.zip</p>
            </div>
            <div className="modal-footer">
              <button className="btn outline" onClick={() => setShowArchiveModal(false)} disabled={archiveModalLoading}>Cancel</button>
              <button className="btn primary" onClick={handleArchive} disabled={archiveModalLoading}>
                {archiveModalLoading ? 'Creating...' : 'Create Archive'}
              </button>
            </div>
          </div>
        </ModalOverlay>
      )}

      {/* ── Preview modal (archive tree / image viewer) ──────────────────── */}
      {previewPath && (
        <ModalOverlay className="modal-overlay active" onClick={closePreview}>
          <div className={`modal ${archiveTree ? '' : 'large'}`} style={archiveTree ? { maxWidth: 520 } : {}} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 id="preview-filename" style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {archiveTree ? (
                  <><svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M21 8l-9-5-9 5v8l9 5 9-5V8z"/><path d="M3 8l9 5 9-5"/><path d="M12 13v8"/></svg>{archiveTree.archiveName}</>
                ) : previewUrl ? (
                  <><svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>{previewPath?.split('/').pop()}</>
                ) : (
                  previewPath?.split('/').pop()
                )}
              </h3>
              <div className="modal-header-actions" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                {archiveTree && (
                  <button className="btn primary small" onClick={handleExtractArchive}>Extract Here</button>
                )}
                <button aria-label="Close dialog" className="close-btn" onClick={closePreview}>&times;</button>
              </div>
            </div>
            <div className="modal-body" style={{ padding: 0, maxHeight: "65dvh", overflow: 'auto' }}>
              {archiveTree ? (
                <div className="archive-tree">
                  <div className="archive-tree-header">{archiveTree.totalEntries} entr{archiveTree.totalEntries === 1 ? 'y' : 'ies'}</div>
                  {archiveTree.entries.map((entry, i) => (
                    <div key={i} className={`archive-tree-item${entry.isDirectory ? ' dir' : ''}`}>
                      <span className="archive-tree-icon">
                        {entry.isDirectory
                          ? <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" fill="none" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
                          : <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" fill="none" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>}
                      </span>
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
                  <img loading="lazy"
                    src={previewUrl}
                    alt={previewPath?.split('/').pop()}
                    style={{ maxWidth: '100%', maxHeight: "62dvh", borderRadius: 'var(--radius)', objectFit: 'contain', boxShadow: 'var(--shadow-md)' }}
                  />
                </div>
              ) : (
                <p className="text-muted" style={{ padding: '2rem', textAlign: 'center' }}>Loading preview...</p>
              )}
            </div>
          </div>
        </ModalOverlay>
      )}

      {/* ── Editor Modal ────────────────────────────────────────────────── */}
      {editingPath && (
        <ModalOverlay className="modal-overlay active" id="modal-file-editor">
          <div className="modal large" role="dialog" aria-modal="true" aria-label={`Editing ${editingPath}`}>
            <div className="modal-header">
              <h3 id="editor-filename" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0, overflow: 'hidden' }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{editingPath}</span>
                {editorDirty && (
                  <span
                    title="Unsaved changes"
                    aria-label="Unsaved changes"
                    style={{ flexShrink: 0, fontSize: '0.875rem', fontWeight: 700, letterSpacing: '0.06em', padding: '0.12rem 0.45rem', borderRadius: 999, background: 'var(--accent-subtle)', color: 'var(--accent)', border: '1px solid var(--accent-glow)' }}
                  >
                    UNSAVED
                  </span>
                )}
              </h3>
              <div className="modal-header-actions" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <button className="btn outline small" onClick={closeEditor} disabled={savingFile}>Cancel</button>
                <button className="btn primary small" onClick={handleSaveFile} disabled={savingFile}>
                  {savingFile ? 'Saving...' : 'Save'}
                </button>
                <button className="close-btn" aria-label="Close editor" onClick={closeEditor} disabled={savingFile}>&times;</button>
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
        </ModalOverlay>
      )}
    </div>
  );
}
