/**
 * Pino logger — single global instance.
 *
 * Use `logger.child({ requestId })` per-request (see middleware/requestLogger).
 * Per docs/11-devops.md §11.7: JSON in non-dev, pretty in dev.
 *
 * Redact list keeps secrets out of stdout: Authorization, cookie,
 * X-Internal-Key, password fields.
 */
import pino, { type Logger, type LoggerOptions } from 'pino';
import { loadEnv } from './env';

const env = loadEnv();

const baseOptions: LoggerOptions = {
  level: env.LOG_LEVEL,
  base: { service: env.SERVICE_NAME, env: env.NODE_ENV },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.headers["x-internal-key"]',
      '*.password',
      '*.token',
      '*.refreshToken',
      '*.accessToken',
    ],
    censor: '[redacted]',
  },
  formatters: {
    level: (label) => ({ level: label }),
  },
};

const devTransport =
  env.NODE_ENV === 'development'
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          singleLine: true,
          translateTime: 'SYS:HH:MM:ss.l',
          ignore: 'pid,hostname,service,env',
        },
      }
    : undefined;

export const logger: Logger = pino({
  ...baseOptions,
  ...(devTransport ? { transport: devTransport } : {}),
});
