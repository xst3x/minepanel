const fs = require('fs');
const path = require('path');

const VAULT_DESKTOP = path.resolve(__dirname, '..', 'obsidian-graph');
const VAULT_DOCS = 'C:\\Users\\stefa\\Documents\\Obsidian Vault\\MinePanel';

console.log('--- Step 1: Guaranteeing 100% complete transfer and mirror ---');

// Helper to copy recursively
function copyRecursive(src, dest) {
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
  for (const item of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, item.name);
    const d = path.join(dest, item.name);
    if (item.isDirectory()) {
      copyRecursive(s, d);
    } else {
      fs.copyFileSync(s, d);
    }
  }
}

// Ensure everything in Documents is in Desktop and vice versa
if (fs.existsSync(VAULT_DOCS)) {
  copyRecursive(VAULT_DOCS, VAULT_DESKTOP);
}
copyRecursive(VAULT_DESKTOP, VAULT_DOCS);

console.log('--- Step 2: Enriching Cross-Domain Connectors ---');

// Define deep cross-domain connector injections for plans, stages, docs, audits, pages, and resolvers
const connectorRules = [
  // --- PLANS (Plan 1) ---
  {
    filter: (p) => p.includes('phase-1-security-audit'),
    additions: `
## Architecture Connections
- Core Subsystem: [[Subsystem - Authentication and Permissions]]
- Implementation: [[Authentication Core Service]], [[API Key Authentication]]
- Security Flows: [[Data Flow - Two-Factor Authentication and JWT]]
- Database Schema: [[Migration 009 - Add 2FA and Token Revocation]]
- Audit Trail: [[Audit Logger]], [[Model - AuditLog]]
`
  },
  {
    filter: (p) => p.includes('phase-2-error-handling-audit'),
    additions: `
## Architecture Connections
- Error Framework: [[Application Errors Framework]]
- Structured Codes: [[Application Error Codes]]
- Subsystem: [[Subsystem - Core Backend and Web Server]]
- Lifecycle Safety: [[ADR - Mutex Locking Strategy for Server Lifecycle]]
- Entrypoint Integration: [[MinePanel Entrypoint]]
`
  },
  {
    filter: (p) => p.includes('phase-3-centralized-errors'),
    additions: `
## Architecture Connections
- Error Classes: [[Application Errors Framework]]
- Error Constants: [[Application Error Codes]]
- Process Execution Errors: [[Execution Manager]], [[Process Manager Wrapper]]
- API Route Guards: [[API Key Auth Middleware]], [[Input Validators Middleware]]
`
  },
  {
    filter: (p) => p.includes('phase-4-validation'),
    additions: `
## Architecture Connections
- Middleware: [[Input Validators Middleware]], [[Validators Middleware]]
- Password Rules: [[Password Validator Utility]]
- IP Checking: [[IP Allowlist Utility]]
- Python Script Validation: [[Python AST Validator]]
`
  },
  {
    filter: (p) => p.includes('phase-5-auth-review'),
    additions: `
## Architecture Connections
- Auth Engine: [[Authentication Core Service]], [[Subsystem - Authentication and Permissions]]
- User Entity: [[Model - User]], [[Model - Rank]]
- Session Tokens: [[Model - AccountCreationToken]]
- Endpoints: [[Auth Routes]], [[User Management Routes]]
`
  },
  {
    filter: (p) => p.includes('phase-6-testing'),
    additions: `
## Architecture Connections
- Supervisor Watchdog: [[Launcher Watchdog]]
- Process Supervision: [[Launcher Process Manager]]
- Database Recovery: [[Failure Mode - Database Corruption and Integrity PRAGMA Check]]
- Port Collision Tests: [[Failure Mode - Server Port Collision and Rebind Rollback]]
`
  },
  {
    filter: (p) => p.includes('phase-7-performance-audit'),
    additions: `
## Architecture Connections
- Telemetry Collector: [[Performance Telemetry Collector]]
- Throttling: [[Throttle Manager]], [[Migration 003 - Add Throttle Config]]
- Metrics Subsystem: [[Subsystem - Resource Monitoring and Safety]]
- Prometheus: [[Observability - Prometheus Metrics Export]]
`
  },
  {
    filter: (p) => p.includes('phase-8-logging'),
    additions: `
## Architecture Connections
- Request Logging: [[Request Logger Middleware]]
- Output Redirection: [[Observability - Structured Logging and Stdio Redirection]]
- Console Parser: [[Process Output Parser]], [[Console Stats Parser]]
- Route: [[Log Routes]]
`
  },
  {
    filter: (p) => p.includes('phase-9-documentation'),
    additions: `
## Architecture Connections
- Documentation Routes: [[Documentation Routes]]
- Frontend Reader: [[Frontend Page - Docs]]
- OpenAPI Specs: [[Server API Documentation Routes]]
- Index: [[INDEX]]
`
  },

  // --- PLANS (Plan 2) ---
  {
    filter: (p) => p.includes('MINEPANEL_ACTIONPLAN'),
    additions: `
## Architecture Connections
- Master Plan: [[MASTER_ROADMAP]]
- Backend Subsystem: [[Subsystem - Core Backend and Web Server]]
- Persistence: [[Subsystem - Database and Persistence]]
- Supervisor: [[Subsystem - Supervisor and Launcher]]
`
  },
  {
    filter: (p) => p.includes('MINEPANEL_VS_CRAFTY_ANALYSIS'),
    additions: `
## Architecture Connections
- Python Architecture: [[ADR - AST-Validated Python Subprocess Isolation]]
- Process Separation: [[ADR - Dedicated Worker Process and IPC Separation]]
- Native Java Execution: [[Execution Manager]], [[Real Process Manager]]
- Automation Advantage: [[Subsystem - Server Automations Engine]], [[Automation Engine]]
`
  },
  {
    filter: (p) => p.includes('STAGE_1_SECURITY'),
    additions: `
## Architecture Connections
- Security Layer: [[Subsystem - Authentication and Permissions]]
- Auth Core: [[Authentication Core Service]]
- Token Revocation: [[Migration 009 - Add 2FA and Token Revocation]]
- API Keys: [[Migration 022 - Server API Keys]], [[API Key Auth Middleware]]
`
  },
  {
    filter: (p) => p.includes('STAGE_2_ERROR_HANDLING'),
    additions: `
## Architecture Connections
- Framework: [[Application Errors Framework]]
- Structured Codes: [[Application Error Codes]]
- Web Server Handler: [[MinePanel Entrypoint]]
`
  },
  {
    filter: (p) => p.includes('STAGE_3_INPUT_VALIDATION'),
    additions: `
## Architecture Connections
- Validation Layer: [[Input Validators Middleware]]
- Utilities: [[Password Validator Utility]], [[IP Allowlist Utility]]
- Route Schemas: [[Server Management Routes]], [[User Management Routes]]
`
  },
  {
    filter: (p) => p.includes('STAGE_4_LOGGING'),
    additions: `
## Architecture Connections
- Logging Middleware: [[Request Logger Middleware]]
- Observability: [[Observability - Structured Logging and Stdio Redirection]]
- Audit Log Storage: [[Model - AuditLog]], [[Migration 006 - Audit Log]]
`
  },
  {
    filter: (p) => p.includes('STAGE_5_DATABASE_MIGRATIONS'),
    additions: `
## Architecture Connections
- Migration Engine: [[Database Migration Runner]]
- Management CLI: [[Database CLI Tool]]
- Storage Abstraction: [[Database Access Layer]], [[Sequelize ORM Layer]]
- Initial Schema: [[Migration 001 - Initial Schema]]
`
  },
  {
    filter: (p) => p.includes('STAGE_6_STATISTICS_DASHBOARD'),
    additions: `
## Architecture Connections
- Polling Worker: [[Stats Collector]]
- Time-series Table: [[Model - ServerStats]], [[Migration 002 - Add Stats Table]]
- Disk Telemetry: [[Disk Usage Calculator]], [[Migration 007 - Add Disk Bytes to Stats]]
- UI Charts: [[Frontend Overview View]], [[Frontend Page - Servers]]
`
  },
  {
    filter: (p) => p.includes('STAGE_7_TEMPLATES_WEBHOOKS'),
    additions: `
## Architecture Connections
- Webhook Subsystem: [[Webhook Manager]]
- Event Payload Schema: [[Migration 003 - Add Webhooks Table]], [[Model - Webhook]]
- Threshold Events: [[Threshold Manager]]
- Discord Notifications: [[Subsystem - Discord Bot Integration]]
`
  },
  {
    filter: (p) => p.includes('STAGE_8_TESTING_RELEASE'),
    additions: `
## Architecture Connections
- Launcher Supervisor: [[Launcher Supervisor]], [[Subsystem - Supervisor and Launcher]]
- Auto Updater: [[Launcher Updater]]
- Watchdog: [[Launcher Watchdog]]
`
  },

  // --- PLANS (Plan 3) ---
  {
    filter: (p) => p.includes('EXECUTIVE_SUMMARY'),
    additions: `
## Architecture Connections
- Central Map: [[Project]]
- Master Roadmap: [[MASTER_ROADMAP]]
- Codebase Audit: [[DEEP_AUDIT]]
- Key Subsystems: [[Subsystem - Core Backend and Web Server]], [[Subsystem - Process Management and Workers]]
`
  },
  {
    filter: (p) => p.includes('Implementation_Guide_Top5'),
    additions: `
## Architecture Connections
- Process Manager: [[Execution Manager]], [[Process Manager Wrapper]]
- Database Layer: [[Database Access Layer]], [[Database Migration Runner]]
- Metrics & Telemetry: [[Stats Collector]], [[Threshold Manager]]
- Webhook Dispatch: [[Webhook Manager]]
- Python Engine: [[Python Sandbox Runner]], [[Automation Engine]]
`
  },
  {
    filter: (p) => p.includes('MinePanel_vs_Crafty_Analiza_Completa'),
    additions: `
## Architecture Connections
- Execution Architecture: [[ADR - Dedicated Worker Process and IPC Separation]]
- In-Process Python Runner: [[ADR - AST-Validated Python Subprocess Isolation]]
- Bedrock Compatibility: [[Bedrock Adapter]], [[Bedrock Dedicated Adapter]], [[PocketMine Adapter]]
- Resource Management: [[Throttle Manager]], [[Subsystem - Resource Monitoring and Safety]]
`
  },

  // --- MASTERPLAN (00 to 11) ---
  {
    filter: (p) => p.includes('00-GENERAL-RULES'),
    additions: `
## Architecture Connections
- Entrypoint: [[MinePanel Entrypoint]]
- Architecture Foundations: [[Project]]
- Config Specifications: [[Config - Environment Variables Specification]]
`
  },
  {
    filter: (p) => p.includes('01-STAGE_SECURITY'),
    additions: `
## Architecture Connections
- Subsystem: [[Subsystem - Authentication and Permissions]]
- Core Service: [[Authentication Core Service]]
- Token Security: [[Migration 009 - Add 2FA and Token Revocation]], [[Migration 010 - Add TOTP Backup Codes]]
- Scoped Keys: [[Migration 022 - Server API Keys]], [[Migration 023 - Server API Keys IP Allowlist]]
`
  },
  {
    filter: (p) => p.includes('02-STAGE_ERROR_ARCHITECTURE'),
    additions: `
## Architecture Connections
- Subsystem: [[Subsystem - Core Backend and Web Server]]
- Error Hierarchy: [[Application Errors Framework]]
- Error Enums: [[Application Error Codes]]
`
  },
  {
    filter: (p) => p.includes('03-STAGE_VALIDATION'),
    additions: `
## Architecture Connections
- Middleware: [[Input Validators Middleware]]
- Password Check: [[Password Validator Utility]]
- CIDR Range Validator: [[IP Allowlist Utility]]
`
  },
  {
    filter: (p) => p.includes('04-STAGE_LOGGING_MONITORING'),
    additions: `
## Architecture Connections
- Subsystem: [[Subsystem - Resource Monitoring and Safety]]
- Request Logging: [[Request Logger Middleware]]
- Prometheus Metrics: [[Observability - Prometheus Metrics Export]]
- Metrics Collector: [[Performance Telemetry Collector]]
`
  },
  {
    filter: (p) => p.includes('05-STAGE_DATABASE'),
    additions: `
## Architecture Connections
- Subsystem: [[Subsystem - Database and Persistence]]
- Migration Pipeline: [[Database Migration Runner]]
- Management Tool: [[Database CLI Tool]]
- Core DB: [[Database Access Layer]], [[Sequelize ORM Layer]]
`
  },
  {
    filter: (p) => p.includes('06-STAGE_STATISTICS_DASHBOARD'),
    additions: `
## Architecture Connections
- Collector Worker: [[Stats Collector]]
- Data Table: [[Model - ServerStats]], [[Migration 002 - Add Stats Table]]
- Disk Telemetry: [[Disk Usage Calculator]]
- Frontend Visuals: [[Frontend Page - Servers]], [[Frontend Overview View]]
`
  },
  {
    filter: (p) => p.includes('07-STAGE_TEMPLATES_WEBHOOKS'),
    additions: `
## Architecture Connections
- Webhook Subsystem: [[Webhook Manager]]
- Database Table: [[Migration 003 - Add Webhooks Table]], [[Model - Webhook]]
- Server Presets: [[Server Helper]], [[Server Lifecycle Helpers]]
`
  },
  {
    filter: (p) => p.includes('08-STAGE_COMPETITIVE_ADVANTAGES'),
    additions: `
## Architecture Connections
- Zero-Docker Native: [[Execution Manager]], [[Real Process Manager]]
- Dual Protocol Sniffer: [[ADR - Dual HTTP and HTTPS Sniffer Socket Routing]]
- Integrated FTP: [[Subsystem - Embedded FTP Server]], [[SFTP Server]]
- Discord Bots: [[Subsystem - Discord Bot Integration]], [[Discord Manager]]
`
  },
  {
    filter: (p) => p.includes('09-STAGE_PERFORMANCE'),
    additions: `
## Architecture Connections
- Throttling Engine: [[Throttle Manager]], [[Migration 003 - Add Throttle Config]]
- Host Telemetry: [[Performance Telemetry Collector]]
- Process Wrapper: [[Process Manager Wrapper]], [[Proxy Process Manager]]
`
  },
  {
    filter: (p) => p.includes('10-STAGE_TESTING_RELEASE'),
    additions: `
## Architecture Connections
- Supervisor Subsystem: [[Subsystem - Supervisor and Launcher]]
- Crash Recovery: [[Flow - Crash Detection and Auto-Restart Loop]], [[Launcher Watchdog]]
- Updater: [[Launcher Updater]], [[Launcher Process Manager]]
`
  },
  {
    filter: (p) => p.includes('11-STAGE_DOCUMENTATION'),
    additions: `
## Architecture Connections
- In-Panel Docs: [[Frontend Page - Docs]]
- Backend Server: [[Documentation Routes]]
- External API Docs: [[Server API Documentation Routes]]
- Graph Index: [[INDEX]]
`
  },

  // --- DOCUMENTATION GUIDES ---
  {
    filter: (p) => p.includes('panel-settings'),
    additions: `
## Architecture Connections
- Settings Page: [[Frontend Page - Server Settings]]
- Configuration Core: [[Config Module]]
- Setting Model: [[Model - Setting]]
`
  },
  {
    filter: (p) => p.includes('sftp-and-db'),
    additions: `
## Architecture Connections
- SFTP Service: [[SFTP Server]]
- FTP Service: [[Subsystem - Embedded FTP Server]]
- SQLite Layer: [[Database Access Layer]]
- File Routes: [[File Routes]]
`
  },
  {
    filter: (p) => p.includes('websocket'),
    additions: `
## Architecture Connections
- Web Console: [[WebSocket Console Server]]
- External API WebSocket: [[Server API WebSocket]], [[Server API WebSocket Subsystem]]
- Live Streaming Flow: [[Data Flow - Live Console Streaming]]
`
  },
  {
    filter: (p) => p.includes('Automations'),
    additions: `
## Architecture Connections
- Engine: [[Automation Engine]], [[Subsystem - Server Automations Engine]]
- Python Sandbox: [[Python Sandbox Runner]], [[Python AST Validator]]
- Flow: [[Data Flow - Sandboxed Python Automations]]
- UI View: [[Frontend Automation View]]
`
  },
  {
    filter: (p) => p.includes('discord-bot'),
    additions: `
## Architecture Connections
- Bot Subsystem: [[Subsystem - Discord Bot Integration]]
- Manager: [[Discord Manager]], [[Discord Provisioner]]
- Slash Commands: [[Discord Slash Commands]], [[Discord Command Registrar]]
- Event Bridge: [[Discord Event Bridge]]
`
  },
  {
    filter: (p) => p.includes('architecture.md'),
    additions: `
## Architecture Connections
- Root Map: [[Project]]
- Backend Server: [[Subsystem - Core Backend and Web Server]]
- Process Tier: [[Subsystem - Process Management and Workers]]
- Database Tier: [[Subsystem - Database and Persistence]]
`
  },
  {
    filter: (p) => p.includes('welcome.md'),
    additions: `
## Architecture Connections
- Onboarding Flow: [[Flow - Application Startup and Boot Sequence]]
- User Setup: [[Flow - Server Creation and Import Wizard]]
- Panel View: [[Frontend Page - Panel]]
`
  },
  {
    filter: (p) => p.includes('ranks.md'),
    additions: `
## Architecture Connections
- Permissions System: [[Permissions System]]
- Rank Model: [[Model - Rank]]
- UI View: [[Page - Ranks Management]]
- API Route: [[Rank Management Routes]]
`
  },
  {
    filter: (p) => p.includes('roles-and-permissions.md'),
    additions: `
## Architecture Connections
- Concept: [[Concept - Granular Permissions and Ranks]]
- Permission Model: [[Model - UserServerPermission]]
- Security Subsystem: [[Subsystem - Authentication and Permissions]]
`
  }
];

