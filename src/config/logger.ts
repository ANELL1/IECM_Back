import pino from 'pino';
export function createLogger(level = 'info') {
  return pino({ level, base: { service: 'iecm-backend' }, redact: { paths: ['password', 'authorization', 'cookie', 'config', 'req.headers.authorization', 'req.headers.cookie'], censor: '[REDACTED]' } });
}
