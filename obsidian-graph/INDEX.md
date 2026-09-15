---
title: MinePanel Knowledge Graph Index
type: index
tags:
  - #index
  - #architecture
---

# MinePanel Architecture & Roadmap Knowledge Graph Index

Welcome to the comprehensive, unified knowledge graph for **MinePanel**.
Total verified nodes: **292 notes** across architecture, source modules, masterplans, internal roadmaps, audits, and documentation.

---

## 🏛️ Central Nexus & Entry Points
- [[Project]] — Root architectural map & overview
- [[MASTER_ROADMAP]] — Master roadmap across all development stages
- [[DEEP_AUDIT]] — Full codebase deep audit report
- [[MinePanel Entrypoint]] — Web server boot sequence
- [[Database Access Layer]] — Persistence engine
- [[Permissions System]] — Access control hierarchy

---

## 📂 Adapters
- [[Bedrock Adapter]]
- [[Bedrock Dedicated Adapter]]
- [[Bedrock Version Service]]
- [[Compatibility Engine]]
- [[Modpack Service]]
- [[PocketMine Adapter]]
- [[PocketMine Server Adapter]]
- [[Software Version Resolvers]]
- [[Update Manager]]
- [[Update Scheduler]]
- [[Version Fetcher]]
- [[Version Manager]]

## 📂 Audit
- [[DEEP_AUDIT]]

## 📂 Automation
- [[Automation Engine]]
- [[Automation Worker Manager]]
- [[Python AST Validator]]
- [[Python Sandbox Runner]]

## 📂 Concepts
- [[Concept - Granular Permissions and Ranks]]
- [[Concept - Minecraft Server Entity]]
- [[Concept - Server Instance Lifecycle States]]

## 📂 Config
- [[Config - Environment Variables Specification]]

## 📂 Core
- [[Application Error Codes]]
- [[Application Errors Framework]]
- [[Execution Manager]]
- [[Java Manager]]
- [[MinePanel Entrypoint]]
- [[SFTP Server]]
- [[Server API WebSocket]]
- [[Server API WebSocket Subsystem]]
- [[Server Helper]]
- [[Server Lifecycle Helpers]]
- [[WebSocket Console Server]]
- [[Webhook Manager]]

## 📂 Database
- [[Database Access Layer]]
- [[Database CLI Tool]]
- [[Database Migration Runner]]
- [[Model - AuditLog]]
- [[Model - DiscordBot]]
- [[Model - Rank]]
- [[Model - Server]]
- [[Model - ServerApiKey]]
- [[Model - ServerStats]]
- [[Model - User]]
- [[Model - Webhook]]
- [[Sequelize ORM Layer]]

## 📂 Database\Migrations
- [[Migration 001 - Initial Schema]]
- [[Migration 002 - Add Stats Table]]
- [[Migration 003 - Add Throttle Config]]
- [[Migration 003 - Add Webhooks Table]]
- [[Migration 004 - Add Threshold Rules]]
- [[Migration 005 - Add Statistics Config]]
- [[Migration 006 - Audit Log]]
- [[Migration 007 - Add Disk Bytes to Stats]]
- [[Migration 008 - Server Automation]]
- [[Migration 009 - Add 2FA and Token Revocation]]
- [[Migration 010 - Add TOTP Backup Codes]]
- [[Migration 011 - Add Avatar]]
- [[Migration 012 - Add TOTP Verified]]
- [[Migration 013 - Docker Execution Mode]]
- [[Migration 014 - Add Extra Ports]]
- [[Migration 015 - Auto Update Settings]]
- [[Migration 016 - Automation Rules]]
- [[Migration 017 - Visual Automation Fields]]
- [[Migration 018 - Python Automations]]
- [[Migration 019 - Add Sort Order to Ranks]]
- [[Migration 020 - Modpack Metadata]]
- [[Migration 021 - Custom Start Command]]
- [[Migration 022 - Server API Keys]]
- [[Migration 023 - Server API Keys IP Allowlist]]

## 📂 Database\Models
- [[Model - AccountCreationToken]]
- [[Model - DiscordBotServer]]
- [[Model - Setting]]
- [[Model - UserCustomAccent]]
- [[Model - UserServerPermission]]

## 📂 Decisions
- [[ADR - AST-Validated Python Subprocess Isolation]]
- [[ADR - Dedicated Worker Process and IPC Separation]]
- [[ADR - Dual HTTP and HTTPS Sniffer Socket Routing]]
- [[ADR - Dual SQLite Access Pattern (Raw Promises vs Sequelize)]]
- [[ADR - Mutex Locking Strategy for Server Lifecycle]]

