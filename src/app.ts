import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import type { Logger } from 'pino';
import { AppError, NotFoundError } from './shared/errors.js';
import { success } from './shared/http.js';
import { requestContext } from './middleware/request-context.js';
import { errorHandler } from './middleware/error-handler.js';
import type { MonitorRepository } from './modules/monitor/domain.js';
import { MonitorService } from './modules/monitor/services/monitor.service.js';
import { SnapshotStore } from './modules/monitor/services/snapshot-store.js';
import { MonitorController } from './modules/monitor/controllers/monitor.controller.js';
import { monitorRoutes } from './modules/monitor/routes/monitor.routes.js';
import { ReportController } from './modules/reports/controllers/report.controller.js';
import { ReportService } from './modules/reports/services/report.service.js';
import { reportRoutes } from './modules/reports/routes/report.routes.js';
export interface AppDependencies { repository: MonitorRepository; logger: Logger; corsOrigins: string[] }
export function createApp({ repository, logger, corsOrigins }: AppDependencies) {
  const app = express();
  app.disable('x-powered-by'); app.set('query parser', 'simple');
  app.use(requestContext(logger)); app.use(helmet());
  app.use(cors({ origin: (origin, callback) => {
    if (!origin || corsOrigins.includes(origin)) callback(null, true);
    else callback(new AppError(403, 'ORIGIN_NOT_ALLOWED', 'Origen no permitido.'));
  }, methods: ['GET', 'HEAD', 'OPTIONS'], exposedHeaders: ['Content-Disposition', 'X-Request-Id'], credentials: false }));
  app.use(express.json({ limit: '16kb' }));
  app.get('/health/live', (_req, res) => success(res, { status: 'ok' }));
  const service = new MonitorService(repository);
  const snapshots = new SnapshotStore();
  app.use('/api', monitorRoutes(new MonitorController(service, snapshots)));
  app.use('/api/reportes', reportRoutes(new ReportController(service, new ReportService(), snapshots)));
  app.use((_req, _res, next) => next(new NotFoundError('Ruta no encontrada.')));
  app.use(errorHandler(logger));
  return app;
}
