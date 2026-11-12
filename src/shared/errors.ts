export class AppError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string,
    public readonly details?: unknown, options?: ErrorOptions) {
    super(message, options); this.name = new.target.name;
  }
}
export class ValidationError extends AppError {
  constructor(message = 'Parámetros inválidos.', details?: unknown) { super(400, 'VALIDATION_ERROR', message, details); }
}
export class NotFoundError extends AppError {
  constructor(message: string) { super(404, 'NOT_FOUND', message); }
}
export class DatabaseError extends AppError {
  constructor(cause: unknown) { super(503, 'DATABASE_UNAVAILABLE', 'La base de datos no está disponible. Intenta nuevamente.', undefined, { cause }); }
}
export class ReportError extends AppError {
  constructor(cause: unknown) { super(500, 'REPORT_ERROR', 'No fue posible generar el reporte.', undefined, { cause }); }
}
