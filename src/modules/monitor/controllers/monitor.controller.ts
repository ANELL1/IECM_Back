import type { Request, Response } from 'express';
import { success } from '../../../shared/http.js';
import { parseActas, parseFilters } from '../validation.js';
import type { MonitorService } from '../services/monitor.service.js';
import type { SnapshotStore } from '../services/snapshot-store.js';
export class MonitorController {
  constructor(private readonly service: MonitorService, private readonly snapshots: SnapshotStore) {}
  catalogs = async (_req: Request, res: Response): Promise<void> => { success(res, await this.service.catalogs()); };
  health = async (_req: Request, res: Response): Promise<void> => { success(res, await this.service.health()); };
  monitor = async (req: Request, res: Response): Promise<void> => {
    const snapshot = await this.service.snapshot(parseFilters(req.query));
    success(res, { ...snapshot, corteId: this.snapshots.save(snapshot) });
  };
  summary = this.section('resumen');
  districts = this.section('distritos');
  elections = this.section('elecciones');
  detail = this.section('detalle');
  actas = async (req: Request, res: Response): Promise<void> => { success(res, await this.service.list(parseActas(req.query))); };
  private section(key: 'resumen' | 'distritos' | 'elecciones' | 'detalle') {
    return async (req: Request, res: Response): Promise<void> => {
      const snapshot = await this.service.snapshot(parseFilters(req.query));
      success(res, snapshot[key], { generadoEn: snapshot.generadoEn, filtros: snapshot.filtros });
    };
  }
}
