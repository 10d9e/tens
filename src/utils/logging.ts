type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';

let level: LogLevel = 'info' as LogLevel;

const levels: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
    fatal: 4,
};

const shouldLog = (messageLevel: LogLevel): boolean => {
    return levels[messageLevel] >= levels[level];
};

export const logger = {
    debug: (message: string, ...args: any[]) => {
        if (shouldLog('debug')) {
            console.log(`[DEBUG] ${message}`, ...args);
        }
    },
    info: (message: string, ...args: any[]) => {
        if (shouldLog('info')) {
            console.log(`[INFO] ${message}`, ...args);
        }
    },
    warn: (message: string, ...args: any[]) => {
        if (shouldLog('warn')) {
            console.log(`[WARN] ${message}`, ...args);
        }
    },
    error: (message: string, ...args: any[]) => {
        if (shouldLog('error')) {
            console.error(`[ERROR] ${message}`, ...args);
        }
    },
    fatal: (message: string, ...args: any[]) => {
        if (shouldLog('fatal')) {
            console.error(`[FATAL] ${message}`, ...args);
        }
    },
}
