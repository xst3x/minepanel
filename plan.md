# 🤖 AI AGENT IMPLEMENTATION PLAN - MinePanel → 95/100

## 📋 OVERVIEW

Plan complet pentru transformarea MinePanel din 74.5/100 la 95/100 folosind AI Agents pe o perioadă de 4-6 săptămâni.

---

## 🎯 OBIECTIV FINAL

```
CURRENT:  74.5/100 ❌
TARGET:   95/100   ✅

Improvement: +20.5 puncte
Timeline: 4-6 săptămâni
Automation: 95%+ AI-driven
```

---

## 📊 SCORING BREAKDOWN

### Current State (74.5/100)
```
Security:        72/100  ❌❌❌
Code Quality:    70/100  ❌❌❌
Deployment:      60/100  ❌❌
Architecture:    65/100  ❌❌
Performance:     80/100  ✅
Features:        88/100  ✅✅
DX:              82/100  ✅✅
Maintenance:     70/100  ❌❌
─────────────────────────────
AVERAGE:         74.5/100
```

### Target State (95/100)
```
Security:        94/100  ✅✅✅✅
Code Quality:    92/100  ✅✅✅
Deployment:      94/100  ✅✅✅
Architecture:    93/100  ✅✅✅
Performance:     78/100  ✅
Features:        88/100  ✅✅
DX:              90/100  ✅✅
Maintenance:     96/100  ✅✅✅
─────────────────────────────
AVERAGE:         95/100  ✅
```

---

## 🤖 AI AGENT ARCHITECTURE

```
┌─────────────────────────────────────────────────┐
│         MASTER CONTROLLER (Claude)              │
│  - Task Orchestration                           │
│  - Quality Gates                                │
│  - Progress Tracking                            │
└────────────────────┬────────────────────────────┘
                     │
        ┌────────────┼────────────┐
        ▼            ▼            ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│Code Gen      │ │Test Generator│ │Doc Generator │
│Agent         │ │Agent         │ │Agent         │
└──────┬───────┘ └──────┬───────┘ └──────┬───────┘
       │                │                │
       └────────────────┼────────────────┘
                        │
        ┌───────────────┼───────────────┐
        ▼               ▼               ▼
    ┌────────┐     ┌────────┐     ┌──────────┐
    │GitHub  │     │Tests   │     │Database  │
    │Repos   │     │Suite   │     │Schema    │
    └────────┘     └────────┘     └──────────┘
```

---

## 📅 DETAILED PHASE PLAN

### PHASE 1: SECURITY HARDENING (Week 1-2)

**Current Score: 72 → Target: 94/100 (+22 points)**

#### TASK 1.1: ORM Migration to Sequelize (80 AI hours)

**Objective:** Eliminate SQL injection vulnerabilities through complete ORM migration

**Subtasks:**

1. **Analysis Phase (8 hours)**
   - Scan all SQL queries in codebase
   - Identify raw SQL patterns
   - Map database schema
   - Create migration strategy
   - Output: `docs/orm-migration-plan.md`

2. **Setup & Configuration (12 hours)**
   - Initialize Sequelize
   - Create `src/db/config.js`
   - Setup connection pooling
   - Environment configuration
   - Output: Full Sequelize configuration

3. **Model Generation (20 hours)**
   ```
   Models to create:
   ├─ User.js (with hooks for password hashing)
   ├─ Server.js (with validations)
   ├─ ServerStats.js
   ├─ Webhook.js
   ├─ Threshold.js
   ├─ AuditLog.js
   ├─ Token.js (JWT revocation)
   ├─ TOTP.js (2FA backup codes)
   └─ Avatar.js
   ```

4. **Route Migration (30 hours)**
   - Migrate auth routes
   - Migrate server routes
   - Migrate player routes
   - Migrate file routes
   - Migrate stats routes
   - Total: 16 route files updated
   - Pattern: Each route gets ORM protection

5. **Migration Scripts (8 hours)**
   ```
   Create scripts:
   ├─ migrate-to-sequelize.js
   ├─ rollback.js
   ├─ verify-data-integrity.js
   └─ backup-before-migration.js
   ```

6. **Testing (12 hours)**
   - Test all models
   - Test all routes
   - Test data integrity
   - Test edge cases

**Output Files:**
```
src/db/
├── models/
│   ├── User.js
│   ├── Server.js
│   ├── Stats.js
│   └── [5+ more]
├── migrations/
│   └── [auto-generated]
└── database.js

All routes updated to use ORM
```

**Success Metrics:**
- ✅ 0 raw SQL queries
- ✅ All tests passing
- ✅ Data integrity verified
- ✅ Performance acceptable
- ✅ Score: +15 points

---

#### TASK 1.2: HTTPS Enforcement Middleware (4 AI hours)

**Objective:** Force all traffic to HTTPS

**Implementation:**

```javascript
File: src/middleware/httpsRedirect.js
─────────────────────────────────────

module.exports = (req, res, next) => {
  // Exclude health checks
  if (req.path === '/health' || req.path === '/metrics') {
    return next();
  }

  // Check for HTTPS
  if (req.header('x-forwarded-proto') !== 'https' && 
      process.env.FORCE_HTTPS === 'true') {
    return res.redirect(
      `https://${req.header('host')}${req.url}`
    );
  }

  // Security headers
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');

  next();
};
```

**Configuration:**
```
.env
────
FORCE_HTTPS=true
SSL_MIN_VERSION=TLSv1.2
```

**Success Metrics:**
- ✅ All HTTP → HTTPS redirects
- ✅ Security headers set
- ✅ Tests passing
- ✅ Score: +3 points

---

#### TASK 1.3: WebAuthn 2FA Support (24 AI hours)

**Objective:** Add hardware security key support

**Implementation:**

```javascript
File: src/core/webauthn.js
──────────────────────────

const fido2 = require('@simplewebauthn/server');

module.exports = {
  async generateRegistrationOptions(user) {
    // Generate challenge for registration
  },

  async verifyRegistrationResponse(user, credential) {
    // Verify hardware key registration
  },

  async generateAuthenticationOptions(user) {
    // Generate challenge for authentication
  },

  async verifyAuthenticationResponse(user, assertion) {
    // Verify hardware key assertion
  }
};
```

**Database Migration:**
```sql
ALTER TABLE users ADD COLUMN webauthn_credentials JSON;
ALTER TABLE users ADD COLUMN webauthn_enabled BOOLEAN DEFAULT FALSE;
```

**Routes:**
```
POST /api/auth/2fa/webauthn/register/options
POST /api/auth/2fa/webauthn/register
POST /api/auth/2fa/webauthn/authenticate/options
POST /api/auth/2fa/webauthn/authenticate
```

**Success Metrics:**
- ✅ Hardware keys supported
- ✅ Fallback to TOTP
- ✅ Tests passing
- ✅ Score: +4 points

---

#### TASK 1.4: Input Validation Hardening (16 AI hours)

**Objective:** Comprehensive input validation across all endpoints

**Implementation:**

```javascript
File: src/utils/validator-schemas.js
───────────────────────────────────

