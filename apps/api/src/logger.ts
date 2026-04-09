/**
 * LexOS Logger
 * Structured JSON logging with pino
 */

import { createRequire } from 'node:module';
import pino from 'pino';
import { config } from './config.js';

const require = createRequire(import.meta.url);

function getPrettyTransport() {
  if (config.NODE_ENV !== 'development') {
    return undefined;
  }

  try {
    require.resolve('pino-pretty');
    return {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:standard',
        ignore: 'pid,hostname',
      },
    };
  } catch {
    return undefined;
  }
}

export const logger = pino({
  level: config.NODE_ENV === 'production' ? 'info' : 'debug',
  transport: getPrettyTransport(),
  base: {
    service: 'lexos-api',
    env: config.NODE_ENV,
  },
  redact: {
    paths: [
      'password',
      'passwordHash',
      'password_hash',
      'token',
      'accessToken',
      'refreshToken',
      'apiKey',
      'secret',
      'mfaSecret',
      'mfa_secret',
      'authorization',
      'cookie',
      '*.password',
      '*.passwordHash',
      '*.token',
      '*.secret',
    ],
    censor: '[REDACTED]',
  },
});

// Request logger that strips sensitive data
export function createRequestLogger(requestId: string) {
  return logger.child({ requestId });
}
