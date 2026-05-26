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
