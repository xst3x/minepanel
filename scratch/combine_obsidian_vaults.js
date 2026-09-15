const fs = require('fs');
const path = require('path');

const VAULT_DESKTOP = path.resolve(__dirname, '..', 'obsidian-graph');
const VAULT_DOCUMENTS = 'C:\\Users\\stefa\\Documents\\Obsidian Vault\\MinePanel';
const MASTERPLAN_DIR = 'C:\\Users\\stefa\\Desktop\\minepanel files\\MinePanel_Ultimate_MasterPlan';
const PLANS_DIR = 'C:\\Users\\stefa\\Desktop\\minepanel files\\Plans-and-internal-stuff';
const DEEP_AUDIT_FILE = path.resolve(__dirname, '..', 'DEEP_AUDIT.md');
const DOCS_DIR = path.resolve(__dirname, '..', 'src', 'docs');

console.log('--- Starting Comprehensive Obsidian Vault Combination ---');

// Helper to copy and ensure directory
function ensureCopy(src, dest) {
  const dir = path.dirname(dest);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.copyFileSync(src, dest);
}

// 1. Copy MasterPlan files with frontmatter and wikilinks
if (fs.existsSync(MASTERPLAN_DIR)) {
  const files = fs.readdirSync(MASTERPLAN_DIR).filter(f => f.endsWith('.md'));
  console.log('Found MasterPlan files:', files.length);
  for (const f of files) {
    let content = fs.readFileSync(path.join(MASTERPLAN_DIR, f), 'utf8');
    const title = f.replace('.md', '');
    
    // Add frontmatter if not present
    if (!content.startsWith('---')) {
      content = `---
title: "${title}"
type: "masterplan"
tags:
  - #masterplan
  - #roadmap
---

# ${title}

> Part of the [[Project]] roadmap and [[MinePanel Master Roadmap]].

${content}

## Related Architecture
- Project Map: [[Project]]
- Subsystems: [[Subsystem - Core Backend and Web Server]], [[Subsystem - Database and Persistence]], [[Subsystem - Authentication and Permissions]]
`;
    }
    
    const dest1 = path.join(VAULT_DESKTOP, 'MasterPlan', f);
    const dest2 = path.join(VAULT_DOCUMENTS, 'MasterPlan', f);
    if (!fs.existsSync(path.dirname(dest1))) fs.mkdirSync(path.dirname(dest1), { recursive: true });
    if (!fs.existsSync(path.dirname(dest2))) fs.mkdirSync(path.dirname(dest2), { recursive: true });
    fs.writeFileSync(dest1, content, 'utf8');
    fs.writeFileSync(dest2, content, 'utf8');
  }
}

// 2. Copy Plans-and-internal-stuff files
if (fs.existsSync(PLANS_DIR)) {
  function walkAndCopy(dir, targetSubfolder) {
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, item.name);
      if (item.isDirectory()) {
        walkAndCopy(full, path.join(targetSubfolder, item.name));
      } else if (item.isFile() && item.name.endsWith('.md')) {
        let content = fs.readFileSync(full, 'utf8');
        const title = item.name.replace('.md', '');
        if (!content.startsWith('---')) {
          content = `---
title: "${title}"
type: "plan"
tags:
  - #plan
  - #architecture
---

# ${title}

> Internal development plan for [[Project]].

${content}

## Related Architecture
- Overview: [[Project]]
- Roadmap: [[MASTER_ROADMAP]]
`;
        }
        const dest1 = path.join(VAULT_DESKTOP, 'Plans', targetSubfolder, item.name);
        const dest2 = path.join(VAULT_DOCUMENTS, 'Plans', targetSubfolder, item.name);
        ensureCopy(full, dest1);
        fs.writeFileSync(dest1, content, 'utf8');
        ensureCopy(full, dest2);
        fs.writeFileSync(dest2, content, 'utf8');
      }
    }
  }
  walkAndCopy(PLANS_DIR, '');
  console.log('Finished copying Plans-and-internal-stuff.');
}

// 3. Integrate DEEP_AUDIT.md
if (fs.existsSync(DEEP_AUDIT_FILE)) {
  let auditContent = fs.readFileSync(DEEP_AUDIT_FILE, 'utf8');
  if (!auditContent.startsWith('---')) {
    auditContent = `---
title: "MinePanel Deep Codebase Audit"
type: "audit"
tags:
  - #audit
  - #security
  - #architecture
---

> Official deep architectural and security audit of the MinePanel repository.

${auditContent}

## Related Architecture
- Central Map: [[Project]]
- Error Framework: [[Application Errors Framework]]
- Security Layer: [[Subsystem - Authentication and Permissions]]
`;
  }
  ensureCopy(DEEP_AUDIT_FILE, path.join(VAULT_DESKTOP, 'Audit', 'DEEP_AUDIT.md'));
  fs.writeFileSync(path.join(VAULT_DESKTOP, 'Audit', 'DEEP_AUDIT.md'), auditContent, 'utf8');
  ensureCopy(DEEP_AUDIT_FILE, path.join(VAULT_DOCUMENTS, 'Audit', 'DEEP_AUDIT.md'));
  fs.writeFileSync(path.join(VAULT_DOCUMENTS, 'Audit', 'DEEP_AUDIT.md'), auditContent, 'utf8');
  console.log('Integrated DEEP_AUDIT.md.');
}

// 4. Integrate src/docs/
if (fs.existsSync(DOCS_DIR)) {
  function walkDocs(dir, targetSubfolder) {
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, item.name);
      if (item.isDirectory()) {
        walkDocs(full, path.join(targetSubfolder, item.name));
      } else if (item.isFile() && item.name.endsWith('.md')) {
        let content = fs.readFileSync(full, 'utf8');
        const title = item.name.replace('.md', '');
        if (!content.startsWith('---')) {
          content = `---
title: "Doc - ${title}"
type: "documentation"
tags:
  - #docs
---

# ${title}

${content}

## Related Architecture
- Documentation Routes: [[Documentation Routes]]
- Frontend Docs Viewer: [[Frontend Page - Docs]]
- Project Overview: [[Project]]
`;
        }
        const dest1 = path.join(VAULT_DESKTOP, 'Documentation', targetSubfolder, item.name);
        const dest2 = path.join(VAULT_DOCUMENTS, 'Documentation', targetSubfolder, item.name);
        ensureCopy(full, dest1);
        fs.writeFileSync(dest1, content, 'utf8');
        ensureCopy(full, dest2);
        fs.writeFileSync(dest2, content, 'utf8');
      }
    }
  }
  walkDocs(DOCS_DIR, '');
  console.log('Integrated src/docs documentation.');
}

console.log('All files imported successfully into both vault locations.');
