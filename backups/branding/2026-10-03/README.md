# Original MinePanel branding

Snapshot taken before the simple M logo replacement on 2026-10-03.

- AppLayout.tsx: original sidebar logo, mobile icon, favicon SVG template and injection hook.
- Login.tsx: original login logo.
- index.html: original document head.

To restore the old branding, copy only the logo definitions, logo usages and favicon hook from these snapshots into the corresponding source files. Replace the new favicon link in src/frontend/index.html and rebuild with npm run build --workspace src/frontend. Do not replace whole files if other changes have since been made.
