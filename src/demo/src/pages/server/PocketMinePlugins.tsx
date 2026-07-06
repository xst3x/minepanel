/**
 * PocketMinePlugins.jsx
 * ──────────────────────
 * PocketMine-MP only plugin marketplace, backed by the Poggit API.
 *
 * This component is ONLY rendered when server.software === 'pocketmine'.
 * It has zero overlap with the Java (Modrinth / Hangar) plugin system.
 *
 * Features:
 *  - Browse / search Poggit plugins
 *  - Plugin detail page (description, icon, all releases)
 *  - Install (.phar → /plugins folder) / Uninstall
 *  - Installed .phar list
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../../lib/api.js';
import { toast, showConfirm } from '../../components/Toast.jsx';
import '../../styles/pages/server/PocketMinePlugins.css';

const PAGE_SIZE = 24;

const bytes = (n) => {
  if (!+n) return '0 B';
  const k = 1024, s = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(n) / Math.log(k));
  return `${parseFloat((n / Math.pow(k, i)).toFixed(1))} ${s[i]}`;
};

export default function PocketMinePlugins({ serverId }) {
  // ── Installed ──────────────────────────────────────────────────────────────
  const [installed, setInstalled]           = useState([]);
  const [installedLoading, setInstalledLoading] = useState(true);

  // ── Browser ────────────────────────────────────────────────────────────────
  const [view, setView]           = useState('browser'); // 'browser' | 'detail'
  const [hits, setHits]           = useState([]);
  const [total, setTotal]         = useState(0);
  const [offset, setOffset]       = useState(0);
  const [searchLoading, setSearchLoading] = useState(false);
  const [resultBar, setResultBar] = useState('');

  // ── Detail ─────────────────────────────────────────────────────────────────
  const [detail, setDetail]           = useState(null);   // collapsed plugin object
  const [releases, setReleases]       = useState([]);
  const [detailLoading, setDetailLoading] = useState(false);

  const searchInputRef  = useRef(null);
  const currentQueryRef = useRef('');

  // ── Installed ──────────────────────────────────────────────────────────────
  const loadInstalled = useCallback(async () => {
    setInstalledLoading(true);
    try {
      const data = await api(`/api/servers/${serverId}/pocketmine/installed`);
      setInstalled(data || []);
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setInstalledLoading(false);
    }
  }, [serverId]);

  useEffect(() => { loadInstalled(); }, [loadInstalled]);

  const uninstallFile = async (filename) => {
    if (!(await showConfirm(`Remove ${filename}?`, 'Remove Plugin'))) return;
    try {
      await api(`/api/servers/${serverId}/pocketmine/uninstall`, {
        method: 'POST',
        body: { filename },
      });
      toast('Removed', 'success');
      loadInstalled();
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  // ── Search ─────────────────────────────────────────────────────────────────
  const doSearch = useCallback(async (q, page) => {
    currentQueryRef.current = q;
    const off = page * PAGE_SIZE;
    setOffset(off);
    setSearchLoading(true);
    try {
      const data = await api(
        `/api/servers/${serverId}/pocketmine/search?q=${encodeURIComponent(q)}&limit=${PAGE_SIZE}&offset=${off}`
      );
      setHits(data.hits || []);
      setTotal(data.total || 0);
      setResultBar(
        q
          ? `"${q}" — ${(data.total || 0).toLocaleString()} results`
          : `${(data.total || 0).toLocaleString()} plugins`
      );
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setSearchLoading(false);
    }
  }, [serverId]);

  useEffect(() => { doSearch('', 0); }, [doSearch]);

  const handleSearch = () => {
    const q = searchInputRef.current?.value?.trim() || '';
    doSearch(q, 0);
  };

  const goToPage = (page) => doSearch(currentQueryRef.current, page);

  // ── Detail ─────────────────────────────────────────────────────────────────
  const openPlugin = async (plugin) => {
    setView('detail');
    setDetailLoading(true);
    setDetail(null);
    setReleases([]);
    try {
      const [det, rels] = await Promise.all([
        api(`/api/servers/${serverId}/pocketmine/plugin/${encodeURIComponent(plugin.name)}`),
        api(`/api/servers/${serverId}/pocketmine/plugin/${encodeURIComponent(plugin.name)}/releases`),
      ]);
      setDetail(det);
      setReleases(rels || []);
    } catch (e) {
      toast(e.message, 'error');
      setView('browser');
    } finally {
      setDetailLoading(false);
    }
  };

  // ── Install ────────────────────────────────────────────────────────────────
  const installPlugin = async (pluginName, version) => {
    try {
      toast('Installing...', 'info');
      const body = version ? { pluginName, version } : { pluginName };
      const r = await api(`/api/servers/${serverId}/pocketmine/install`, {
        method: 'POST',
        body,
      });
      toast(r.message, 'success');
      loadInstalled();
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  // ── Helpers ────────────────────────────────────────────────────────────────
  const isInstalledPlugin = (name) =>
    installed.some(f => f.name.toLowerCase().startsWith(name.toLowerCase().replace(/[^a-zA-Z0-9.\-_]/g, '_')));

  const getInstalledFile = (name) =>
    installed.find(f => f.name.toLowerCase().startsWith(name.toLowerCase().replace(/[^a-zA-Z0-9.\-_]/g, '_')));

  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;
  const totalPages  = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="plugins-section">

      {/* ── Installed ──────────────────────────────────────────────────────── */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h3 style={{ margin: 0 }}>Installed PocketMine Plugins</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{
              padding: '0.2rem 0.6rem',
              borderRadius: 'var(--radius)',
              background: 'var(--accent-subtle)',
              color: 'var(--accent)',
              fontSize: '0.75rem',
              fontWeight: 700,
              letterSpacing: '0.04em',
            }}>
              POGGIT
            </span>
          </div>
        </div>

        <div className="installed-plugins-list">
          {installedLoading ? (
            <p className="text-muted">Loading...</p>
          ) : !installed.length ? (
            <p className="text-muted">No .phar plugins installed.</p>
          ) : (
            installed.map(p => (
              <div key={p.name} className="installed-plugin-item">
                <div>
                  <span className="ipn">{p.name}</span>
                  <span className="ips">{bytes(p.size)}</span>
                  <span className="ips" style={{ color: 'var(--text-muted)' }}>PocketMine plugin</span>
                </div>
                <button
                  className="btn danger small"
                  onClick={() => uninstallFile(p.name)}
                >
                  Remove
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* ── Discover ───────────────────────────────────────────────────────── */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
          <h3 style={{ margin: 0, flex: 1 }}>
            Discover PocketMine Plugins
          </h3>
          <a
            href="https://poggit.pmmp.io"
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textDecoration: 'none' }}
          >
            Powered by Poggit ↗
          </a>
        </div>

        {/* ── Browser view ─────────────────────────────────────────────────── */}
        {view === 'browser' && (
          <>
            <div className="plugins-header">
              <input
                type="text"
                ref={searchInputRef}
                placeholder="Search PocketMine plugins on Poggit..."
                className="search-bar"
                onKeyDown={e => e.key === 'Enter' && handleSearch()}
              />
              <button className="btn primary" onClick={handleSearch}>Search</button>
            </div>

            {resultBar && (
              <div style={{ margin: '0.5rem 0 1rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                {resultBar}
              </div>
            )}

            {searchLoading ? (
              <p className="text-muted">Loading...</p>
            ) : (
              <div className="plugins-grid">
                {!hits.length ? (
                  <p className="text-muted">No plugins found.</p>
                ) : hits.map(plugin => {
                  const instEntry = getInstalledFile(plugin.name);
                  const isInst = !!instEntry;
                  return (
                    <div
                      key={plugin.name}
                      className="plugin-card"
                      tabIndex={0}
                      onClick={() => openPlugin(plugin)}
                      onKeyDown={e => e.key === 'Enter' && openPlugin(plugin)}
                    >
                      <div className="plugin-header">
                        {plugin.icon ? (
                          <img
                            src={plugin.icon}
                            className="plugin-icon"
                            alt=""
                            onError={e => { e.target.style.display = 'none'; }}
                          />
                        ) : (
                          <div className="plugin-icon" style={{
                            background: 'var(--bg-input)',
                            display: 'flex', alignItems: 'center',
                            justifyContent: 'center', fontSize: '1.2rem',
                          }}>
                            🟠
                          </div>
                        )}
                        <div>
                          <div className="plugin-title">{plugin.name}</div>
                          <div className="plugin-author">{plugin.mainAuthor || ''}</div>
                        </div>
                      </div>

                      <div className="plugin-desc">{plugin.description}</div>

                      <div className="plugin-card-meta">
                        <span>{(plugin.downloads || 0).toLocaleString()} downloads</span>
                        <span>v{plugin.version}</span>
                      </div>

                      {isInst && (
                        <div className="plugin-installed-note">
                          Installed: {instEntry.name}
                        </div>
                      )}

                      <button
                        className={`btn ${isInst ? 'danger' : 'primary'} small full-width`}
                        onClick={e => {
                          e.stopPropagation();
                          if (isInst) uninstallFile(instEntry.name);
                          else installPlugin(plugin.name);
                        }}
                      >
                        {isInst ? 'Uninstall' : 'Install latest'}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Pagination */}
            {total > PAGE_SIZE && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem', marginTop: '1.5rem' }}>
                <button
                  className="btn outline small"
                  disabled={currentPage <= 1}
                  onClick={() => goToPage(currentPage - 2)}
                >
                  Prev
                </button>
                <div className="plugin-page-status">
                  Page{' '}
                  <input
                    type="number"
                    min={1}
                    max={totalPages}
                    defaultValue={currentPage}
                    key={currentPage}
                    style={{
                      width: 52, padding: '3px 6px',
                      background: 'var(--bg-input)',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius)',
                      color: 'var(--text-primary)', textAlign: 'center',
                    }}
                    onBlur={e => {
                      const v = Math.min(Math.max(parseInt(e.target.value, 10) || 1, 1), totalPages);
                      goToPage(v - 1);
                    }}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        const v = Math.min(Math.max(parseInt(e.target.value, 10) || 1, 1), totalPages);
                        goToPage(v - 1);
                      }
                    }}
                  />{' '}of {totalPages.toLocaleString()}
                </div>
                <button
                  className="btn outline small"
                  disabled={currentPage >= totalPages}
                  onClick={() => goToPage(currentPage)}
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}

        {/* ── Detail view ──────────────────────────────────────────────────── */}
        {view === 'detail' && (
          <div id="pm-plugin-detail-view">
            {detailLoading ? (
              <>
                <button className="btn outline small" onClick={() => setView('browser')}>← Back</button>
                <p className="text-muted" style={{ marginTop: '1rem' }}>Loading...</p>
              </>
            ) : detail && (
              <>
                {/* Toolbar */}
                <div className="plugin-detail-toolbar">
                  <button className="btn outline small" onClick={() => setView('browser')}>← Back</button>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ color: 'var(--accent)', fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase' }}>
                      Poggit
                    </span>
                    {detail.poggitUrl && (
                      <button
                        className="btn outline small"
                        onClick={() => window.open(detail.poggitUrl, '_blank', 'noopener')}
                      >
                        View on Poggit ↗
                      </button>
                    )}
                  </div>
                </div>

                {/* Hero */}
                <div className="plugin-detail-hero">
                  {detail.icon ? (
                    <img
                      src={detail.icon}
                      className="plugin-detail-icon"
                      alt=""
                      onError={e => { e.target.style.display = 'none'; }}
                    />
                  ) : (
                    <div className="plugin-detail-icon" style={{
                      background: 'var(--bg-input)',
                      display: 'flex', alignItems: 'center',
                      justifyContent: 'center', fontSize: '2rem',
                    }}>
                      🟠
                    </div>
                  )}
                  <div>
                    <h2 style={{ margin: '0 0 0.25rem' }}>{detail.name}</h2>
                    <p style={{ margin: '0 0 0.5rem', color: 'var(--text-muted)' }}>{detail.description}</p>
                    <div className="plugin-detail-stats">
                      <span>{(detail.downloads || 0).toLocaleString()} downloads</span>
                      <span>by {detail.mainAuthor}</span>
                      <span>Latest: v{detail.version}</span>
                      {detail.license && <span>{detail.license}</span>}
                    </div>
                    {detail.api?.length > 0 && (
                      <div className="plugin-tags">
                        {detail.api.map(a => (
                          <span key={`${a.from}-${a.till}`}>
                            API {a.from}–{a.till}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Columns */}
                <div className="plugin-detail-columns">
                  {/* README placeholder — Poggit has no public body API */}
                  <section className="plugin-readme">
                    <p className="text-muted" style={{ fontStyle: 'italic' }}>
                      Full plugin documentation is available on{' '}
                      {detail.poggitUrl ? (
                        <a href={detail.poggitUrl} target="_blank" rel="noopener noreferrer">
                          Poggit
                        </a>
                      ) : 'Poggit'}.
                      {detail.repoUrl && (
                        <>
                          {' '}Source code:{' '}
                          <a href={detail.repoUrl} target="_blank" rel="noopener noreferrer">
                            {detail.repo}
                          </a>
                        </>
                      )}
                    </p>
                  </section>

                  {/* Releases sidebar */}
                  <aside className="plugin-versions">
                    <h3>Releases</h3>
                    <div className="plugin-versions-list">
                      {!releases.length ? (
                        <p className="text-muted">No releases found.</p>
                      ) : releases.map(rel => {
                        const instFile = getInstalledFile(rel.name);
                        const isThisVersionInstalled =
                          instFile && instFile.name.includes(`_${rel.version}.phar`);
                        const hasDownload = !!rel.artifact;

                        return (
                          <div
                            key={rel.version}
                            className={`plugin-version-item ${rel.state >= 2 ? 'compatible' : 'incompatible'}`}
                          >
                            <div>
                              <div className="plugin-version-title">v{rel.version}</div>
                              <div className="plugin-version-meta">
                                {rel.api?.length > 0 && (
                                  <span>
                                    API {rel.api.map(a => `${a.from}–${a.till}`).join(', ')}
                                  </span>
                                )}
                                {rel.submittedAt && (
                                  <span>{new Date(rel.submittedAt * 1000).toLocaleDateString()}</span>
                                )}
                              </div>
                            </div>
                            <div className="plugin-version-actions">
                              {isThisVersionInstalled && (
                                <span className="plugin-compat ok">Installed</span>
                              )}
                              <span className={`plugin-compat ${rel.state >= 2 ? 'ok' : 'warn'}`}>
                                {rel.state >= 2 ? 'Approved' : 'Draft'}
                              </span>
                              {!hasDownload ? (
                                <button className="btn outline small" disabled>No file</button>
                              ) : isThisVersionInstalled ? (
                                <button className="btn success small" disabled>Installed</button>
                              ) : (
                                <button
                                  className="btn primary small"
                                  onClick={() => installPlugin(rel.name, rel.version)}
                                >
                                  Install
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </aside>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
