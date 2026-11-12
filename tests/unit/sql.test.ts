import { describe, expect, it } from 'vitest';
import { bindFilters, countNumber } from '../../src/modules/monitor/repositories/sql-monitor.repository.js';
import { loadEnvironment } from '../../src/config/env.js';
import { sqlConfiguration } from '../../src/infrastructure/database.js';
describe('MySQL parametrizado', () => {
  it('separa valores de SQL y conserva el orden de parámetros', () => {
    expect(bindFilters({ distritoId: 2, tipoEleccionId: 3, estado: 'Pendiente' })).toEqual({
      where: 'WHERE a.DistritoId = ? AND a.TipoEleccionId = ? AND a.Estado = ?', values: [2, 3, 'Pendiente'],
    });
    expect(bindFilters({})).toEqual({ where: '', values: [] });
    expect(bindFilters({ tipoEleccionId: 3 })).toEqual({ where: 'WHERE a.TipoEleccionId = ?', values: [3] });
  });
  it('no interpola un valor malicioso incluso si se omite validación HTTP', () => {
    const value = "Pendiente' OR 1=1 --";
    expect(bindFilters({ estado: value })).toEqual({ where: 'WHERE a.Estado = ?', values: [value] });
  });
  it('normaliza agregados DECIMAL/BIGINT sin concatenar cadenas', () => {
    expect(countNumber('120') + countNumber('96')).toBe(216);
    expect(countNumber('0')).toBe(0);
    expect(() => countNumber('9007199254740993')).toThrow();
  });
});
describe('configuración MySQL', () => {
  const credentials = { DB_USER: 'test-user', DB_PASSWORD: 'test-password' };
  it('utiliza TCP local y no habilita sentencias múltiples', () => {
    const env = loadEnvironment(credentials);
    expect(sqlConfiguration(env)).toMatchObject({ host: '127.0.0.1', port: 3306,
      database: 'monitorcapturaprueba', multipleStatements: false, timezone: 'Z', waitForConnections: false });
  });
  it('exige TLS en producción sin permitir certificados inválidos', () => {
    expect(() => loadEnvironment({ ...credentials, NODE_ENV: 'production' })).toThrow('DB_SSL');
    const env = loadEnvironment({ ...credentials, NODE_ENV: 'production', DB_SSL: 'true' });
    expect(sqlConfiguration(env).ssl).toEqual({ rejectUnauthorized: true });
    expect(() => loadEnvironment({ ...credentials, DB_SSL_CA: '/ca.pem' })).toThrow('DB_SSL_CA');
  });
});
