import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { ReportError } from '../../../shared/errors.js';
import type { DetailRow, Snapshot } from '../../monitor/domain.js';
const title = 'Monitor de avance de captura';
const headings = ['Distrito', 'Tipo de elección', 'Esperadas', 'Capturadas', 'Pendientes', 'Avance'];
export class ReportService {
  async generate(format: 'xlsx' | 'pdf', snapshot: Snapshot): Promise<Buffer> {
    try { return format === 'xlsx' ? await this.excel(snapshot) : await this.pdf(snapshot); }
    catch (error) { throw new ReportError(error); }
  }
  private async excel(snapshot: Snapshot): Promise<Buffer> {
    const book = new ExcelJS.Workbook();
    book.creator = 'IECM - Prueba técnica'; book.created = new Date();
    const sheet = book.addWorksheet('Avance', { views: [{ state: 'frozen', ySplit: 7 }] });
    sheet.columns = [{ width: 23 }, { width: 30 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 16 }];
    const lines = [title, `Generado: ${book.created.toISOString()}`, `Corte de datos: ${snapshot.generadoEn}`,
      `Distrito: ${snapshot.filtros.distrito} | Elección: ${snapshot.filtros.tipoEleccion}`, 'Información ficticia de prueba'];
    for (const text of lines) { const row = sheet.addRow([text]); sheet.mergeCells(row.number, 1, row.number, 6); }
    sheet.getRow(1).font = { bold: true, size: 18 };
    sheet.addRow([]); sheet.addRow(headings);
    const values = (row: Pick<DetailRow, 'distrito' | 'tipoEleccion' | 'esperadas' | 'capturadas' | 'pendientes' | 'porcentaje'>) => [row.distrito, row.tipoEleccion, row.esperadas, row.capturadas, row.pendientes, row.porcentaje / 100];
    snapshot.detalle.forEach(row => sheet.addRow(values(row)));
    if (!snapshot.detalle.length) sheet.addRow(['Sin datos']);
    const total = sheet.addRow(values({ distrito: 'TOTAL', tipoEleccion: '', ...snapshot.resumen }));
    for (const row of [sheet.getRow(7), total]) {
      row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF57387B' } }; row.height = 26;
    }
    sheet.getColumn(6).numFmt = '0.00%';
    sheet.autoFilter = { from: 'A7', to: `F${7 + snapshot.detalle.length}` };
    sheet.pageSetup = { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
    return Buffer.from(await book.xlsx.writeBuffer());
  }
  private pdf(snapshot: Snapshot): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 40, bufferPages: true, info: { Title: title, Author: 'IECM - Prueba técnica' } });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk)); doc.on('end', () => resolve(Buffer.concat(chunks))); doc.on('error', reject);
      doc.font('Helvetica-Bold').fontSize(21).fillColor('#422c5c').text(title);
      doc.moveDown(0.5).font('Helvetica').fontSize(10).fillColor('#333333');
      doc.text(`Generado: ${new Date().toISOString()}`); doc.text(`Corte de datos: ${snapshot.generadoEn}`);
      doc.text(`Distrito: ${snapshot.filtros.distrito} | Elección: ${snapshot.filtros.tipoEleccion}`);
      doc.moveDown();
      let y = doc.y;
      const xs = [40, 185, 400, 495, 590, 685];
      const widths = [135, 205, 85, 85, 85, 105];
      const drawRow = (cells: (string | number)[], strong = false): void => {
        doc.font(strong ? 'Helvetica-Bold' : 'Helvetica').fontSize(10);
        const height = Math.max(28, ...cells.map((v, i) => doc.heightOfString(String(v), { width: widths[i] ?? 85 }) + 12));
        if (y + height > 510) { doc.addPage(); y = 40; drawRow(headings, true); }
        if (strong) doc.rect(40, y - 4, 760, height).fill('#eee8f4');
        doc.fillColor('#292332').font(strong ? 'Helvetica-Bold' : 'Helvetica');
        cells.forEach((value, i) => doc.text(String(value), xs[i] ?? 40, y, { width: widths[i] ?? 85 }));
        y += height;
      };
      drawRow(headings, true);
      for (const row of snapshot.detalle) drawRow([row.distrito, row.tipoEleccion, row.esperadas, row.capturadas, row.pendientes, `${row.porcentaje.toFixed(2)}%`]);
      if (!snapshot.detalle.length) drawRow(['Sin datos', '', 0, 0, 0, '0.00%']);
      const total = snapshot.resumen;
      drawRow(['TOTAL', '', total.esperadas, total.capturadas, total.pendientes, `${total.porcentaje.toFixed(2)}%`], true);
      const range = doc.bufferedPageRange();
      for (let page = 0; page < range.count; page++) {
        doc.switchToPage(page);
        doc.font('Helvetica').fontSize(8).fillColor('#666666').text(`Información ficticia de prueba | Página ${page + 1} de ${range.count}`, 40, 545, { lineBreak: false });
      }
      doc.end();
    });
  }
}
