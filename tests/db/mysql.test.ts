import { afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { loadEnvironment } from '../../src/config/env.js';
import { createLogger } from '../../src/config/logger.js';
import { Database, sqlConfiguration } from '../../src/infrastructure/database.js';
import { SqlMonitorRepository } from '../../src/modules/monitor/repositories/sql-monitor.repository.js';
import { MonitorService } from '../../src/modules/monitor/services/monitor.service.js';
import { createApp } from '../../src/app.js';
// No carga ni modifica datos. Requiere el script 03_Base_Datos_MySQL.sql previamente cargado.
const env = loadEnvironment();
const logger = createLogger('silent');
const db = new Database(sqlConfiguration(env), logger, env.DB_REQUEST_TIMEOUT_MS);
const repo = new SqlMonitorRepository(db);
const service = new MonitorService(repo);
afterAll(() => db.close());
describe('MySQL real con datos originales', () => {
  it('verifica los 1,800 registros y 75% global', async () => {
    expect((await service.snapshot({})).resumen).toMatchObject({ esperadas: 1800, capturadas: 1350, pendientes: 450, porcentaje: 75 });
  });
  it('aplica distrito y elección', async () => {
    expect((await service.snapshot({ distritoId: 1, tipoEleccionId: 1 })).resumen).toMatchObject({ esperadas: 120, capturadas: 96, pendientes: 24, porcentaje: 80 });
  });
  it('pagina sin duplicados y filtra pendientes', async () => {
    const query = { distritoId: 1, tipoEleccionId: 1, estado: 'Pendiente' as const, limite: 10 };
    const first = await service.list({ ...query, pagina: 1 });
    const second = await service.list({ ...query, pagina: 2 });
    expect(first.total).toBe(24); expect(first.totalPaginas).toBe(3);
    expect(first.items.every(a => a.estado === 'Pendiente' && a.fechaCaptura === null)).toBe(true);
    expect(new Set([...first.items, ...second.items].map(a => a.actaId)).size).toBe(20);
    expect((await service.list({ ...query, pagina: 99 })).items).toEqual([]);
  });
  it('conserva fechas ISO UTC de las actas capturadas', async () => {
    const page = await repo.list({ distritoId: 1, tipoEleccionId: 1, estado: 'Capturada', pagina: 1, limite: 1 });
    expect(page.items[0]?.fechaCaptura?.toISOString()).toBe('2026-10-01T19:51:00.000Z');
  });
  it('atiende resumen HTTP con SQL real', async () => {
    const app = createApp({ repository: repo, logger, corsOrigins: ['http://localhost:4200'] });
    const result = await request(app).get('/api/resumen').expect(200);
    expect(result.body.data.porcentaje).toBe(75);
  });
});
