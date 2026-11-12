import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';
import type { Logger } from 'pino';
export function requestContext(logger: Logger): RequestHandler {
  return (req, res, next) => {
    const requestId = randomUUID();
    res.locals['requestId'] = requestId;
    res.setHeader('X-Request-Id', requestId); res.setHeader('Cache-Control', 'no-store');
    const started = performance.now();
    res.on('finish', () => logger.info({ requestId, method: req.method, route: req.route?.path ?? 'unmatched', statusCode: res.statusCode, durationMs: Math.round(performance.now() - started) }, 'http.request'));
    next();
  };
}