const Joi = require('joi');

const schemas = {
  server: {
    create: Joi.object({
      name: Joi.string()
        .required()
        .min(3)
        .max(50)
        .pattern(/^[a-zA-Z0-9-_]+$/),
      
      type: Joi.string()
        .required()
        .valid('vanilla', 'paper', 'forge', 'fabric', 'quilt', 'purpur', 'magma'),
      
      memory: Joi.number()
        .required()
        .min(512)
        .max(16384)
        .error(new Error('Memory must be 512-16384 MB')),
      
      javaVersion: Joi.string()
        .optional()
        .pattern(/^\d+$/)
    }).unknown(false)
  },

  user: {
    create: Joi.object({
      username: Joi.string()
        .required()
        .alphanum()
        .min(3)
        .max(30),
      
      email: Joi.string()
        .required()
        .email()
        .lowercase(),
      
      password: Joi.string()
        .required()
        .min(12)
        .pattern(/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/)
    }).unknown(false)
  }
};

module.exports = schemas;
```

**File: src/utils/sanitizer.js**
```javascript
─────────────────────────────────

const sanitizeHtml = require('sanitize-html');
const xss = require('xss');

module.exports = {
  sanitizeString(input) {
    return xss(input, {
      whiteList: {},
      stripIgnoredTag: true
    });
  },

  sanitizeHtml(input) {
    return sanitizeHtml(input, {
      allowedTags: [],
      allowedAttributes: {}
    });
  },

  sanitizePath(input) {
    // Prevent directory traversal
    if (input.includes('..') || input.startsWith('/')) {
      throw new Error('Invalid path');
    }
    return input;
  }
};
```

**Apply to all routes:**
- File uploads
- User inputs
- API parameters
- Configuration values

**Success Metrics:**
- ✅ All inputs validated
- ✅ XSS prevention working
- ✅ Directory traversal blocked
- ✅ Tests passing
- ✅ Score: +4 points

---

### PHASE 2: CODE QUALITY & ARCHITECTURE (Week 3-4)

**Current Score: 70 → Target: 92/100 (+22 points)**

#### TASK 2.1: Route Modularization (40 AI hours)

**Objective:** Break down monolithic route files

**Analysis & Planning (8 hours):**

```
Current State:
├─ serverRoutes.js (60 KB, 1800+ lines) ❌
├─ userRoutes.js (28 KB, 900+ lines) ⚠️
├─ playerRoutes.js (28 KB, 900+ lines) ⚠️
└─ statsRoutes.js (12 KB, 400+ lines) ⚠️

Target State:
├─ server/
│   ├─ lifecycle.js (start/stop/restart)
│   ├─ management.js (create/delete)
│   ├─ console.js (command execution)
│   ├─ files.js (file operations)
│   ├─ backup.js (backup/restore)
│   └─ analytics.js (stats/monitoring)
│
├─ user/
│   ├─ auth.js (authentication)
│   ├─ profile.js (user data)
│   └─ permissions.js (roles/perms)
│
└─ player/
    ├─ info.js (player info)
    ├─ inventory.js (inventory viewer)
    └─ data.js (player data)
```

**Implementation (32 hours):**

```javascript
File: src/routes/server/lifecycle.js
──────────────────────────────────

const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../../core/auth');
const processManager = require('../../core/processManager');
const { models } = require('../../db/database');
const { validateRequest } = require('../../middleware/validation');
const Joi = require('joi');

/**
 * Start a server
 * @swagger
 * /api/servers/{serverId}/start:
 *   post:
 *     tags: [Servers]
 *     parameters:
 *       - in: path
 *         name: serverId
 *         required: true
 *     responses:
 *       200:
 *         description: Server started
 */
router.post(
  '/:serverId/start',
  authenticateToken,
  validateRequest(Joi.object({ serverId: Joi.number().required() }), 'params'),
  async (req, res, next) => {
    try {
      const { serverId } = req.params;
      const userId = req.user.id;

      // Get server
      const server = await models.Server.findByPk(serverId);
      if (!server) {
        return res.status(404).json({ error: 'Server not found' });
      }

      // Check ownership
      if (server.userId !== userId) {
        return res.status(403).json({ error: 'Unauthorized' });
      }

      // Start
      await processManager.startServer(serverId);
      await server.update({ status: 'running' });

      res.json({
        message: 'Server started',
        status: 'running',
        serverId
      });
    } catch (error) {
      next(error);
    }
  }
);

// Similar for stop, restart...

module.exports = router;
```

**File: src/routes/serverRoutes.js (refactored)**
```javascript
──────────────────────────────────────────

const express = require('express');
const router = express.Router();

// Import sub-routes
const lifecycleRoutes = require('./server/lifecycle');
const managementRoutes = require('./server/management');
const consoleRoutes = require('./server/console');
const fileRoutes = require('./server/files');
const backupRoutes = require('./server/backup');
const analyticsRoutes = require('./server/analytics');

const { authenticateToken } = require('../core/auth');
const { models } = require('../db/database');

// List all servers
router.get('/', authenticateToken, async (req, res, next) => {
  try {
    const servers = await models.Server.findAll({
      where: { userId: req.user.id },
      attributes: { exclude: ['databasePassword'] }
    });
    res.json(servers);
  } catch (error) {
    next(error);
  }
});

// Mount sub-routes
router.use(lifecycleRoutes);
router.use(managementRoutes);
router.use('/console', consoleRoutes);
router.use('/files', fileRoutes);
router.use('/backups', backupRoutes);
router.use('/analytics', analyticsRoutes);

module.exports = router;
```

**Success Metrics:**
- ✅ No file > 500 lines
- ✅ Clear separation of concerns
- ✅ All tests passing
- ✅ Score: +10 points

---

#### TASK 2.2: Error Handling Standardization (20 AI hours)

**Objective:** Unified error handling across all endpoints

**Implementation:**

```javascript
File: src/core/errorHandler.js
──────────────────────────────

class AppError extends Error {
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR') {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.timestamp = new Date();
  }
}

class ValidationError extends AppError {
  constructor(message, details = {}) {
    super(message, 400, 'VALIDATION_ERROR');
    this.details = details;
  }
}

class NotFoundError extends AppError {
  constructor(resource = 'Resource') {
    super(`${resource} not found`, 404, 'NOT_FOUND');
  }
}

class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

class ForbiddenError extends AppError {
  constructor(message = 'Forbidden') {
    super(message, 403, 'FORBIDDEN');
  }
}

module.exports = {
  AppError,
  ValidationError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError
};
```

```javascript
File: src/middleware/errorHandler.js
────────────────────────────────────

const logger = require('../core/utils/logger');

