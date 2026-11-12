import { createApp } from './app.js';
import { loadEnvironment } from './config/env.js';
import { createLogger } from './config/logger.js';
import { Database, sqlConfiguration } from './infrastructure/database.js';
import { SqlMonitorRepository } from './modules/monitor/repositories/sql-monitor.repository.js';
const bootstrapLogger = createLogger();
async function main(): Promise<void> {
  const env = loadEnvironment();
  const logger = createLogger(env.LOG_LEVEL);
  const database = new Database(sqlConfiguration(env), logger, env.DB_REQUEST_TIMEOUT_MS);
  const repository = new SqlMonitorRepository(database);
  // El servicio arranca aun ante una caída de SQL; readiness da 503 y el pool reintenta
  // en la siguiente solicitud, sin bucles de reconexión ilimitados.
  const app = createApp({ repository, logger, corsOrigins: env.CORS_ORIGINS });
  const server = app.listen(env.PORT, env.HOST, () => logger.info({ host: env.HOST, port: env.PORT }, 'server.started'));
  server.requestTimeout = 30000; server.headersTimeout = 15000;
  let closing = false;
  const shutdown = (): void => {
    if (closing) return; closing = true;
    logger.info('server.stopping');
    const deadline = setTimeout(() => process.exit(1), 10000); deadline.unref();
    server.close(() => { void database.close().then(() => { clearTimeout(deadline); process.exitCode = 0; }).catch(() => { logger.error('database.close_failed'); process.exitCode = 1; }); });
  };
  process.once('SIGINT', shutdown); process.once('SIGTERM', shutdown);
  server.on('error', () => { logger.fatal('server.listen_failed'); process.exitCode = 1; });
}
main().catch(() => { bootstrapLogger.fatal('No se pudo iniciar. Revisa las variables de entorno con .env.example.'); process.exitCode = 1; });
