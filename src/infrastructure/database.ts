import { readFileSync } from 'node:fs';
import { createPool, type Pool, type PoolConnection, type PoolOptions } from 'mysql2/promise';
import type { Logger } from 'pino';
import type { Environment } from '../config/env.js';
import { DatabaseError } from '../shared/errors.js';

export function sqlConfiguration(env: Environment): PoolOptions {
  return {
    host: env.DB_HOST, port: env.DB_PORT, database: env.DB_NAME,
    user: env.DB_USER, password: env.DB_PASSWORD,
    connectionLimit: env.DB_POOL_MAX, maxIdle: env.DB_POOL_MAX, idleTimeout: 30000,
    // Rechazar saturación evita una cola sin plazo de espera.
    waitForConnections: false, connectTimeout: env.DB_CONNECTION_TIMEOUT_MS,
    enableKeepAlive: true, multipleStatements: false, charset: 'utf8mb4', timezone: 'Z',
    supportBigNumbers: true, bigNumberStrings: true,
    ...(env.DB_SSL ? { ssl: { rejectUnauthorized: true,
      ...(env.DB_SSL_CA ? { ca: readFileSync(env.DB_SSL_CA, 'utf8') } : {}) } } : {}),
  };
}

export class Database {
  private pool: Pool | undefined;
  private closed = false;
  constructor(private readonly config: PoolOptions, private readonly logger: Logger,
    private readonly requestTimeoutMs = 15000) {}

  async withConnection<T>(operation: (connection: PoolConnection) => Promise<T>): Promise<T> {
    let connection: PoolConnection | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let destroyed = false;
    try {
      if (this.closed) throw new Error('Database closed');
      this.pool ??= createPool(this.config);
      connection = await this.pool.getConnection();
      const acquired = connection;
      const deadline = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          destroyed = true;
          acquired.destroy();
          reject(new Error('Database operation timed out'));
        }, this.requestTimeoutMs);
        timer.unref();
      });
      return await Promise.race([operation(acquired), deadline]);
    } catch (error) {
      // No devolver al pool una sesión con una transacción fallida o consultas pendientes.
      // Cerrar la conexión hace rollback en MySQL y permite un intento posterior nuevo.
      if (connection && !destroyed) { connection.destroy(); destroyed = true; }
      this.logger.error({ event: 'database.operation_failed' }, 'Error de conexión o consulta MySQL');
      throw error instanceof DatabaseError ? error : new DatabaseError(error);
    } finally {
      if (timer) clearTimeout(timer);
      if (connection && !destroyed) connection.release();
    }
  }

  async close(): Promise<void> {
    this.closed = true;
    const pool = this.pool; this.pool = undefined;
    if (pool) await pool.end();
  }
}
