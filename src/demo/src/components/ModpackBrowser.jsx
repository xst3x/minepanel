import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../lib/api.js';
import { toast, toastProgress } from './Toast.jsx';
import { parseMarkdown } from '../lib/markdown.js';
import ModpackIcon from './ModpackIcon.jsx';
import Select from './Select.jsx';
import '../styles/pages/server/Content.css';
import '../styles/components/ModpackBrowser.css';

const PAGE_SIZE = 15;

const SORT_OPTIONS = [
  ['relevance', 'Relevance'],
  ['downloads_desc', 'Downloads ↓'],
  ['downloads_asc', 'Downloads ↑'],
  ['updated', 'Recently updated'],
  ['newest', 'Newest'],
];

const LOADER_LABELS = {
  fabric: 'Fabric',
  forge: 'Forge',
  quilt: 'Quilt',
  neoforge: 'NeoForge',
};

const formatDate = (iso) => {
  if (!iso) return '';
  try { return new Date(iso).toLocaleDateString(); } catch { return ''; }
};

/**
 * Modpack browser for the Create Server modal — browse, detail, and install from Modrinth.
 */
export default function ModpackBrowser({ serverName, ramMb, port, onInstalled }) {
  const [view, setView] = useState('browser'); // browser | detail

  // Filter / browse state
  const [categories, setCategories] = useState([['popular', 'Popular']]);
  const [gameVersions, setGameVersions] = useState([]);
  const [mcVersion, setMcVersion] = useState('');
  const [loader, setLoader] = useState('');
  const [sort, setSort] = useState('downloads_desc');
  const [activeCategory, setActiveCategory] = useState('popular');
  const [hits, setHits] = useState([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [resultBar, setResultBar] = useState('');
  const [installingId, setInstallingId] = useState(null);

  // Detail state
  const [detailProject, setDetailProject] = useState(null);
  const [detailVersions, setDetailVersions] = useState([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailHit, setDetailHit] = useState(null);
  const [detailTab, setDetailTab] = useState('overview'); // 'overview' | 'contents'
  const [contents, setContents] = useState(null); // { mods, resource_packs, shaders }
  const [contentsLoading, setContentsLoading] = useState(false);
  const [contentsVersionId, setContentsVersionId] = useState(null);

  const searchInputRef = useRef(null);
  const queryRef = useRef('');

  // Bootstrap categories + MC versions
  useEffect(() => {
    (async () => {
      try {
        const [catData, verData] = await Promise.all([
          api('/api/modpacks/categories'),
          api('/api/modpacks/game-versions'),
        ]);
        if (catData?.categories?.length) setCategories(catData.categories);
        if (verData?.versions?.length) setGameVersions(verData.versions);
      } catch (e) {
        console.error(e.message);
      }
    })();
  }, []);

  const doSearch = useCallback(async (q, cat, page = 0) => {
    queryRef.current = q;
    const off = page * PAGE_SIZE;
    setOffset(off);
    setLoading(true);
    try {
      const params = new URLSearchParams({
        q,
        category: cat,
        limit: String(PAGE_SIZE),
        offset: String(off),
      });
      if (mcVersion) params.set('mcVersion', mcVersion);
      if (loader) params.set('loader', loader);
      if (sort) params.set('sort', sort);

      const data = await api(`/api/modpacks/search?${params}`);
      const h = data.hits || [];
      setHits(h);
      setTotal(data.totalHits || h.length);
      const label = q ? `"${q}"` : (categories.find(([id]) => id === cat)?.[1] || cat);
      setResultBar(`${label} — ${(data.totalHits || h.length).toLocaleString()} modpacks`);
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [mcVersion, loader, sort, categories]);

  useEffect(() => {
    doSearch('', 'popular', 0);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-run search when filters change
  useEffect(() => {
    doSearch(queryRef.current, activeCategory, 0);
  }, [mcVersion, loader, sort]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSearch = () => {
    const q = searchInputRef.current?.value?.trim() || '';
    doSearch(q, activeCategory, 0);
  };

  const loadCategory = (cat) => {
    setActiveCategory(cat);
    if (searchInputRef.current) searchInputRef.current.value = '';
    queryRef.current = '';
    doSearch('', cat, 0);
  };

  const goToPage = (page) => {
    doSearch(queryRef.current, activeCategory, page);
  };

  const installModpack = async (projectId, versionId, title) => {
    if (!serverName?.trim()) {
      toast('Enter a server name before installing a modpack.', 'error');
      return;
    }

    const key = versionId || projectId;
    setInstallingId(key);
    const dismiss = toastProgress(`Creating modpack server "${serverName.trim()}"…`);

    try {
      const body = {
        name: serverName.trim(),
        ram_mb: Number(ramMb) || 2048,
        port: Number(port) || 25565,
        projectId,
      };
      if (versionId) body.versionId = versionId;

      const result = await api('/api/modpacks/create-server', { method: 'POST', body });
      dismiss(null, result.message || `Installed ${title}`);
      onInstalled?.(result);
    } catch (e) {
      dismiss(e.message || 'Modpack install failed.');
    } finally {
      setInstallingId(null);
    }
  };

  const openProject = async (hit) => {
    setView('detail');
    setDetailLoading(true);
    setDetailProject(null);
    setDetailVersions([]);
    setDetailHit(hit);
    setDetailTab('overview');
    setContents(null);
    setContentsVersionId(null);
    try {
      const [project, versions] = await Promise.all([
        api(`/api/modpacks/project/${encodeURIComponent(hit.project_id)}`),
        api(`/api/modpacks/project/${encodeURIComponent(hit.project_id)}/versions`),
      ]);
      setDetailProject(project);
      setDetailVersions(versions || []);
    } catch (e) {
      toast(e.message, 'error');
      setView('browser');
    } finally {
      setDetailLoading(false);
    }
  };

  const loadContents = async (versionId) => {
    if (!versionId) return;
    if (contentsVersionId === versionId && contents) return; // already loaded
    setContentsLoading(true);
    setContents(null);
    setContentsVersionId(versionId);
    try {
      const data = await api(`/api/modpacks/version/${encodeURIComponent(versionId)}/contents`);
      setContents(data);
    } catch (e) {
      toast('Failed to load included content: ' + e.message, 'error');
    } finally {
      setContentsLoading(false);
    }
  };

  const handleDetailTabChange = (tab) => {
    setDetailTab(tab);
    if (tab === 'contents' && detailVersions.length > 0) {
      const latestVid = detailVersions[0]?.id;
      loadContents(latestVid);
    }
  };

  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const renderLoaderBadges = (loaders) => {
    if (!loaders?.length) return null;
    return loaders.map(l => (
      <span key={l} className="modpack-loader-badge">{LOADER_LABELS[l] || l}</span>
    ));
  };

  // ── Detail view ──────────────────────────────────────────────────────────
  if (view === 'detail') {
    return (
      <div className="modpack-browser modpack-detail-scroll">
        <div className="plugin-detail-toolbar">
          <button type="button" className="btn outline small" onClick={() => setView('browser')}>← Back</button>
          {detailProject && (
            <button
              type="button"
              className="btn outline small"
              onClick={() => window.open(detailProject.modrinthUrl, '_blank', 'noopener')}
            >
              View on Modrinth
            </button>
          )}
        </div>

        {detailLoading ? (
          <p className="text-muted">Loading modpack…</p>
        ) : detailProject ? (
          <>
            <div className="plugin-detail-hero">
              <ModpackIcon url={detailProject.icon_url} className="plugin-detail-icon" size={78} alt={detailProject.title} />
              <div>
                <h2 style={{ margin: '0 0 0.25rem' }}>{detailProject.title}</h2>
                <p style={{ margin: '0 0 0.5rem', color: 'var(--text-muted)' }}>{detailProject.description}</p>
                <div className="plugin-detail-stats">
                  <span>{(detailProject.downloads || 0).toLocaleString()} downloads</span>
                  <span>{(detailProject.followers || 0).toLocaleString()} followers</span>
                  {detailProject.team && <span>{detailProject.team}</span>}
                </div>
                <div className="plugin-tags">
                  {(detailProject.categories || []).slice(0, 10).map(c => (
                    <span key={c}>{c}</span>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: '0.35rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
                  {renderLoaderBadges((detailProject.categories || []).filter(c => LOADER_LABELS[c]))}
                </div>
              </div>
            </div>

            {(detailProject.gallery || []).length > 0 && (
              <div className="plugin-gallery">
                {detailProject.gallery.map((img, i) => (
                  <figure key={img.url || i}>
                    <img src={img.url} alt={img.title || ''} loading="lazy" />
                    {img.title && <figcaption>{img.title}</figcaption>}
                  </figure>
                ))}
              </div>
            )}

            {(detailProject.links || []).length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', margin: '0.75rem 0' }}>
                {detailProject.links.map((link, i) => (
                  <a
                    key={`${link.url}-${i}`}
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn outline small"
                  >
                    {link.label || link.type}
                  </a>
                ))}
              </div>
            )}

            {/* Sub-tab navigation */}
            <div style={{ display: 'flex', gap: '0.25rem', borderBottom: '1px solid var(--border-color)', marginBottom: '1rem' }}>
              {[
                { id: 'overview', label: 'Overview' },
                { id: 'contents', label: 'Included Content' },
              ].map(t => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => handleDetailTabChange(t.id)}
                  style={{
                    padding: '0.5rem 1rem', background: 'none', border: 'none',
                    borderBottom: detailTab === t.id ? '2px solid var(--accent)' : '2px solid transparent',
                    color: detailTab === t.id ? 'var(--accent)' : 'var(--text-muted)',
                    cursor: 'pointer', fontWeight: detailTab === t.id ? 600 : 400,
                    fontSize: '0.85rem', transition: 'color 0.15s, border-color 0.15s',
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {detailTab === 'contents' && (
              <div style={{ marginBottom: '1rem' }}>
                {contentsLoading ? (
                  <p className="text-muted" style={{ fontSize: '0.85rem' }}>Loading included content…</p>
                ) : contents ? (
                  (() => {
                    const total = (contents.mods?.length || 0) + (contents.resource_packs?.length || 0) + (contents.shaders?.length || 0);
                    if (total === 0) return <p className="text-muted" style={{ fontSize: '0.85rem' }}>No dependency information available for this version.</p>;

                    const renderList = (title, items) => {
                      if (!items?.length) return null;
                      return (
                        <div style={{ marginBottom: '1.25rem' }}>
                          <h4 style={{ margin: '0 0 0.5rem', fontSize: '0.82rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)' }}>
                            {title} <span style={{ color: 'var(--accent)', fontWeight: 700 }}>{items.length}</span>
                          </h4>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                            {items.map(item => (
                              <div key={item.project_id} style={{
                                display: 'flex', alignItems: 'center', gap: '0.6rem',
                                padding: '0.4rem 0.6rem', borderRadius: 'var(--radius)',
                                background: 'var(--bg-input)', border: '1px solid var(--border-color)',
                                fontSize: '0.82rem',
                              }}>
                                {item.icon_url && (
                                  <img src={`/api/modpacks/icon?url=${encodeURIComponent(item.icon_url)}`} alt="" width={20} height={20} style={{ borderRadius: '3px', flexShrink: 0 }} loading="lazy" />
                                )}
                                <span style={{ fontWeight: 500, color: 'var(--text-primary)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</span>
                                {item.dependency_type === 'optional' && (
                                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', flexShrink: 0 }}>optional</span>
                                )}
                                <a href={`https://modrinth.com/mod/${item.slug}`} target="_blank" rel="noopener noreferrer"
                                  style={{ color: 'var(--accent)', fontSize: '0.72rem', flexShrink: 0 }}
                                  onClick={e => e.stopPropagation()}
                                >↗</a>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    };

                    return (
                      <>
                        {renderList('Mods', contents.mods)}
                        {renderList('Resource Packs', contents.resource_packs)}
                        {renderList('Shaders', contents.shaders)}
                      </>
                    );
                  })()
                ) : (
                  <p className="text-muted" style={{ fontSize: '0.85rem' }}>Select a version and click "Included Content" to load dependencies.</p>
                )}
              </div>
            )}

            <div className="plugin-detail-columns">
              <section className="plugin-readme" style={detailTab === 'contents' ? { display: 'none' } : {}}>
                <div className="markdown-body plugin-description">
                  {detailProject.body
                    ? <div dangerouslySetInnerHTML={{ __html: parseMarkdown(detailProject.body) }} />
                    : <p className="text-muted">No description provided.</p>}
                </div>
              </section>

              <aside className="plugin-versions">
                <h3>Versions</h3>
                <div className="plugin-versions-list">
                  {!detailVersions.length ? (
                    <p className="text-muted">No versions found.</p>
                  ) : detailVersions.map((v, idx) => {
                    const date = formatDate(v.date_published);
                    const gvs = (v.game_versions || []).join(', ');
                    const busy = installingId === v.id;
                    return (
                      <div
                        key={v.id}
                        className={`plugin-version-item modpack-version-item${idx === 0 ? ' latest' : ''}`}
                      >
                        <div>
                          <div className="plugin-version-title">{v.name || v.version_number}</div>
                          <div className="plugin-version-meta">
                            {gvs && <span>MC {gvs}</span>}
                            {(v.loaders || []).length > 0 && (
                              <span>{v.loaders.map(l => LOADER_LABELS[l] || l).join(', ')}</span>
                            )}
                            {date && <span>{date}</span>}
                          </div>
                        </div>
                        <div className="plugin-version-actions">
                          <button
                            type="button"
                            className="btn primary small"
                            disabled={busy || !!installingId}
                            onClick={() => installModpack(detailProject.id, v.id, detailProject.title)}
                          >
                            {busy ? 'Installing…' : 'Install'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </aside>
            </div>
          </>
        ) : null}
      </div>
    );
  }

  // ── Browser view ─────────────────────────────────────────────────────────
  return (
    <div className="modpack-browser">
      <div className="plugins-header">
        <input
          type="text"
          ref={searchInputRef}
          placeholder="Search modpacks on Modrinth…"
          className="search-bar"
          onKeyDown={e => e.key === 'Enter' && handleSearch()}
        />
        <button type="button" className="btn primary" onClick={handleSearch}>Search</button>
      </div>

      <div className="modpack-browser-filters">
        <div>
          <label>Minecraft Version</label>
          <Select value={mcVersion} onChange={e => setMcVersion(e.target.value)}>
            <option value="">All versions</option>
            {gameVersions.map(v => <option key={v} value={v}>{v}</option>)}
          </Select>
        </div>
        <div>
          <label>Mod Loader</label>
          <Select value={loader} onChange={e => setLoader(e.target.value)}>
            <option value="">All loaders</option>
            <option value="fabric">Fabric</option>
            <option value="forge">Forge</option>
            <option value="quilt">Quilt</option>
            <option value="neoforge">NeoForge</option>
          </Select>
        </div>
        <div>
          <label>Sort By</label>
          <Select value={sort} onChange={e => setSort(e.target.value)}>
            {SORT_OPTIONS.map(([id, label]) => (
              <option key={id} value={id}>{label}</option>
            ))}
          </Select>
        </div>
      </div>

      <div className="sub-nav" style={{ marginBottom: '0.25rem' }}>
        {categories.map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={`sub-nav-item${activeCategory === id && !queryRef.current ? ' active' : ''}`}
            onClick={() => loadCategory(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {resultBar && (
        <div className="plugins-result-bar">{resultBar}</div>
      )}

      {loading ? (
        <p className="text-muted">Loading modpacks…</p>
      ) : (
        <div className="plugins-grid">
          {!hits.length ? (
            <p className="text-muted">No modpacks found.</p>
          ) : hits.map(hit => {
            const busy = installingId === hit.project_id;
            return (
              <div
                key={hit.project_id}
                className="plugin-card"
                tabIndex={0}
                onClick={() => openProject(hit)}
                onKeyDown={e => e.key === 'Enter' && openProject(hit)}
              >
                <div className="plugin-header">
                  <ModpackIcon url={hit.icon_url} alt={hit.title} />
                  <div style={{ minWidth: 0 }}>
                    <div className="plugin-title">{hit.title}</div>
                    <div className="plugin-author">{hit.author || ''}</div>
                  </div>
                </div>
                <div className="markdown-body plugin-description">
                  <div
                    className="plugin-desc"
                    dangerouslySetInnerHTML={{ __html: parseMarkdown(hit.description) }}
                  />
                </div>
                <div className="plugin-card-meta">
                  <span>{(hit.downloads || 0).toLocaleString()} downloads</span>
                  <span>{(hit.game_versions || []).slice(0, 2).join(', ')}{(hit.game_versions?.length > 2 ? '…' : '')}</span>
                </div>
                <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
                  {renderLoaderBadges(hit.loaders?.length ? hit.loaders : (hit.categories || []).filter(c => LOADER_LABELS[c]))}
                </div>
                <button
                  type="button"
                  className="btn primary small full-width"
                  disabled={busy || !!installingId}
                  onClick={e => {
                    e.stopPropagation();
                    installModpack(hit.project_id, null, hit.title);
                  }}
                >
                  {busy ? 'Installing…' : 'Install Latest'}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {total > PAGE_SIZE && (
        <div className="plugins-pagination">
          <button type="button" className="btn outline small" disabled={currentPage <= 1} onClick={() => goToPage(currentPage - 2)}>Prev</button>
          <div className="plugin-page-status">
            Page{' '}
            <input
              type="number"
              min={1}
              max={totalPages}
              defaultValue={currentPage}
              key={currentPage}
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
            />{' '}
            of {totalPages.toLocaleString()}
          </div>
          <button type="button" className="btn outline small" disabled={currentPage >= totalPages} onClick={() => goToPage(currentPage)}>Next</button>
        </div>
      )}
    </div>
  );
}
