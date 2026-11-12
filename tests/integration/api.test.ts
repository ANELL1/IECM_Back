import { describe, expect, it, vi } from 'vitest';
import request, { type Response as TestResponse } from 'supertest';
import ExcelJS from 'exceljs';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createApp } from '../../src/app.js';
import { createLogger } from '../../src/config/logger.js';
import { ReportService } from '../../src/modules/reports/services/report.service.js';
import { ReportError, DatabaseError } from '../../src/shared/errors.js';
import { repository } from '../helpers.js';
function setup() {
  const repo = repository();
  return { repo, app: createApp({ repository: repo, logger: createLogger('silent'), corsOrigins: ['http://localhost:4200'] }) };
}
const binary = (res: TestResponse, callback: (error: Error | null, body?: Buffer) => void): void => {
  const chunks: Buffer[] = []; res.on('data', (c: Buffer) => chunks.push(c));
  res.on('end', () => callback(null, Buffer.concat(chunks))); res.on('error', callback);
};
describe('API HTTP con repositorio controlado (sin MySQL)', () => {
  it('health/live no depende de SQL; readiness sí', async () => {
    const { app, repo } = setup();
    await request(app).get('/health/live').expect(200);
    expect(repo.ping).not.toHaveBeenCalled();
    await request(app).get('/api/health').expect(200);
    vi.mocked(repo.ping).mockRejectedValue(new DatabaseError(new Error('password=secret')));
    const result = await request(app).get('/api/health').expect(503);
    expect(result.body.error.code).toBe('DATABASE_UNAVAILABLE');
    expect(JSON.stringify(result.body)).not.toContain('secret');
  });
  it.each(['/api/resumen','/api/estadisticas/distritos','/api/estadisticas/elecciones','/api/detalle','/api/catalogos'])('responde %s con JSON consistente', async path => {
    const { app } = setup(); const result = await request(app).get(path).expect(200);
    expect(result.body.success).toBe(true);
    expect(result.body.meta.requestId).toBe(result.headers['x-request-id']);
  });
  it('valida parámetros duplicados e inyección', async () => {
    const { app, repo } = setup();
    for (const query of ['distritoId=1&distritoId=2','distritoId=1%20OR%201=1','limite=101']) {
      const result = await request(app).get(`/api/actas?${query}`).expect(400);
      expect(result.body.error.code).toBe('VALIDATION_ERROR');
    }
    expect(repo.list).not.toHaveBeenCalled();
  });
  it('transmite filtros y paginación al repositorio', async () => {
    const { app, repo } = setup();
    const result = await request(app).get('/api/actas?distritoId=1&tipoEleccionId=1&estado=Pendiente&pagina=2&limite=10').expect(200);
    expect(repo.list).toHaveBeenCalledWith({ distritoId: 1, tipoEleccionId: 1, estado: 'Pendiente', pagina: 2, limite: 10 });
    expect(result.body.data).toMatchObject({ items: [], total: 0, totalPaginas: 0 });
  });
  it('aplica CORS y cabeceras de seguridad', async () => {
    const { app } = setup();
    const allowed = await request(app).get('/health/live').set('Origin','http://localhost:4200').expect(200);
    expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:4200');
    expect(allowed.headers['x-content-type-options']).toBe('nosniff');
    expect(allowed.headers['x-powered-by']).toBeUndefined();
    await request(app).get('/health/live').set('Origin','https://evil.example').expect(403);
  });
  it('responde errores JSON para cuerpo inválido, demasiado grande y ruta inexistente', async () => {
    const { app } = setup();
    await request(app).post('/unknown').set('Content-Type','application/json').send('{').expect(400);
    await request(app).post('/unknown').send({ value: 'a'.repeat(17000) }).expect(413);
    const result = await request(app).get('/unknown').expect(404);
    expect(result.body.success).toBe(false);
  });
  it('exporta Excel con filtros, detalle y totales del mismo corte', async () => {
    const { app, repo } = setup();
    const dashboard = await request(app).get('/api/monitor?distritoId=1').expect(200);
    vi.mocked(repo.aggregate).mockResolvedValue([]);
    const result = await request(app).get(`/api/reportes/xlsx?corteId=${dashboard.body.data.corteId}`).buffer(true).parse(binary).expect(200);
    const book = new ExcelJS.Workbook(); await book.xlsx.load(result.body);
    const sheet = book.getWorksheet('Avance')!;
    expect(sheet.getCell('A4').value).toContain('Distrito 01');
    const total = sheet.getRow(sheet.rowCount);
    expect(total.getCell(1).value).toBe('TOTAL');
    expect(total.getCell(3).value).toBe(120);
    expect(total.getCell(4).value).toBe(80);
    expect(total.getCell(6).value).toBeCloseTo(0.6667);
    expect(result.headers['content-disposition']).toContain('.xlsx');
  });
  it('genera PDF legible con título, filtros, detalle y total', async () => {
    const { app } = setup();
    const result = await request(app).get('/api/reportes/pdf').buffer(true).parse(binary).expect(200);
    const task = getDocument({ data: new Uint8Array(result.body), useSystemFonts: true });
    const pdf = await task.promise;
    const content = await (await pdf.getPage(1)).getTextContent();
    const text = content.items.map(item => 'str' in item ? item.str : '').join(' ');
    expect(text).toContain('Monitor de avance de captura');
    expect(text).toContain('Distrito: Todos'); expect(text).toContain('TOTAL');
    expect(text).toContain('66.67%'); expect(text).toContain('Generado:');
    await task.destroy();
  });
  it('rechaza formato, cortes desconocidos y filtros mezclados', async () => {
    const { app } = setup();
    await request(app).get('/api/reportes/csv').expect(400);
    await request(app).get('/api/reportes/pdf?corteId=00000000-0000-4000-8000-000000000000').expect(410);
    await request(app).get('/api/reportes/pdf?corteId=00000000-0000-4000-8000-000000000000&distritoId=1').expect(400);
  });
});

