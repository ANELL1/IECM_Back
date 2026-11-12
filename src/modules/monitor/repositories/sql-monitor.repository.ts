import type { RowDataPacket } from 'mysql2/promise';
import type { Database } from '../../../infrastructure/database.js';
import type { Acta, ActaPage, ActaQuery, AggregateRow, CatalogItem, Catalogs, Filters, MonitorRepository } from '../domain.js';

// Solo se concatenan fragmentos constantes; los valores se envían por separado a execute().
export function bindFilters(filters: Filters & { estado?: string }): { where: string; values: (number | string)[] } {
  const clauses: string[] = [];
  const values: (number | string)[] = [];
  if (filters.distritoId !== undefined) { clauses.push('a.DistritoId = ?'); values.push(filters.distritoId); }
  if (filters.tipoEleccionId !== undefined) { clauses.push('a.TipoEleccionId = ?'); values.push(filters.tipoEleccionId); }
  if (filters.estado !== undefined) { clauses.push('a.Estado = ?'); values.push(filters.estado); }
  return { where: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', values };
}

// COUNT devuelve BIGINT y SUM devuelve DECIMAL: mysql2 puede entregarlos como cadenas.
export function countNumber(value: number | string): number {
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < 0) throw new Error('Conteo fuera del rango numérico seguro');
  return result;
}
type AggregateRecord = RowDataPacket & Omit<AggregateRow, 'esperadas' | 'capturadas'> & {
  esperadas: number | string; capturadas: number | string;
};

export class SqlMonitorRepository implements MonitorRepository {
  constructor(private readonly database: Database) {}
  catalogs(): Promise<Catalogs> {
    return this.database.withConnection(async connection => {
      const [districts] = await connection.execute<(CatalogItem & RowDataPacket)[]>(
        'SELECT DistritoId AS id, Nombre AS nombre FROM Distrito ORDER BY DistritoId');
      const [elections] = await connection.execute<(CatalogItem & RowDataPacket)[]>(
        'SELECT TipoEleccionId AS id, Nombre AS nombre FROM TipoEleccion ORDER BY TipoEleccionId');
      return { distritos: districts, elecciones: elections };
    });
  }
  aggregate(filters: Filters): Promise<AggregateRow[]> {
    return this.database.withConnection(async connection => {
      const { where, values } = bindFilters(filters);
      const [rows] = await connection.execute<AggregateRecord[]>(`
        SELECT a.DistritoId AS distritoId, d.Nombre AS distrito,
          a.TipoEleccionId AS tipoEleccionId, t.Nombre AS tipoEleccion,
          COUNT(*) AS esperadas,
          SUM(CASE WHEN a.Estado = 'Capturada' THEN 1 ELSE 0 END) AS capturadas
        FROM Acta a
        INNER JOIN Distrito d ON d.DistritoId = a.DistritoId
        INNER JOIN TipoEleccion t ON t.TipoEleccionId = a.TipoEleccionId
        ${where}
        GROUP BY a.DistritoId, d.Nombre, a.TipoEleccionId, t.Nombre
        ORDER BY a.DistritoId, a.TipoEleccionId`, values);
      return rows.map(row => ({ ...row, esperadas: countNumber(row.esperadas), capturadas: countNumber(row.capturadas) }));
    });
  }
  list(query: ActaQuery): Promise<ActaPage> {
    return this.database.withConnection(async connection => {
      // Snapshot InnoDB: total y página coherentes sin bloquear escrituras concurrentes.
      await connection.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
      await connection.query('START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY');
      const { where, values } = bindFilters(query);
      const [counts] = await connection.execute<(RowDataPacket & { total: number | string })[]>(
        `SELECT COUNT(*) AS total FROM Acta a ${where}`, values);
      const [items] = await connection.execute<(Acta & RowDataPacket)[]>(`
        SELECT a.ActaId AS actaId, a.DistritoId AS distritoId, d.Nombre AS distrito,
          a.TipoEleccionId AS tipoEleccionId, t.Nombre AS tipoEleccion,
          a.NumeroActa AS numeroActa, a.Estado AS estado, a.FechaCaptura AS fechaCaptura
        FROM Acta a
        INNER JOIN Distrito d ON d.DistritoId = a.DistritoId
        INNER JOIN TipoEleccion t ON t.TipoEleccionId = a.TipoEleccionId
        ${where}
        ORDER BY a.DistritoId, a.TipoEleccionId, a.NumeroActa
        LIMIT ? OFFSET ?`, [...values, query.limite, (query.pagina - 1) * query.limite]);
      const total = countNumber(counts[0]?.total ?? 0);
      await connection.commit();
      return { items, total, pagina: query.pagina, limite: query.limite, totalPaginas: Math.ceil(total / query.limite) };
    });
  }
  ping(): Promise<void> {
    return this.database.withConnection(async connection => { await connection.execute('SELECT 1 AS ok'); });
  }
}