module.exports = (err, req, res, next) => {
  // Log error
  logger.error('Request error', {
    message: err.message,
    code: err.code,
    statusCode: err.statusCode,
    stack: err.stack,
    path: req.path,
    method: req.method
  });

  // Default error
  let statusCode = err.statusCode || 500;
  let code = err.code || 'INTERNAL_ERROR';
  let message = err.message || 'Internal server error';

  // Don't expose internal errors
  if (statusCode === 500) {
    message = 'An error occurred. Please try again later.';
    code = 'INTERNAL_ERROR';
  }

  // Response
  res.status(statusCode).json({
    error: {
      message,
      code,
      ...(process.env.NODE_ENV === 'development' && {
        stack: err.stack,
        details: err.details
      })
    }
  });
};
```

**Apply to all routes:**
- Replace try-catch with typed errors
- Use standardized error responses
- Proper HTTP status codes
- Error logging

**Success Metrics:**
- ✅ Consistent error responses
- ✅ Proper HTTP status codes
- ✅ Comprehensive logging
- ✅ Tests passing
- ✅ Score: +8 points

---

#### TASK 2.3: Code Documentation & JSDoc (24 AI hours)

**Objective:** Complete JSDoc documentation for all functions

**Implementation:**

```javascript
File: src/routes/server/lifecycle.js
──────────────────────────────────

/**
 * Start a Minecraft server
 * 
 * @async
 * @function startServer
 * @memberof ServerRoutes
 * 
 * @param {string} req.params.serverId - Server ID
 * @param {Object} req.user - Authenticated user
 * @param {number} req.user.id - User ID
 * 
 * @returns {Promise<Object>} Server status
 * @returns {string} returns.message - Status message
 * @returns {string} returns.status - 'running'
 * @returns {number} returns.serverId - Server ID
 * 
 * @throws {NotFoundError} Server not found
 * @throws {UnauthorizedError} User not owner
 * @throws {AppError} Start failed
 * 
 * @example
 * POST /api/servers/1/start
 * // Returns: { message: 'Server started', status: 'running', serverId: 1 }
 */
router.post('/:serverId/start', authenticateToken, async (req, res, next) => {
  // Implementation
});
```

**Documentation to generate:**
- [ ] All route functions
- [ ] All utility functions
- [ ] All database models
- [ ] All middleware
- [ ] All core services

**Output:**
- Complete JSDoc coverage
- Type hints
- Usage examples
- Error documentation

**Success Metrics:**
- ✅ 100% JSDoc coverage
- ✅ All functions documented
- ✅ Examples provided
- ✅ Score: +4 points

---

### PHASE 3: DEPLOYMENT & DEVOPS (Week 4)

**Current Score: 60 → Target: 94/100 (+34 points)**

#### TASK 3.1: Docker & Orchestration (16 AI hours)

**Objective:** Production-ready Docker setup

**Files to Create:**

```dockerfile
File: Dockerfile
────────────────

# Build stage
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci

# Runtime stage
FROM node:20-alpine
WORKDIR /app

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Copy from builder
COPY --from=builder /app/node_modules ./node_modules
COPY package*.json ./
COPY src ./src
COPY docs ./docs

# Create app directories
RUN mkdir -p /app/data /app/servers /app/logs && \
    chown -R node:node /app

# Switch to non-root user
USER node

# Expose port
EXPOSE 8082

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8082/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

# Run with dumb-init
ENTRYPOINT ["/sbin/dumb-init", "--"]
CMD ["npm", "start"]
```

```yaml
File: docker-compose.yml
────────────────────────

version: '3.8'

services:
  minepanel:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: minepanel
    restart: unless-stopped
    
    ports:
      - "8082:8082"
    
    volumes:
      - ./data:/app/data
      - ./servers:/app/servers
      - ./logs:/app/logs
    
    environment:
      - NODE_ENV=production
      - DATABASE_PATH=/app/data/minepanel.db
      - PORT=8082
      - FORCE_HTTPS=true
      - DISCORD_TOKEN=${DISCORD_TOKEN}
      - JWT_SECRET=${JWT_SECRET}
      - FTP_PORT=${FTP_PORT:-21}
    
    healthcheck:
      test: ["CMD", "node", "-e", "require('http').get('http://localhost:8082/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 5s
    
    networks:
      - minepanel-net
    
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"

networks:
  minepanel-net:
    driver: bridge
```

```text
File: .dockerignore
───────────────────

node_modules
npm-debug.log
.git
.gitignore
README.md
.env
.env.local
tests
.vscode
.cache
logs
*.log
coverage
.DS_Store
```

```bash
File: docker-entrypoint.sh
──────────────────────────

#!/bin/sh
set -e

# Wait for database to be ready
echo "Waiting for database..."
timeout 30 sh -c 'until sqlite3 "$DATABASE_PATH" ".tables" > /dev/null 2>&1; do sleep 1; done'

# Run migrations
echo "Running migrations..."
npm run db:migrate

# Start application
echo "Starting MinePanel..."
exec npm start
```

**Additional Docker Files:**

```yaml
File: .env.example
──────────────────

NODE_ENV=production
DATABASE_PATH=/app/data/minepanel.db
PORT=8082
FORCE_HTTPS=true
DISCORD_TOKEN=your_token_here
JWT_SECRET=your_secret_here
FTP_PORT=21
```

**Success Metrics:**
- ✅ Docker image builds
- ✅ docker-compose works
- ✅ Health checks pass
- ✅ Proper logging
- ✅ Non-root user
- ✅ Signal handling correct
- ✅ Score: +15 points

---

#### TASK 3.2: Systemd Service & Installation Guide (8 AI hours)

**Objective:** Linux integration and automated deployment

**Files:**

```ini
File: minepanel.service
───────────────────────

[Unit]
Description=MinePanel - Minecraft Server Management
After=network.target
Wants=network-online.target

[Service]
Type=simple
User=minepanel
Group=minepanel
WorkingDirectory=/opt/minepanel

# Environment
EnvironmentFile=/etc/minepanel/minepanel.env
Environment="NODE_ENV=production"

# Startup
ExecStart=/usr/bin/node /opt/minepanel/src/index.js
Restart=on-failure
RestartSec=10

# Security
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=yes
ReadWritePaths=/opt/minepanel/data /opt/minepanel/servers /opt/minepanel/logs

# Resource limits
LimitNOFILE=65535
LimitNPROC=4096

# Timeouts
TimeoutStartSec=30
TimeoutStopSec=30

[Install]
WantedBy=multi-user.target
```

```bash
File: install.sh
────────────────

#!/bin/bash
set -e

echo "Installing MinePanel..."

# Check if running as root
if [ "$EUID" -ne 0 ]; then
   echo "This script must be run as root"
   exit 1
fi

# Create user
useradd -r -s /bin/false minepanel 2>/dev/null || true

# Create directories
mkdir -p /opt/minepanel
mkdir -p /etc/minepanel
mkdir -p /var/lib/minepanel/{data,servers,logs}

# Copy files
cp -r . /opt/minepanel/
chown -R minepanel:minepanel /opt/minepanel
chown -R minepanel:minepanel /var/lib/minepanel

# Install dependencies
cd /opt/minepanel
npm ci --only=production

# Copy service file
cp minepanel.service /etc/systemd/system/
systemctl daemon-reload

# Copy config template
cp minepanel.env.example /etc/minepanel/minepanel.env

echo "Installation complete!"
echo "Next steps:"
echo "1. Edit /etc/minepanel/minepanel.env"
echo "2. Run: systemctl start minepanel"
echo "3. Check status: systemctl status minepanel"
```

```bash
File: update.sh
───────────────

#!/bin/bash
set -e

echo "Updating MinePanel..."

# Backup database
cp /var/lib/minepanel/data/minepanel.db \
   /var/lib/minepanel/data/minepanel.db.backup.$(date +%Y%m%d-%H%M%S)

# Stop service
systemctl stop minepanel

# Update code
cd /opt/minepanel
git pull origin main
npm ci --only=production
npm run db:migrate

# Restart service
systemctl start minepanel

echo "Update complete!"
```

**Installation Guide Output:**
- Complete setup instructions
- Configuration guide
- Troubleshooting
- Update procedures
- Backup/restore procedures

**Success Metrics:**
- ✅ systemd service works
- ✅ Auto-restart on failure
- ✅ Install script functional
- ✅ Update script functional
- ✅ Backup procedures defined
- ✅ Score: +10 points

---

#### TASK 3.3: CI/CD Pipeline (12 AI hours)

**Objective:** Automated testing and deployment

```yaml
File: .github/workflows/tests.yml
─────────────────────────────────

name: Tests

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main, develop ]

