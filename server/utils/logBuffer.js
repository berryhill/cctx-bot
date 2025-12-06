// Circular buffer for log entries with subscriber pattern for WebSocket broadcasting

class LogBuffer {
    constructor(maxSize = 1000) {
        this.buffer = [];
        this.maxSize = maxSize;
        this.subscribers = new Set();
    }

    push(entry) {
        this.buffer.push(entry);
        if (this.buffer.length > this.maxSize) {
            this.buffer.shift();
        }
        this.broadcast(entry);
    }

    getHistory() {
        return [...this.buffer];
    }

    subscribe(callback) {
        this.subscribers.add(callback);
        return () => this.subscribers.delete(callback);
    }

    broadcast(entry) {
        this.subscribers.forEach(cb => cb(entry));
    }
}

// Singleton instance
const logBuffer = new LogBuffer(1000);

// Strip ANSI color codes for frontend display
function stripAnsi(str) {
    return String(str).replace(/\x1b\[[0-9;]*m/g, '');
}

// Intercept console.log, console.error, console.warn
const originalConsoleLog = console.log.bind(console);
const originalConsoleError = console.error.bind(console);
const originalConsoleWarn = console.warn.bind(console);

// Expose original for Logger class to avoid double-logging
logBuffer.originalConsoleLog = originalConsoleLog;

console.log = (...args) => {
    originalConsoleLog(...args);

    const message = args.map(arg =>
        typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
    ).join(' ');

    logBuffer.push({
        timestamp: new Date().toISOString(),
        service: 'Console',
        type: 'Log',
        message: stripAnsi(message),
        level: 'log'
    });
};

console.error = (...args) => {
    originalConsoleError(...args);

    const message = args.map(arg =>
        typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
    ).join(' ');

    logBuffer.push({
        timestamp: new Date().toISOString(),
        service: 'Console',
        type: 'Error',
        message: stripAnsi(message),
        level: 'error'
    });
};

console.warn = (...args) => {
    originalConsoleWarn(...args);

    const message = args.map(arg =>
        typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
    ).join(' ');

    logBuffer.push({
        timestamp: new Date().toISOString(),
        service: 'Console',
        type: 'Warn',
        message: stripAnsi(message),
        level: 'warn'
    });
};

module.exports = logBuffer;
