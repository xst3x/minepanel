// ── Demo Restrictions System ─────────────────────────────────────────────────
// Controls which features are available in the demo version and shows warnings.

const RESTRICTIONS = {
  // Server management
  'server.create.max':  { limit: 2, message: 'Server creation limit reached. Maximum 2 servers allowed in demo mode.' },
  'server.delete':      { message: 'Server deletion is disabled in the demo version.' },
  'server.import':      { message: 'Server import is disabled in the demo version.' },
  'server.switch':      { message: 'Engine switching is disabled in the demo version.' },
  
  // Files
  'file.upload':        { message: 'File upload is disabled in the demo version.' },
  'file.batch_download':{ message: 'Batch download is disabled in the demo version.' },
  
  // Users / Auth
  'user.create':        { message: 'User creation is disabled in the demo version.' },
  'user.delete':        { message: 'User deletion is disabled in the demo version.' },
  'user.change_name':   { message: 'Username change is disabled in the demo version.' },
  'user.change_password': { message: 'Password change is disabled in the demo version.' },
  'user.invite_token':  { message: 'Invite token generation is disabled in the demo version.' },
  'user.clear_tokens':  { message: 'Token clearing is disabled in the demo version.' },
  'user.register':      { message: 'Registration is disabled in the demo version.' },
  
  // 2FA
  '2fa.setup':          { message: '2FA setup is disabled in the demo version.' },
  '2fa.disable':        { message: '2FA disable is disabled in the demo version.' },
  '2fa.toggle':         { message: '2FA toggle is disabled in the demo version.' },
  '2fa.backup_codes':   { message: 'Backup codes are disabled in the demo version.' },
  
  // Password reset
  'password.reset':     { message: 'Password reset is disabled in the demo version.' },
  
  // Discord
  'discord.bot.create': { message: 'Discord bot creation is disabled in the demo version.' },
  'discord.bot.edit':   { message: 'Discord bot editing is disabled in the demo version.' },
  'discord.bot.delete': { message: 'Discord bot deletion is disabled in the demo version.' },
  'discord.bot.token':  { message: 'Discord bot token editing is disabled in the demo version.' },
  
  // Modpacks
  'modpack.install':    { message: 'Modpack installation is disabled in the demo version.' },
  
  // Plugins
  'plugin.install':     { message: 'Plugin installation is disabled in the demo version.' },
  
  // Settings
  'settings.save':      { message: 'System settings changes are disabled in the demo version.' },
  'settings.port':      { message: 'Port change is disabled in the demo version.' },
  
  // Automation
  'automation.create':  { message: 'Automation script creation is disabled in the demo version.' },
};

// ── Check if a feature is restricted ─────────────────────────────────────────
export function isDemoRestricted(featureKey) {
  return !!RESTRICTIONS[featureKey];
}

// ── Get restriction info ─────────────────────────────────────────────────────
export function getRestrictionInfo(featureKey) {
  return RESTRICTIONS[featureKey] || { message: 'This feature is unavailable in the demo version.' };
}

// ── Demo warning messages ────────────────────────────────────────────────────
export const DEMO_WARNINGS = {
  general: 'This is a limited demo version intended for testing purposes.',
  backend: 'Backend-dependent feature disabled in demo mode.',
  full: 'This feature requires the full version. Download the full version at github.com/xst3x/minepanel',
  download: 'Download the full version at github.com/xst3x/minepanel',
};

// ── Check if we can create a server (max 2) ──────────────────────────────────
export function checkServerCreateLimit(currentCount) {
  if (currentCount >= RESTRICTIONS['server.create.max'].limit) {
    return { allowed: false, message: RESTRICTIONS['server.create.max'].message };
  }
  return { allowed: true };
}

export default { isDemoRestricted, getRestrictionInfo, DEMO_WARNINGS, checkServerCreateLimit };