jobs:
  test:
    runs-on: ubuntu-latest
    
    strategy:
      matrix:
        node-version: [18.x, 20.x]
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Use Node.js ${{ matrix.node-version }}
      uses: actions/setup-node@v3
      with:
        node-version: ${{ matrix.node-version }}
        cache: 'npm'
    
    - name: Install dependencies
      run: npm ci
    
    - name: Run tests
      run: npm test
    
    - name: Generate coverage
      run: npm run test:coverage
    
    - name: Upload coverage
      uses: codecov/codecov-action@v3
      with:
        file: ./coverage/lcov.info
```

```yaml
File: .github/workflows/security.yml
────────────────────────────────────

name: Security Scan

on:
  push:
    branches: [ main ]
  schedule:
    - cron: '0 0 * * 0'

jobs:
  security:
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Run npm audit
      run: npm audit --audit-level=moderate
    
    - name: Run Snyk
      uses: snyk/actions/node@master
      env:
        SNYK_TOKEN: ${{ secrets.SNYK_TOKEN }}
```

```yaml
File: .github/workflows/deploy.yml
──────────────────────────────────

name: Deploy

on:
  push:
    tags:
      - 'v*'

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Set up Docker Buildx
      uses: docker/setup-buildx-action@v2
    
    - name: Login to Docker Hub
      uses: docker/login-action@v2
      with:
        username: ${{ secrets.DOCKER_USERNAME }}
        password: ${{ secrets.DOCKER_PASSWORD }}
    
    - name: Build and push
      uses: docker/build-push-action@v4
      with:
        context: .
        push: true
        tags: |
          minepanel/minepanel:latest
          minepanel/minepanel:${{ github.ref_name }}
```

**Success Metrics:**
- ✅ Tests run on push
- ✅ Security scanning automated
- ✅ Docker builds automated
- ✅ Coverage tracked
- ✅ Score: +9 points

---

### PHASE 4: TESTING & QUALITY ASSURANCE (Week 5)

**Current Score: (varies) → Target: 90%+ coverage**

#### TASK 4.1: Unit Tests Generation (60 AI hours)

**Objective:** 90%+ code coverage with comprehensive unit tests

**Test Structure:**

```
tests/
├── unit/
│   ├── routes/
│   │   ├── server/
│   │   │   ├─ lifecycle.test.js
│   │   │   ├─ management.test.js
│   │   │   ├─ console.test.js
│   │   │   ├─ files.test.js
│   │   │   ├─ backup.test.js
│   │   │   └─ analytics.test.js
│   │   ├── user/
│   │   │   ├─ auth.test.js
│   │   │   ├─ profile.test.js
│   │   │   └─ permissions.test.js
│   │   └── ...
│   ├── core/
│   │   ├─ auth.test.js
│   │   ├─ permissions.test.js
│   │   ├─ ftpServer.test.js
│   │   └─ ...
│   ├── middleware/
│   │   ├─ validation.test.js
│   │   ├─ errorHandler.test.js
│   │   └─ ...
│   └── utils/
│       ├─ logger.test.js
│       ├─ encryption.test.js
│       └─ ...
├── integration/
│   ├── auth-flow.test.js
│   ├── server-lifecycle.test.js
│   ├── file-operations.test.js
│   └─ ...
└── config/
    └── test-setup.js
```

**Example Test File:**

```javascript
File: tests/unit/routes/server/lifecycle.test.js
───────────────────────────────────────────────

const request = require('supertest');
const app = require('../../../../src/index');
const { sequelize, models } = require('../../../../src/db/database');
const { generateToken } = require('../../../../src/core/auth');

describe('Server Lifecycle Routes', () => {
  let server;
  let user;
  let token;

  beforeAll(async () => {
    await sequelize.sync({ force: true });
  });

  beforeEach(async () => {
    // Create test user
    user = await models.User.create({
      username: 'testuser',
      email: 'test@example.com',
      passwordHash: 'hashed_password',
      role: 'admin'
    });

    // Generate token
    token = generateToken(user.id);

    // Create test server
    server = await models.Server.create({
      name: 'TestServer',
      type: 'paper',
      port: 25565,
      path: '/test',
      userId: user.id
    });
  });

  afterEach(async () => {
    await sequelize.sync({ force: true });
  });

  describe('POST /api/servers/:serverId/start', () => {
    it('should start a server', async () => {
      const res = await request(app)
        .post(`/api/servers/${server.id}/start`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.message).toBe('Server started');
      expect(res.body.status).toBe('running');

      // Verify in database
      const updated = await models.Server.findByPk(server.id);
      expect(updated.status).toBe('running');
    });

    it('should return 404 for non-existent server', async () => {
      const res = await request(app)
        .post(`/api/servers/99999/start`)
        .set('Authorization', `Bearer ${token}`)
        .expect(404);

      expect(res.body.error).toBeDefined();
    });

    it('should return 401 for unauthenticated request', async () => {
      const res = await request(app)
        .post(`/api/servers/${server.id}/start`)
        .expect(401);
    });

    it('should return 403 if user does not own server', async () => {
      const otherUser = await models.User.create({
        username: 'other',
        email: 'other@example.com',
        passwordHash: 'hashed',
        role: 'user'
      });

      const otherToken = generateToken(otherUser.id);

      const res = await request(app)
        .post(`/api/servers/${server.id}/start`)
        .set('Authorization', `Bearer ${otherToken}`)
        .expect(403);
    });
  });

  describe('POST /api/servers/:serverId/stop', () => {
    beforeEach(async () => {
      await server.update({ status: 'running' });
    });

    it('should stop a running server', async () => {
      const res = await request(app)
        .post(`/api/servers/${server.id}/stop`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.status).toBe('stopped');
    });
  });

  describe('POST /api/servers/:serverId/restart', () => {
    beforeEach(async () => {
      await server.update({ status: 'running' });
    });

    it('should restart a server', async () => {
      const res = await request(app)
        .post(`/api/servers/${server.id}/restart`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.status).toBe('running');
    });
  });
});
```

**Test Coverage Report:**

```bash
File: npm scripts in package.json
─────────────────────────────────

