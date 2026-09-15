---
title: "Implementation_Guide_Top5"
type: "plan"
tags:
  - #plan
  - #architecture
---

# Implementation_Guide_Top5

> Internal development plan for [[Project]].

# 🚀 IMPLEMENTATION GUIDES - TOP 7 IMPROVEMENTS

---

## 1️⃣ PROMETHEUS METRICS (4-6 ORE)

### Step 1: Install dependency
```bash
npm install prom-client --save
```

### Step 2: Create metrics module

```javascript
// src/core/metrics/collector.js
const client = require('prom-client');

class MetricsCollector {
  constructor() {
    // Default metrics (CPU, Memory, etc.)
    client.collectDefaultMetrics({ prefix: 'minepanel_' });

    // Custom metrics
    this.uptime = new client.Gauge({
      name: 'minepanel_uptime_seconds',
      help: 'MinePanel uptime in seconds'
    });

    this.serverCount = new client.Gauge({
      name: 'minepanel_servers_total',
      help: 'Total number of servers'
    });

    this.serverStatus = new client.Gauge({
      name: 'minepanel_server_status',
      help: 'Server status (1=running, 0=stopped)',
      labelNames: ['server_id', 'server_name']
    });

    this.serverPlayers = new client.Gauge({
      name: 'minepanel_server_players',
      help: 'Number of players on server',
      labelNames: ['server_id', 'server_name']
    });

    this.serverCpu = new client.Gauge({
      name: 'minepanel_server_cpu_percent',
      help: 'CPU usage percentage',
      labelNames: ['server_id']
    });

    this.serverMemory = new client.Gauge({
      name: 'minepanel_server_memory_mb',
      help: 'Memory usage in MB',
      labelNames: ['server_id']
    });

    this.serverTps = new client.Gauge({
      name: 'minepanel_server_tps',
      help: 'Ticks per second',
      labelNames: ['server_id']
    });

    this.backupCount = new client.Counter({
      name: 'minepanel_backups_total',
      help: 'Total backups created',
      labelNames: ['server_id']
    });

    this.apiRequests = new client.Counter({
      name: 'minepanel_api_requests_total',
      help: 'Total API requests',
      labelNames: ['method', 'endpoint', 'status']
    });

    this.apiDuration = new client.Histogram({
      name: 'minepanel_api_duration_ms',
      help: 'API request duration in milliseconds',
      labelNames: ['method', 'endpoint'],
      buckets: [10, 50, 100, 500, 1000, 5000]
    });

    setInterval(() => this.updateMetrics(), 10000); // Update every 10s
  }

  updateMetrics() {
    this.uptime.set(process.uptime());
  }

  recordRequest(method, endpoint, status, duration) {
    this.apiRequests.inc({ method, endpoint, status });
    this.apiDuration.observe({ method, endpoint }, duration);
  }

  getMetrics() {
    return client.register.metrics();
  }
}

module.exports = new MetricsCollector();
```

### Step 3: Add metrics endpoint

```javascript
// src/index.js - ADD THIS
const metricsCollector = require('./core/metrics/collector');
const prometheus = require('prom-client');

// Metrics endpoint
app.get('/metrics', (req, res) => {
  res.set('Content-Type', prometheus.register.contentType);
  res.end(metricsCollector.getMetrics());
});

// Middleware to track API requests
app.use((req, res, next) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    metricsCollector.recordRequest(
      req.method,
      req.path,
      res.statusCode,
      duration
    );
  });
  
  next();
});
```

### Step 4: Update server metrics

```javascript
// src/core/processManager.js - ADD TO GETALL METHOD
const metricsCollector = require('./metrics/collector');

getAll() {
  const servers = this.servers.values();
  metricsCollector.serverCount.set(servers.length);
  
  servers.forEach(server => {
    metricsCollector.serverStatus.set(
      { server_id: server.id, server_name: server.name },
      server.isRunning ? 1 : 0
    );
    
    metricsCollector.serverPlayers.set(
      { server_id: server.id, server_name: server.name },
      server.players.length || 0
    );
    
    const stats = server.getStats();
    metricsCollector.serverCpu.set({ server_id: server.id }, stats.cpu);
    metricsCollector.serverMemory.set({ server_id: server.id }, stats.memory);
    metricsCollector.serverTps.set({ server_id: server.id }, stats.tps);
  });
  
  return servers;
}
```

