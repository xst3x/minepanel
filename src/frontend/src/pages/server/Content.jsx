import { useState, useEffect, useCallback, useRef } from 'react';
import { useOutletContext } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { toast, showConfirm } from '../../components/Toast.jsx';
import { marked } from 'marked';
import PocketMinePlugins from './PocketMinePlugins.jsx';

// Configure marked — safe, no gfm alerts, open links in new tab
marked.setOptions({ breaks: true, gfm: true });
const renderer = new marked.Renderer();
renderer.link = (href, title, text) =>
  `<a href="${href}" target="_blank" rel="noopener noreferrer"${title ? ` title="${title}"` : ''}>${text}</a>`;
renderer.image = (href, title, text) =>
  `<img src="${href}" alt="${text || ''}"${title ? ` title="${title}"` : ''} style="max-width:100%;border-radius:6px;" />`;
marked.use({ renderer });

const PAGE_SIZE = 60;
const ROWS = 10;
const CARD_MIN_W = 170;

const VENDORS = [
  { id: 'modrinth', label: 'Modrinth', icon: '' },
  { id: 'hangar',   label: 'Hangar',   icon: '' },
];

const MODRINTH_CATEGORIES = [
  ['popular',      'Popular'],
  ['optimization', 'Optimization'],
  ['utility',      'Utility / Admin'],
  ['adventure',    'Adventure'],
];

const HANGAR_CATEGORIES = [
  ['popular',  'Popular'],
  ['chat',     'Chat'],
  ['economy',  'Economy'],
  ['protection','Protection'],
];

const bytes = (n) => {
  if (!+n) return '0 B';
  const k = 1024, s = ['B','KB','MB','GB'];
  const i = Math.floor(Math.log(n) / Math.log(k));
  return `${parseFloat((n / Math.pow(k,i)).toFixed(1))} ${s[i]}`;
};