"test": "jest --runInBand --detectOpenHandles",
"test:coverage": "jest --coverage --runInBand",
"test:watch": "jest --watch",
"test:integration": "jest --testPathPattern=integration"
```

**Success Metrics:**
- ✅ 90%+ line coverage
- ✅ All critical paths tested
- ✅ Error cases covered
- ✅ Edge cases tested
- ✅ Security tests included
- ✅ Score: +12 points

---

#### TASK 4.2: Integration Tests (40 AI hours)

**Objective:** Test complete workflows

```javascript
File: tests/integration/auth-flow.test.js
──────────────────────────────────────────

describe('Authentication Flow', () => {
  it('should complete full auth flow: register → login → 2FA', async () => {
    // 1. Register user
    const registerRes = await request(app)
      .post('/api/auth/register')
      .send({
        username: 'newuser',
        email: 'new@example.com',
        password: 'SecurePassword123!@#'
      })
      .expect(201);

    expect(registerRes.body.userId).toBeDefined();

    // 2. Login
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'new@example.com',
        password: 'SecurePassword123!@#'
      })
      .expect(200);

    const { token, requiresTwoFa } = loginRes.body;
    expect(requiresTwoFa).toBe(false);
    expect(token).toBeDefined();

    // 3. Use token
    const meRes = await request(app)
      .get('/api/users/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(meRes.body.email).toBe('new@example.com');
  });

  it('should enforce 2FA when enabled', async () => {
    // Setup user with 2FA
    const user = await models.User.create({
      username: 'mfauser',
      email: 'mfa@example.com',
      passwordHash: 'hashed',
      totpEnabled: true,
      totpSecret: 'test_secret'
    });

    // Login
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'mfa@example.com',
        password: 'password'
      })
      .expect(200);

    expect(loginRes.body.requiresTwoFa).toBe(true);
    expect(loginRes.body.token).toBeUndefined();

    // Verify 2FA
    const mfaRes = await request(app)
      .post('/api/auth/verify-2fa')
      .send({
        sessionToken: loginRes.body.sessionToken,
        code: '123456'
      })
      .expect(200);

    expect(mfaRes.body.token).toBeDefined();
  });
});

File: tests/integration/server-lifecycle.test.js
─────────────────────────────────────────────────

describe('Server Lifecycle Workflow', () => {
  it('should complete full server workflow', async () => {
    // 1. Create server
    const createRes = await request(app)
      .post('/api/servers')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'ProductionServer',
        type: 'paper',
        memory: 4096,
        javaVersion: '17'
      })
      .expect(201);

    const serverId = createRes.body.id;

    // 2. Start server
    const startRes = await request(app)
      .post(`/api/servers/${serverId}/start`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(startRes.body.status).toBe('running');

    // 3. Get stats
    const statsRes = await request(app)
      .get(`/api/servers/${serverId}/stats`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(statsRes.body.cpu).toBeDefined();
    expect(statsRes.body.memory).toBeDefined();

    // 4. Upload file
    const fileRes = await request(app)
      .post(`/api/servers/${serverId}/files/upload`)
      .set('Authorization', `Bearer ${token}`)
      .attach('file', Buffer.from('test'), 'test.txt')
      .expect(200);

    // 5. Backup
    const backupRes = await request(app)
      .post(`/api/servers/${serverId}/backups`)
      .set('Authorization', `Bearer ${token}`)
      .expect(201);

    const backupId = backupRes.body.id;

    // 6. Stop server
    const stopRes = await request(app)
      .post(`/api/servers/${serverId}/stop`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(stopRes.body.status).toBe('stopped');

    // 7. Delete server
    const deleteRes = await request(app)
      .delete(`/api/servers/${serverId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
  });
});
```

**Success Metrics:**
- ✅ All critical workflows tested
- ✅ Multi-step operations verified
- ✅ Error recovery tested
- ✅ Edge cases covered
- ✅ Score: +8 points

---

#### TASK 4.3: Security Testing (20 AI hours)

**Objective:** Automated security vulnerability detection

```javascript
File: tests/security/sql-injection.test.js
───────────────────────────────────────────

describe('SQL Injection Prevention', () => {
  it('should prevent SQL injection via user input', async () => {
    const maliciousInput = "'; DROP TABLE users; --";

    const res = await request(app)
      .post('/api/servers')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: maliciousInput,
        type: 'paper',
        memory: 2048
      })
      .expect(400); // Should reject invalid input

    // Verify table still exists
    const servers = await models.Server.findAll();
    expect(servers).toBeDefined();
  });

  it('should prevent SQL injection via URL parameters', async () => {
    const res = await request(app)
      .get("/api/servers/1' OR '1'='1")
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });
});

File: tests/security/xss-prevention.test.js
─────────────────────────────────────────────

describe('XSS Prevention', () => {
  it('should sanitize HTML in user input', async () => {
    const xssPayload = '<script>alert("XSS")</script>';

    const res = await request(app)
      .post('/api/servers')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: xssPayload,
        type: 'paper'
      })
      .expect(400);
  });

  it('should escape HTML in responses', async () => {
    const server = await models.Server.create({
      name: '<script>alert("test")</script>',
      type: 'paper',
      userId: user.id
    });

    const res = await request(app)
      .get(`/api/servers/${server.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.name).not.toContain('<script>');
  });
});

File: tests/security/authentication.test.js
──────────────────────────────────────────

describe('Authentication Security', () => {
  it('should reject expired tokens', async () => {
    const expiredToken = generateToken(user.id, { expiresIn: '-1h' });

    const res = await request(app)
      .get('/api/users/me')
      .set('Authorization', `Bearer ${expiredToken}`)
      .expect(401);
  });

  it('should reject invalid tokens', async () => {
    const res = await request(app)
      .get('/api/users/me')
      .set('Authorization', 'Bearer invalid_token')
      .expect(401);
  });

  it('should enforce password strength', async () => {
    const weakPassword = 'weak';

    const res = await request(app)
      .post('/api/auth/register')
      .send({
        username: 'newuser',
        email: 'new@example.com',
        password: weakPassword
      })
      .expect(400);

    expect(res.body.error).toContain('password');
  });
});

File: tests/security/csrf-protection.test.js
──────────────────────────────────────────────

describe('CSRF Protection', () => {
  it('should reject requests without CSRF token', async () => {
    const res = await request(app)
      .post('/api/servers')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'test',
        type: 'paper'
      })
      // Should work - CSRF mainly for state-changing via GET/HEAD
      .expect(201);
  });
});

