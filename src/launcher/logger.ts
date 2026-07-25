function formatDigit(n: number): string {
    return n < 10 ? '0' + n : String(n);
}

function getTimestamp(): string {
    const d = new Date();
    const year = d.getFullYear();
    const month = formatDigit(d.getMonth() + 1);
    const date = formatDigit(d.getDate());
    const hours = formatDigit(d.getHours());
    const minutes = formatDigit(d.getMinutes());
    const seconds = formatDigit(d.getSeconds());
    return `${year}-${month}-${date} ${hours}:${minutes}:${seconds}`;
}

export function log(severity: 'INFO' | 'WARN' | 'ERROR', component: string, message: string): void {
    const ts = getTimestamp();
    const formatted = `[${ts}] [${severity}] [${component}] ${message}`;
    if (severity === 'ERROR') {
        console.error(formatted);
    } else if (severity === 'WARN') {
        console.warn(formatted);
    } else {
        console.log(formatted);
    }
}

export const info = (component: string, message: string) => log('INFO', component, message);
export const warn = (component: string, message: string) => log('WARN', component, message);
export const error = (component: string, message: string) => log('ERROR', component, message);
