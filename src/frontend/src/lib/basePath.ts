// Express injects the active installation path into <base>. Static demo builds
// receive it from VITE_BASE_PATH. Never derive it from the current SPA route.
export function getBasePath(): string {
  const href = document.querySelector('base')?.getAttribute('href') || '/';
  return new URL(href, window.location.origin).pathname.replace(/\/?$/, '/');
}

export function withBasePath(url: string): string {
  if (!url || !url.startsWith('/') || url.startsWith('//')) return url;
  return getBasePath().slice(0, -1) + url;
}