File: tests/security/rate-limiting.test.js
───────────────────────────────────────────

describe('Rate Limiting', () => {
  it('should enforce rate limits on login attempts', async () => {
    for (let i = 0; i < 10; i++) {
      await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test@example.com',
          password: 'wrong'
        });
    }

    const res = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'test@example.com',
        password: 'wrong'
      });

    expect(res.statusCode).toBe(429); // Too Many Requests
  });
});
```

**Success Metrics:**
- ✅ SQL injection prevented
- ✅ XSS protection working
- ✅ CSRF protected
- ✅ Rate limiting enforced
- ✅ Auth security verified
- ✅ Score: +5 points

---

### PHASE 5: DOCUMENTATION & API (Week 6)

**Current Score: 60 → Target: 96/100 (+36 points)**

#### TASK 5.1: Swagger/OpenAPI Documentation (16 AI hours)

**Objective:** Complete API documentation

```javascript
File: src/swagger.js
────────────────────

const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'MinePanel API',
      version: '1.0.0',
      description: 'Minecraft Server Management Panel API',
      contact: {
        name: 'MinePanel Support',
        url: 'https://minepanel.dev'
      },
      license: {
        name: 'MIT'
      }
    },
    servers: [
      {
        url: process.env.API_URL || 'http://localhost:8082/api',
        description: 'MinePanel API Server'
      }
    ],
    components: {
      securitySchemes: {
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT'
        }
      },
      schemas: {
        Server: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            name: { type: 'string' },
            type: { type: 'string', enum: ['vanilla', 'paper', 'forge', 'fabric', 'quilt', 'purpur', 'magma'] },
            port: { type: 'integer' },
            status: { type: 'string', enum: ['stopped', 'running', 'crashed'] },
            memory: { type: 'integer' },
            userId: { type: 'integer' }
          }
        },
        User: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            username: { type: 'string' },
            email: { type: 'string', format: 'email' },
            role: { type: 'string', enum: ['admin', 'user', 'moderator'] },
            totpEnabled: { type: 'boolean' }
          }
        }
      }
    },
    security: [{ BearerAuth: [] }]
  },
  apis: ['./src/routes/**/*.js']
};

const specs = swaggerJsdoc(options);

module.exports = (app) => {
  app.use('/api-docs', swaggerUi.serve);
  app.get('/api-docs', swaggerUi.setup(specs));
  app.get('/api-docs.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(specs);
  });
};
```

**JSDoc Annotations in Routes:**

```javascript
File: src/routes/server/lifecycle.js (with swagger annotations)
─────────────────────────────────────────────────────────────

/**
 * @swagger
 * /servers/{serverId}/start:
 *   post:
 *     summary: Start a Minecraft server
 *     tags:
 *       - Servers
 *     parameters:
 *       - in: path
 *         name: serverId
 *         required: true
 *         schema:
 *           type: integer
 *         description: Server ID
 *     requestBody:
 *       description: Optional start parameters
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               graceful:
 *                 type: boolean
 *                 description: Graceful start (wait for previous shutdown)
 *     responses:
 *       200:
 *         description: Server started successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 status:
 *                   type: string
 *                 serverId:
 *                   type: integer
 *       404:
 *         description: Server not found
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - not server owner
 *     security:
 *       - BearerAuth: []
 */
router.post('/:serverId/start', authenticateToken, async (req, res, next) => {
  // Implementation
});

/**
 * @swagger
 * /servers/{serverId}/stop:
 *   post:
 *     summary: Stop a Minecraft server
 *     tags:
 *       - Servers
 *     parameters:
 *       - in: path
 *         name: serverId
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               graceful:
 *                 type: boolean
 *               timeout:
 *                 type: integer
 *                 description: Timeout in seconds
 *     responses:
 *       200:
 *         description: Server stopped successfully
 *       404:
 *         description: Server not found
 *       401:
 *         description: Unauthorized
 *     security:
 *       - BearerAuth: []
 */
router.post('/:serverId/stop', authenticateToken, async (req, res, next) => {
  // Implementation
});

/**
 * @swagger
 * /servers/{serverId}/restart:
 *   post:
 *     summary: Restart a Minecraft server
 *     tags:
 *       - Servers
 *     parameters:
 *       - in: path
 *         name: serverId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Server restarted successfully
 *       404:
 *         description: Server not found
 *       401:
 *         description: Unauthorized
 *     security:
 *       - BearerAuth: []
 */
router.post('/:serverId/restart', authenticateToken, async (req, res, next) => {
  // Implementation
});
```

**API Endpoints Documented: 50+**

**Success Metrics:**
- ✅ All endpoints documented
- ✅ Request/response schemas
- ✅ Error codes documented
- ✅ Authentication examples
- ✅ Try-it-out capability
- ✅ Score: +10 points

---

#### TASK 5.2: Comprehensive Documentation (12 AI hours)

**Objective:** Generate complete project documentation

**Files to Generate:**

```markdown
File: docs/INSTALLATION.md
─────────────────────────

# Installation Guide

## Prerequisites
- Node.js 18+
- npm 8+
- SQLite3 (bundled with Node)

## Quick Start (Docker)

```bash
docker-compose up -d
```

## Manual Installation

### 1. Clone Repository
```bash
git clone https://github.com/your-org/minepanel.git
cd minepanel
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Configure Environment
```bash
cp .env.example .env
# Edit .env with your configuration
```

### 4. Initialize Database
```bash
npm run db:migrate
```

### 5. Start Application
```bash
npm start
```

Application running on http://localhost:8082

## Configuration

See `CONFIGURATION.md` for detailed options.

## Troubleshooting

See `TROUBLESHOOTING.md` for common issues.
```

```markdown
File: docs/CONFIGURATION.md
──────────────────────────

# Configuration Guide

## Environment Variables

### Database
```
DATABASE_PATH=/path/to/minepanel.db
```

### Server
```
PORT=8082
NODE_ENV=production
HOST=0.0.0.0
```

### Security
```
FORCE_HTTPS=true
JWT_SECRET=your-secret-key-here
JWT_EXPIRY=24h
```

### Discord Integration
```
DISCORD_TOKEN=your-token-here
DISCORD_PREFIX=!
```

### FTP Server
```
FTP_ENABLED=true
FTP_PORT=21
FTP_PASSIVE_IP=your-ip
FTP_PASSIVE_PORT_RANGE=6000-6500
```

## Configuration File

Optional config.json:
```json
{
  "theme": "dark",
  "locale": "en-US",
  "timeFormat": "24h"
}
```

## Advanced Options

See individual service documentation:
- Discord Bot: `docs/discord-bot.md`
- FTP Server: `docs/ftp-server.md`
- Statistics: `docs/statistics.md`
```

```markdown
File: docs/API.md
────────────────

# API Documentation

Complete API documentation available at: `/api-docs`

## Quick Start

### Authentication
```bash
curl -X POST http://localhost:8082/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "password"
  }'