### Step 5: Test it
```bash
curl http://localhost:8082/metrics
```

**Expected output:**
```
# HELP minepanel_uptime_seconds MinePanel uptime in seconds
# TYPE minepanel_uptime_seconds gauge
minepanel_uptime_seconds 3600

# HELP minepanel_servers_total Total number of servers
# TYPE minepanel_servers_total gauge
minepanel_servers_total 3

# HELP minepanel_server_players Number of players on server
# TYPE minepanel_server_players gauge
minepanel_server_players{server_id="srv1",server_name="Main"} 5
...
```

---

## 2️⃣ DOCKER SUPPORT (2-4 ORE)

### Step 1: Create Dockerfile

```dockerfile
# Dockerfile
FROM node:18-alpine

WORKDIR /app

# Install Java and Python (for server JAR and setup)
RUN apk add --no-cache openjdk21-jre python3 py3-pip git

# Copy package files
COPY package*.json ./

# Install Node dependencies
RUN npm ci --omit=dev

# Copy source
COPY . .

# Create necessary directories
RUN mkdir -p servers data cache backups logs

# Expose main port + range for Minecraft servers
EXPOSE 8082
EXPOSE 9000-10000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8082/api/system', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

CMD ["npm", "start"]
```

### Step 2: Create docker-compose.yml

```yaml
# docker-compose.yml
version: '3.8'

services:
  minepanel:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: minepanel
    restart: unless-stopped
    
    ports:
      - "8082:8082"           # MinePanel web UI
      - "9000-10000:9000-10000"  # Minecraft server ports
    
    volumes:
      - ./servers:/app/servers       # Server data
      - ./data:/app/data             # Database
      - ./cache:/app/cache           # JAR cache
      - ./backups:/app/backups       # Backups
      - ./logs:/app/logs             # Logs
      - ./.env:/app/.env             # Config
    
    environment:
      - NODE_ENV=production
      - TZ=UTC
      # Add these from your .env:
      # - JWT_SECRET=your-secret-here
      # - PORT=8082
      # - ALLOWED_ORIGINS=*
    
    networks:
      - minecraft
    
    # Optional: for Nginx reverse proxy
    labels:
      - "com.example.description=MinePanel Minecraft Server Management"

networks:
  minecraft:
    driver: bridge
```

### Step 3: Optional - Nginx reverse proxy

```yaml
# docker-compose.yml - ADD nginx service
  nginx:
    image: nginx:alpine
    container_name: minepanel_nginx
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - ./certs:/etc/nginx/certs:ro
    networks:
      - minecraft
    depends_on:
      - minepanel
```

```nginx
# nginx.conf
upstream minepanel {
    server minepanel:8082;
}

server {
    listen 80;
    server_name localhost;
    
    client_max_body_size 500M;
    
    location / {
        proxy_pass http://minepanel;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### Step 4: Build and run

```bash
docker-compose build
docker-compose up -d
docker-compose logs -f minepanel
```

### Step 5: Verify

```bash
docker ps                           # Check running containers
docker exec minepanel npm test      # Run tests
curl http://localhost:8082          # Check web UI
curl http://localhost:8082/metrics  # Check metrics
```

---

## 3️⃣ HTTPS + LET'S ENCRYPT (4-6 ORE)

### Step 1: Install dependency

```bash
npm install greenlock-express --save
```

### Step 2: Create HTTPS manager

```javascript
// src/core/https/manager.js
const greenlock = require('greenlock-express');
const path = require('path');
const fs = require('fs');

class HttpsManager {
  static async initialize(domain, email) {
    const configDir = path.join(__dirname, '../../certs');
    
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }

    const gl = greenlock.create({
      email: email,
      agreeTos: true,
      configDir: configDir,
      
      domains: [domain],
      
      app: require('express')(),
      
      renew: 80,
      secure: 443,
      
      // Test mode - remove for production
      staging: process.env.NODE_ENV !== 'production'
    });

    return gl;
  }
}

module.exports = HttpsManager;
```

### Step 3: Update main server setup

```javascript
// src/index.js - REPLACE HTTP SETUP
const HttpsManager = require('./core/https/manager');
const CONFIG = require('./config');

