// ── Server API WebSocket Handler ────────────────────────────────────────
// Authenticated WebSocket connections using API keys.
// Mounted at /ws/serverapi URL path.
//
// Auth flow:
// 1. Client connects to ws://host/ws/serverapi
// 2. Client sends: { type: 'auth', token: '<API_KEY>', serverId: 1 }
// 3. Server verifies the API key, checks scopes, and responds with events
//
// Message types (client server):
// auth – Authenticate with API key
// subscribe – Subscribe to specific event types
// unsubscribe – Unsubscribe from event types
// command – Send a console command (requires server.console.write scope)
//
// Event types (server client):
// console – Console output lines
// status – Server status changes
// stats – Performance metrics (every 2s)
// playerJoin – Player joined notification
// playerLeave – Player left notification
// serverStarted – Server started event
// serverStopped – Server stopped event
// serverRestarting – Server restarting event
// backupProgress – Backup progress updates
// tps_update – TPS metric update
// ram_update – RAM usage update
// cpu_update – CPU usage update

import argon2 = require('argon2')
const WebSocket = require('ws')
const { dbGet, dbRun } = require('../db/database')
import processManager = require('./processManager')
import executionManager = require('./executionManager')
const automationEngine = require('./automationEngine')
const logger = require('./utils/logger')
const audit = require('./utils/auditLog')
const { isIpAllowed } = require('./utils/ipAllowlist')

interface WsClient {
 ws: any
 serverId: string
 keyScopes: string[]
 keyId: number
 subscribed: Set<string>
 authenticated: boolean
 statsInterval: NodeJS.Timeout | null
 listeners: Map<string, (...args: any[]) => void>
}

// ── Scope-to-event mapping ──────────────────────────────────────────────
const SCOPE_EVENTS: Record<string, string[]> = {
 'server.console.read': ['console', 'status', 'serverStarted', 'serverStopped', 'serverRestarting', 'clear_console'],
 'server.console.write': [], // no events, just command sending
 'server.players.read': ['playerJoin', 'playerLeave'],
 'server.performance.read': ['stats', 'tps_update', 'ram_update', 'cpu_update'],
 'server.backups.read': ['backupProgress'],
 'server.backups.write': ['backupProgress'],
 'server.everything': [], // catch-all handled separately
}

function getEventsForScopes(scopes: string[]): Set<string> {
 const events = new Set<string>()
 for (const scope of scopes) {
 if (scope === 'server.everything') {
 // All events
 Object.values(SCOPE_EVENTS).forEach(e => e.forEach(ev => events.add(ev)))
 return events
 }
 const scopeEvents = SCOPE_EVENTS[scope]
 if (scopeEvents) scopeEvents.forEach(e => events.add(e))
 }
 return events
}

function hasScope(scopes: string[], required: string): boolean {
 return scopes.includes('server.everything') || scopes.includes(required)
}

// ── Verify API key ──────────────────────────────────────────────────────
async function verifyApiKey(token: string, serverId: string, clientIp?: string): Promise<{ valid: boolean; scopes?: string[]; keyId?: number; ipDenied?: boolean }> {
 try {
 const prefix = token.length >= 20 ? token.substring(0, 20) : token
 const key = await dbGet(
 `SELECT id, key_hash, scopes, expires_at, allowed_ips
 FROM server_api_keys 
 WHERE server_id = ? AND key_prefix = ? AND is_revoked = 0`,
 [serverId, prefix]
 )
 if (!key) return { valid: false }
 if (key.expires_at && new Date(key.expires_at).getTime() < Date.now()) return { valid: false }

 const isValid = await argon2.verify(key.key_hash, token)
 if (!isValid) return { valid: false }

 let scopes: string[] = ['server.read']
 try {
 scopes = JSON.parse(key.scopes || '["server.read"]')
 if (!Array.isArray(scopes)) scopes = ['server.read']
 } catch { /* use default */ }

 // Check IP allowlist (if set)
 let allowedIps: string[] = []
 try {
 allowedIps = JSON.parse(key.allowed_ips || '[]')
 if (!Array.isArray(allowedIps)) allowedIps = []
 } catch { allowedIps = [] }

 if (allowedIps.length > 0 && clientIp) {
 if (!isIpAllowed(clientIp, allowedIps)) {
 return { valid: false, ipDenied: true }
 }
 }

 // Update last_used_at (fire-and-forget)
 dbRun('UPDATE server_api_keys SET last_used_at = ? WHERE id = ?', [new Date().toISOString(), key.id]).catch(() => {})

 return { valid: true, scopes, keyId: key.id }
 } catch {
 return { valid: false }
 }
}