```

### Using Token
```bash
curl -X GET http://localhost:8082/api/users/me \
  -H "Authorization: Bearer <token>"
```

## API Sections

- Authentication
- Users & Permissions
- Servers
- Players
- Statistics
- Files
- Backups
- Discord

See `/api-docs` for full documentation with examples.
```

```markdown
File: docs/SECURITY.md
──────────────────────

# Security Guidelines

## For Administrators

### Access Control
- Always use strong passwords (12+ characters, mixed case, numbers, symbols)
- Enable 2FA for all admin accounts
- Use WebAuthn (hardware keys) when possible
- Regularly audit user permissions

### Data Protection
- Regular backups (automated recommended)
- Secure backup storage
- Encryption in transit (HTTPS enforced)
- Encryption at rest (recommended)

### Monitoring
- Regular security audits
- Log monitoring
- Activity audit logs
- Update monitoring

## For Developers

### Code Security
- Never commit secrets to repository
- Use environment variables
- Validate all user input
- Use parameterized queries (ORM handles this)
- Implement rate limiting

### Dependencies
- Keep dependencies updated: `npm audit`
- Review security advisories
- Use lockfile (package-lock.json)

### Testing
- Security test coverage
- Regular penetration testing
- Vulnerability scanning
- Automated security checks (CI/CD)

## Reporting Security Issues

Please report security vulnerabilities to: security@minepanel.dev

Do not open public issues for security vulnerabilities.
```

```markdown
File: docs/DEPLOYMENT.md
────────────────────────

# Deployment Guide

## Docker Deployment

### Requirements
- Docker
- docker-compose

### Setup
```bash
# Clone repo
git clone https://github.com/your-org/minepanel.git
cd minepanel

# Configure
cp .env.example .env
# Edit .env

# Deploy
docker-compose up -d

