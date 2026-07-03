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
        📦
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
