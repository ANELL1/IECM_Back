import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPool, type Pool, type PoolConnection } from 'mysql2/promise';
import { Database } from '../../src/infrastructure/database.js';
import { createLogger } from '../../src/config/logger.js';
import { DatabaseError } from '../../src/shared/errors.js';
import { SqlMonitorRepository } from '../../src/modules/monitor/repositories/sql-monitor.repository.js';
vi.mock('mysql2/promise', () => ({ createPool: vi.fn() }));
const connection = { execute: vi.fn(), query: vi.fn(), commit: vi.fn(), release: vi.fn(), destroy: vi.fn() };
const pool = { getConnection: vi.fn(), end: vi.fn() };
let db: Database;
beforeEach(() => {
  vi.resetAllMocks();
  pool.getConnection.mockResolvedValue(connection as unknown as PoolConnection);
  pool.end.mockResolvedValue(undefined);
  connection.query.mockResolvedValue([[], []]);
  connection.commit.mockResolvedValue(undefined);
  vi.mocked(createPool).mockReturnValue(pool as unknown as Pool);
  db = new Database({}, createLogger('silent'), 100);
});
afterEach(async () => { vi.useRealTimers(); await db.close(); });
describe('ciclo de vida del pool MySQL', () => {
  it('reutiliza el pool y libera conexiones exitosas', async () => {
    expect(await db.withConnection(async () => 42)).toBe(42);
    await db.withConnection(async () => undefined);
    expect(createPool).toHaveBeenCalledTimes(1);
    expect(connection.release).toHaveBeenCalledTimes(2);
    expect(connection.destroy).not.toHaveBeenCalled();
  });
  it('permite reintentar después de un fallo de conexión', async () => {
    pool.getConnection.mockRejectedValueOnce(new Error('authentication failure'));
    await expect(db.withConnection(async () => 1)).rejects.toBeInstanceOf(DatabaseError);
    expect(await db.withConnection(async () => 2)).toBe(2);
  });
  it('destruye la conexión si falla la consulta, evitando reutilizar transacciones', async () => {
    await expect(db.withConnection(async () => { throw new Error('query failure'); })).rejects.toBeInstanceOf(DatabaseError);
    expect(connection.destroy).toHaveBeenCalledOnce();
    expect(connection.release).not.toHaveBeenCalled();
  });
  it('destruye conexiones bloqueadas al vencer el plazo de operación', async () => {
    vi.useFakeTimers();
    const result = db.withConnection(() => new Promise<never>(() => undefined));
    const assertion = expect(result).rejects.toBeInstanceOf(DatabaseError);
    await vi.advanceTimersByTimeAsync(101);
    await assertion;
    expect(connection.destroy).toHaveBeenCalledOnce();
    expect(connection.release).not.toHaveBeenCalled();
  });
  it('no abre conexiones después del cierre', async () => {
    await db.close();
    await expect(db.withConnection(async () => 1)).rejects.toBeInstanceOf(DatabaseError);
    expect(pool.getConnection).not.toHaveBeenCalled();
  });
});
describe('adaptación del repositorio a MySQL', () => {
  it('convierte SUM y COUNT de MySQL a números JSON', async () => {
    connection.execute.mockResolvedValueOnce([[{ distritoId: 1, distrito: 'Distrito 01',
      tipoEleccionId: 1, tipoEleccion: 'Diputaciones MR', esperadas: '120', capturadas: '96' }], []]);
    const rows = await new SqlMonitorRepository(db).aggregate({ distritoId: 1 });
    expect(rows[0]).toMatchObject({ esperadas: 120, capturadas: 96 });
    expect(connection.execute.mock.calls[0]?.[1]).toEqual([1]);
  });
  it('lee total y página en snapshot y parametriza límite y desplazamiento', async () => {
    connection.execute.mockResolvedValueOnce([[{ total: '24' }], []]).mockResolvedValueOnce([[], []]);
    const page = await new SqlMonitorRepository(db).list({ distritoId: 1, estado: 'Pendiente', pagina: 2, limite: 10 });
    expect(page).toEqual({ items: [], total: 24, pagina: 2, limite: 10, totalPaginas: 3 });
    expect(connection.query.mock.calls.map(call => call[0])).toEqual([
      'SET TRANSACTION ISOLATION LEVEL REPEATABLE READ', 'START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY']);
    expect(connection.execute.mock.calls[1]?.[0]).toContain('LIMIT ? OFFSET ?');
    expect(connection.execute.mock.calls[1]?.[1]).toEqual([1, 'Pendiente', 10, 10]);
    expect(connection.commit).toHaveBeenCalledOnce();
    expect(connection.release).toHaveBeenCalledOnce();
  });
  it('no hace commit ni devuelve la conexión al pool ante error de paginación', async () => {
    connection.execute.mockResolvedValueOnce([[{ total: '24' }], []]).mockRejectedValueOnce(new Error('failure'));
    await expect(new SqlMonitorRepository(db).list({ pagina: 1, limite: 10 })).rejects.toBeInstanceOf(DatabaseError);
    expect(connection.commit).not.toHaveBeenCalled();
    expect(connection.destroy).toHaveBeenCalledOnce();
    expect(connection.release).not.toHaveBeenCalled();
  });
});
