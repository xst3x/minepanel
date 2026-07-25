"use strict";
// ── Server API OpenAPI/Swagger Documentation ──────────────────────────
// Serves auto-generated API docs at /serverapi/docs
const express = require("express");
const router = express.Router();
const OPENAPI_SPEC = {
    openapi: '3.0.3',
    info: {
        title: 'MinePanel Server API',
        version: require('../../package.json').version || '1.0.0',
        description: `REST API for interacting with individual Minecraft servers.

Authentication: All endpoints require an API key sent as a Bearer token in the Authorization header.

\`\`\`
Authorization: Bearer <your_api_key>
\`\`\`

API keys are created per-server from the panel and can be scoped to specific permissions.

Base URL: \`/serverapi/:serverId/\`

Error responses follow this format:
\`\`\`json
{
  "success": false,
  "error": "Error message",
  "code": "ERROR_CODE"
}
\`\`\`
`,
        contact: {
            name: 'MinePanel',
        },
    },
    servers: [
        { url: '/serverapi/{serverId}', variables: { serverId: { default: '1', description: 'Server numeric ID' } } },
    ],
    components: {
        securitySchemes: {
            ApiKeyAuth: {
                type: 'http',
                scheme: 'bearer',
                bearerFormat: 'API Key',
                description: 'Enter your server API key',
            },
        },
        schemas: {
            Error: {
                type: 'object',
                properties: {
                    success: { type: 'boolean', example: false },
                    error: { type: 'string' },
                    code: { type: 'string' },
                },
            },
            ServerInfo: {
                type: 'object',
                properties: {
                    name: { type: 'string' },
                    id: { type: 'integer' },
                    uuid: { type: 'string' },
                    version: { type: 'string' },
                    software: { type: 'string' },
                    status: { type: 'string', enum: ['online', 'offline', 'starting', 'stopping'] },
                    uptime: { type: 'integer' },
                    motd: { type: 'string' },
                    icon: { type: 'string', nullable: true },
                    java_version: { type: 'string' },
                    allocated_ram: { type: 'integer' },
                    used_ram: { type: 'integer' },
                    cpu_usage: { type: 'number' },
                    tps: { type: 'number' },
                    mspt: { type: 'number' },
                    online_players: { type: 'integer' },
                    max_players: { type: 'integer' },
                    world_size: { type: 'string' },
                    storage_usage: { type: 'string' },
                },
            },
            Performance: {
                type: 'object',
                properties: {
                    tps: { type: 'number' },
                    mspt: { type: 'number' },
                    cpu: { type: 'number' },
                    ram: { type: 'integer' },
                    allocated_ram: { type: 'integer' },
                    disk_usage: { type: 'string' },
                },
            },
            Player: {
                type: 'object',
                properties: {
                    uuid: { type: 'string' },
                    username: { type: 'string' },
                    ping: { type: 'integer' },
                    gamemode: { type: 'string' },
                    world: { type: 'string' },
                    health: { type: 'integer' },
                    food: { type: 'integer' },
                    x: { type: 'number' },
                    y: { type: 'number' },
                    z: { type: 'number' },
                },
            },
        },
    },
    security: [{ ApiKeyAuth: [] }],
    paths: {
        '/info': {
            get: {
                summary: 'Get server information',
                description: 'Returns detailed information about the server including status, performance, and configuration.',
                tags: ['Server'],
                security: [{ ApiKeyAuth: ['server.read'] }],
                responses: {
                    '200': { description: 'Server info', content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' }, data: { $ref: '#/components/schemas/ServerInfo' } } } } } },
                    '401': { description: 'Invalid or missing API key' },
                    '403': { description: 'Missing scope permission' },
                    '404': { description: 'Server not found' },
                },
            },
        },
        '/performance': {
            get: {
                summary: 'Get performance metrics',
                description: 'Returns live performance metrics for the server.',
                tags: ['Performance'],
                security: [{ ApiKeyAuth: ['server.performance.read'] }],
                responses: {
                    '200': { description: 'Performance data', content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' }, data: { $ref: '#/components/schemas/Performance' } } } } } },
                    '401': { description: 'Invalid or missing API key' },
                    '403': { description: 'Missing scope permission' },
                },
            },
        },
        '/players': {
            get: {
                summary: 'List online players',
                description: 'Returns all currently online players with details.',
                tags: ['Players'],
                security: [{ ApiKeyAuth: ['server.players.read'] }],
                responses: {
                    '200': { description: 'Player list', content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' }, data: { type: 'array', items: { $ref: '#/components/schemas/Player' } }, count: { type: 'integer' } } } } } },
                },
            },
        },
        '/players/count': {
            get: {
                summary: 'Get player count',
                description: 'Returns the number of online and max players.',
                tags: ['Players'],
                security: [{ ApiKeyAuth: ['server.players.read'] }],
                responses: {
                    '200': { description: 'Player count' },
                },
            },
        },
        '/players/{uuid}': {
            get: {
                summary: 'Get player details',
                description: 'Returns detailed information about a specific player by UUID.',
                tags: ['Players'],
                parameters: [{ name: 'uuid', in: 'path', required: true, schema: { type: 'string' } }],
                security: [{ ApiKeyAuth: ['server.players.read'] }],
                responses: {
                    '200': { description: 'Player details' },
                    '404': { description: 'Player not found' },
                },
            },
        },
        '/console': {
            get: {
                summary: 'Get console output',
                description: 'Returns recent console log lines. Supports limit and search parameters.',
                tags: ['Console'],
                parameters: [
                    { name: 'limit', in: 'query', schema: { type: 'integer', default: 100, maximum: 500 } },
                    { name: 'search', in: 'query', schema: { type: 'string' } },
                ],
                security: [{ ApiKeyAuth: ['server.console.read'] }],
                responses: {
                    '200': { description: 'Console output' },
                },
            },
            post: {
                summary: 'Send console command',
                description: 'Sends a command to the server console.',
                tags: ['Console'],
                requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { command: { type: 'string', example: 'say Hello World' } }, required: ['command'] } } } },
                security: [{ ApiKeyAuth: ['server.console.write'] }],
                responses: {
                    '200': { description: 'Command sent', content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' }, message: { type: 'string' } } } } } },
                    '400': { description: 'Server offline or invalid command' },
                },
            },
        },
        '/start': {
            post: {
                summary: 'Start the server',
                tags: ['Power'],
                security: [{ ApiKeyAuth: ['server.power'] }],
                responses: { '200': { description: 'Start command sent' } },
            },
        },
        '/stop': {
            post: {
                summary: 'Stop the server',
                tags: ['Power'],
                security: [{ ApiKeyAuth: ['server.power'] }],
                responses: { '200': { description: 'Stop command sent' } },
            },
        },
        '/restart': {
            post: {
                summary: 'Restart the server',
                tags: ['Power'],
                security: [{ ApiKeyAuth: ['server.power'] }],
                responses: { '200': { description: 'Restart command sent' } },
            },
        },
        '/kill': {
            post: {
                summary: 'Force kill the server',
                tags: ['Power'],
                security: [{ ApiKeyAuth: ['server.power'] }],
                responses: { '200': { description: 'Kill command sent' } },
            },
        },
        '/files': {
            get: {
                summary: 'List files',
                description: 'Lists files and directories in the server directory. Supports path parameter.',
                tags: ['Files'],
                parameters: [{ name: 'path', in: 'query', schema: { type: 'string', default: '/' } }],
                security: [{ ApiKeyAuth: ['server.files.read'] }],
                responses: { '200': { description: 'File listing' } },
            },
        },
        '/files/content': {
            get: {
                summary: 'Read file content',
                description: 'Returns the content of a text file. Limited to 10MB files.',
                tags: ['Files'],
                parameters: [{ name: 'path', in: 'query', required: true, schema: { type: 'string' } }],
                security: [{ ApiKeyAuth: ['server.files.read'] }],
                responses: { '200': { description: 'File content' } },
            },
        },
        '/backups': {
            get: {
                summary: 'List backups',
                tags: ['Backups'],
                security: [{ ApiKeyAuth: ['server.backups.read'] }],
                responses: { '200': { description: 'Backup list' } },
            },
            post: {
                summary: 'Create a backup',
                tags: ['Backups'],
                security: [{ ApiKeyAuth: ['server.backups.write'] }],
                responses: { '200': { description: 'Backup created' } },
            },
        },
        '/backups/{id}/restore': {
            post: {
                summary: 'Restore a backup',
                tags: ['Backups'],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
                security: [{ ApiKeyAuth: ['server.backups.write'] }],
                responses: { '200': { description: 'Backup restored' } },
            },
        },
        '/backups/{id}': {
            delete: {
                summary: 'Delete a backup',
                tags: ['Backups'],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
                security: [{ ApiKeyAuth: ['server.backups.write'] }],
                responses: { '200': { description: 'Backup deleted' } },
            },
        },
        '/plugins': {
            get: {
                summary: 'List installed plugins',
                tags: ['Plugins & Mods'],
                security: [{ ApiKeyAuth: ['server.files.read'] }],
                responses: { '200': { description: 'Plugin list' } },
            },
        },
        '/mods': {
            get: {
                summary: 'List installed mods',
                tags: ['Plugins & Mods'],
                security: [{ ApiKeyAuth: ['server.files.read'] }],
                responses: { '200': { description: 'Mod list' } },
            },
        },
        '/worlds': {
            get: {
                summary: 'List worlds',
                tags: ['Worlds'],
                security: [{ ApiKeyAuth: ['server.files.read'] }],
                responses: { '200': { description: 'World list' } },
            },
        },
        '/logs': {
            get: {
                summary: 'Get logs',
                description: 'Returns log files and recent console output.',
                tags: ['Logs'],
                security: [{ ApiKeyAuth: ['server.files.read'] }],
                responses: { '200': { description: 'Log files and latest console output' } },
            },
        },
        '/statistics': {
            get: {
                summary: 'Get historical statistics',
                description: 'Returns historical performance metrics. Supports range parameter.',
                tags: ['Statistics'],
                parameters: [{ name: 'range', in: 'query', schema: { type: 'string', enum: ['1h', '24h', '7d', '30d'], default: '24h' } }],
                security: [{ ApiKeyAuth: ['server.performance.read'] }],
                responses: { '200': { description: 'Historical statistics' } },
            },
        },
        '/environment': {
            get: {
                summary: 'Get server environment info',
                description: 'Returns Java version, JVM arguments, and RAM configuration.',
                tags: ['Server'],
                security: [{ ApiKeyAuth: ['server.read'] }],
                responses: { '200': { description: 'Environment info' } },
            },
        },
        '/health': {
            get: {
                summary: 'Health check',
                description: 'Simple health check endpoint (no auth required).',
                tags: ['System'],
                security: [],
                responses: { '200': { description: 'Health status' } },
            },
        },
    },
    tags: [
        { name: 'Server', description: 'Server information and environment' },
        { name: 'Performance', description: 'Performance metrics' },
        { name: 'Players', description: 'Player management' },
        { name: 'Console', description: 'Console access and commands' },
        { name: 'Power', description: 'Server lifecycle management' },
        { name: 'Files', description: 'File system access' },
        { name: 'Backups', description: 'Backup management' },
        { name: 'Plugins & Mods', description: 'Plugin and mod listings' },
        { name: 'Worlds', description: 'World management' },
        { name: 'Logs', description: 'Server logs' },
        { name: 'Statistics', description: 'Historical metrics' },
        { name: 'System', description: 'System health' },
    ],
};
router.get('/', (req, res) => {
    res.json(OPENAPI_SPEC);
});
router.get('/ui', (req, res) => {
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>MinePanel Server API - Swagger UI</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui.css">
  <link rel="icon" type="image/png" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/favicon-32x32.png">
  <style>
    body { margin: 0; background: #f6f8fa; }
    .swagger-ui .topbar { display: none; }
    .swagger-ui .info .title { color: #1a1a2e; }
    .swagger-ui .scheme-container { background: #fff; box-shadow: none; border-radius: 8px; }
  </style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script>
    SwaggerUIBundle({
      url: '/serverapi/docs',
      dom_id: '#swagger-ui',
      deepLinking: true,
      presets: [SwaggerUIBundle.presets.apis],
      layout: 'BaseLayout',
    });
  </script>
</body>
</html>`;
    res.setHeader('Content-Type', 'text/html');
    res.send(html);
});
module.exports = router;
//# sourceMappingURL=serverApiDocsRoutes.js.map