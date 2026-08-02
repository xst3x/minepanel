import { useState } from 'react';

/**
 * Modpack/project icon with CDN proxy cache and fallback placeholder.
 */
export default function ModpackIcon({ url, alt = '', className = 'plugin-icon', size = 30 }) {
  const [failed, setFailed] = useState(false);

  if (!url || failed) {
    return (
      <div
        className={className}
        style={{
          width: size,
          height: size,
          background: 'var(--bg-input)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: size > 40 ? '1.6rem' : '1.1rem',
          flexShrink: 0,
        }}
        aria-hidden="true"
      >
        <svg viewBox="0 0 24 24" width={size > 40 ? 22 : 16} height={size > 40 ? 22 : 16} stroke="currentColor" fill="none" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.55 }}>
          <path d="M21 8l-9-5-9 5v8l9 5 9-5V8z"/>
          <path d="M3 8l9 5 9-5"/>
          <path d="M12 13v8"/>
        </svg>
      </div>
    );
  }

  const proxied = url.startsWith('https://cdn.modrinth.com/')
    ? `/api/modpacks/icon?url=${encodeURIComponent(url)}`
    : url;

  return (
    <img
      src={proxied}
      className={className}
      alt={alt}
      style={{ width: size, height: size, flexShrink: 0 }}
      onError={() => setFailed(true)}
    />
  );
}
