"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.error = exports.warn = exports.info = void 0;
exports.log = log;
function formatDigit(n) {
    return n < 10 ? '0' + n : String(n);
}
function getTimestamp() {
    const d = new Date();
    const year = d.getFullYear();
    const month = formatDigit(d.getMonth() + 1);
    const date = formatDigit(d.getDate());
    const hours = formatDigit(d.getHours());
    const minutes = formatDigit(d.getMinutes());
    const seconds = formatDigit(d.getSeconds());
    return `${year}-${month}-${date} ${hours}:${minutes}:${seconds}`;
}
function log(severity, component, message) {
    const ts = getTimestamp();
    const formatted = `[${ts}] [${severity}] [${component}] ${message}`;
    if (severity === 'ERROR') {
        console.error(formatted);
    }
    else if (severity === 'WARN') {
        console.warn(formatted);
    }
    else {
        console.log(formatted);
    }
}
const info = (component, message) => log('INFO', component, message);
exports.info = info;
const warn = (component, message) => log('WARN', component, message);
exports.warn = warn;
const error = (component, message) => log('ERROR', component, message);
exports.error = error;
//# sourceMappingURL=logger.js.map