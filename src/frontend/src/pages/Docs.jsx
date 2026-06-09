import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { marked } from 'marked';
import { api } from '../lib/api.js';

const CATEGORY_LABELS = {
  'getting-started': 'Getting Started',
  'servers':         'Servers',
  'users':           'Users & Permissions',
  'advanced':        'Advanced',
  'discord':         'Discord',
};

function categoryLabel(cat) {
  return CATEGORY_LABELS[cat] || cat.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

marked.setOptions({ breaks: true, gfm: true });

// Chevron icon — points right when collapsed, down when expanded
function Chevron({ open }) {
  return (
    <svg
      width="12" height="12" viewBox="0 0 12 12" fill="none"
      style={{
        transition: 'transform 0.18s ease',
        transform: open ? 'rotate(90deg)' : 'rotate(0deg)',
        flexShrink: 0,
      }}
    >
      <path d="M4 2.5L7.5 6L4 9.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function Docs() {
  const { category, page } = useParams();
  const navigate = useNavigate();

  const [docs, setDocs]         = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);
  const [activeDoc, setActiveDoc] = useState(null);
  const [openCats, setOpenCats] = useState({});   // { [category]: true | false }

  useEffect(() => {
    setLoading(true);
    api('/api/docs')
      .then(data => { setDocs(data); setError(null); })
      .catch(err  => { setError('Failed to load documentation.'); console.error(err); })
      .finally(()  => setLoading(false));
  }, []);

  // Once docs load: open the active category, resolve active doc
  useEffect(() => {
    if (!docs.length) return;

    let target = null;
    if (category && page) {
      const slug = `${category}/${page}`;
      target = docs.find(d => d.slug === slug) || null;
    }
    if (!target) target = docs[0];

    if (target) {
      setActiveDoc(target);
      // Open the category that contains this doc
      setOpenCats(prev => ({ ...prev, [target.category]: true }));
      if (!category || !page) {
        navigate(`/docs/${target.slug}`, { replace: true });
      }
    }
  }, [docs]);

  // When URL params change (browser back/forward), sync active doc
  useEffect(() => {
    if (!docs.length || !category || !page) return;
    const slug = `${category}/${page}`;
    const found = docs.find(d => d.slug === slug);
    if (found) {
      setActiveDoc(found);
      setOpenCats(prev => ({ ...prev, [found.category]: true }));
    }
  }, [category, page, docs]);

  const selectDoc = useCallback((doc) => {
    setActiveDoc(doc);
    navigate(`/docs/${doc.slug}`);
  }, [navigate]);

  const toggleCat = useCallback((cat) => {
    setOpenCats(prev => ({ ...prev, [cat]: !prev[cat] }));
  }, []);

  // Build ordered category list preserving backend sort
  const orderedCategories = [];
  const seen = new Set();
  for (const doc of docs) {
    if (!seen.has(doc.category)) {
      seen.add(doc.category);
      orderedCategories.push(doc.category);
    }
  }

  // Group docs by category (order preserved from backend)
  const grouped = {};
  for (const doc of docs) {
    if (!grouped[doc.category]) grouped[doc.category] = [];
    grouped[doc.category].push(doc);
  }

  return (
    <div className="page" style={{ padding: '2.25rem' }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ marginTop: 0, marginBottom: '0.5rem' }}>Docs</h2>
        <p className="text-muted" style={{ margin: 0 }}>Comprehensive documentation for MinePanel features</p>
      </div>

      {error && (
        <div className="card" style={{ color: 'var(--danger)', marginBottom: '1rem' }}>{error}</div>
      )}

      <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'flex-start' }}>

        {/* ── Sidebar ────────────────────────────────────────────────── */}
        <div className="docs-sidebar" style={{ alignSelf: 'flex-start' }}>
          {loading ? (
            <div className="text-muted" style={{ fontSize: '0.85rem', padding: '0.5rem' }}>Loading…</div>
          ) : (
            orderedCategories.map(cat => {
              const isOpen = !!openCats[cat];
              const catDocs = grouped[cat] || [];
              const hasActive = catDocs.some(d => d.slug === activeDoc?.slug);

              return (
                <div key={cat} className="docs-cat-group">
                  {/* Category header — clickable to expand/collapse */}
                  <button
                    className={`docs-cat-header${hasActive ? ' has-active' : ''}`}
                    onClick={() => toggleCat(cat)}
                  >
                    <span>{categoryLabel(cat)}</span>
                    <Chevron open={isOpen} />
                  </button>

                  {/* Collapsible file list */}
                  {isOpen && (
                    <div className="docs-cat-items">
                      {catDocs.map(doc => (
                        <button
                          key={doc.slug}
                          className={`docs-item${activeDoc?.slug === doc.slug ? ' active' : ''}`}
                          onClick={() => selectDoc(doc)}
                        >
                          {doc.title}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* ── Content ────────────────────────────────────────────────── */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {loading && (
            <div className="card" style={{ color: 'var(--text-muted)' }}>Loading documentation…</div>
          )}
          {!loading && activeDoc && (
            <div
              className="card doc-content"
              style={{ lineHeight: 1.7 }}
              dangerouslySetInnerHTML={{ __html: marked.parse(activeDoc.content) }}
            />
          )}
          {!loading && !activeDoc && !error && (
            <div className="card text-muted">No documentation available.</div>
          )}
        </div>

      </div>
    </div>
  );
}
