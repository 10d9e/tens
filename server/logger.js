const winston = require('winston');
const { combine, timestamp, printf, colorize, errors } = winston.format;

let logger;
if (process.env.NODE_ENV === 'production') {
    logger = winston.createLogger({
        level: 'info', // Set production log level
        format: combine(
            timestamp(),
            errors({ stack: true }), // Include stack traces for errors
            winston.format.json(), // Crucial for Railway's log processing
        ),
        transports: [
            new winston.transports.Console(),
        ],
    });
} else {
    // Define a format specifically for the console
    const consoleFormat = combine(
        colorize(), // Add colors to the log level
        timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        errors({ stack: true }), // <-- This captures the stack trace
        printf(({ level, message, timestamp, stack }) => {
            // If a stack trace exists, add it to the message
            if (stack) {
                return `${timestamp} ${level}: ${message} - ${stack}`;
            }
            return `${timestamp} ${level}: ${message}`;
        })
    );
    // Configure the Winston logger.
    logger = winston.createLogger({
        level: 'debug', // Default log level
        // Combine formats to produce a structured JSON output
        format: combine(
            timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
            errors({ stack: true }), // Include stack traces for errors
            winston.format.json(), // Crucial for Railway's log processing
        ),
        transports: [
            // Console transport for development
            new winston.transports.Console({
                level: 'debug', // Show debug messages in the console
                format: consoleFormat,
            }),
        ],
    });
}

module.exports = logger;
