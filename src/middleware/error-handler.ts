import type { ErrorRequestHandler } from 'express';
import type { Logger } from 'pino';
import { AppError } from '../shared/errors.js';
export function errorHandler(logger: Logger): ErrorRequestHandler {
  return (error: unknown, _req, res, next) => {
    if (res.headersSent) { next(error); return; }
    let normalized: AppError;
    if (error instanceof AppError) normalized = error;
    else if (typeof error === 'object' && error !== null && 'type' in error && error.type === 'entity.too.large') normalized = new AppError(413, 'PAYLOAD_TOO_LARGE', 'La solicitud excede el límite de 16 KB.');
    else if (error instanceof SyntaxError && 'status' in error && error.status === 400) normalized = new AppError(400, 'INVALID_JSON', 'El cuerpo JSON no es válido.');
    else normalized = new AppError(500, 'INTERNAL_ERROR', 'Ocurrió un error interno.');
    const requestId = res.locals['requestId'] as string;
    // No serializar error/cause: los drivers pueden incluir SQL, servidores o credenciales.
    logger[normalized.status >= 500 ? 'error' : 'warn']({ requestId, code: normalized.code, statusCode: normalized.status }, 'http.error');
    res.status(normalized.status).json({ success: false, error: { code: normalized.code, message: normalized.message,
      ...(normalized.details === undefined ? {} : { details: normalized.details }) }, meta: { requestId } });
  };
}
