import { z } from 'zod';
import { ValidationError } from '../../shared/errors.js';
import type { ActaQuery, Filters } from './domain.js';
const id = z.string().regex(/^[1-9]\d*$/).transform(Number).pipe(z.number().int().max(2147483647));
const filters = z.strictObject({ distritoId: id.optional(), tipoEleccionId: id.optional() });
const actas = filters.extend({ estado: z.enum(['Capturada', 'Pendiente']).optional(),
  pagina: id.pipe(z.number().max(1000000)).default(1), limite: id.pipe(z.number().max(100)).default(25) });
function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) throw new ValidationError('Consulta inválida. Omite los filtros para seleccionar Todos.', result.error.issues.map(i => ({ campo: i.path.join('.') || 'query', motivo: i.code })));
  return result.data;
}
export function parseFilters(input: unknown): Filters {
  const value = parse(filters, input);
  return { ...(value.distritoId === undefined ? {} : { distritoId: value.distritoId }),
    ...(value.tipoEleccionId === undefined ? {} : { tipoEleccionId: value.tipoEleccionId }) };
}
export function parseActas(input: unknown): ActaQuery {
  const value = parse(actas, input);
  return { pagina: value.pagina, limite: value.limite,
    ...(value.distritoId === undefined ? {} : { distritoId: value.distritoId }),
    ...(value.tipoEleccionId === undefined ? {} : { tipoEleccionId: value.tipoEleccionId }),
    ...(value.estado === undefined ? {} : { estado: value.estado }) };
}
export const parseReportFormat = (input: unknown): 'xlsx' | 'pdf' => parse(z.enum(['xlsx', 'pdf']), input);
export const parseSnapshotId = (input: unknown): string => parse(z.strictObject({ corteId: z.uuid() }), input).corteId;
