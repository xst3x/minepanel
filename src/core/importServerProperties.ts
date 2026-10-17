import fs = require('fs');
import path = require('path');
import { randomUUID } from 'crypto';
import { Transform } from 'stream';
import { pipeline } from 'stream/promises';
import { requireDiskSpace } from './importResources';

/** Replace the first server-port line with bounded memory, even if an imported
 * properties file contains a multi-gigabyte line without any newline. */
export async function setImportedServerPort(serverDir: string, port: number, signal?: AbortSignal) {
    const source = path.join(serverDir, 'server.properties');
    let size: number;
    try { size = (await fs.promises.stat(source)).size; }
    catch (error) {
        if (error.code !== 'ENOENT') throw error;
        await fs.promises.writeFile(source, `server-port=${port}\n`, { flag: 'wx', signal });
        return;
    }
    await requireDiskSpace(serverDir, size + 32);
    const temporary = path.join(serverDir, `.import-properties-${randomUUID()}`);
    const key = Buffer.from('server-port=');
    let matched = 0;
    let lineStart = true;
    let replaced = false;
    let dropping = false;
    const replace = new Transform({
        transform(chunk: Buffer, _encoding, callback) {
            let position = 0;
            while (position < chunk.length) {
                if (dropping) {
                    const newline = chunk.indexOf(10, position);
                    const carriage = chunk.indexOf(13, position);
                    const end = newline < 0 ? carriage : carriage < 0 ? newline : Math.min(newline, carriage);
                    if (end < 0) break;
                    dropping = false;
                    position = end;
                }
                if (replaced) { this.push(chunk.subarray(position)); break; }
                if (lineStart) {
                    if (chunk[position] === key[matched]) {
                        matched++;
                        position++;
                        if (matched === key.length) {
                            this.push(Buffer.from(`server-port=${port}`));
                            matched = 0;
                            replaced = true;
                            dropping = true;
                        }
                        continue;
                    }
                    if (matched) this.push(key.subarray(0, matched));
                    matched = 0;
                    lineStart = false;
                }
                const lf = chunk.indexOf(10, position);
                const cr = chunk.indexOf(13, position);
                const newline = lf < 0 ? cr : cr < 0 ? lf : Math.min(lf, cr);
                const end = newline < 0 ? chunk.length : newline + 1;
                this.push(chunk.subarray(position, end));
                position = end;
                lineStart = newline >= 0;
            }
            callback();
        },
        flush(callback) {
            if (matched) this.push(key.subarray(0, matched));
            if (!replaced) this.push(Buffer.from(`\nserver-port=${port}\n`));
            callback();
        },
    });
    try {
        await pipeline(fs.createReadStream(source), replace, fs.createWriteStream(temporary, { flags: 'wx', mode: 0o600 }), { signal });
        await fs.promises.rename(temporary, source);
    } finally { await fs.promises.rm(temporary, { force: true }); }
}
