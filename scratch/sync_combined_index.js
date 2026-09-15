const fs = require('fs');
const path = require('path');

const VAULT_DESKTOP = path.resolve(__dirname, '..', 'obsidian-graph');
const VAULT_DOCUMENTS = 'C:\\Users\\stefa\\Documents\\Obsidian Vault\\MinePanel';

function generateIndex(vaultDir) {
  const categories = {};
  
  function scan(dir) {
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, item.name);
      if (item.isDirectory() && item.name !== '.obsidian') {
        scan(full);
      } else if (item.isFile() && item.name.endsWith('.md') && item.name !== 'INDEX.md') {
        const relDir = path.relative(vaultDir, dir) || 'Root';
        if (!categories[relDir]) categories[relDir] = [];
        categories[relDir].push(path.basename(item.name, '.md'));
      }
    }
  }

  scan(vaultDir);

  const totalNotes = Object.values(categories).reduce((acc, list) => acc + list.length, 0);

  let md = `---
title: MinePanel Knowledge Graph Index
type: index
tags:
  - #index
  - #architecture
---

# MinePanel Architecture & Roadmap Knowledge Graph Index

Welcome to the comprehensive, unified knowledge graph for **MinePanel**.
Total verified nodes: **${totalNotes} notes** across architecture, source modules, masterplans, internal roadmaps, audits, and documentation.

---

## 🏛️ Central Nexus & Entry Points
- [[Project]] — Root architectural map & overview
- [[MASTER_ROADMAP]] — Master roadmap across all development stages
- [[DEEP_AUDIT]] — Full codebase deep audit report
- [[MinePanel Entrypoint]] — Web server boot sequence
- [[Database Access Layer]] — Persistence engine
- [[Permissions System]] — Access control hierarchy

---
`;

  const sortedCats = Object.keys(categories).sort();
  for (const cat of sortedCats) {
    md += `\n## 📂 ${cat}\n`;
    const notes = categories[cat].sort();
    for (const n of notes) {
      md += `- [[${n}]]\n`;
    }
  }

  fs.writeFileSync(path.join(vaultDir, 'INDEX.md'), md, 'utf8');
  console.log(`Updated INDEX.md in ${vaultDir} with ${totalNotes} notes.`);
}

// Update Project.md in a vault directory
function updateProject(vaultDir) {
  const pPath = path.join(vaultDir, 'Project.md');
  if (!fs.existsSync(pPath)) return;
  let content = fs.readFileSync(pPath, 'utf8');
  
  const strategicSection = `
## 🗺️ Master Plans, Audits & Strategic Roadmaps

Unified planning and audit documents integrated into this graph:
- [[MASTER_ROADMAP]]: Consolidated master development roadmap
- [[DEEP_AUDIT]]: Comprehensive 48KB deep codebase audit & health score
- [[00-GENERAL-RULES]]: Coding standards, safety rules, and architecture constraints
- [[01-STAGE_SECURITY]]: Hardening auth, rate limits, and tokens
- [[02-STAGE_ERROR_ARCHITECTURE]]: Centralized error handler and typed exceptions
- [[03-STAGE_VALIDATION]]: Input sanitization and express-validator schemas
- [[04-STAGE_LOGGING_MONITORING]]: Structured JSON logging and Prometheus telemetry
- [[05-STAGE_DATABASE]]: SQLite integrity, migrations, and indexing
- [[06-STAGE_STATISTICS_DASHBOARD]]: Historical metrics charts and player telemetry
- [[07-STAGE_TEMPLATES_WEBHOOKS]]: Webhook dispatch engine and server templates
- [[08-STAGE_COMPETITIVE_ADVANTAGES]]: MinePanel vs Crafty feature matrix & differentiators
- [[09-STAGE_PERFORMANCE]]: Event loop optimizations and memory throttling
- [[10-STAGE_TESTING_RELEASE]]: Test automation, unit suites, and CI/CD pipelines
- [[11-STAGE_DOCUMENTATION]]: Internal and operator documentation
`;

  if (!content.includes('Master Plans, Audits & Strategic Roadmaps')) {
    content += '\n' + strategicSection;
    fs.writeFileSync(pPath, content, 'utf8');
    console.log(`Updated Project.md in ${vaultDir}.`);
  }
}

// Copy recursively helper
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

// 1. Sync from Desktop to Documents
copyRecursive(VAULT_DESKTOP, VAULT_DOCUMENTS);

// 2. Generate Index for both
generateIndex(VAULT_DESKTOP);
generateIndex(VAULT_DOCUMENTS);

// 3. Update Project.md for both
updateProject(VAULT_DESKTOP);
updateProject(VAULT_DOCUMENTS);

console.log('--- Successfully Combined and Synchronized Both Vaults ---');