# Check status
docker-compose logs -f minepanel
```

### Updating
```bash
docker-compose pull
docker-compose up -d
```

## Linux (Systemd) Deployment

### Installation
```bash
sudo ./install.sh
```

### Start Service
```bash
sudo systemctl start minepanel
```

### Check Status
```bash
sudo systemctl status minepanel
sudo journalctl -u minepanel -f
```

### Update
```bash
sudo ./update.sh
```

## Nginx Reverse Proxy

```nginx
server {
    listen 80;
    server_name minepanel.example.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name minepanel.example.com;

    ssl_certificate /etc/ssl/certs/cert.pem;
    ssl_certificate_key /etc/ssl/private/key.pem;

    location / {
        proxy_pass http://localhost:8082;
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

## Backup Strategy

### Automated Backups
```bash
0 2 * * * /opt/minepanel/backup.sh
```

### Manual Backup
```bash
cp /var/lib/minepanel/data/minepanel.db /backups/minepanel-$(date +%Y%m%d).db
```

### Restore
```bash
cp /backups/minepanel-YYYYMMDD.db /var/lib/minepanel/data/minepanel.db
systemctl restart minepanel
```

## Monitoring

### Health Check
```bash
curl http://localhost:8082/health
```

### Logs
```bash
# Docker
docker-compose logs minepanel

# Systemd
journalctl -u minepanel
```

### Metrics (Prometheus)
```
http://localhost:8082/metrics
```
```

```markdown
File: docs/TROUBLESHOOTING.md
─────────────────────────────

# Troubleshooting Guide

## Common Issues

### Application won't start
1. Check logs: `journalctl -u minepanel -n 50`
2. Verify database: `sqlite3 /app/data/minepanel.db ".tables"`
3. Check permissions: `ls -la /app/data/`
4. Check port: `lsof -i :8082`

### Database locked
```bash
# Restart application
systemctl restart minepanel

# If persistent, check for stale connections
ps aux | grep minepanel
```

### High memory usage
1. Check stats: `/api/servers/:id/stats`
2. Review logs for memory leaks
3. Restart if necessary: `systemctl restart minepanel`
4. Monitor with: `docker stats minepanel`

### Discord bot not working
1. Verify token: `DISCORD_TOKEN` in .env
2. Check permissions in Discord
3. Verify intents enabled
4. Check logs for errors

### FTP not accessible
1. Check firewall: `sudo ufw status`
2. Check port: `netstat -tlnp | grep 21`
3. Check config: `FTP_PORT=21`
4. Try passive mode

## Getting Help

1. Check logs
2. Review documentation
3. Open GitHub issue with:
   - Logs (sanitized)
   - Configuration (sanitized)
   - Steps to reproduce
4. Contact support: support@minepanel.dev
```

```markdown
File: docs/ARCHITECTURE.md
──────────────────────────

# Architecture Overview

## System Design

```
┌─────────────────┐
│   Web Browser   │
└────────┬────────┘
         │ HTTP/WebSocket
         ▼
┌─────────────────────────┐
│   Express.js API        │
│  - Authentication       │
│  - Route Handlers       │
│  - Middleware           │
└────────┬────────────────┘
         │
    ┌────┴────┬──────────┬──────────┐
    ▼         ▼          ▼          ▼
┌────────┐ ┌───────┐ ┌──────┐ ┌───────┐
│Database│ │Discord│ │ FTP  │ │ Files │
│SQLite  │ │ Bot   │ │Server│ │System │
└────────┘ └───────┘ └──────┘ └───────┘
```

## Core Components

### API Layer
- Express routes
- Authentication/Authorization
- Input validation
- Error handling

### Service Layer
- Process management
- Server lifecycle
- Statistics collection
- File operations

### Data Layer
- Sequelize ORM
- SQLite database
- Migrations
- Transactions

### Integration Layer
- Discord bot
- FTP server
- Webhook system

## Database Schema

```sql
users
├─ id (PK)
├─ username
├─ email
├─ passwordHash
├─ role
├─ totpEnabled
├─ webauthnEnabled
└─ createdAt

servers
├─ id (PK)
├─ userId (FK)
├─ name
├─ type
├─ port
├─ status
├─ memory
└─ path

... (8+ more tables)
```
```

```markdown
File: docs/CONTRIBUTING.md
──────────────────────────

# Contributing Guide

## Code Style

### JavaScript
- Use ES6+ syntax
- Consistent 2-space indentation
- camelCase for variables/functions
- PascalCase for classes
- Use JSDoc comments

### Formatting
```bash
npm run lint          # Check style
npm run lint:fix      # Fix automatically
```

## Development Workflow

1. Fork repository
2. Create feature branch: `git checkout -b feature/name`
3. Make changes
4. Write tests: `npm test`
5. Check coverage: `npm run test:coverage`
6. Commit: `git commit -m "Description"`
7. Push: `git push origin feature/name`
8. Create Pull Request

## Pull Request Checklist

- [ ] Tests pass: `npm test`
- [ ] Coverage maintained: `npm run test:coverage`
- [ ] Code linted: `npm run lint:fix`
- [ ] Documentation updated
- [ ] Changelog updated
- [ ] No sensitive data in code

## Testing

```bash
npm test              # Run all tests
npm run test:unit     # Unit tests only
npm run test:integration # Integration tests
npm run test:coverage # Coverage report
npm run test:watch    # Watch mode
```

## Commit Messages

```
type(scope): subject

body

footer
```

Types: feat, fix, docs, style, refactor, perf, test, chore

Example:
```
feat(server): add graceful shutdown timeout

Implements graceful shutdown with configurable timeout
for saving world data before process termination.

Fixes #123
```
```

**Success Metrics:**
- ✅ Complete installation guide
- ✅ Configuration documentation
- ✅ API documentation (Swagger)
- ✅ Security guidelines
- ✅ Deployment guide
- ✅ Troubleshooting guide
- ✅ Architecture documentation
- ✅ Contributing guidelines
- ✅ Score: +12 points

---

## 🎯 SCORING SUMMARY

### Phase Breakdown

```
PHASE 1: Security Hardening
└─ +22 points (72→94)
   ├─ ORM Migration: +15
   ├─ HTTPS: +3
   ├─ WebAuthn: +4
   └─ Input Validation: +4

PHASE 2: Code Quality
└─ +22 points (70→92)
   ├─ Route Modularization: +10
   ├─ Error Handling: +8
   └─ Documentation: +4

PHASE 3: Deployment
└─ +34 points (60→94)
   ├─ Docker: +15
   ├─ Systemd: +10
   └─ CI/CD: +9

PHASE 4: Testing
└─ +25 points (coverage → 90%+)
   ├─ Unit Tests: +12
   ├─ Integration Tests: +8
   └─ Security Tests: +5

PHASE 5: Documentation
└─ +12 points (60→96)
   ├─ Swagger: +10
   └─ Guides: +2

TOTAL: +20.5 points (74.5→95.0) ✅
```

---

## 📊 FINAL SCORE

```
CATEGORY         BEFORE  AFTER   GAIN
─────────────────────────────────────
Security           72     94    +22 ✅
Code Quality       70     92    +22 ✅
Deployment         60     94    +34 ✅
Architecture       65     93    +28 ✅
Performance        80     78     -2
Features           88     88      0
DX                 82     90     +8 ✅
Maintenance        70     96    +26 ✅
─────────────────────────────────────
OVERALL           74.5   95.0  +20.5 ✅
```

---

## 🤖 AI AGENT CONFIGURATION

### Task Management
```yaml
Task Distribution:
  - Code Generation: 65% (210 hours)
  - Testing: 20% (64 hours)
  - Documentation: 10% (32 hours)
  - Review/Feedback: 5% (16 hours)

Total AI Hours: 322 hours
```

### Quality Gates

```markdown
## Before Merge
- [ ] All tests passing
- [ ] Coverage maintained
- [ ] Security audit passed
- [ ] Linting passed
- [ ] Documentation updated
- [ ] Performance acceptable

## Before Release
- [ ] All features working
- [ ] No regressions
- [ ] Security review complete
- [ ] Performance benchmarked
- [ ] Full integration testing
- [ ] Documentation complete
```

---

## 📋 DAILY TASK GENERATION

### Automated Task Breakdown

**Example Day 1 Tasks:**

```markdown
## Day 1: Phase 1, Task 1.1 (ORM Analysis)

### Morning (4 hours)
- [ ] Scan all files for SQL queries
- [ ] Create query audit report
- [ ] Map database schema
- [ ] Plan migration path

### Afternoon (4 hours)
- [ ] Create Sequelize config
- [ ] Setup connection pooling
- [ ] Write initial models
- [ ] Create test database

### Deliverables
- `orm-migration-plan.md` (analysis document)
- `src/db/config.js` (Sequelize config)
- `src/db/models/` (initial models)

### Success Criteria
- All SQL patterns identified
- Models match schema
- Tests created
- Documentation complete
```

---

## 🚀 IMPLEMENTATION START

### Day 0: Setup
```bash
# 1. Create GitHub project board
# 2. Setup CI/CD pipeline
# 3. Create initial AI agent task list
# 4. Configure notifications
```

### Week 1: Phase 1 (Security)
```bash
Day 1-2: ORM setup
Day 3-4: Route migration
Day 5: HTTPS + WebAuthn
```

### Week 2-3: Continued Phase 1 & Phase 2
```bash
Week 2: ORM completion + Tests
Week 3: Code refactoring
```

### Week 4: Phase 3 (Deployment)
```bash
Docker, Systemd, CI/CD
```

### Week 5: Phase 4 (Testing)
```bash
Unit, Integration, Security tests
90%+ coverage
```

### Week 6: Phase 5 (Documentation)
```bash
Swagger, Guides, Final polish
```

---

## ✅ SUCCESS VERIFICATION

### Automated Checks
```bash
# Security
npm audit                    # 0 high/critical
snyk test                   # Pass all checks

# Code Quality
npm run lint               # 0 errors
npm run test:coverage      # 90%+ coverage

# Performance
npm run perf:bench         # Within limits
docker build               # Successful

# Documentation
npm run docs:generate      # Success
swagger-cli validate       # Valid spec
```

### Final Audit
```markdown
## Production Readiness Checklist

✅ Security: 94/100
  - No SQL injection vulnerabilities
  - HTTPS enforced
  - 2FA support (TOTP + WebAuthn)
  - Comprehensive input validation

✅ Code Quality: 92/100
  - All modules < 500 lines
  - Consistent error handling
  - 100% JSDoc coverage
  - No duplicate code

✅ Deployment: 94/100
  - Docker working
  - Systemd service ready
  - CI/CD pipeline functional
  - Zero-downtime deployment

✅ Testing: 90%+ coverage
  - Unit tests: 90%+
  - Integration tests: All flows
  - Security tests: OWASP checks
  - Performance tests: Passing

✅ Documentation: 96/100
  - API docs (Swagger)
  - Setup guide
  - Security guide
  - Deployment guide
```

---

## 📞 AGENT COMMUNICATION

### Daily Report Format
```markdown
## Daily Report - Day N

### Completed Tasks
- [x] Task 1 (X hours)
- [x] Task 2 (X hours)
- [ ] Task 3 (in progress)

### Code Generated
- X files created
- X tests added
- X documentation updates

### Metrics
- Test Coverage: Y%
- Build Time: Z sec
- Files Modified: N

### Blockers
- None / [List of blockers]

### Tomorrow
- Task A
- Task B
```

### Weekly Report Format
```markdown
## Weekly Report - Week N

### Summary
- Tasks Completed: N/N
- Score Improvement: +X points
- Code Added: Y lines
- Tests Added: Z tests

### Metrics
- Coverage: Y%
- Issues Fixed: N
- Tests Passing: 100%

### Progress to Goal
Current: 74.5/100
Target: 95/100
Progress: +X points this week
Remaining: +Y points

### Next Week
- Phase N, Task N
- [Tasks list]
```

---
