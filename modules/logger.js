const fs = require('fs');
const path = require('path');
const { createLogger, format, transports } = require('winston');
const { combine, timestamp, label, printf, colorize } = format;

// Ensure logs directory exists
const logsDir = path.join(__dirname, '..', 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir);
}

// Custom format
const myFormat = printf(({ level, message, label, timestamp }) => {
  return `${timestamp} [${label}] ${level}: ${message}`;
});

// Create logger instance
const logger = createLogger({
  format: combine(
    label({ label: 'GitHubBot' }),
    timestamp(),
    myFormat
  ),
  transports: [
    // Console transport
    new transports.Console({
      format: combine(
        colorize(),
        timestamp(),
        myFormat
      )
    }),
    // File transport - all logs
    new transports.File({ 
      filename: path.join(logsDir, 'combined.log'),
      maxsize: 5242880, // 5MB
      maxFiles: 5
    }),
    // File transport - error logs
    new transports.File({ 
      filename: path.join(logsDir, 'error.log'), 
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5
    })
  ]
});

// Simple wrapper for console.log for environments without Winston
const fallbackLogger = {
  info: (message) => console.log(`[INFO] ${message}`),
  warn: (message) => console.warn(`[WARN] ${message}`),
  error: (message, error) => {
    console.error(`[ERROR] ${message}`);
    if (error) console.error(error);
  },
  debug: (message) => console.debug(`[DEBUG] ${message}`)
};

// Determine which logger to use
const isWinstonAvailable = true;
const activeLogger = isWinstonAvailable ? logger : fallbackLogger;

module.exports = {
  info: (message) => {
    activeLogger.info(message);
  },
  warn: (message) => {
    activeLogger.warn(message);
  },
  error: (message, error) => {
    if (error) {
      activeLogger.error(`${message} ${error.message}`);
      activeLogger.error(error.stack);
    } else {
      activeLogger.error(message);
    }
  },
  debug: (message) => {
    activeLogger.debug(message);
  }
}; 