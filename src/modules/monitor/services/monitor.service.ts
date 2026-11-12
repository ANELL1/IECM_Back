import { ValidationError } from '../../../shared/errors.js';
import { calculateMetrics } from '../domain.js';
import type { ActaPage, ActaQuery, AggregateRow, Catalogs, Filters, GroupRow, MonitorRepository, Snapshot } from '../domain.js';
function group(rows: AggregateRow[], idKey: 'distritoId' | 'tipoEleccionId', nameKey: 'distrito' | 'tipoEleccion'): GroupRow[] {
  const groups = new Map<number, { id: number; nombre: string; esperadas: number; capturadas: number }>();
  for (const row of rows) {
    const value = groups.get(row[idKey]) ?? { id: row[idKey], nombre: row[nameKey], esperadas: 0, capturadas: 0 };
    value.esperadas += row.esperadas; value.capturadas += row.capturadas;
    groups.set(value.id, value);
  }
  return [...groups.values()].map(g => ({ id: g.id, nombre: g.nombre, ...calculateMetrics(g.esperadas, g.capturadas) }));
}
export class MonitorService {
  constructor(private readonly repository: MonitorRepository) {}
  catalogs(): Promise<Catalogs> { return this.repository.catalogs(); }
  async health(): Promise<{ status: string; database: string }> { await this.repository.ping(); return { status: 'ok', database: 'connected' }; }
  private async validate(filters: Filters): Promise<Catalogs> {
    const catalogs = await this.repository.catalogs();
    if (filters.distritoId !== undefined && !catalogs.distritos.some(d => d.id === filters.distritoId)) throw new ValidationError('El distrito no existe.');
    if (filters.tipoEleccionId !== undefined && !catalogs.elecciones.some(e => e.id === filters.tipoEleccionId)) throw new ValidationError('El tipo de elección no existe.');
    return catalogs;
  }
  async snapshot(filters: Filters): Promise<Snapshot> {
    const catalogs = await this.validate(filters);
    const rows = await this.repository.aggregate(filters);
    const totals = rows.reduce((acc, row) => ({ esperadas: acc.esperadas + row.esperadas, capturadas: acc.capturadas + row.capturadas }), { esperadas: 0, capturadas: 0 });
    return { generadoEn: new Date().toISOString(), filtros: { ...filters,
      distrito: catalogs.distritos.find(d => d.id === filters.distritoId)?.nombre ?? 'Todos',
      tipoEleccion: catalogs.elecciones.find(e => e.id === filters.tipoEleccionId)?.nombre ?? 'Todas' },
      resumen: calculateMetrics(totals.esperadas, totals.capturadas),
      distritos: group(rows, 'distritoId', 'distrito'), elecciones: group(rows, 'tipoEleccionId', 'tipoEleccion'),
      detalle: rows.map(row => ({ ...row, ...calculateMetrics(row.esperadas, row.capturadas) })) };
  }
  async list(query: ActaQuery): Promise<ActaPage> { await this.validate(query); return this.repository.list(query); }
}
