import { describe, expect, it, vi } from 'vitest';
import { calculateMetrics } from '../../src/modules/monitor/domain.js';
import { parseActas, parseFilters } from '../../src/modules/monitor/validation.js';
import { MonitorService } from '../../src/modules/monitor/services/monitor.service.js';
import { SnapshotStore } from '../../src/modules/monitor/services/snapshot-store.js';
import { loadEnvironment } from '../../src/config/env.js';
import { repository } from '../helpers.js';
describe('reglas de negocio', () => {
  it.each([[0,0,0,'sin_datos'],[100,49,49,'rojo'],[100,50,50,'amarillo'],[100,79,79,'amarillo'],[100,80,80,'verde'],[3,1,33.33,'rojo']])('porcentaje y semáforo %s / %s', (expected,captured,percentage,color) => {
    expect(calculateMetrics(Number(expected),Number(captured))).toEqual({ esperadas: expected, capturadas: captured, pendientes: Number(expected)-Number(captured), porcentaje: percentage, semaforo: color });
  });
  it('calcula el global por sumas y no por promedio de porcentajes', async () => {
    const snapshot = await new MonitorService(repository()).snapshot({});
    expect(snapshot.resumen.porcentaje).toBe(66.67);
    expect(snapshot.resumen.pendientes).toBe(40);
  });
  it('valida catálogos antes de consultar actas', async () => {
    const repo = repository();
    await expect(new MonitorService(repo).snapshot({ distritoId: 99 })).rejects.toThrow('El distrito no existe');
    expect(repo.aggregate).not.toHaveBeenCalled();
  });
  it('transmite filtros y produce sin datos', async () => {
    const repo = repository(); vi.mocked(repo.aggregate).mockResolvedValue([]);
    const result = await new MonitorService(repo).snapshot({ distritoId: 1 });
    expect(repo.aggregate).toHaveBeenCalledWith({ distritoId: 1 });
    expect(result.resumen).toMatchObject({ porcentaje: 0, semaforo: 'sin_datos' });
    expect(result.detalle).toEqual([]);
  });
});
describe('validación estricta', () => {
  it.each([{ distritoId: '0' }, { distritoId: '-1' }, { distritoId: '1 OR 1=1' }, { distritoId: ['1','2'] }, { distritoId: '' }, { distritoId: '2147483648' }, { inesperado: '1' }, { distritoId: '1.5' }])('rechaza %j', query => expect(() => parseFilters(query)).toThrow());
  it('Todos se representa omitiendo filtros', () => expect(parseFilters({})).toEqual({}));
  it('aplica paginación por defecto', () => expect(parseActas({})).toEqual({ pagina: 1, limite: 25 }));
  it.each([{ limite: '101' },{ pagina: '0' },{ estado: 'otro' }])('rechaza paginación/estado inválido', query => expect(() => parseActas(query)).toThrow());
  it('acepta filtros combinados', () => expect(parseActas({ distritoId: '1', tipoEleccionId: '2', estado: 'Pendiente', pagina: '2', limite: '10' })).toEqual({ distritoId: 1, tipoEleccionId: 2, estado: 'Pendiente', pagina: 2, limite: 10 }));
  it('no expone secretos en errores de configuración', () => {
    expect(() => loadEnvironment({ DB_PASSWORD: 'secret-value' })).toThrow('Configuración inválida');
    try { loadEnvironment({ DB_PASSWORD: 'secret-value' }); } catch (error) { expect(String(error)).not.toContain('secret-value'); }
  });
});
describe('cortes de exportación', () => {
  it('conserva el corte, expira y limita capacidad', async () => {
    let now = 0;
    const store = new SnapshotStore(100, 1, () => now);
    const value = await new MonitorService(repository()).snapshot({});
    const first = store.save(value);
    value.resumen.capturadas = 999;
    expect(store.get(first).resumen.capturadas).toBe(80);
    const second = store.save(value);
    expect(() => store.get(first)).toThrow('El corte expiró');
    now = 101;
    expect(() => store.get(second)).toThrow('El corte expiró');
  });
});
