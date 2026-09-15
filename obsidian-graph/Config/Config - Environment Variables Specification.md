---
title: "Config - Environment Variables Specification"
type: "config"
layer: "core"
source: "src/config.ts"
tags:
  - minepanel
  - core
  - config
---

# Configuration: Environment Variables Specification

Documents all recognized environment variables parsed by [[Config Module]] and `.env`:

| Variable | Type | Default | Description |
|---|---|---|---|
| `PORT` | Number | `8082` | Primary web server port |
| `HTTPS` | Boolean | `false` | Enable native TLS server |
| `HTTPS_KEY` | Path | `certs/key.pem` | SSL Private Key path |
| `HTTPS_CERT` | Path | `certs/cert.pem` | SSL Certificate path |
| `JWT_SECRET` | String | Auto-generated | Secret for signing auth tokens |
| `DATA_DIR` | Path | `data/` | Custom directory for DB and avatars |
| `METRICS_AUTH` | Boolean | `true` | Require JWT for `/metrics` |
| `LAUNCHER_PORT` | Number | Auto | Supervisor protocol port |
| `LAUNCHER_TOKEN` | String | Auto | Supervisor authentication token |
| `ALLOWED_ORIGINS`| Array | `['*']` | CORS allowed origin domains |

## Relationships
- Parsed by: [[Config Module]], [[Environment Helper]]
