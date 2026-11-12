import type { Response } from 'express';
export function success(res: Response, data: unknown, extra: Record<string, unknown> = {}): void {
  res.json({ success: true, data, meta: { requestId: res.locals['requestId'] as string, ...extra } });
}
