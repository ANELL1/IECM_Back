// Verificación de integración REAL, solo lectura. Nunca crea ni simula datos.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
const base = (process.env.API_BASE_URL || 'http://127.0.0.1:3000/api').replace(/\/$/, '');
const out = path.resolve('artifacts/api');
await mkdir(out, { recursive: true });
const evidence = { generatedAt: new Date().toISOString(), api: base, mockedResponses: false, checks: [], status: 'running' };
async function response(route, status = 200) {
  const result = await fetch(`${base}${route}`, { signal: AbortSignal.timeout(20000) });
  assert.equal(result.status, status, `${route}: estado HTTP inesperado`);
  return result;
}
async function json(route) {
  const result = await response(route);
  assert.match(result.headers.get('content-type') || '', /application\/json/);
  const payload = await result.json(); assert.equal(payload.success, true);
  assert.ok(payload.meta?.requestId); return payload.data;
}
function checked(name) { evidence.checks.push({ name, passed: true }); }
try {
  // /health confirma conectividad; no informa el motor ni su versión.
  const health = await json('/health'); assert.equal(health.database, 'connected'); checked('Conexión a la base de datos verificada por la API');
  const { default: ExcelJS } = await import('exceljs');
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const catalogs = await json('/catalogos'); assert.equal(catalogs.distritos.length, 5); assert.equal(catalogs.elecciones.length, 3); checked('Catálogos originales');
  for (const [suffix, label] of [['', 'global'], ['?distritoId=1&tipoEleccionId=1', 'distrito-1-eleccion-1']]) {
    const snapshot = await json(`/monitor${suffix}`);
    const expected = suffix ? { esperadas: 120, capturadas: 96, pendientes: 24, porcentaje: 80 } : { esperadas: 1800, capturadas: 1350, pendientes: 450, porcentaje: 75 };
    for (const [key, value] of Object.entries(expected)) assert.equal(snapshot.resumen[key], value, `${label}: ${key}`);
    assert.equal(snapshot.detalle.reduce((sum, row) => sum + row.esperadas, 0), expected.esperadas);
    assert.equal(snapshot.detalle.reduce((sum, row) => sum + row.capturadas, 0), expected.capturadas);
    if (suffix) assert.ok(snapshot.detalle.every(row => row.distritoId === 1 && row.tipoEleccionId === 1));
    checked(`Monitor ${label}`);
    await writeFile(path.join(out, `monitor-${label}.json`), JSON.stringify(snapshot, null, 2));
    for (const format of ['xlsx', 'pdf']) {
      const result = await response(`/reportes/${format}?corteId=${encodeURIComponent(snapshot.corteId)}`);
      const buffer = Buffer.from(await result.arrayBuffer()); assert.ok(buffer.length > 100);
      if (format === 'xlsx') {
        const book = new ExcelJS.Workbook(); await book.xlsx.load(buffer); const sheet = book.getWorksheet('Avance'); assert.ok(sheet);
        const total = sheet.getRow(sheet.rowCount);
        assert.equal(total.getCell(1).value, 'TOTAL'); assert.equal(total.getCell(3).value, expected.esperadas);
        assert.equal(total.getCell(4).value, expected.capturadas); assert.equal(total.getCell(5).value, expected.pendientes);
        assert.equal(total.getCell(6).value, expected.porcentaje / 100);
        assert.ok(String(sheet.getCell('A4').value).includes(snapshot.filtros.distrito));
      } else {
        const task = getDocument({ data: new Uint8Array(buffer), useSystemFonts: true });
        const pdf = await task.promise; let content = '';
        for (let p = 1; p <= pdf.numPages; p++) content += (await (await pdf.getPage(p)).getTextContent()).items.map(item => 'str' in item ? item.str : '').join(' ');
        assert.ok(content.includes('TOTAL')); assert.ok(content.includes(`${expected.porcentaje.toFixed(2)}%`));
        assert.ok(content.includes(snapshot.filtros.distrito)); assert.ok(content.includes(String(expected.esperadas)));
        await task.destroy();
      }
      await writeFile(path.join(out, `avance-${label}.${format}`), buffer); checked(`Reporte ${format} ${label}`);
    }
  }
  const first = await json('/actas?distritoId=1&tipoEleccionId=1&estado=Pendiente&pagina=1&limite=10');
  const second = await json('/actas?distritoId=1&tipoEleccionId=1&estado=Pendiente&pagina=2&limite=10');
  assert.equal(first.total, 24); assert.equal(first.items.length, 10); assert.equal(second.items.length, 10);
  assert.equal(new Set([...first.items, ...second.items].map(row => row.actaId)).size, 20);
  assert.ok(first.items.every(row => row.estado === 'Pendiente' && row.fechaCaptura === null)); checked('Filtros y paginación real sin duplicados');
  await response('/monitor?distritoId=0', 400); await response('/monitor?distritoId=99999', 400); checked('Validaciones reales de filtros');
  evidence.status = 'passed';
} catch (error) {
  evidence.status = evidence.checks.length ? 'failed' : 'blocked';
  evidence.reason = evidence.checks.length ? error.message : 'No se pudo verificar la conexión a la base de datos a través de la API. Configura e inicia el backend con una base real.';
  process.exitCode = 1;
} finally {
  await writeFile(path.join(out, 'integration-check.json'), JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence, null, 2));
}
