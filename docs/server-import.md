# Large server imports

`POST /api/servers/import` retains its multipart fields (`archive`, `name`,
`software`, `version`, `ram_mb`, `port`, `root_path`) and success response. JWT
authentication and the existing global `server.create` permission run before
the upload consumes disk. Both import dialogs use the existing backend provider.

## Root cause and inspection

Before commit `c12d595`, `serverManagementRoutes.ts` constructed `adm-zip` with
the uploaded filename. Its constructor calls `fs.readFileSync`, which hits
Node's 2 GiB whole-file read limit (`ERR_FS_FILE_TOO_LARGE`). `zip.readFile(entry)`
also buffered each expanded file. The old Multer configuration independently
capped uploads at **50 GiB**, not 2 GiB. Uploads already used disk storage.

Commit `c12d595` was already present when this investigation started. It removed
the 50 GiB cap and switched to `node-stream-zip`, so there was no remaining 2 GiB
frontend or Multer validation to remove in this checkout. The additional work
here completes error handling, resource bounds, archive validation and tests.
No dependency was added.

## Implementation map

- `src/frontend/src/components/GlobalServerModals.tsx` and
  `src/frontend/src/pages/Panel.tsx`: ZIP selection, multipart upload and progress.
  `src/frontend/src/lib/importProgress.ts` validates safe positive byte counts
  and computes percentages and average transfer speed without bitwise coercion.
- `src/routes/modules/serverManagementRoutes.ts`: authorization, field validation,
  database record, server lock, extraction, existing fresh-binary installation,
  response and rollback. Only a newly created destination can be deleted on failure.
- `src/middleware/serverImportUpload.ts`: Multer with a backpressured disk pipeline,
  cancellation, private temporary files and cleanup. The old upload configuration
  was removed from `src/routes/modules/serverHelpers.ts`.
- `src/core/importResources.ts`: safe byte arithmetic, BigInt disk checks and
  enforcement of actual streamed byte counts.
- `src/core/serverImportArchive.ts`: ZIP/ZIP64 footer preflight, bounded metadata
  parsing using the existing dependency, path/type validation, and sequential
  file-range → inflate → size/checksum verification → disk pipelines. Every
  pipeline stage is destroyed on failure or cancellation. CRC verification also
  covers archives using data descriptors.
- `src/core/importServerProperties.ts`: updates the port with bounded memory,
  including when an imported properties file contains an extremely long line.
- `src/minepanel.ts` already disables the HTTP/HTTPS request timeout and exempts
  the import route from the global rate limiter. Those existing settings are unchanged.

## Capacity and security

There is no fixed compressed or extracted payload-size cap. Sizes and offsets
must be nonnegative safe integers (up to `Number.MAX_SAFE_INTEGER` bytes, roughly
8 PiB). ZIP64 is required where the ZIP format's 32-bit fields are insufficient.
Disk-capacity multiplication and aggregate extracted sizes use BigInt.

Temporary archives live in `SERVERS_DIR/.imports/upload-*/archive.zip`, on the
server storage volume rather than a potentially memory-backed OS temporary
directory. Capacity must cover the uploaded ZIP, selected expanded files, fresh
server software, and an extra copy of `server.properties` during its atomic
update. Disk checks retain 256 MiB of headroom and repeat every 64 MiB of streamed
data. `ENOSPC` is still handled if another process consumes space between checks.

Resource protections are separate from payload size: two concurrent imports per
Node process, at most 100,000 ZIP entries and 32 MiB of central-directory metadata,
and at most 1000:1 expansion per entry. Multipart fields are bounded separately.
Exceeding these protections produces an error; these limits do not cap a normal
10, 50, 100 GiB or larger server archive by its byte size. Symlinks, special files,
traversal, Windows device names/alternate streams, duplicate output files,
encryption, unsupported compression and malformed ZIP64 offsets are rejected.

World detection, the data/config allowlist and fresh server-binary downloads are
preserved. No uploaded server binary is executed during import. A failed import
removes its new database record, new server directory and temporary archive.
Disconnects cancel upload/extraction; if an existing shared download/installer
is already running, rollback follows its settlement. Hard process termination
cannot execute cleanup; leftover `.imports/upload-*` folders can be removed
after stopping MinePanel and confirming that no other instance uses them.

Upload progress reports multipart bytes (including framing), total bytes when
the browser supplies them, actual upload percentage and average bytes/second.
At upload completion the dialog explicitly switches to extraction/configuration.
Extraction has no invented percentage or new polling/WebSocket API.

## Verification

```sh
npm run compile
npm run typecheck:frontend
npx jest --config jest.backend.config.cjs --runInBand --detectOpenHandles tests/serverImport.test.ts tests/serverImportRoute.test.ts tests/server.test.ts
npm run test:frontend
npm run build --workspace minepanel-frontend
```

Tests cover the existing multipart API with real authentication/permissions and
SQLite, ZIP64 imports, preserved contents, rollback, real HTTP disconnects,
concurrency, disk exhaustion/write errors, corruption, malicious paths, bombs,
metadata bounds, safe-number boundaries, progress and properties stream boundaries.
A tiny virtual ZIP64 fixture places its headers and payload at a **100 GiB file
offset** and exercises the real metadata parser and extraction path. Large
declared sizes and counter boundary tests require no huge allocation or disk file.
This is not a claim that a real 100 GiB browser transfer has been performed.

Rebuild and restart the deployed backend to load these changes; rebuild the
frontend to serve the updated progress display. Local tests do not verify a
remote deployment or the browser's behavior over a multi-hour transfer.
