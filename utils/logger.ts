import { createLogger, format, transports } from 'winston';

// Create a logger instance with custom formatting
const logger = createLogger({
  level: process.env.LOG_LEVEL || 'info', // Dynamic log level
  format: format.combine(
    format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    format.printf(({ timestamp, level, message, stack }) =>
      stack ? `${timestamp} [${level.toUpperCase()}]: ${message}\n${stack}` : `${timestamp} [${level.toUpperCase()}]: ${message}`
    )
  ),
  transports: [
    new transports.Console({
      format: format.combine(
        format.colorize(),
        format.printf(({ level, message }) => `[${level.toUpperCase()}]: ${message}`)
      ),
    }),
    new transports.File({
      filename: 'logs/app.log',
      maxsize: 5 * 1024 * 1024, // 5MB
      maxFiles: 5,
    }),
  ],
});

// Export logger with shorthand methods
export default logger;
