export function validImportSize(bytes: number): boolean {
  return Number.isSafeInteger(bytes) && bytes > 0;
}

export function importProgress(event: Pick<ProgressEvent, 'loaded' | 'total' | 'lengthComputable'>, started: number, now: number) {
  const loaded = Number.isSafeInteger(event.loaded) && event.loaded >= 0 ? event.loaded : 0;
  const total = event.lengthComputable && validImportSize(event.total) ? event.total : null;
  const pct = total ? Math.min(100, Math.round((loaded / total) * 100)) : 0;
  const speed = now > started ? loaded * 1000 / (now - started) : 0;
  return { label: total !== null && loaded >= total ? 'Extracting & configuring...' : 'Uploading...', pct, loaded, total, speed };
}

export function formatImportBytes(bytes: number): string {
  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB'];
  const index = bytes > 0 ? Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1) : 0;
  return `${(bytes / 1024 ** index).toFixed(index ? 2 : 0)} ${units[index]}`;
}
