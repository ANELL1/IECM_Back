import { Router } from 'express';
import type { MonitorController } from '../controllers/monitor.controller.js';
export function monitorRoutes(controller: MonitorController): Router {
  const router = Router();
  router.get('/health', controller.health);
  router.get('/catalogos', controller.catalogs);
  router.get('/monitor', controller.monitor);
  router.get('/resumen', controller.summary);
  router.get('/estadisticas/distritos', controller.districts);
  router.get('/estadisticas/elecciones', controller.elections);
  router.get('/detalle', controller.detail);
  router.get('/actas', controller.actas);
  return router;
}
