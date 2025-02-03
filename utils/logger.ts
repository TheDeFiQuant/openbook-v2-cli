import { createLogger, format, transports } from 'winston';

// Custom format to ensure full error details are logged
const errorFormat = format((info) => {
  if (info instanceof Error) {
    return {
      ...info,
      message: info.message,
      stack: info.stack,
      details: JSON.stringify(info, null, 2), // Ensure full error details are logged
    };
  }
  return info;
});

// Create a logger instance with custom formatting
const logger = createLogger({
  level: process.env.LOG_LEVEL || 'info', // Dynamic log level
  format: format.combine(
    errorFormat(), // Ensure errors are formatted properly
    format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    format.printf(({ timestamp, level, message, stack, details }) => {
      if (stack) {
        return `${timestamp} [${level.toUpperCase()}]: ${message}\nStack: ${stack}\nDetails: ${details}`;
      }
      return `${timestamp} [${level.toUpperCase()}]: ${message}`;
    })
  ),
  transports: [
    new transports.Console({
      format: format.combine(
        format.colorize(),
        format.printf(({ level, message, stack, details }) => {
          if (stack) {
            return `[${level.toUpperCase()}]: ${message}\nStack: ${stack}\nDetails: ${details}`;
          }
          return `[${level.toUpperCase()}]: ${message}`;
        })
      ),
    }),
    new transports.File({
      filename: 'logs/app.log',
      maxsize: 5 * 1024 * 1024, // 5MB
      maxFiles: 5,
      format: format.combine(
        format.json() // Store logs in JSON format for easier debugging
      ),
    }),
  ],
});

export default logger;
