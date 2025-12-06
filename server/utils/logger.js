const logBuffer = require('./logBuffer');

function timeTag() {
    return `${c.yellow}[${(new Date).toISOString()}]${c.end}`
}

const c = {
    end: "\x1b[0m",
    red: "\x1b[31m",
    yellow: "\x1b[33m",
    blue: "\x1b[34m",
    magenta: "\x1b[35m",
    cyan: "\x1b[36m",
}

// Strip ANSI color codes for frontend display
function stripAnsi(str) {
    return String(str).replace(/\x1b\[[0-9;]*m/g, '');
}

// Map type strings to log levels for color coding
function determineLevel(type) {
    const typeUpper = String(type).toUpperCase();
    if (typeUpper.includes('ERROR') || typeUpper.includes('ERR')) return 'error';
    if (typeUpper.includes('WARN')) return 'warn';
    if (typeUpper.includes('DEBUG')) return 'debug';
    return 'info';
}

module.exports = function Logger(service, color) {
    this.service = service
    this.color = color ? color : c.cyan
    this.print = (update, message) => {
        const timestamp = new Date().toISOString();

        // Original console output (with colors) - use original to avoid double-logging
        const originalLog = logBuffer.originalConsoleLog || console.log;
        originalLog(`${c.yellow}[${timestamp}]${c.end}${this.color}[${this.service}]${c.end} <${update}>: ${message}`);

        // Push to buffer for WebSocket streaming
        logBuffer.push({
            timestamp,
            service: this.service,
            type: stripAnsi(String(update)),
            message: stripAnsi(String(message)),
            level: determineLevel(update)
        });
    }
};