// Apply additions to notes in both vaults
function applyRules(vaultDir) {
  let updatedCount = 0;
  function scan(dir) {
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, item.name);
      if (item.isDirectory() && item.name !== '.obsidian') {
        scan(full);
      } else if (item.isFile() && item.name.endsWith('.md')) {
        let content = fs.readFileSync(full, 'utf8');
        let modified = false;
        for (const rule of connectorRules) {
          if (rule.filter(full)) {
            if (!content.includes(rule.additions.trim().split('\n')[0])) {
              content += '\n' + rule.additions;
              modified = true;
            }
          }
        }
        if (modified) {
          fs.writeFileSync(full, content, 'utf8');
          updatedCount++;
        }
      }
    }
  }
  scan(vaultDir);
  return updatedCount;
}

const c1 = applyRules(VAULT_DESKTOP);
const c2 = applyRules(VAULT_DOCS);
console.log(`Enriched ${c1} notes in Desktop vault and ${c2} notes in Documents vault with dense architecture connectors.`);

// Step 3: Configure stunning graph settings with clear color tags for all categories
const graphConfig = {
  "collapse-filter": false,
  "search": "",
  "showTags": false,
  "showAttachments": false,
  "hideUnresolved": false,
  "showOrphans": true,
  "collapse-color-groups": false,
  "colorGroups": [
    { "query": "tag:#masterplan", "color": { "a": 1, "rgb": 16728140 } },   // Crimson / Red
    { "query": "tag:#plan", "color": { "a": 1, "rgb": 16744448 } },         // Orange
    { "query": "tag:#audit", "color": { "a": 1, "rgb": 14423100 } },        // Coral
    { "query": "tag:#flow", "color": { "a": 1, "rgb": 16753920 } },         // Amber
    { "query": "tag:#subsystem", "color": { "a": 1, "rgb": 15099684 } },    // Violet / Purple
    { "query": "tag:#backend", "color": { "a": 1, "rgb": 3855523 } },       // Bright Blue
    { "query": "tag:#database", "color": { "a": 1, "rgb": 3901655 } },      // Teal
    { "query": "tag:#migration", "color": { "a": 1, "rgb": 16766720 } },     // Gold
    { "query": "tag:#automation", "color": { "a": 1, "rgb": 3394747 } },     // Emerald Green
    { "query": "tag:#discord", "color": { "a": 1, "rgb": 5865209 } },        // Discord Blurple
    { "query": "tag:#monitoring", "color": { "a": 1, "rgb": 16744272 } },    // Tangerine
    { "query": "tag:#security", "color": { "a": 1, "rgb": 10565866 } },      // Indigo
    { "query": "tag:#route", "color": { "a": 1, "rgb": 14436531 } },         // Magenta
    { "query": "tag:#frontend", "color": { "a": 1, "rgb": 4175344 } },       // Cyan
    { "query": "tag:#resolver", "color": { "a": 1, "rgb": 9699539 } },       // Mauve
    { "query": "tag:#docs", "color": { "a": 1, "rgb": 65484 } }              // Mint Green
  ],
  "collapse-display": false,
  "showArrow": true,
  "textFadeMultiplier": 0,
  "nodeSizeMultiplier": 1.25,
  "lineSizeMultiplier": 1.1,
  "collapse-forces": false,
  "centerStrength": 0.52,
  "repelStrength": 16,
  "linkStrength": 1,
  "linkDistance": 170,
  "scale": 0.35
};

fs.writeFileSync(path.join(VAULT_DESKTOP, '.obsidian', 'graph.json'), JSON.stringify(graphConfig, null, 2));
fs.writeFileSync(path.join(VAULT_DOCS, '.obsidian', 'graph.json'), JSON.stringify(graphConfig, null, 2));

console.log('--- Step 3: Configured cohesive graph physics and palette in both vaults ---');
