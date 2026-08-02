# Configuration

## `.env` Reference

Read once at startup. Changes require a process restart.

| Variable | Default | Notes |
|---|---|---|
| `PORT` | `8082` | HTTP/HTTPS listen port |
| `SECRET_KEY` | — | **Required.** Signs all JWT tokens. |
| `JWT_EXPIRES_IN` | `24h` | Token lifetime |
| `ALLOWED_ORIGINS` | `*` | Comma-separated CORS whitelist |
| `RATE_LIMIT` | `100` | API requests/min per IP |
| `HTTPS` | `false` | Enable Node.js native TLS |
| `HTTPS_KEY` | `certs/key.pem` | TLS private key path |
| `HTTPS_CERT` | `certs/cert.pem` | TLS certificate path |
| `MC_RUN_AS_USER` | — (empty) | Linux only. Unprivileged user Minecraft server processes are de-escalated to when MinePanel itself runs as root. See [Running Server Processes Unprivileged](#running-server-processes-unprivileged). |

## Runtime Settings (UI)

**Global → Panel Settings** — writes to SQLite, takes effect immediately.

| Setting | Notes |
|---|---|
| Login cooldown | Seconds after exceeding max login attempts |
| Max login attempts | Brute-force threshold |
| API rate limit | Overrides `.env` value at runtime |
| FTP port | Global FTP service port |
| FTP enabled | Toggle without restarting |
| Default server RAM | Pre-fills Create Server form |
| Default server port | Pre-fills Create Server form |
| Max RAM per server | Upper bound on server creation/edit |

## HTTPS Setup

### Self-signed (dev / LAN)

```bash
mkdir certs
openssl req -x509 -newkey rsa:4096 \
  -keyout certs/key.pem -out certs/cert.pem \
  -days 365 -nodes -subj "/CN=localhost"
```

Set `HTTPS=true` in `.env`.

### Nginx (production — recommended)

```nginx
server {
    listen 443 ssl;
    server_name panel.example.com;

    ssl_certificate     /etc/letsencrypt/live/panel.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/panel.example.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:8082;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 0;   # required for large imports + WebSocket
    }
}
```

## Running Server Processes Unprivileged

If MinePanel itself runs as `root` (common on quick VPS installs — e.g. the
`systemd` unit below with no `User=` set), every Minecraft server it spawns
inherits that and also runs as root. You'll see this warning in the server
console:

```
YOU ARE RUNNING THIS SERVER AS AN ADMINISTRATIVE OR ROOT USER. THIS IS NOT ADVISED.
```

This means a plugin/mod exploit (RCE) on any single server would give an
attacker full root on the host. Fix it by creating a dedicated, unprivileged
user and pointing `MC_RUN_AS_USER` at it:

```bash
# 1. Create a system user with no login shell and no home directory
sudo useradd -r -M -s /usr/sbin/nologin mcserver

# 2. Point MinePanel at it
echo "MC_RUN_AS_USER=mcserver" | sudo tee -a /opt/minepanel/.env

# 3. Restart MinePanel (must still start as root so it CAN drop privileges)
sudo systemctl restart minepanel
```

On the next start of each server, MinePanel automatically:
1. `chown -R`'s that server's directory to `mcserver` (skipped on later
   starts once ownership is already correct, so it stays fast even for large
   worlds).
2. Spawns the Java/Bedrock/PocketMine process with `uid`/`gid` set to
   `mcserver` — the same mechanism `sudo -u` uses under the hood.

Verify it worked:

```bash
ps -eo user,pid,cmd | grep java   # should show "mcserver", not "root"
```

**Notes:**
- Windows and non-root installs (Docker, a normal `User=minepanel` systemd
  unit, etc.) are unaffected — `MC_RUN_AS_USER` is a no-op there, since
  there's no root privilege to drop in the first place.
- If you upload files as root via the panel's File Manager while a server is
  stopped, those specific files stay root-owned until the next full
  `chown -R` (i.e. until server ownership needs re-syncing). This normally
  isn't an issue since the panel process itself performs file writes.
- Leaving `MC_RUN_AS_USER` unset while MinePanel runs as root logs a warning
  on every server start (`[ProcessManager] ... server processes will run as
  ROOT`) but does not block startup, to avoid breaking existing installs.

## Running as a Service

### systemd (Linux)

```ini
[Unit]
Description=MinePanel
After=network.target

[Service]
Type=simple
User=minepanel
WorkingDirectory=/opt/minepanel
ExecStart=/usr/bin/node src/index.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
systemctl daemon-reload && systemctl enable --now minepanel
```

### PM2

```bash
npm install -g pm2
pm2 start src/index.js --name minepanel
pm2 save && pm2 startup
```

### Windows Task Scheduler

Use `python setup.py` → **1 · Install MinePanel** to register automatically.
