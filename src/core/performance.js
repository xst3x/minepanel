// src/core/performance.js
// Lightweight in-process metrics — no external Prometheus dependency required.
// Exposes a /metrics endpoint with HTTP timing histograms and server gauges
// in Prometheus text format so it can be scraped by any compatible collector.

const os = require('os');

// ── Internal stores ──────────────────────────────────────────────────────────

/** @type {{ method: string, route: string, status: number, durationMs: number }[]} */
const httpSamples = [];
const MAX_SAMPLES = 2000;

/** Active WebSocket connections */
let wsConnections = 0;

/** Per-server gauge: serverId → { status: 0|1, players: number } */
const serverGauges = new Map();

// ── Public recording API ──────────────────────────────────────────────────────

function recordRequest(method, route, status, durationMs) {
    httpSamples.push({ method, route, status, durationMs });
    if (httpSamples.length > MAX_SAMPLES) httpSamples.shift();
}

function setWsConnections(n) { wsConnections = n; }
function incWsConnections()  { wsConnections++; }
function decWsConnections()  { if (wsConnections > 0) wsConnections--; }

function setServerGauge(serverId, status, players) {
    serverGauges.set(String(serverId), { status: status ? 1 : 0, players: players || 0 });
}

function clearServerGauge(serverId) { serverGauges.delete(String(serverId)); }

// ── Prometheus text format renderer ──────────────────────────────────────────

function buildHistogramBuckets(samples, label) {
    const buckets = [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000];
    const counts = new Array(buckets.length).fill(0);
    let sum = 0;

    for (const s of samples) {
        sum += s.durationMs;
        for (let i = 0; i < buckets.length; i++) {
            if (s.durationMs <= buckets[i]) counts[i]++;
        }
    }

    let out = '';
    for (let i = 0; i < buckets.length; i++) {
        out += `http_request_duration_ms_bucket{${label},le="${buckets[i]}"} ${counts[i]}\n`;
    }
    out += `http_request_duration_ms_bucket{${label},le="+Inf"} ${samples.length}\n`;
    out += `http_request_duration_ms_sum{${label}} ${sum.toFixed(2)}\n`;
    out += `http_request_duration_ms_count{${label}} ${samples.length}\n`;
    return out;
}

function renderMetrics() {
    const lines = [];
    const uptime = Math.floor(process.uptime());
    const mem = process.memoryUsage();

    // Process info
    lines.push('# HELP process_uptime_seconds Process uptime');
    lines.push('# TYPE process_uptime_seconds gauge');
    lines.push(`process_uptime_seconds ${uptime}`);

    lines.push('# HELP process_heap_bytes Node.js heap used');
    lines.push('# TYPE process_heap_bytes gauge');
    lines.push(`process_heap_bytes ${mem.heapUsed}`);

    // System memory
    const totalMem = os.totalmem();
    const freeMem  = os.freemem();
    lines.push('# HELP system_memory_total_bytes Total system RAM');
    lines.push('# TYPE system_memory_total_bytes gauge');
    lines.push(`system_memory_total_bytes ${totalMem}`);
    lines.push('# HELP system_memory_free_bytes Free system RAM');
    lines.push('# TYPE system_memory_free_bytes gauge');
    lines.push(`system_memory_free_bytes ${freeMem}`);

    // HTTP histogram (all routes combined)
    lines.push('# HELP http_request_duration_ms HTTP request latency');
    lines.push('# TYPE http_request_duration_ms histogram');
    if (httpSamples.length > 0) {
        lines.push(buildHistogramBuckets(httpSamples, 'handler="all"').trimEnd());
    } else {
        lines.push(`http_request_duration_ms_count{handler="all"} 0`);
    }

    // HTTP request count by status class
    const s2xx = httpSamples.filter(s => s.status >= 200 && s.status < 300).length;
    const s4xx = httpSamples.filter(s => s.status >= 400 && s.status < 500).length;
    const s5xx = httpSamples.filter(s => s.status >= 500).length;
    lines.push('# HELP http_requests_total Total HTTP requests by status class');
    lines.push('# TYPE http_requests_total counter');
    lines.push(`http_requests_total{class="2xx"} ${s2xx}`);
    lines.push(`http_requests_total{class="4xx"} ${s4xx}`);
    lines.push(`http_requests_total{class="5xx"} ${s5xx}`);

    // WebSocket connections
    lines.push('# HELP ws_active_connections Active WebSocket connections');
    lines.push('# TYPE ws_active_connections gauge');
    lines.push(`ws_active_connections ${wsConnections}`);

    // Per-server gauges
    if (serverGauges.size > 0) {
        lines.push('# HELP server_status MC server running (1=online, 0=offline)');
        lines.push('# TYPE server_status gauge');
        lines.push('# HELP server_players_online Players currently online');
        lines.push('# TYPE server_players_online gauge');
        for (const [id, g] of serverGauges) {
            lines.push(`server_status{server_id="${id}"} ${g.status}`);
            lines.push(`server_players_online{server_id="${id}"} ${g.players}`);
        }
    }

    return lines.join('\n') + '\n';
}

module.exports = {
    recordRequest,
    setWsConnections, incWsConnections, decWsConnections,
    setServerGauge, clearServerGauge,
    renderMetrics,
};
