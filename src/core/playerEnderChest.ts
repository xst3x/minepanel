import fs = require('fs');
import path = require('path');
import zlib = require('zlib');
import crypto = require('crypto');
import { promisify } from 'util';

const gunzip = promisify(zlib.gunzip);
const gzip = promisify(zlib.gzip);
const MAX_BYTES = 64 * 1024 * 1024;

// Replace only the root EnderItems list. Other NBT payloads remain byte-for-byte
// identical, including unknown item components, inventory, position and vitals.
export function emptyEnderItems(buf: Buffer): Buffer {
  let pos = 0;
  let start = -1;
  let end = -1;
  const take = (size: number) => {
    if (!Number.isSafeInteger(size) || size < 0 || pos + size > buf.length) throw new Error('Invalid player NBT data.');
    const offset = pos; pos += size; return offset;
  };
  const byte = () => buf[take(1)];
  const name = () => { const size = buf.readUInt16BE(take(2)); return buf.subarray(take(size), pos).toString('utf8'); };
  const count = () => { const n = buf.readInt32BE(take(4)); if (n < 0) throw new Error('Invalid NBT array length.'); return n; };
  function payload(type: number, depth: number) {
    if (depth > 64) throw new Error('Player NBT nesting is too deep.');
    if (type >= 1 && type <= 6) { take([0, 1, 2, 4, 8, 4, 8][type]); return; }
    if (type === 7) { take(count()); return; }
    if (type === 8) { name(); return; }
    if (type === 9) {
      const itemType = byte(); const length = count();
      if (itemType > 12 || (itemType === 0 && length !== 0) || length > buf.length - pos) throw new Error('Invalid NBT list.');
      for (let i = 0; i < length; i++) payload(itemType, depth + 1);
      return;
    }
    if (type === 10) {
      while (true) { const tag = byte(); if (tag === 0) break; name(); payload(tag, depth + 1); }
      return;
    }
    if (type === 11 || type === 12) { take(count() * (type === 11 ? 4 : 8)); return; }
    throw new Error('Invalid NBT tag type.');
  }
  if (byte() !== 10) throw new Error('Player data must be a root NBT compound.');
  name();
  while (true) {
    const tag = byte();
    if (tag === 0) break;
    const key = name(); const payloadStart = pos;
    payload(tag, 1);
    if (key === 'EnderItems') {
      if (tag !== 9 || start !== -1) throw new Error('Invalid EnderItems list.');
      start = payloadStart; end = pos;
    }
  }
  if (pos !== buf.length) throw new Error('Unexpected trailing player NBT data.');
  const empty = Buffer.from([10, 0, 0, 0, 0]); // TAG_Compound list with zero entries
  if (start !== -1) return Buffer.concat([buf.subarray(0, start), empty, buf.subarray(end)]);
  const tagName = Buffer.from('EnderItems');
  const header = Buffer.alloc(3); header[0] = 9; header.writeUInt16BE(tagName.length, 1);
  return Buffer.concat([buf.subarray(0, pos - 1), header, tagName, empty, Buffer.from([0])]);
}

function inside(root: string, target: string) {
  const relative = path.relative(root, target);
  return relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative);
}

export async function clearPlayerEnderChest(serverDir: string, uuid: string) {
  const normalized = String(uuid).replace(/-/g, '');
  if (!/^[0-9a-f]{32}$/i.test(normalized)) throw new Error('A valid player UUID is required.');
  const dashed = normalized.replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5');
  const root = await fs.promises.realpath(serverDir);
  // Respect vanilla's configured world directory instead of assuming "world".
  let levelName = 'world';
  try {
    const properties = await fs.promises.readFile(path.join(root, 'server.properties'), 'utf8');
    const configured = properties.match(/^\s*level-name\s*[=:]\s*(.*?)\s*$/m);
    if (configured) levelName = configured[1] || 'world';
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const directory = await fs.promises.realpath(path.resolve(root, levelName, 'playerdata'));
  if (!inside(root, directory)) throw new Error('Player data must stay inside the server directory.');
  let file: string;
  for (const filename of [`${dashed}.dat`, `${normalized}.dat`]) {
    try { file = await fs.promises.realpath(path.join(directory, filename)); break; }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  if (!file) { const error = new Error('Player data not found.') as NodeJS.ErrnoException; error.code = 'ENOENT'; throw error; }
  if (!inside(directory, file)) throw new Error('Player data file must stay inside its directory.');
  const originalStat = await fs.promises.stat(file);
  if (!originalStat.isFile() || originalStat.size > MAX_BYTES) throw new Error('Invalid player data file.');
  const compressed = await fs.promises.readFile(file);
  const data = await gunzip(compressed, { maxOutputLength: MAX_BYTES });
  const updated = await gzip(emptyEnderItems(data));
  const temporary = path.join(directory, `.${dashed}.${crypto.randomUUID()}.tmp`);
  try {
    const handle = await fs.promises.open(temporary, 'wx', originalStat.mode);
    try { await handle.writeFile(updated); await handle.sync(); } finally { await handle.close(); }
    await fs.promises.rename(temporary, file);
  } finally {
    await fs.promises.unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; });
  }
}
