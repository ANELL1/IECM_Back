import { z } from 'zod';
const integer = (fallback: number, max: number) => z.coerce.number().int().min(1).max(max).default(fallback);
const boolean = (fallback: 'true' | 'false') => z.enum(['true', 'false']).default(fallback).transform(v => v === 'true');
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().min(1).default('127.0.0.1'), PORT: integer(3000, 65535),
  CORS_ORIGINS: z.string().default('http://localhost:4200').transform(v => v.split(',').map(s => s.trim())).pipe(z.array(z.url().refine(v => { const u = new URL(v); return ['http:', 'https:'].includes(u.protocol) && u.origin === v; }, 'Usa un origen HTTP sin ruta ni barra final.')).min(1)),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  DB_HOST: z.string().min(1).default('127.0.0.1'), DB_PORT: integer(3306, 65535),
  DB_NAME: z.string().min(1).default('monitorcapturaprueba'), DB_USER: z.string().min(1), DB_PASSWORD: z.string().min(1),
  DB_SSL: boolean('false'), DB_SSL_CA: z.string().min(1).optional(),
  DB_POOL_MAX: integer(10, 100), DB_CONNECTION_TIMEOUT_MS: integer(10000, 120000), DB_REQUEST_TIMEOUT_MS: integer(15000, 120000),
});
export type Environment = z.infer<typeof schema>;
export function loadEnvironment(input: NodeJS.ProcessEnv = process.env): Environment {
  const result = schema.safeParse(input);
  if (!result.success) {
    // Nunca incluir valores de entrada o el objeto completo de configuración.
    throw new Error(`Configuración inválida. Revisa: ${[...new Set(result.error.issues.map(i => i.path.join('.')))].join(', ')}`);
  }
  if (result.data.NODE_ENV === 'production' && !result.data.DB_SSL) {
    throw new Error('Producción requiere DB_SSL=true y verificación de certificado MySQL.');
  }
  if (result.data.DB_SSL_CA && !result.data.DB_SSL) throw new Error('DB_SSL_CA requiere DB_SSL=true.');
  return result.data;
}
