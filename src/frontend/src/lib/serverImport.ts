import { createUploadRequest, extractApiErrorMessage, getToken } from './api';
import { withBasePath } from './basePath';
import { formatImportBytes, importProgress, validImportSize } from './importProgress';
import { toast, toastProgress } from '../components/Toast';

export type ServerImport = {
  file: File; name: string; software: string; version: string;
  ram: string | number; port: string | number; root: string;
};

// The request belongs to the application, not to either modal or routed page.
// Closing a modal or navigating within MinePanel must not abort the upload.
const activeImports = new Set<XMLHttpRequest>();
const warnBeforeUnload = (event: BeforeUnloadEvent) => {
  event.preventDefault();
  event.returnValue = '';
};

export function startServerImport(input: ServerImport): boolean {
  const { file, name, software, version, ram, port, root } = input;
  const invalid = !file ? 'Please select a .zip archive first.'
    : !validImportSize(file.size) ? 'Please select a nonempty archive with a supported file size.'
    : !(file.name.toLowerCase().endsWith('.zip') || file.type === 'application/zip') ? 'Only .zip archives are accepted.'
    : !name.trim() ? 'Server name is required.'
    : !version ? 'Minecraft version is required.'
    : root.includes('..') ? 'Server root path cannot contain "..".'
    : !Number.isInteger(Number(ram)) || Number(ram) < 512 || Number(ram) > 16384 ? 'RAM must be between 512 and 16384 MB.'
    : !Number.isInteger(Number(port)) || Number(port) < 1024 || Number(port) > 65535 ? 'Port must be between 1024 and 65535.' : null;
  if (invalid) { toast(invalid, 'error'); return false; }
  const xhr = createUploadRequest();
  if (!xhr) return false;
  const notification = toastProgress(`Importing server "${name}"`);
  notification.update({ detail: 'Starting upload...', progress: 0 });
  let finished = false;
  let uploadComplete = false;
  const finish = (error?: string) => {
    if (finished) return;
    finished = true;
    activeImports.delete(xhr);
    if (!activeImports.size) window.removeEventListener('beforeunload', warnBeforeUnload);
    xhr.upload.onprogress = null;
    xhr.upload.onload = null;
    xhr.onload = xhr.onerror = xhr.onabort = xhr.ontimeout = null;
    if (error) notification(`Import of "${name}" failed: ${error}`);
    else {
      notification(null, `Server "${name}" imported successfully.`);
      window.dispatchEvent(new Event('mp:server-status-changed'));
    }
  };
  const extracting = () => {
    uploadComplete = true;
    notification.update({ progress: null, detail: 'Upload complete · Extracting and configuring server...' });
  };
  try {
    const form = new FormData();
    form.append('archive', file, file.name);
    form.append('name', name);
    form.append('port', String(port));
    form.append('software', software);
    form.append('version', version);
    form.append('ram_mb', String(ram));
    form.append('root_path', root);
    xhr.open('POST', withBasePath('/api/servers/import'));
    const token = getToken();
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.timeout = 0;
    const started = performance.now();
    xhr.upload.onprogress = event => {
      if (finished || uploadComplete) return;
      const progress = importProgress(event, started, performance.now());
      if (progress.total !== null && progress.loaded >= progress.total) { extracting(); return; }
      notification.update({ progress: progress.total === null ? null : progress.pct,
        detail: `Uploading${progress.total !== null ? ` ${progress.pct}%` : ''} · ${formatImportBytes(progress.loaded)}${progress.total !== null ? ` / ${formatImportBytes(progress.total)}` : ''} · ${formatImportBytes(progress.speed)}/s` });
    };
    xhr.upload.onload = extracting;
    xhr.onload = () => {
      let data;
      try { data = JSON.parse(xhr.responseText); }
      catch { finish(`The server returned an unexpected response (HTTP ${xhr.status}). Check the server logs.`); return; }
      if (xhr.status >= 200 && xhr.status < 300) { finish(); return; }
      // Import middleware errors have { error: CODE, message: readableReason }.
      // Prefer the reason so the user sees disk/ZIP/permission errors, not a code.
      const reason = [data?.detail, data?.details, data?.message].find(value => typeof value === 'string' && value.trim());
      finish(reason || extractApiErrorMessage(data, xhr.status));
    };
    xhr.onerror = () => finish('The connection was lost. Check your connection and server logs before retrying.');
    xhr.ontimeout = () => finish('The request timed out. Check the server logs before retrying.');
    xhr.onabort = () => finish('The upload was interrupted.');
    activeImports.add(xhr);
    if (activeImports.size === 1) window.addEventListener('beforeunload', warnBeforeUnload);
    xhr.send(form);
    return true;
  } catch (error) {
    finish(error instanceof Error ? error.message : 'Could not start the upload.');
    return false;
  }
}
