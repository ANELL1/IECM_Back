import { vi } from 'vitest';
import type { MonitorRepository } from '../src/modules/monitor/domain.js';
export function repository(): MonitorRepository {
  return {
    catalogs: vi.fn(async () => ({ distritos: [{ id: 1, nombre: 'Distrito 01' }, { id: 2, nombre: 'Distrito 02' }], elecciones: [{ id: 1, nombre: 'Diputaciones MR' }] })),
    aggregate: vi.fn(async () => [
      { distritoId: 1, distrito: 'Distrito 01', tipoEleccionId: 1, tipoEleccion: 'Diputaciones MR', esperadas: 100, capturadas: 80 },
      { distritoId: 2, distrito: 'Distrito 02', tipoEleccionId: 1, tipoEleccion: 'Diputaciones MR', esperadas: 20, capturadas: 0 },
    ]),
    list: vi.fn(async query => ({ items: [], total: 0, pagina: query.pagina, limite: query.limite, totalPaginas: 0 })),
    ping: vi.fn(async () => undefined),
  };
}
