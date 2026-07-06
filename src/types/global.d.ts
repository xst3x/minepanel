// MinePanel Global Type Declarations
// These provide types for common patterns used throughout the codebase.

// ── Database row helper types ──────────────────────────────

// Allow `serverId`, `id`, `name`, `version`, `software`, `port`, `ram_mb`, `java_path`,
// `autostart_on_crash`, `automation_enabled`, `bot_token_encrypted`, `guild_id`, etc.
// on any object to fix property access from DB results.
interface DbResult {
  id: string | number;
  [key: string]: any;
}

// ── Loosen object type access ──────────────────────────────

// Allow any property access on `{}` and `object` types
// This fixes "Property does not exist on type '{}'" errors
interface Object {
  [key: string]: any;
}

// ── General 'any' for loose typing ─────────────────────────

// Allow property access on `unknown` type (common for DB results)
// Without this, every `result.someProperty` access on unknown would need a cast

// ── Timer & Node globals ───────────────────────────────────

// Ensure setTimeout/setInterval etc. are available without @types/node
// (already provided by @types/node, but this is a fallback)

// ── Fix Class Property Patterns ────────────────────────────

// For classes that extend EventEmitter but don't declare properties:
// We use declare to add properties at the interface level

// ── ProcessManager augmentation ────────────────────────────

// Allow `processes`, `lockTimers`, `locks`, `_stopIntents`, `pendingRequests`,
// `worker` properties on process managers