// ── Handle a single WebSocket connection ────────────────────────────────
function handleConnection(ws: any, req: any) {
 const client: WsClient = {
 ws,
 serverId: '',
 keyScopes: [],
 keyId: 0,
 subscribed: new Set(),
 authenticated: false,
 statsInterval: null,
 listeners: new Map(),
 }

 // Extract client IP once for audit logging
 const requestIp = req.headers?.['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || ''

 let authTimeout = setTimeout(() => {
 if (!client.authenticated) {
 audit.log(null, 'API_KEY_TIMEOUT', {
 detail: { ip: requestIp, reason: 'websocket_auth_timeout' }
 }).catch(() => {})
 ws.close(4002, 'Authentication timeout')
 }
 }, 10000)

 function send(event: string, data: any) {
 if (ws.readyState !== WebSocket.OPEN) return
 ws.send(JSON.stringify({ type: event, data }))
 }

 function subscribeDefaultEvents() {
 const allowedEvents = getEventsForScopes(client.keyScopes)
 client.subscribed = new Set(allowedEvents)
 }

 function attachListeners() {
 const sid = client.serverId

 // Console listener
 const consoleListener = (srvId: string, output: string) => {
 if (srvId === sid && client.subscribed.has('console')) {
 send('console', output)
 }
 }
 client.listeners.set('console', consoleListener)
 processManager.on('console', consoleListener)

 // Status listener
 const statusListener = (srvId: string, status: string) => {
 if (srvId === sid && client.subscribed.has('status')) {
 send('status', status)
 }
 }
 client.listeners.set('status', statusListener)
 processManager.on('status', statusListener)

 // Clear console listener
 const clearConsoleListener = (srvId: string) => {
 if (srvId === sid && client.subscribed.has('clear_console')) {
 send('clear_console', null)
 }
 }
 client.listeners.set('clear_console', clearConsoleListener)
 processManager.on('clear_console', clearConsoleListener)

 // Automation log listener
 const automationLogListener = (srvId: string, logLine: any) => {
 if (srvId.toString() === sid && client.subscribed.has('automation_log')) {
 send('automation_log', logLine)
 }
 }
 client.listeners.set('automation_log', automationLogListener)
 automationEngine.on('log', automationLogListener)

 // Player events from processManager
 const playerJoinListener = (srvId: string, player: any) => {
 if (srvId === sid && client.subscribed.has('playerJoin')) {
 send('playerJoin', player)
 }
 }
 client.listeners.set('playerJoin', playerJoinListener)
 processManager.on('playerJoin', playerJoinListener)

 const playerLeaveListener = (srvId: string, player: any) => {
 if (srvId === sid && client.subscribed.has('playerLeave')) {
 send('playerLeave', player)
 }
 }
 client.listeners.set('playerLeave', playerLeaveListener)
 processManager.on('playerLeave', playerLeaveListener)

 // Stats interval (every 2 seconds)
 const allowedStats = ['stats', 'tps_update', 'ram_update', 'cpu_update']
 const hasAnyStatScope = allowedStats.some(e => client.subscribed.has(e))
 if (hasAnyStatScope && hasScope(client.keyScopes, 'server.performance.read')) {
 client.statsInterval = setInterval(async () => {
 if (ws.readyState !== WebSocket.OPEN) return
 try {
 const stats = await executionManager.getStats(sid)
 if (!stats) return

 if (client.subscribed.has('stats')) {
 send('stats', {
 tps: stats.tps || 0,
 mspt: stats.mspt || 0,
 cpu: stats.cpu || 0,
 ram: stats.ram ? Math.round(stats.ram / 1024 / 1024) : 0,
 players: stats.players || 0,
 maxPlayers: stats.maxPlayers || 20,
 })
 }
 if (client.subscribed.has('tps_update')) {
 send('tps_update', { tps: stats.tps || 0, mspt: stats.mspt || 0 })
 }
 if (client.subscribed.has('ram_update')) {
 send('ram_update', { used: stats.ram ? Math.round(stats.ram / 1024 / 1024) : 0, allocated: stats.maxRam || 0 })
 }
 if (client.subscribed.has('cpu_update')) {
 send('cpu_update', { cpu: stats.cpu || 0 })
 }
 } catch { /* ignore */ }
 }, 2000)
 }
 }

 function detachListeners() {
 if (client.statsInterval) {
 clearInterval(client.statsInterval)
 client.statsInterval = null
 }
 client.listeners.forEach((listener, event) => {
 if (event === 'automation_log') {
 automationEngine.removeListener('log', listener)
 } else {
 processManager.removeListener(event, listener)
 }
 })
 client.listeners.clear()
 }

 ws.on('message', async (message: string) => {
 try {
 const parsed = JSON.parse(message)

 if (!client.authenticated) {
 if (parsed.type === 'auth') {
 if (!parsed.token || !parsed.serverId) {
 audit.log(null, 'API_KEY_MISSING', {
 detail: { reason: 'websocket_missing_token_or_serverId_in_auth_message', ip: requestIp }
 }).catch(() => {})
 send('error', { message: 'Token and serverId required' })
 return
 }

 const result = await verifyApiKey(parsed.token, String(parsed.serverId), requestIp)
 if (!result.valid) {
 if (result.ipDenied) {
 audit.log(null, 'API_KEY_IP_DENIED', {
 detail: { serverId: parsed.serverId, ip: requestIp, reason: 'websocket_ip_not_allowed' }
 }).catch(() => {})
 send('error', { message: 'IP address not allowed by key restrictions' })
 ws.close(4005, 'IP not allowed')
 } else {
 audit.log(null, 'API_KEY_INVALID', {
 detail: { serverId: parsed.serverId, ip: requestIp, reason: 'websocket_invalid_key' }
 }).catch(() => {})
 send('error', { message: 'Invalid API key' })
 ws.close(4001, 'Invalid API key')
 }
 return
 }

 client.serverId = String(parsed.serverId)
 client.keyScopes = result.scopes || ['server.read']
 client.keyId = result.keyId || 0
 client.authenticated = true
 clearTimeout(authTimeout)

 // Subscribe to events based on scopes
 subscribeDefaultEvents()

 // Send initial state
 const history = processManager.getHistory(client.serverId)
 if (history.length > 0) {
 send('history', history)
 }
 const initStatus = await executionManager.getStatus(client.serverId)
 send('status', initStatus)

 // Send available scopes
 send('authenticated', {
 serverId: client.serverId,
 scopes: client.keyScopes,
 events: Array.from(client.subscribed),
 })

 // Attach event listeners
 attachListeners()
 } else {
 audit.log(null, 'API_KEY_MISSING', {
 detail: { reason: 'websocket_no_auth_message', messageType: parsed.type, ip: requestIp }
 }).catch(() => {})
 send('error', { message: 'Authentication required. Send { type: "auth", token: "...", serverId: 1 }' })
 }
 return
 }

 // Authenticated message handling
 switch (parsed.type) {
 case 'subscribe': {
 const events = Array.isArray(parsed.events) ? parsed.events : [parsed.events]
 const allowedEvents = getEventsForScopes(client.keyScopes)
 events.forEach((e: string) => {
 if (allowedEvents.has(e)) client.subscribed.add(e)
 })
 send('subscribed', { events: Array.from(client.subscribed) })
 break
 }

 case 'unsubscribe': {
 const events = Array.isArray(parsed.events) ? parsed.events : [parsed.events]
 events.forEach((e: string) => client.subscribed.delete(e))
 send('unsubscribed', { events: Array.from(client.subscribed) })
 break
 }

 case 'command': {
 if (!hasScope(client.keyScopes, 'server.console.write')) {
 send('console', '\n[API] Access denied: Missing server.console.write scope\n')
 return
 }
 const cmd = String(parsed.data || parsed.command || '').trim()
 if (cmd) {
 processManager.sendCommand(client.serverId, cmd)
 logger.info(`[WS API] Command sent to server ${client.serverId}: ${cmd}`)
 }
 break
 }

 case 'ping': {
 send('pong', { timestamp: Date.now() })
 break
 }
 }
 } catch (e) {
 send('error', { message: 'Invalid message format' })
 }
 })

 ws.on('close', () => {
 clearTimeout(authTimeout)
 detachListeners()
 })

 ws.on('error', () => {
 clearTimeout(authTimeout)
 detachListeners()
 })
}

export = { handleConnection }
