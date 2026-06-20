import { useState, useEffect } from 'react';
import { Link, NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../lib/api.js';
import BgCanvas from './BgCanvas.jsx';

// Logo SVG Components
const LogoIcon = () => (
  <svg viewBox="0 0 256 256" xmlns="http://www.w3.org/2000/svg" className="sidebar-logo">
    <defs>
      <filter id="logo-glow-f">
        <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur"/>
        <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
    </defs>
    {/* Three faces as a single shape group — solid fills derived from accent, no stroke anywhere */}
    <polygon points="128,52 196,90 128,128 60,90"   fill="hsl(149,90%,42%)"  stroke="none"/>
    <polygon points="60,90 128,128 128,204 60,166"   fill="hsl(149,80%,18%)"  stroke="none"/>
    <polygon points="128,128 196,90 196,166 128,204" fill="hsl(149,80%,28%)"  stroke="none"/>
    {/* Circuit traces */}
    <g filter="url(#logo-glow-f)" opacity="0.85">
      <polyline points="60,90 28,70 14,70"    fill="none" stroke="var(--accent,hsl(149,100%,47%))" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
      <polyline points="196,90 228,70 242,70"  fill="none" stroke="var(--accent,hsl(149,100%,47%))" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
      <polyline points="60,166 28,186 14,186"  fill="none" stroke="var(--accent,hsl(149,100%,47%))" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
      <polyline points="196,166 228,186 242,186" fill="none" stroke="var(--accent,hsl(149,100%,47%))" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
      <line x1="128" y1="204" x2="128" y2="234" stroke="var(--accent,hsl(149,100%,47%))" strokeWidth="1.4" strokeLinecap="round"/>
      <circle cx="28"  cy="70"  r="2.5" fill="var(--accent,hsl(149,100%,47%))"/>
      <circle cx="228" cy="70"  r="2.5" fill="var(--accent,hsl(149,100%,47%))"/>
      <circle cx="28"  cy="186" r="2.5" fill="var(--accent,hsl(149,100%,47%))"/>
      <circle cx="228" cy="186" r="2.5" fill="var(--accent,hsl(149,100%,47%))"/>
      <circle cx="14"  cy="70"  r="4"   fill="var(--accent,hsl(149,100%,47%))"/>
      <circle cx="242" cy="70"  r="4"   fill="var(--accent,hsl(149,100%,47%))"/>
      <circle cx="14"  cy="186" r="4"   fill="var(--accent,hsl(149,100%,47%))"/>
      <circle cx="242" cy="186" r="4"   fill="var(--accent,hsl(149,100%,47%))"/>
      <circle cx="128" cy="234" r="4"   fill="var(--accent,hsl(149,100%,47%))"/>
    </g>
    {/* Power button on top face, centred at (128,90) */}
    <g filter="url(#logo-glow-f)">
      <line x1="128" y1="76" x2="128" y2="83" stroke="var(--accent,hsl(149,100%,47%))" strokeWidth="2.2" strokeLinecap="round"/>
      <path d="M 114,84 A 14,14 0 1 0 142,84" fill="none" stroke="var(--accent,hsl(149,100%,47%))" strokeWidth="2.2" strokeLinecap="round"/>
    </g>
  </svg>
);

const FaviconIcon = (props) => (
  <svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" {...props}>
    <polygon points="32,4  60,20 32,36 4,20"  fill="hsl(149,90%,42%)" stroke="none"/>
    <polygon points="4,20  32,36 32,60 4,44"  fill="hsl(149,80%,18%)" stroke="none"/>
    <polygon points="32,36 60,20 60,44 32,60" fill="hsl(149,80%,28%)" stroke="none"/>
    <line x1="32" y1="13" x2="32" y2="17" stroke="var(--accent,hsl(149,100%,47%))" strokeWidth="1.4" strokeLinecap="round"/>
    <path d="M 25,16 A 7,7 0 1 0 39,16" fill="none" stroke="var(--accent,hsl(149,100%,47%))" strokeWidth="1.4" strokeLinecap="round"/>
  </svg>
);

// Inject SVG favicon — CSS vars can't work inside data URIs so we resolve --accent at runtime
const FAVICON_SVG_TPL = `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg"><polygon points="32,4 60,20 32,36 4,20" fill="hsl(149,90%,42%)" stroke="none"/><polygon points="4,20 32,36 32,60 4,44" fill="hsl(149,80%,18%)" stroke="none"/><polygon points="32,36 60,20 60,44 32,60" fill="hsl(149,80%,28%)" stroke="none"/><line x1="32" y1="13" x2="32" y2="17" stroke="__A__" stroke-width="1.4" stroke-linecap="round"/><path d="M 25,16 A 7,7 0 1 0 39,16" fill="none" stroke="__A__" stroke-width="1.4" stroke-linecap="round"/></svg>`;

function useInjectFavicon() {
  useEffect(() => {
    const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || 'hsl(149,100%,47%)';
    const svg = FAVICON_SVG_TPL.replace(/__A__/g, accent);
    const url = `data:image/svg+xml,${encodeURIComponent(svg)}`;
    let link = document.querySelector("link[rel~='icon']");
    if (!link) { link = document.createElement('link'); link.rel = 'icon'; document.head.appendChild(link); }
    link.type = 'image/svg+xml';
    link.href = url;
  }, []);
}

export default function AppLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [servers, setServers] = useState([]);
  const [metrics, setMetrics] = useState({ cpu: '0%', mem: '0%', temp: '--°C' });
  const [themeMode, setThemeMode] = useState(localStorage.getItem('mp_theme') || 'dark');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isUserDropdownOpen, setIsUserDropdownOpen] = useState(false);

  useInjectFavicon();

  const loadServers = async () => {
    try {
      const svs = await api('/api/servers');
      setServers(svs || []);
    } catch (e) {}
  };

  const loadMetrics = async () => {
    try {
      const data = await api('/api/system/metrics');
      if (data) {
        setMetrics({
          cpu: `${Math.round(data.cpu?.usage || 0)}%`,
          mem: `${data.memory?.usedPercentage || 0}%`,
          temp: data.cpu?.temp != null ? `${data.cpu.temp}°C` : '--°C'
        });
      }
    } catch (e) {}
  };

  useEffect(() => {
    loadServers();
    loadMetrics();
    const s = setInterval(loadServers, 15000);
    const m = setInterval(loadMetrics, 30000);
    window.addEventListener('mp:server-status-changed', loadServers);
    return () => {
      clearInterval(s);
      clearInterval(m);
      window.removeEventListener('mp:server-status-changed', loadServers);
    };
  }, []);

  const toggleTheme = () => {
    const next = themeMode === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('mp_theme', next);
    setThemeMode(next);
  };

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', themeMode);
  }, [themeMode]);

  const isAdmin = user?.role === 'admin' ||
    (Array.isArray(user?.globalPermissions) && (
      user.globalPermissions.includes('*') ||
      user.globalPermissions.includes('root') ||
      user.globalPermissions.includes('panel.settings')
    ));

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div id="app">
      <BgCanvas />

      {/* ── Mobile Top Bar (fixed, outside main-view flow) ── */}
      <header className="mobile-top-bar">
        <button className="mobile-hamburger" aria-label="Toggle menu"
          onClick={() => setIsMobileMenuOpen(v => !v)}
          onTouchEnd={e => { e.preventDefault(); setIsMobileMenuOpen(v => !v); }}>
          <svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" fill="none" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="3" y1="6"  x2="21" y2="6"/>
            <line x1="3" y1="12" x2="21" y2="12"/>
            <line x1="3" y1="18" x2="21" y2="18"/>
          </svg>
        </button>
        <div className="mobile-logo">
          <FaviconIcon style={{ width: '24px', height: '24px' }} />
          <span>MinePanel</span>
        </div>
        <div className="mobile-user-circle"
          onClick={() => setIsUserDropdownOpen(v => !v)}
          onTouchEnd={e => { e.preventDefault(); setIsUserDropdownOpen(v => !v); }}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block' }}>
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
          </svg>
        </div>
        {isUserDropdownOpen && (
          <>
            <div className="mobile-dropdown-backdrop"
              onClick={() => setIsUserDropdownOpen(false)}
              onTouchEnd={e => { e.preventDefault(); setIsUserDropdownOpen(false); }} />
            <div className="mobile-user-dropdown">
              <div className="dropdown-username">{user?.username || 'User'}</div>
              <button className="dropdown-item"
                onClick={() => { setIsUserDropdownOpen(false); navigate('/profile'); }}
                onTouchEnd={e => { e.preventDefault(); setIsUserDropdownOpen(false); navigate('/profile'); }}>My Account</button>
              <button className="dropdown-item"
                onClick={() => { setIsUserDropdownOpen(false); toggleTheme(); }}
                onTouchEnd={e => { e.preventDefault(); setIsUserDropdownOpen(false); toggleTheme(); }}>
                {themeMode === 'dark' ? 'Light Mode' : 'Dark Mode'}
              </button>
              <button className="dropdown-item dropdown-item-danger"
                onClick={handleLogout}
                onTouchEnd={e => { e.preventDefault(); handleLogout(); }}>Logout</button>
            </div>
          </>
        )}
      </header>

      {/* ── Mobile overlay behind drawer ── */}
      {isMobileMenuOpen && (
        <div className="mobile-overlay"
          onClick={() => setIsMobileMenuOpen(false)}
          onTouchEnd={e => { e.preventDefault(); setIsMobileMenuOpen(false); }} />
      )}

      {/* ── Main layout: sidebar + content ── */}
      <div id="main-view">

        <aside className={`sidebar${isMobileMenuOpen ? ' drawer-open' : ''}`} id="sidebar">
          <button className="sidebar-close-btn" aria-label="Close menu"
            onClick={() => setIsMobileMenuOpen(false)}
            onTouchEnd={e => { e.preventDefault(); setIsMobileMenuOpen(false); }}>
            &times;
          </button>

          <Link to="/panel" className="sidebar-brand" onClick={() => setIsMobileMenuOpen(false)}>
            <LogoIcon />
            <span>MinePanel</span>
          </Link>

          {/* SERVERS */}
          <div className="sidebar-section sidebar-section-servers">
            <div className="sidebar-section-title">
              <svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" fill="none" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <ellipse cx="12" cy="5" rx="9" ry="3"/>
                <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>
                <path d="M3 12c0 1.66 4 3 9 3s9-1.34 9-3"/>
              </svg>
              <span>SERVERS</span>
            </div>
            {servers.map(sv => {
              const pathSegment = `/server/${sv.id}/`;
              const active = location.pathname.startsWith(pathSegment);
              const status = sv.status || 'offline';
              return (
                <Link key={sv.id} to={`/server/${sv.id}/overview`}
                  className={`sidebar-item sidebar-server-item${active ? ' active' : ''}`}
                  onClick={() => setIsMobileMenuOpen(false)}>
                  <span className="sidebar-server-icon-wrap">
                    {sv.icon
                      ? <img className="sidebar-server-icon" src={sv.icon} alt="" />
                      : <svg className="sidebar-server-icon sidebar-server-icon-default" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <rect x="2" y="2" width="20" height="8" rx="2"/>
                          <rect x="2" y="14" width="20" height="8" rx="2"/>
                        </svg>
                    }
                  </span>
                  <span className="sidebar-server-name">{sv.name}</span>
                  <span className={`sidebar-server-dot ${status}`}></span>
                </Link>
              );
            })}
          </div>
          {isAdmin && (
            <div className="sidebar-section" style={{ borderTop: 'none', paddingTop: 0 }}>
              <Link to="/panel?action=create" className="sidebar-item sidebar-create" onClick={() => setIsMobileMenuOpen(false)}>
                <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/>
                </svg>
                Create Server
              </Link>
              <Link to="/panel?action=import" className="sidebar-item sidebar-add" onClick={() => setIsMobileMenuOpen(false)}>
                <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                </svg>
                Import Server
              </Link>
            </div>
          )}

          {/* GLOBAL */}
          <div className="sidebar-section">
            <div className="sidebar-section-title">
              <svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" fill="none" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              </svg>
              <span>GLOBAL</span>
            </div>
            <NavLink to="/users" className={({isActive}) => `sidebar-item${isActive?' active':''}`} onClick={() => setIsMobileMenuOpen(false)}>
              <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
              </svg>
              Users
            </NavLink>
            {isAdmin && (<>
              <NavLink to="/ranks" className={({isActive}) => `sidebar-item${isActive?' active':''}`} onClick={() => setIsMobileMenuOpen(false)}>
                <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                </svg>
                Ranks
              </NavLink>
              <NavLink to="/settings" className={({isActive}) => `sidebar-item${isActive?' active':''}`} onClick={() => setIsMobileMenuOpen(false)}>
                <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                </svg>
                Panel Settings
              </NavLink>
              <NavLink to="/discord" className={({isActive}) => `sidebar-item${isActive?' active':''}`} onClick={() => setIsMobileMenuOpen(false)}>
                <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                  <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
                </svg>
                Discord Bots
              </NavLink>
            </>)}
            <NavLink to="/docs" className={({isActive}) => `sidebar-item${isActive?' active':''}`} onClick={() => setIsMobileMenuOpen(false)}>
              <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/><line x1="9" y1="7" x2="15" y2="7"/><line x1="9" y1="11" x2="15" y2="11"/>
              </svg>
              Docs
            </NavLink>
          </div>


          {/* Footer */}
          <div className="sidebar-footer">
            <div className="sidebar-stats">
              <div className="sidebar-stat">
                <span className="sidebar-stat-label">CPU</span>
                <span className="sidebar-stat-value" id="sys-cpu">{metrics.cpu}</span>
              </div>
              <div className="sidebar-stat">
                <span className="sidebar-stat-label">RAM</span>
                <span className="sidebar-stat-value" id="sys-mem">{metrics.mem}</span>
              </div>
              <div className="sidebar-stat">
                <span className="sidebar-stat-label">TEMP</span>
                <span className="sidebar-stat-value" id="sys-temp">{metrics.temp}</span>
              </div>
            </div>
            <div className="sidebar-bottom-row">
              <div className="sidebar-user">
                <span id="sidebar-username">{user?.username || 'user'}</span>
              </div>
              <div className="sidebar-actions">
                <button className="icon-btn" title="My Account" onClick={() => { setIsMobileMenuOpen(false); navigate('/profile'); }}>
                  <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
                  </svg>
                </button>
                <button className="icon-btn" title="Toggle theme" onClick={toggleTheme}>
                  {themeMode === 'dark'
                    ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
                    : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
                  }
                </button>
                <button className="icon-btn" title="Logout" onClick={handleLogout}>
                  <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </aside>

        <main className="content-area" id="content-area">
          <div key={location.pathname.split('/')[1] || 'panel'} className="route-fade">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
