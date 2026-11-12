import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import type { ReportController } from '../controllers/report.controller.js';
import { AppError } from '../../../shared/errors.js';
export function reportRoutes(controller: ReportController): Router {
  const router = Router();
  router.use(rateLimit({ windowMs: 60000, limit: 30, standardHeaders: 'draft-8', legacyHeaders: false,
    handler: (_req, _res, next) => next(new AppError(429, 'RATE_LIMIT', 'Demasiados reportes. Intenta nuevamente en un minuto.')) }));
  router.get('/:formato', controller.download);
  return router;
}