let server;

(async () => {
  if (CONFIG.HTTPS_ENABLED && CONFIG.DOMAIN) {
    try {
      const gl = await HttpsManager.initialize(
        CONFIG.DOMAIN,
        CONFIG.EMAIL || 'admin@' + CONFIG.DOMAIN
      );
      
      server = gl.listen(80, 443);
      console.log(`[HTTPS] Server running on ${CONFIG.DOMAIN}`);
    } catch (err) {
      console.error('[HTTPS] Initialization failed:', err);
      // Fallback to HTTP
      server = http.createServer(app);
      server.listen(CONFIG.PORT);
    }
  } else {
    server = http.createServer(app);
    server.listen(CONFIG.PORT, () => {
      console.log(`[HTTP] Server running on port ${CONFIG.PORT}`);
    });
  }
})();
```

### Step 4: Update .env

```env
HTTPS_ENABLED=true
DOMAIN=minepanel.example.com
EMAIL=admin@example.com
```

### Step 5: For Docker

```dockerfile
# In Dockerfile, add certbot
RUN apk add --no-cache certbot certbot-nginx

# Add renewal script
COPY scripts/renew-certs.sh /etc/periodic/daily/
RUN chmod +x /etc/periodic/daily/renew-certs.sh
```

```bash
#!/bin/sh
# scripts/renew-certs.sh
certbot renew --non-interactive --quiet
```

---

## 4️⃣ BACKUP ENCRYPTION (6-8 ORE)

### Step 1: Install crypto library (built-in Node.js)

```javascript
// src/core/backup/encryption.js
const crypto = require('crypto');
const fs = require('fs');

class BackupEncryption {
  constructor(secretKey) {
    // Derive encryption key using PBKDF2
    this.masterKey = crypto.pbkdf2Sync(
      secretKey,
      'minepanel-backup-salt-v1',
      100000,
      32,
      'sha256'
    );
  }

  encryptFile(inputPath, outputPath) {
    return new Promise((resolve, reject) => {
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipheriv('aes-256-gcm', this.masterKey, iv);
      
      const input = fs.createReadStream(inputPath);
      const output = fs.createWriteStream(outputPath);
      
      // Write IV first (needed for decryption)
      output.write(iv);
      
      input.pipe(cipher).pipe(output);
      
      output.on('finish', () => {
        const authTag = cipher.getAuthTag();
        // Append auth tag at the end
        fs.appendFileSync(outputPath, authTag);
        resolve();
      });
      
      output.on('error', reject);
      input.on('error', reject);
    });
  }

  decryptFile(inputPath, outputPath) {
    return new Promise((resolve, reject) => {
      const buffer = fs.readFileSync(inputPath);
      
      const iv = buffer.slice(0, 16);
      const authTag = buffer.slice(buffer.length - 16);
      const encrypted = buffer.slice(16, buffer.length - 16);
      
      const decipher = crypto.createDecipheriv('aes-256-gcm', this.masterKey, iv);
      decipher.setAuthTag(authTag);
      
      const decrypted = Buffer.concat([
        decipher.update(encrypted),
        decipher.final()
      ]);
      
      fs.writeFileSync(outputPath, decrypted);
      resolve();
    });
  }
}

module.exports = BackupEncryption;
```

### Step 2: Update backup routes

```javascript
// src/routes/backupRoutes.js - ADD ENCRYPTION OPTION
const BackupEncryption = require('../core/backup/encryption');

