export type ActaStatus = 'Capturada' | 'Pendiente';
export interface Filters { distritoId?: number; tipoEleccionId?: number }
export interface ActaQuery extends Filters { estado?: ActaStatus; pagina: number; limite: number }
export interface CatalogItem { id: number; nombre: string }
export interface Catalogs { distritos: CatalogItem[]; elecciones: CatalogItem[] }
export interface AggregateRow {
  distritoId: number; distrito: string; tipoEleccionId: number; tipoEleccion: string;
  esperadas: number; capturadas: number;
}
export interface Metrics { esperadas: number; capturadas: number; pendientes: number; porcentaje: number; semaforo: 'rojo' | 'amarillo' | 'verde' | 'sin_datos' }
export interface DetailRow extends AggregateRow, Metrics {}
export interface GroupRow extends Metrics { id: number; nombre: string }
export interface Snapshot {
  generadoEn: string;
  filtros: Filters & { distrito: string; tipoEleccion: string };
  resumen: Metrics; distritos: GroupRow[]; elecciones: GroupRow[]; detalle: DetailRow[];
}
export interface Acta {
  actaId: number; distritoId: number; distrito: string; tipoEleccionId: number; tipoEleccion: string;
  numeroActa: number; estado: ActaStatus; fechaCaptura: Date | null;
}
export interface ActaPage { items: Acta[]; total: number; pagina: number; limite: number; totalPaginas: number }
export interface MonitorRepository {
  catalogs(): Promise<Catalogs>;
  aggregate(filters: Filters): Promise<AggregateRow[]>;
  list(query: ActaQuery): Promise<ActaPage>;
  ping(): Promise<void>;
}
export function calculateMetrics(esperadas: number, capturadas: number): Metrics {
  const ratio = esperadas === 0 ? 0 : 100 * capturadas / esperadas;
  return { esperadas, capturadas, pendientes: esperadas - capturadas, porcentaje: Number(ratio.toFixed(2)),
    semaforo: esperadas === 0 ? 'sin_datos' : ratio < 50 ? 'rojo' : ratio < 80 ? 'amarillo' : 'verde' };
}
