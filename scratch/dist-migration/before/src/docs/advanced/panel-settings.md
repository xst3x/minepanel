---
type: doc
title: Panel Settings
category: advanced
order: 1
---

# Panel Settings

## .env Reference

| Variable | Default | Notes |
|---|---|---|
| `PORT` | `8082` | HTTP/HTTPS listen port |
| `SECRET_KEY` | — | Required. Signs JWT tokens. Use a long random string. |
| `JWT_EXPIRES_IN` | `24h` | JWT token lifetime |
| `ALLOWED_ORIGINS` | `*` | Comma-separated CORS whitelist. Set to your actual domain(s) in production. |
| `RATE_LIMIT` | `100` | API requests/min per IP. Import endpoint is exempt. |
| `HTTPS` | `false` | Enable TLS directly in Node. Use Nginx in production instead. |
| `HTTPS_KEY` | `certs/key.pem` | Path to TLS private key |
| `HTTPS_CERT` | `certs/cert.pem` | Path to TLS certificate |

## CLI Flags

Flags passed directly to the Node process at startup. They override no `.env` values — they are additive options.

| Flag | Default | Description |
|---|---|---|
| `--show-requests` | off | Log every HTTP request (method, URL, IP, status, duration). Useful for debugging. Off by default to keep logs clean. |

### Usage

```bash
# Normal startup — only errors and startup messages are logged
node src/minepanel.js

# Debug mode — all HTTP requests are logged to stdout
node src/minepanel.js --show-requests
```

### With PM2

```bash
pm2 start src/minepanel.js --name minepanel -- --show-requests
```

### With systemd

```ini
ExecStart=/usr/bin/node src/minepanel.js --show-requests
```

> **Tip:** Leave `--show-requests` off in production. Use it temporarily when tracing an issue, then restart without it.

## Runtime Settings (UI)

Global → Panel Settings writes to the `settings` table in SQLite — changes take effect immediately without a restart.

| Key | Notes |
|---|---|
| Login cooldown | Seconds a user must wait after exceeding max login attempts |
| Max login attempts | Threshold before the cooldown kicks in |
| API rate limit | Overrides the `.env` value at runtime |
| FTP port | Port for the global FTP service (not per-server FTP) |
| FTP enabled | Toggle the FTP service on/off without restarting |
| Default server RAM | Pre-fills the RAM field on the Create Server form |
| Default server port | Pre-fills the port field |
| Max RAM per server | Upper bound enforced during server creation/edit |

## HTTPS Setup

### Self-signed (dev / LAN)

```bash
mkdir certs
openssl req -x509 -newkey rsa:4096 \
  -keyout certs/key.pem -out certs/cert.pem \
  -days 365 -nodes -subj "/CN=localhost"
```

Set `HTTPS=true` in `.env`. Browsers will warn about the self-signed cert.

### Nginx reverse proxy (production)

```nginx
server {
    listen 443 ssl;
    server_name panel.example.com;
    ssl_certificate     /etc/letsencrypt/.../fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/.../privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:8082;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 0;
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

### PM2

```bash
npm install -g pm2
pm2 start src/index.js --name minepanel
pm2 save && pm2 startup
```
