import { randomUUID } from 'node:crypto';
import { AppError } from '../../../shared/errors.js';
import type { Snapshot } from '../domain.js';
// Caché acotada de cortes generados exclusivamente por el servidor, sin datos del cliente.
export class SnapshotStore {
  private readonly entries = new Map<string, { value: Snapshot; expiresAt: number }>();
  constructor(private readonly ttlMs = 15 * 60 * 1000, private readonly maxEntries = 500, private readonly now = Date.now) {}
  save(value: Snapshot): string {
    const now = this.now();
    for (const [key, entry] of this.entries) if (entry.expiresAt <= now) this.entries.delete(key);
    if (this.entries.size >= this.maxEntries) {
      const first = this.entries.keys().next().value;
      if (first) this.entries.delete(first);
    }
    const id = randomUUID(); this.entries.set(id, { value: structuredClone(value), expiresAt: now + this.ttlMs }); return id;
  }
  get(id: string): Snapshot {
    const entry = this.entries.get(id);
    if (!entry || entry.expiresAt <= this.now()) {
      this.entries.delete(id);
      throw new AppError(410, 'SNAPSHOT_EXPIRED', 'El corte expiró o no existe. Actualiza el panel y vuelve a exportar.');
    }
    return structuredClone(entry.value);
  }
}
