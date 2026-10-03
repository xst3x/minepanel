/**
 * Server output parsing — stderr analysis for Java version mismatches and JVM flag errors.
 * Extracted from processManager.js — single responsibility.
 */

/**
 * Parse server stderr output for common issues and append helpful hints.
 * @param {string} serverId
 * @param {string} output Raw stderr output
 * @returns {string} Output with any additional hints appended
 */
function parseServerStderr(serverId, output) {
    const javaVersionMatch = output.match(/Current Java is (\d+) but we require at least (\d+)/);
    if (javaVersionMatch) {
        const current = javaVersionMatch[1];
        const required = javaVersionMatch[2];
        const hint =
            `\n[MinePanel] ⚠  Java version mismatch: you have Java ${current} but this Forge version requires Java ${required}.\n` +
            `[MinePanel]    Fix: go to Server Settings → Advanced Settings → Java Path and set\n` +
            `[MinePanel]    the full path to a Java ${required}+ executable, e.g.:\n` +
            `[MinePanel]      Windows: C:\\Program Files\\Java\\jdk-${required}\\bin\\java.exe\n` +
            `[MinePanel]      Linux:   /usr/lib/jvm/java-${required}-openjdk/bin/java\n` +
            `[MinePanel]    You can also click "Detect Java" in Advanced Settings to find installed JDKs.\n`;
        output += hint;
    }

    const portInUse =
        output.includes('Address already in use') ||
        output.includes('Failed to bind to port') ||
        output.includes('Perhaps a server is already running on that port');
    if (portInUse && !output.includes('Port is already in use')) {
        const hint =
            `\n[MinePanel] ⚠  Port is already in use by another process.\n` +
            `[MinePanel]    Stop the process using it, or change server-port in server.properties.\n`;
        output += hint;
    }

    if (output.includes('Unrecognized VM option')) {
        const optMatch = output.match(/Unrecognized VM option '([^']+)'/);
        const flag = optMatch ? optMatch[1] : 'unknown flag';
        const hint =
            `\n[MinePanel] ⚠  JVM rejected the option '${flag}'.\n` +
            `[MinePanel]    This usually means your Java version is too old for this server.\n` +
            `[MinePanel]    Update your Java Path in Server Settings → Advanced Settings.\n`;
        output += hint;
    }

    return output;
}

export = { parseServerStderr };
