"use strict";
// ── IP Allowlist Validation ────────────────────────────────────────────
// Supports:
//   - Exact IP addresses: "192.168.1.1", "10.0.0.5"
//   - CIDR ranges:        "10.0.0.0/24", "192.168.0.0/16"
//   - The special value:  "*" (allow all)
//
// The allowed_ips field in the DB is stored as a JSON array of strings.
/**
 * Convert an IPv4 address string to a 32-bit integer.
 * Returns null if the IP is invalid.
 */
function ipToInt(ip) {
    const parts = ip.trim().split('.');
    if (parts.length !== 4)
        return null;
    let result = 0;
    for (const part of parts) {
        const octet = parseInt(part, 10);
        if (isNaN(octet) || octet < 0 || octet > 255)
            return null;
        result = (result << 8) + octet;
    }
    return result;
}
/**
 * Check if a given IP address matches an allowlist entry.
 * Entry can be:
 *   - Exact IP: "192.168.1.1"
 *   - CIDR:     "10.0.0.0/24"
 *   - Wildcard: "*"
 */
function ipMatchesEntry(ip, entry) {
    const trimmed = entry.trim();
    if (trimmed === '*')
        return true;
    // CIDR notation
    if (trimmed.includes('/')) {
        const [rangeIp, bitsStr] = trimmed.split('/');
        const bits = parseInt(bitsStr, 10);
        if (isNaN(bits) || bits < 0 || bits > 32)
            return false;
        const ipInt = ipToInt(ip);
        const rangeInt = ipToInt(rangeIp);
        if (ipInt === null || rangeInt === null)
            return false;
        const mask = bits === 0 ? 0 : ~(0xFFFFFFFF >>> bits);
        return (ipInt & mask) === (rangeInt & mask);
    }
    // Exact match
    return ip.trim() === trimmed;
}
/**
 * Check if a client IP is allowed by the given allowlist.
 *
 * @param clientIp  - The client's IP address (string).
 * @param allowedIps - Array of allowlist entries (IPs, CIDRs, or "*").
 * @returns true if the IP is allowed or the allowlist is empty.
 */
function isIpAllowed(clientIp, allowedIps) {
    if (!allowedIps || allowedIps.length === 0)
        return true; // Empty = no restriction
    const cleanIp = clientIp.replace(/^::ffff:/, ''); // Normalize IPv4-mapped IPv6
    for (const entry of allowedIps) {
        if (ipMatchesEntry(cleanIp, entry))
            return true;
    }
    return false;
}
module.exports = { isIpAllowed, ipToInt, ipMatchesEntry };
//# sourceMappingURL=ipAllowlist.js.map