describe('fallos de exportación', () => {
  it('normaliza un error de reporte sin revelar su causa', async () => {
    const { app } = setup();
    const spy = vi.spyOn(ReportService.prototype, 'generate').mockRejectedValueOnce(new ReportError(new Error('secret-internal')));
    try {
      const result = await request(app).get('/api/reportes/pdf').expect(500);
      expect(result.body.error.code).toBe('REPORT_ERROR');
      expect(JSON.stringify(result.body)).not.toContain('secret-internal');
    } finally { spy.mockRestore(); }
  });
  it('exporta sin datos y conserva totales cero', async () => {
    const { app, repo } = setup(); vi.mocked(repo.aggregate).mockResolvedValue([]);
    const result = await request(app).get('/api/reportes/xlsx').buffer(true).parse(binary).expect(200);
    const book = new ExcelJS.Workbook(); await book.xlsx.load(result.body);
    const sheet = book.getWorksheet('Avance')!;
    expect(sheet.getCell('A8').value).toBe('Sin datos');
    expect(sheet.getRow(sheet.rowCount).getCell(3).value).toBe(0);
  });
  it('repite encabezados y pagina PDF con las 15 combinaciones', async () => {
    const { app, repo } = setup();
    vi.mocked(repo.aggregate).mockResolvedValue(Array.from({ length: 15 }, (_, i) => ({ distritoId: Math.floor(i / 3) + 1, distrito: `Distrito ${Math.floor(i / 3) + 1}`, tipoEleccionId: i % 3 + 1, tipoEleccion: 'Diputaciones MR', esperadas: 120, capturadas: 90 })));
    const result = await request(app).get('/api/reportes/pdf').buffer(true).parse(binary).expect(200);
    const task = getDocument({ data: new Uint8Array(result.body), useSystemFonts: true });
    const pdf = await task.promise;
    expect(pdf.numPages).toBeGreaterThan(1);
    const last = await (await pdf.getPage(pdf.numPages)).getTextContent();
    const text = last.items.map(i => 'str' in i ? i.str : '').join(' ');
    expect(text).toContain('TOTAL'); expect(text).toContain('1800'); expect(text).toContain('75.00%');
    await task.destroy();
  });
});