export default function Content() {
  const { serverId, serverInfo } = useOutletContext();

  // ── PocketMine gate ───────────────────────────────────────────────────────
  // If this server runs PocketMine-MP, hand off to the dedicated Poggit UI.
  // The Java plugin system (Modrinth / Hangar) must never be shown for PocketMine,
  // and the PocketMine UI must never appear for Java servers.
  const isPocketMine = serverInfo?.software?.toLowerCase() === 'pocketmine';
  if (isPocketMine) {
    return <PocketMinePlugins serverId={serverId} />;
  }

  // ── Installed ──────────────────────────────────────────────────────────────
  const [installedItems, setInstalledItems]   = useState([]);
  const [installedLoading, setInstalledLoading] = useState(true);

  // ── Vendor & view ──────────────────────────────────────────────────────────
  const [vendor, setVendor]     = useState('modrinth'); // 'modrinth' | 'hangar'
  const [view,   setView]       = useState('browser');  // 'browser' | 'detail'

  // ── Browser state ──────────────────────────────────────────────────────────
  const [activeCategory, setActiveCategory] = useState('popular');
  const [hits,           setHits]           = useState([]);
  const [total,          setTotal]          = useState(0);
  const [offset,         setOffset]         = useState(0);
  const [searchLoading,  setSearchLoading]  = useState(false);
  const [resultBar,      setResultBar]      = useState('');
  const [incompatMsg,    setIncompatMsg]    = useState('');

  // ── Detail state ───────────────────────────────────────────────────────────
  const [detailProject,  setDetailProject]  = useState(null);
  const [detailVersions, setDetailVersions] = useState([]);
  const [detailLoading,  setDetailLoading]  = useState(false);

  const searchInputRef   = useRef(null);
  const currentQueryRef  = useRef('');
  const currentCatRef    = useRef('popular');
  const gridRef          = useRef(null);
  const containerRef     = useRef(null); // always-mounted container
  const [pageSize, setPageSize] = useState(PAGE_SIZE);

  const calcPageSize = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const w = el.offsetWidth;
    const gap = 11;
    const cols = Math.max(1, Math.floor((w + gap) / (CARD_MIN_W + gap)));
    const newSize = cols * ROWS;
    setPageSize(prev => prev === newSize ? prev : newSize);
  }, []);

  // Observe the always-mounted discover card container
  useEffect(() => {
    const ro = new ResizeObserver(calcPageSize);
    if (containerRef.current) ro.observe(containerRef.current);
    // Fallback: also listen to window resize
    window.addEventListener('resize', calcPageSize);
    // Retry after paint in case ref wasn't ready
    const t1 = setTimeout(calcPageSize, 0);
    const t2 = setTimeout(calcPageSize, 200);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', calcPageSize);
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [calcPageSize]);

  // ── Installed ──────────────────────────────────────────────────────────────
  const loadInstalled = useCallback(async () => {
    setInstalledLoading(true);
    try {
      const data = await api(`/api/servers/${serverId}/plugins/installed`);
      setInstalledItems(data || []);
    } catch (e) { toast(e.message, 'error'); }
    finally { setInstalledLoading(false); }
  }, [serverId]);

  useEffect(() => { loadInstalled(); }, [loadInstalled]);

  const uninstall = async (filename) => {
    if (!(await showConfirm(`Remove ${filename}?`, 'Remove Plugin'))) return;
    try {
      await api(`/api/servers/${serverId}/plugins/uninstall`, { method:'POST', body:{ filename } });
      toast('Removed', 'success');
      loadInstalled();
    } catch (e) { toast(e.message, 'error'); }
  };

  const updateAll = async () => {
    if (!installedItems.length) return toast('No plugins installed.', 'info');
    toast('Checking for updates...', 'info');
    try {
      const r = await api(`/api/servers/${serverId}/plugins/update-all`, { method:'POST' });
      toast(r.message, r.updated > 0 ? 'success' : 'info');
      loadInstalled();
    } catch (e) { toast(e.message, 'error'); }
  };


  // ── Search / browse ────────────────────────────────────────────────────────
  const doSearch = useCallback(async (q, cat, page, activeVendor, ps) => {
    const limit = ps || pageSize || PAGE_SIZE;
    currentQueryRef.current = q;
    currentCatRef.current   = cat;
    const off = page * limit;
    setOffset(off);
    setSearchLoading(true);
    setIncompatMsg('');
    try {
      if (activeVendor === 'modrinth') {
        const catParam = cat !== 'popular' ? cat : '';
        const data = await api(
          `/api/servers/${serverId}/plugins/modrinth/search?q=${encodeURIComponent(q)}&category=${encodeURIComponent(catParam)}&limit=${limit}&offset=${off}`
        );
        const h = data.hits || [];
        setHits(h);
        setTotal(data.totalHits || h.length);
        setResultBar(`${q ? `"${q}"` : cat} — ${(data.totalHits || h.length).toLocaleString()} results`);
      } else {
        const data = await api(
          `/api/servers/${serverId}/plugins/hangar/search?q=${encodeURIComponent(q)}&limit=${limit}&offset=${off}`
        );
        if (data.incompatible) {
          setHits([]); setTotal(0);
          setIncompatMsg(data.reason || 'Hangar is not compatible with your server software.');
          setResultBar('');
        } else {
          const h = data.hits || [];
          setHits(h);
          setTotal(data.totalHits || h.length);
          setResultBar(`${q ? `"${q}"` : 'Popular'} — ${(data.totalHits || h.length).toLocaleString()} results`);
        }
      }
    } catch (e) { toast(e.message, 'error'); }
    finally { setSearchLoading(false); }
  }, [serverId, pageSize]);

  const loadCategory = useCallback((cat, page = 0, v = vendor) => {
    setActiveCategory(cat);
    if (searchInputRef.current) searchInputRef.current.value = '';
    doSearch('', cat, page, v);
  }, [doSearch, vendor]);

  const handleSearch = () => {
    const q = searchInputRef.current?.value || '';
    doSearch(q, activeCategory, 0, vendor);
  };

  const goToPage = (page) => {
    doSearch(currentQueryRef.current, currentCatRef.current, page, vendor);
  };

  // Reset when vendor changes
  const switchVendor = (v) => {
    setVendor(v);
    setView('browser');
    setHits([]);
    setTotal(0);
    setOffset(0);
    setActiveCategory('popular');
    currentQueryRef.current = '';
    if (searchInputRef.current) searchInputRef.current.value = '';
    doSearch('', 'popular', 0, v);
  };

  useEffect(() => { loadCategory('popular', 0, 'modrinth'); }, []);

  // Re-fetch page 0 whenever pageSize is recalculated (grid resized)
  const pageSizeInitRef = useRef(false);
  useEffect(() => {
    if (!pageSizeInitRef.current) { pageSizeInitRef.current = true; return; }
    doSearch(currentQueryRef.current, currentCatRef.current, 0, vendor, pageSize);
  }, [pageSize]);

  // ── Install ────────────────────────────────────────────────────────────────
  const getInstalledForProject = (projectId) =>
    installedItems.find(i => i.modrinth?.projectId === projectId);

  const installProject = async (hit) => {
    try {
      toast('Installing...', 'info');
      let body;
      if (hit.source === 'hangar') {
        body = { source: 'hangar', hangarOwner: hit.owner, hangarSlug: hit.slug };
      } else {
        body = { source: 'modrinth', projectId: hit.project_id };
      }
      const r = await api(`/api/servers/${serverId}/plugins/install`, { method:'POST', body });
      toast(r.message, 'success');
      await loadInstalled();
    } catch (e) { toast(e.message, 'error'); }
  };

  const uninstallProject = async (filename, title) => {
    if (!(await showConfirm(`Uninstall ${title}?`, 'Remove'))) return;
    try {
      await api(`/api/servers/${serverId}/plugins/uninstall`, { method:'POST', body:{ filename } });
      toast(`${title} uninstalled`, 'success');
      await loadInstalled();
    } catch (e) { toast(e.message, 'error'); }
  };

  // ── Detail view ────────────────────────────────────────────────────────────
  const openProject = async (hit) => {
    setView('detail');
    setDetailLoading(true);
    setDetailProject(null);
    setDetailVersions([]);
    try {
      if (hit.source === 'hangar') {
        const [project, versions] = await Promise.all([
          api(`/api/servers/${serverId}/plugins/hangar/project/${encodeURIComponent(hit.owner)}/${encodeURIComponent(hit.slug)}`),
          api(`/api/servers/${serverId}/plugins/hangar/project/${encodeURIComponent(hit.owner)}/${encodeURIComponent(hit.slug)}/versions`),
        ]);
        setDetailProject({ ...project, _hit: hit });
        setDetailVersions(versions || []);
      } else {
        const [project, versions] = await Promise.all([
          api(`/api/servers/${serverId}/plugins/modrinth/project/${encodeURIComponent(hit.project_id)}`),
          api(`/api/servers/${serverId}/plugins/modrinth/project/${encodeURIComponent(hit.project_id)}/versions`),
        ]);
        setDetailProject({ ...project, _hit: hit });
        setDetailVersions(versions || []);
      }
    } catch (e) { toast(e.message, 'error'); setView('browser'); }
    finally { setDetailLoading(false); }
  };

  const installVersion = async (versionId, compatible) => {
    if (!detailProject) return;
    if (!compatible) {
      const ok = await showConfirm('This version may not match your server. Install anyway?', 'Install incompatible version');
      if (!ok) return;
    }
    try {
      toast('Installing...', 'info');
      let body;
      const hit = detailProject._hit;
      if (hit.source === 'hangar') {
        body = { source: 'hangar', hangarOwner: hit.owner, hangarSlug: hit.slug, versionId };
      } else {
        body = { source: 'modrinth', projectId: detailProject.id, versionId, allowIncompatible: !compatible };
      }
      const r = await api(`/api/servers/${serverId}/plugins/install`, { method:'POST', body });
      toast(r.message, 'success');
      await loadInstalled();
      // refresh versions
      openProject(hit);
    } catch (e) { toast(e.message, 'error'); }
  };

  const currentPage = Math.floor(offset / pageSize) + 1;
  const totalPages  = Math.max(1, Math.ceil(total / pageSize));
  const categories  = vendor === 'modrinth' ? MODRINTH_CATEGORIES : HANGAR_CATEGORIES;
  const activeVendorMeta = VENDORS.find(v => v.id === vendor);


  return (
    <div className="plugins-section">

      {/* ── Installed ─────────────────────────────────────────────────────── */}
      <div className="card">
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1rem' }}>
          <h3 style={{ margin:0 }}>Installed</h3>
          <button className="btn outline small" onClick={updateAll}>Update All</button>
        </div>
        <div className="installed-plugins-list">
          {installedLoading
            ? <p className="text-muted">Loading...</p>
            : !installedItems.length
              ? <p className="text-muted">No plugins installed.</p>
              : installedItems.map(p => (
                <div key={p.name} className="installed-plugin-item">
                  <div>
                    <span className="ipn">{p.name}</span>
                    <span className="ips">{bytes(p.size)}</span>
                    {p.modrinth
                      ? <span className="ips" style={{ color:'var(--text-muted)' }}>Modrinth · {p.modrinth.versionNumber || p.modrinth.versionId}</span>
                      : <span className="ips" style={{ color:'var(--text-muted)' }}>Manual jar</span>
                    }
                  </div>
                  <button className="btn danger small" onClick={() => uninstall(p.name)}>Remove</button>
                </div>
              ))
          }
        </div>
      </div>

      {/* ── Discover ──────────────────────────────────────────────────────── */}
      <div className="card" ref={containerRef}>

        {/* Vendor switcher */}
        <div style={{ display:'flex', alignItems:'center', gap:'0.75rem', marginBottom:'1.25rem', flexWrap:'wrap' }}>
          <h3 style={{ margin:0, flex:1 }}>Discover Plugins & Mods</h3>
          <div style={{ display:'flex', gap:'0.5rem' }}>
            {VENDORS.map(v => (
              <button
                key={v.id}
                onClick={() => vendor !== v.id && switchVendor(v.id)}
                style={{
                  padding:'0.4rem 1rem',
                  borderRadius:'var(--radius)',
                  border: vendor === v.id ? '2px solid var(--accent)' : '2px solid var(--border)',
                  background: vendor === v.id ? 'var(--accent-subtle)' : 'var(--bg-card)',
                  color: vendor === v.id ? 'var(--accent)' : 'var(--text-muted)',
                  fontWeight: vendor === v.id ? 700 : 400,
                  cursor:'pointer', transition:'all 0.15s', fontSize:'0.9rem',
                  display:'flex', alignItems:'center', gap:'0.4rem'
                }}>
                {v.label}
              </button>
            ))}
          </div>
        </div>

        {/* Browser view */}
        {view === 'browser' && (
          <>
            {/* Category tabs */}
            <div className="sub-nav" style={{ marginBottom:'1rem' }}>
              {categories.map(([id, label]) => (
                <button key={id}
                  className={`sub-nav-item${activeCategory === id && !currentQueryRef.current ? ' active' : ''}`}
                  onClick={() => loadCategory(id, 0)}>
                  {label}
                </button>
              ))}
            </div>

            {/* Search bar */}
            <div className="plugins-header">
              <input type="text" ref={searchInputRef}
                placeholder={`Search on ${activeVendorMeta.label}...`}
                className="search-bar"
                onKeyDown={e => e.key === 'Enter' && handleSearch()} />
              <button className="btn primary" onClick={handleSearch}>Search</button>
            </div>

            {/* Result bar */}
            {resultBar && (
              <div style={{ margin:'0.5rem 0 1rem', fontSize:'0.85rem', color:'var(--text-muted)' }}>
                {resultBar}
              </div>
            )}

            {/* Incompatibility notice */}
            {incompatMsg && (
              <div style={{ padding:'1rem', borderRadius:'var(--radius)', background:'var(--bg-input)', border:'1px solid var(--border)', color:'var(--text-muted)', marginBottom:'1rem' }}>
                ⚠️ {incompatMsg}
              </div>
            )}

            {/* Grid */}
            {searchLoading
              ? <p className="text-muted">Loading...</p>
              : (
                <div className="plugins-grid" ref={gridRef}>
                  {!hits.length && !incompatMsg
                    ? <p className="text-muted">No results found.</p>
                    : hits.map(hit => {
                      const installedEntry = hit.source === 'modrinth' ? getInstalledForProject(hit.project_id) : null;
                      const isInstalled = !!installedEntry;
                      return (
                        <div key={hit.project_id} className="plugin-card" tabIndex={0}
                          onClick={() => openProject(hit)}
                          onKeyDown={e => e.key === 'Enter' && openProject(hit)}>
                          <div className="plugin-header">
                            {hit.icon_url
                              ? <img src={hit.icon_url} className="plugin-icon" alt=""
                                  onError={e => { e.target.style.display='none'; }} />
                              : <div className="plugin-icon" style={{ background:'var(--bg-input)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'1.2rem' }}>
                                  🧩
                                </div>
                            }
                            <div>
                              <div className="plugin-title">{hit.title}</div>
                              <div className="plugin-author">
                                {hit.author || ''}
                              </div>
                            </div>
                          </div>
                          <div className="plugin-desc">{hit.description}</div>
                          <div className="plugin-card-meta">
                            <span>{(hit.downloads || 0).toLocaleString()} downloads</span>
                            <span>{hit.project_type || 'plugin'}</span>
                          </div>
                          {isInstalled && (
                            <div className="plugin-installed-note">
                              Installed: {installedEntry.modrinth?.versionNumber || installedEntry.name}
                            </div>
                          )}
                          <button
                            className={`btn ${isInstalled ? 'danger' : 'primary'} small full-width`}
                            onClick={e => {
                              e.stopPropagation();
                              if (isInstalled) uninstallProject(installedEntry.name, hit.title);
                              else installProject(hit);
                            }}>
                            {isInstalled ? 'Uninstall' : 'Install latest compatible'}
                          </button>
                        </div>
                      );
                    })
                  }
                </div>
              )
            }

            {/* Pagination */}
            {total > PAGE_SIZE && (
              <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:'1rem', marginTop:'1.5rem' }}>
                <button className="btn outline small" disabled={currentPage <= 1} onClick={() => goToPage(currentPage - 2)}>Prev</button>
                <div className="plugin-page-status">
                  Page{' '}
                  <input type="number" min={1} max={totalPages} defaultValue={currentPage} key={currentPage}
                    style={{ width:52, padding:'3px 6px', background:'var(--bg-input)', border:'1px solid var(--border)', borderRadius:'var(--radius)', color:'var(--text-primary)', textAlign:'center' }}
                    onBlur={e => { const v = Math.min(Math.max(parseInt(e.target.value,10)||1,1),totalPages); goToPage(v-1); }}
                    onKeyDown={e => { if(e.key==='Enter'){const v=Math.min(Math.max(parseInt(e.target.value,10)||1,1),totalPages);goToPage(v-1);}}}
                  />{' '}of {totalPages.toLocaleString()}
                </div>
                <button className="btn outline small" disabled={currentPage >= totalPages} onClick={() => goToPage(currentPage)}>Next</button>
              </div>
            )}
          </>
        )}

        {/* Detail view */}
        {view === 'detail' && (
          <div id="plugin-detail-view">
            {detailLoading ? (
              <>
                <button className="btn outline small" onClick={() => setView('browser')}>← Back</button>
                <p className="text-muted" style={{ marginTop:'1rem' }}>Loading...</p>
              </>
            ) : detailProject && (() => {
              const hit = detailProject._hit;
              const externalUrl = hit.source === 'hangar'
                ? `https://hangar.papermc.io/${hit.owner}/${hit.slug}`
                : detailProject.modrinthUrl || `https://modrinth.com/project/${detailProject.slug || detailProject.id}`;
              return (
                <>
                  <div className="plugin-detail-toolbar">
                    <button className="btn outline small" onClick={() => setView('browser')}>← Back</button>
                    <div style={{ display:'flex', alignItems:'center', gap:'0.5rem' }}>
                      <span style={{ color:'var(--accent)', fontSize:'0.8rem', fontWeight:700, textTransform:'uppercase' }}>
                        {hit.source === 'hangar' ? 'Hangar' : 'Modrinth'}
                      </span>
                      <button className="btn outline small" onClick={() => window.open(externalUrl, '_blank', 'noopener')}>
                        View on {hit.source === 'hangar' ? 'Hangar' : 'Modrinth'} 
                      </button>
                    </div>
                  </div>

                  <div className="plugin-detail-hero">
                    {detailProject.icon_url
                      ? <img src={detailProject.icon_url} className="plugin-detail-icon" alt=""
                          onError={e => { e.target.style.display='none'; }} />
                      : <div className="plugin-detail-icon" style={{ background:'var(--bg-input)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'2rem' }}>
                          🧩
                        </div>
                    }
                    <div>
                      <h2 style={{ margin:'0 0 0.25rem' }}>{detailProject.title}</h2>
                      <p style={{ margin:'0 0 0.5rem', color:'var(--text-muted)' }}>{detailProject.description}</p>
                      <div className="plugin-detail-stats">
                        <span>{(detailProject.downloads||0).toLocaleString()} downloads</span>
                        {detailProject.followers > 0 && <span>{(detailProject.followers||0).toLocaleString()} followers</span>}
                        <span>{detailProject.project_type || 'plugin'}</span>
                      </div>
                      <div className="plugin-tags">
                        {(detailProject.categories||[]).slice(0,8).map(c => <span key={c}>{c}</span>)}
                      </div>
                    </div>
                  </div>

                  <div className="plugin-detail-columns">
                    <section className="plugin-readme">
                      {detailProject.body
                        ? <div dangerouslySetInnerHTML={{
                            __html: hit.source === 'hangar'
                              ? marked.parse(detailProject.body)
                              : detailProject.body.slice(0, 20000)
                          }} />
                        : <p className="text-muted">No description provided.</p>}
                    </section>
                    <aside className="plugin-versions">
                      <h3>Versions</h3>
                      <div className="plugin-versions-list">
                        {!detailVersions.length
                          ? <p className="text-muted">No versions found.</p>
                          : detailVersions.map(v => {
                            const pf = (v.files||[]).find(f=>f.primary) || v.files?.[0];
                            const date = v.date_published ? new Date(v.date_published).toLocaleDateString() : '';
                            const gvs  = (v.game_versions||[]).slice(0,4).join(', ');
                            const more = (v.game_versions||[]).length > 4 ? ` +${v.game_versions.length-4}` : '';
                            const installedV = installedItems.find(i => i.modrinth?.versionId === v.id);
                            const channel = v.channel ? ` [${v.channel}]` : '';
                            const isExternal = v.isExternal;
                            const hasNoFile = !pf || !pf.url;
                            // For Hangar: show description as subtitle (commit message), keep name clean
                            const versionLabel = v.version_number || v.name;
                            const versionSub = v.source === 'hangar' && v.description ? v.description.replace(/\[([a-f0-9]{7,})\]\([^)]+\)\s*/g, '').trim() : null;
                            return (
                              <div key={v.id} className={`plugin-version-item ${v.compatible ? 'compatible' : 'incompatible'}`}>
                                <div>
                                  <div className="plugin-version-title">{versionLabel}{channel}</div>
                                  {versionSub && <div style={{ fontSize:'0.75rem', color:'var(--text-muted)', marginTop:'2px', lineHeight:1.3 }}>{versionSub.slice(0, 120)}</div>}
                                  <div className="plugin-version-meta">
                                    {(v.loaders||[]).length > 0 && <span>{v.loaders.join(', ')}</span>}
                                    {gvs && <span>{gvs}{more}</span>}
                                    {date && <span>{date}</span>}
                                    {pf?.size > 0 && <span>{bytes(pf.size)}</span>}
                                    {isExternal && <span style={{color:'var(--text-muted)'}}>External link</span>}
                                  </div>
                                </div>
                                <div className="plugin-version-actions">
                                  {installedV && <span className="plugin-compat ok">Installed</span>}
                                  <span className={`plugin-compat ${v.compatible ? 'ok' : 'warn'}`}>
                                    {v.compatible ? 'Compatible' : 'Incompatible'}
                                  </span>
                                  {isExternal ? (
                                    <button className="btn outline small"
                                      onClick={() => window.open(v.externalUrl, '_blank', 'noopener')}>
                                      Download 
                                    </button>
                                  ) : hasNoFile ? (
                                    <button className="btn outline small" disabled>No file</button>
                                  ) : (
                                    <button
                                      className={`btn ${installedV ? 'success' : 'primary'} small`}
                                      disabled={!!installedV}
                                      onClick={() => !installedV && installVersion(v.id, v.compatible)}>
                                      {installedV ? 'Installed' : 'Install'}
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })
                        }
                      </div>
                    </aside>
                  </div>
                </>
              );
            })()}
          </div>
        )}
      </div>
    </div>
  );
}