## 📂 Discord
- [[Discord Bot Queries]]
- [[Discord CRUD Operations]]
- [[Discord Client Lifecycle]]
- [[Discord Command Registrar]]
- [[Discord Event Bridge]]
- [[Discord Interactions Handler]]
- [[Discord Legacy API]]
- [[Discord Live Session Manager]]
- [[Discord Manager]]
- [[Discord Provisioner]]
- [[Discord Shared State]]
- [[Discord Slash Commands]]

## 📂 Discord\Commands
- [[Discord Console Command]]
- [[Discord Lifecycle Commands]]
- [[Discord Players Command]]
- [[Discord Stats Command]]

## 📂 Documentation\advanced
- [[panel-settings]]
- [[sftp-and-db]]
- [[websocket]]

## 📂 Documentation\automations
- [[Automations]]

## 📂 Documentation\discord
- [[discord-bot]]

## 📂 Documentation\getting-started
- [[architecture]]
- [[welcome]]

## 📂 Documentation\users
- [[ranks]]
- [[roles-and-permissions]]

## 📂 Failures
- [[Failure Mode - Database Corruption and Integrity PRAGMA Check]]
- [[Failure Mode - Filesystem Lock Contention and Retry Backoff]]
- [[Failure Mode - Server Port Collision and Rebind Rollback]]

## 📂 Flows
- [[Data Flow - Live Console Streaming]]
- [[Data Flow - Multi-Threshold Safety Ladder]]
- [[Data Flow - Sandboxed Python Automations]]
- [[Data Flow - Server Power Lifecycle]]
- [[Data Flow - Two-Factor Authentication and JWT]]
- [[Flow - Application Startup and Boot Sequence]]
- [[Flow - Backup Creation and Safe Restoration]]
- [[Flow - Crash Detection and Auto-Restart Loop]]
- [[Flow - Server Creation and Import Wizard]]

## 📂 Frontend
- [[Frontend API Client]]
- [[Frontend App Shell]]
- [[Frontend Auth Context]]
- [[Frontend Automation View]]
- [[Frontend Console View]]
- [[Frontend File Manager View]]
- [[Frontend Overview View]]
- [[Frontend Server Layout]]

## 📂 Frontend\Components
- [[Component - CodeEditor]]
- [[Component - GlobalServerModals]]
- [[Component - ModpackBrowser]]
- [[Frontend Component - AppLayout]]
- [[Frontend Component - CodeEditor]]
- [[Frontend Component - ModpackBrowser]]
- [[Frontend Component - RequireAuth]]
- [[Frontend Component - ServerLayout]]
- [[Frontend Layout - AppLayout]]
- [[Frontend Log Parser]]

## 📂 Frontend\Context
- [[Frontend Context - AuthContext]]
- [[Frontend Context - ServerModalsContext]]

## 📂 Frontend\Pages
- [[Frontend Page - Docs]]
- [[Frontend Page - Panel]]
- [[Frontend Page - PocketMine Plugins]]
- [[Frontend Page - Profile]]
- [[Frontend Page - Server Backups]]
- [[Frontend Page - Server Logs]]
- [[Frontend Page - Server Settings]]
- [[Frontend Page - Servers]]
- [[Page - Discord Settings]]
- [[Page - Ranks Management]]
- [[Page - Server API Keys]]
- [[Page - Server Content and Plugins]]
- [[Page - Server Properties]]
- [[Page - User Management]]

## 📂 Hotspots
- [[Hotspot - Database Access Layer]]
- [[Hotspot - MinePanel Entrypoint]]
- [[Hotspot - Process Manager Wrapper]]

## 📂 Launcher
- [[Launcher Backend Monitor]]
- [[Launcher IPC Protocol]]
- [[Launcher Process Manager]]
- [[Launcher Protocol Server]]
- [[Launcher Supervisor]]
- [[Launcher Updater]]
- [[Launcher Watchdog]]

## 📂 MasterPlan
- [[00-GENERAL-RULES]]
- [[01-STAGE_SECURITY]]
- [[02-STAGE_ERROR_ARCHITECTURE]]
- [[03-STAGE_VALIDATION]]
- [[04-STAGE_LOGGING_MONITORING]]
- [[05-STAGE_DATABASE]]
- [[06-STAGE_STATISTICS_DASHBOARD]]
- [[07-STAGE_TEMPLATES_WEBHOOKS]]
- [[08-STAGE_COMPETITIVE_ADVANTAGES]]
- [[09-STAGE_PERFORMANCE]]
- [[10-STAGE_TESTING_RELEASE]]
- [[11-STAGE_DOCUMENTATION]]
- [[MASTER_ROADMAP]]

## 📂 Middleware
- [[API Key Auth Middleware]]
- [[Input Validators Middleware]]
- [[Request Logger Middleware]]
- [[Validators Middleware]]

## 📂 Monitoring
- [[Console Stats Parser]]
- [[Disk Usage Calculator]]
- [[Performance Telemetry Collector]]
- [[Stats Collector]]
- [[Threshold Manager]]
- [[Throttle Manager]]