router.post('/:serverId/backups', async (req, res) => {
  const { encrypt } = req.body; // true/false
  
  try {
    const backup = await createBackup(serverId, encrypt);
    
    if (encrypt) {
      const encryptor = new BackupEncryption(process.env.JWT_SECRET);
      await encryptor.encryptFile(backup.path, backup.path + '.enc');
      fs.unlinkSync(backup.path); // Delete unencrypted
      backup.path += '.enc';
      backup.encrypted = true;
    }
    
    res.json({ success: true, backup });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
```

### Step 3: Update restore

```javascript
// src/routes/backupRoutes.js - UPDATE RESTORE
router.post('/:serverId/backups/:backupId/restore', async (req, res) => {
  try {
    let backupPath = getBackupPath(serverId, backupId);
    
    // Check if encrypted
    if (backup.encrypted) {
      const encryptor = new BackupEncryption(process.env.JWT_SECRET);
      const tempPath = backupPath + '.tmp';
      await encryptor.decryptFile(backupPath, tempPath);
      backupPath = tempPath;
    }
    
    await restoreBackup(serverId, backupPath);
    
    if (backup.encrypted) {
      fs.unlinkSync(tempPath);
    }
    
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
```

---

## 5️⃣ API DOCUMENTATION (6-8 ORE)

### Step 1: Install dependencies

```bash
npm install swagger-ui-express swagger-jsdoc --save
```

### Step 2: Create Swagger config

```javascript
// src/core/swagger.js
const swaggerJsdoc = require('swagger-jsdoc');
const path = require('path');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'MinePanel API',
      version: '1.0.0',
      description: 'Minecraft Server Management Panel API',
      contact: {
        name: 'MinePanel Developer'
      }
    },
    servers: [
      {
        url: 'http://localhost:8082/api',
        description: 'Development server'
      },
      {
        url: 'https://minepanel.example.com/api',
        description: 'Production server'
      }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'JWT token from /api/auth/login'
        }
      },
      schemas: {
        Server: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            running: { type: 'boolean' },
            players: { type: 'array' },
            maxPlayers: { type: 'number' },
            motd: { type: 'string' }
          }
        },
        Error: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            code: { type: 'number' }
          }
        }
      }
    }
  },
  apis: [
    path.join(__dirname, '../routes/*.js')
  ]
};

module.exports = swaggerJsdoc(options);
```

### Step 3: Add endpoints documentation

```javascript
// src/routes/serverRoutes.js - ADD SWAGGER DOCS
/**
 * @swagger
 * /api/servers:
 *   get:
 *     summary: Get all servers
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of servers
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Server'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/', authenticateToken, async (req, res) => {
  // ... existing code
});

/**
 * @swagger
 * /api/servers/{serverId}/start:
 *   post:
 *     summary: Start a server
 *     parameters:
 *       - in: path
 *         name: serverId
 *         required: true
 *         schema:
 *           type: string
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Server started
 */
router.post('/:serverId/start', authenticateToken, async (req, res) => {
  // ... existing code
});
```

### Step 4: Add Swagger UI to app

```javascript
// src/index.js
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./core/swagger');

app.use('/api-docs', swaggerUi.serve);
app.get('/api-docs', swaggerUi.setup(swaggerSpec, {
  swaggerOptions: {
    urls: [
      {
        url: '/api-docs-json',
        name: 'Swagger JSON'
      }
    ]
  }
}));

app.get('/api-docs-json', (req, res) => {
  res.send(swaggerSpec);
});
```

### Step 5: Test

```bash
npm start
# Visit http://localhost:8082/api-docs
```

---

## 📋 CHECKLIST FINAL

- [ ] Prometheus metrics working (`/metrics` endpoint)
- [ ] Docker image builds successfully
- [ ] Docker-compose runs without errors
- [ ] HTTPS certificate auto-renewal configured
- [ ] Backup encryption tested
- [ ] API documentation displays correctly (`/api-docs`)
- [ ] All endpoints documented in Swagger
- [ ] Health check working
- [ ] Tests passing with new code
- [ ] Performance benchmarks recorded

---

## 🎯 NEXT STEPS

After implementing these 5 features:
1. Deploy to production
2. Monitor with Prometheus + Grafana
3. Gather user feedback
4. Plan Phase 2 (Database abstraction + Clustering)
5. Start working on Clustered Mode (the game changer!)

**Total time:** ~25-35 hours of focused development  
**Result:** MinePanel becomes competitive with enterprise panels like Crafty-4 ✨

Good luck! 🚀


## Related Architecture
- Overview: [[Project]]
- Roadmap: [[MASTER_ROADMAP]]


## Architecture Connections
- Process Manager: [[Execution Manager]], [[Process Manager Wrapper]]
- Database Layer: [[Database Access Layer]], [[Database Migration Runner]]
- Metrics & Telemetry: [[Stats Collector]], [[Threshold Manager]]
- Webhook Dispatch: [[Webhook Manager]]
- Python Engine: [[Python Sandbox Runner]], [[Automation Engine]]
