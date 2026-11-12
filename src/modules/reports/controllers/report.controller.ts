import type { Request, Response } from 'express';
import type { MonitorService } from '../../monitor/services/monitor.service.js';
import type { SnapshotStore } from '../../monitor/services/snapshot-store.js';
import { parseFilters, parseReportFormat, parseSnapshotId } from '../../monitor/validation.js';
import type { ReportService } from '../services/report.service.js';
export class ReportController {
  constructor(private readonly monitor: MonitorService, private readonly reports: ReportService, private readonly snapshots: SnapshotStore) {}
  download = async (req: Request, res: Response): Promise<void> => {
    const format = parseReportFormat(req.params['formato']);
    const snapshot = 'corteId' in req.query ? this.snapshots.get(parseSnapshotId(req.query)) : await this.monitor.snapshot(parseFilters(req.query));
    const content = await this.reports.generate(format, snapshot);
    res.type(format === 'xlsx' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'application/pdf');
    res.attachment(`avance-captura-${new Date().toISOString().slice(0, 10)}.${format}`).send(content);
  };
}