## 📂 Observability
- [[Observability - Prometheus Metrics Export]]
- [[Observability - Structured Logging and Stdio Redirection]]

## 📂 Plans\plan 1
- [[phase-1-security-audit]]
- [[phase-2-error-handling-audit]]
- [[phase-3-centralized-errors]]
- [[phase-4-validation]]
- [[phase-5-auth-review]]
- [[phase-6-testing]]
- [[phase-7-performance-audit]]
- [[phase-8-logging]]
- [[phase-9-documentation]]

## 📂 Plans\plan 2
- [[MINEPANEL_ACTIONPLAN]]
- [[MINEPANEL_VS_CRAFTY_ANALYSIS]]
- [[STAGE_1_SECURITY]]
- [[STAGE_2_ERROR_HANDLING]]
- [[STAGE_3_INPUT_VALIDATION]]
- [[STAGE_4_LOGGING]]
- [[STAGE_5_DATABASE_MIGRATIONS]]
- [[STAGE_6_STATISTICS_DASHBOARD (to do now)]]
- [[STAGE_7_TEMPLATES_WEBHOOKS]]
- [[STAGE_8_TESTING_RELEASE]]

## 📂 Plans\plan 3\files
- [[EXECUTIVE_SUMMARY]]
- [[Implementation_Guide_Top5]]
- [[MinePanel_vs_Crafty_Analiza_Completa]]
- [[README]]

## 📂 Process
- [[Process Manager Wrapper]]
- [[Process Output Parser]]
- [[Process Persistence]]
- [[Proxy Process Manager]]
- [[Real Process Manager]]
- [[Worker Process]]

## 📂 Protocols
- [[IPC Protocol - API to Worker Messages]]
- [[IPC Protocol - Supervisor Protocol Server]]
- [[IPC Protocol - Worker to API Events]]

## 📂 Resolvers
- [[Arclight Resolver]]
- [[Fabric Resolver]]
- [[Folia Resolver]]
- [[Forge Resolver]]
- [[GitHub Java Resolver]]
- [[Leaves Resolver]]
- [[Magma Resolver]]
- [[Mohist Resolver]]
- [[NeoForge Resolver]]
- [[Paper Resolver]]
- [[Pufferfish Resolver]]
- [[Purpur Resolver]]
- [[Quilt Resolver]]
- [[SpongeVanilla Resolver]]
- [[Vanilla Resolver]]
- [[Velocity Resolver]]
- [[Waterfall Resolver]]

## 📂 Root
- [[2026-09-06]]
- [[Project]]

## 📂 Routes
- [[Auth Routes]]
- [[Automation Routes]]
- [[Backup Routes]]
- [[Discord Bots Routes]]
- [[Discord Routes]]
- [[Documentation Routes]]
- [[External Server API Routes]]
- [[File Routes]]
- [[Log Routes]]
- [[Modpack Routes]]
- [[Player Management Routes]]
- [[Player Routes]]
- [[Plugin Routes]]
- [[PocketMine Plugin Routes]]
- [[PocketMine Routes]]
- [[Properties Routes]]
- [[Rank Management Routes]]
- [[Server API Documentation Routes]]
- [[Server API Key Management Routes]]
- [[Server FTP Routes]]
- [[Server Lifecycle Routes]]
- [[Server Management Routes]]
- [[Server Update Routes]]
- [[Stats Routes]]
- [[System Diagnostics Routes]]
- [[System Routes]]
- [[Threshold Management Routes]]
- [[Threshold Routes]]
- [[User Management Routes]]

## 📂 Schedulers
- [[Scheduler - Auto-Update Polling Scheduler]]
- [[Scheduler - Token Expiration Cleanup Job]]

## 📂 Security
- [[API Key Authentication]]
- [[Audit Logger]]
- [[Authentication Core]]
- [[Authentication Core Service]]
- [[Encryption Utility]]
- [[Permissions System]]

## 📂 Subsystems
- [[Subsystem - Authentication and Permissions]]
- [[Subsystem - Core Backend and Web Server]]
- [[Subsystem - Database and Persistence]]
- [[Subsystem - Discord Bot Integration]]
- [[Subsystem - Embedded FTP Server]]
- [[Subsystem - External Server API]]
- [[Subsystem - File and Backup Management]]
- [[Subsystem - Frontend React Architecture]]
- [[Subsystem - Process Management and Workers]]
- [[Subsystem - Resource Monitoring and Safety]]
- [[Subsystem - Server Automations Engine]]
- [[Subsystem - Server Lifecycle and Adapters]]
- [[Subsystem - Software Resolvers and Updates]]
- [[Subsystem - Supervisor and Launcher]]

## 📂 Utilities
- [[Config Module]]
- [[Environment Helper]]
- [[File Retry Utility]]
- [[IP Allowlist Utility]]
- [[Password Validator Utility]]
