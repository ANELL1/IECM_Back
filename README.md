# IECM · Backend del monitor de captura

API HTTP de consulta desarrollada con Node.js, TypeScript, Express y MySQL. Obtiene de la base de datos el avance de captura por distrito y elección y genera reportes Excel y PDF. No incluye captura ni modificación de actas.

La referencia es [01_Instrucciones_Postulante.docx](../01_Instrucciones_Postulante.docx). El documento permite adaptar SQL Server a MySQL y exige consultar datos reales, aplicar filtros y conservar los mismos totales en los reportes.

## Requisitos y versiones

| Componente | Versión y evidencia |
|---|---|
| Node.js | `>=22.13 <23`, declarado en `package.json`; `.nvmrc` selecciona la rama 22 |
| pnpm | `12.15.0`, declarado en `packageManager`; `preinstall` exige pnpm |
| MySQL | Rama 8.4, objetivo explícito de `database/03_Base_Datos_MySQL.sql` |
| TypeScript / Express / mysql2 | 5.9.3 / 5.3.0 / 3.24.6, observadas en los paquetes instalados |
| ExcelJS / PDFKit / Vitest | 4.4.0 / 0.17.2 / 3.2.7, observadas en los paquetes instalados |

Las versiones instaladas describen este entorno; `package.json` declara rangos. No se ha comprobado en esta revisión la versión de un servidor MySQL activo. MySQL Workbench permite preparar la base y ejecutar el script.

## Discrepancias pendientes

- `pnpm-lock.yaml` contiene el gestor pnpm, pero no las dependencias del backend declaradas en `package.json`. La instalación congelada no puede darse por reproducible con este archivo. Si falla, detener la puesta en marcha y solicitar la corrección del lockfile; no omitir `--frozen-lockfile` para ocultar la discrepancia.
- `.env.example` usa `MonitorCapturaPrueba`, mientras el script y el valor predeterminado del código usan `monitorcapturaprueba`. Para seguir estas instrucciones, configurar localmente `DB_NAME=monitorcapturaprueba`; la distinción de mayúsculas depende de la instancia.
- El script MySQL requiere una base existente: no ejecuta `CREATE DATABASE`. La preparación se explica en [database/README.md](database/README.md).

## Puesta en marcha desde cero

1. Instalar Node.js de la rama admitida, pnpm de la versión indicada y MySQL 8.4. Verificar los ejecutables:

   ```sh
   node --version
   pnpm --version
   mysql --version
   ```

   `mysql --version` identifica el cliente. Para conocer la versión del servidor, ejecutar `SELECT VERSION();` desde una conexión de Workbench.

2. Desde la carpeta raíz del proyecto, acceder al backend e instalar las dependencias:

   ```sh
   cd iecm-backend
   pnpm install --frozen-lockfile
   ```

   La discrepancia del lockfile descrita arriba debe resolverse antes de considerar reproducible una instalación nueva. Los siguientes pasos presuponen una instalación completada correctamente.

3. Crear el archivo local de configuración si todavía no existe:

   ```sh
   cp .env.example .env
   ```

   En PowerShell puede utilizarse `Copy-Item .env.example .env`. Antes de iniciar la aplicación, sustituir los valores de usuario y contraseña por los de una cuenta local autorizada y establecer `DB_NAME=monitorcapturaprueba`. No publicar `.env` ni compartir su contenido. No sobrescribir un `.env` existente.

4. Crear la base vacía y cargar `database/03_Base_Datos_MySQL.sql` siguiendo [las instrucciones de Workbench](database/README.md#preparación-en-mysql-workbench). La cuenta de ejecución de la API necesita permiso `SELECT` sobre las tres tablas; la cuenta de carga requiere permisos adicionales para crear el esquema e insertar datos.

5. Comprobar la conexión, el esquema y los datos ficticios mediante la suite disponible:

   ```sh
   pnpm test:db
   ```

   Carga `.env`, usa MySQL real y verifica totales, filtros y paginación. No necesita un servidor HTTP iniciado ni crea o modifica tablas. Un resultado correcto debe mostrar todas las pruebas aprobadas; no se ha ejecutado esta suite durante la revisión documental.

6. Iniciar el servidor en desarrollo:

   ```sh
   pnpm dev
   ```

   Con los valores predeterminados escucha en `127.0.0.1:3000`. La URL base de la API es `http://127.0.0.1:3000/api`. Las rutas `/` y `/api` no tienen un recurso definido y responden 404.

7. Desde otra terminal, verificar la salud:

   ```sh
   curl -i http://127.0.0.1:3000/api/health
   ```
  
   Respuesta **esperada**, no resultado de una ejecución realizada en esta revisión: HTTP 200 y un cuerpo como este, con un identificador distinto en cada petición:

   ```json
   {
     "success": true,
     "data": { "status": "ok", "database": "connected" },
     "meta": { "requestId": "UUID generado por el servidor" }
   }
   ```

   Esta ruta ejecuta `SELECT 1`; comprueba conectividad, pero no certifica que las tablas o los datos estén cargados. Una falla de base de datos produce HTTP 503. `/health/live` comprueba únicamente que el proceso HTTP responde.

## Variables de entorno

Node.js carga `.env` mediante los scripts de ejecución; las variables ya definidas en el proceso tienen precedencia. Los valores siguientes provienen de `src/config/env.ts`.

| Variable | Propósito / valor predeterminado |
|---|---|
| `NODE_ENV` | `development`; admite `test` y `production` |
| `HOST`, `PORT` | Dirección HTTP `127.0.0.1` y puerto `3000` |
| `CORS_ORIGINS` | Orígenes permitidos separados por comas; `http://localhost:4200`, sin ruta ni barra final |
| `LOG_LEVEL` | Nivel de registro; `info` |
| `DB_HOST`, `DB_PORT` | Servidor MySQL por TCP; `127.0.0.1`, `3306` |
| `DB_NAME` | Base de datos; `monitorcapturaprueba`, igual al `USE` del script |
| `DB_USER`, `DB_PASSWORD` | Obligatorios, sin valor predeterminado; configurar localmente |
| `DB_SSL` | `false` en desarrollo local; producción exige `true` |
| `DB_SSL_CA` | Ruta opcional al certificado CA; requiere `DB_SSL=true` |
| `DB_POOL_MAX` | Máximo de conexiones; `10` |
| `DB_CONNECTION_TIMEOUT_MS` | Tiempo para establecer conexión; `10000` ms |
| `DB_REQUEST_TIMEOUT_MS` | Plazo de operación tras adquirir conexión; `15000` ms |

La contraseña incluida en `.env.example` es ficticia y sirve únicamente como ejemplo:

```dotenv
DB_PASSWORD="Alwaysmine2025*"
```

Este valor no crea ni configura la contraseña de ningún usuario de MySQL. En el `.env` local debe sustituirse por la contraseña de la cuenta utilizada para la conexión; las credenciales reales no deben publicarse.

Los booleanos aceptan únicamente `true` o `false`. No se desactiva la validación del certificado TLS.

## Endpoints HTTP

| Método | Ruta | Propósito |
|---|---|---|
| GET | `/health/live` | Estado del proceso HTTP |
| GET | `/api/health` | Conectividad con MySQL |
| GET | `/api/catalogos` | Distritos y tipos de elección |
| GET | `/api/monitor` | Resumen, estadísticas, detalle y `corteId` |
| GET | `/api/resumen` | Totales, porcentaje y semáforo |
| GET | `/api/estadisticas/distritos` | Avance agrupado por distrito |
| GET | `/api/estadisticas/elecciones` | Avance agrupado por elección |
| GET | `/api/detalle` | Agregados por distrito y elección |
| GET | `/api/actas` | Actas individuales paginadas |
| GET | `/api/reportes/xlsx` | Descarga Excel |
| GET | `/api/reportes/pdf` | Descarga PDF |

Monitor, resumen, estadísticas, detalle y reportes aceptan `distritoId` y `tipoEleccionId`. La opción Todos se expresa omitiendo el parámetro. `/api/actas` admite además `estado=Capturada|Pendiente`, `pagina` (predeterminado 1) y `limite` (predeterminado 25, máximo 100). Los filtros inválidos se rechazan con HTTP 400.

```sh
curl 'http://127.0.0.1:3000/api/resumen?distritoId=1&tipoEleccionId=1'
curl 'http://127.0.0.1:3000/api/reportes/xlsx?distritoId=1' --output avance.xlsx
curl 'http://127.0.0.1:3000/api/reportes/pdf?distritoId=1' --output avance.pdf
```

Las respuestas JSON usan `{ success, data, meta }`; los errores usan `{ success: false, error, meta }`. `meta.requestId` identifica la petición. Los reportes exitosos son archivos binarios con `Content-Disposition`.

## Decisiones técnicas

- Organización por módulos con rutas, controladores, servicios y repositorio. `mysql2/promise` proporciona un pool de conexiones; no se utiliza ORM. Los datos operativos se leen de MySQL.
- Consultas parametrizadas mediante `execute` y marcadores `?`. Una agregación con `COUNT`, `SUM` y agrupación por distrito/elección alimenta los indicadores; los totales se suman sin promediar porcentajes ni duplicar actas.
- Pendientes = esperadas − capturadas. Avance = 100 × capturadas / esperadas; sin actas se devuelve 0 y `sin_datos`. Se redondea a dos decimales; el semáforo usa el porcentaje sin redondear: rojo <50, amarillo <80 y verde ≥80.
- El índice `IX_Acta_FiltrosEstado` y la unicidad por distrito, elección y número de acta apoyan las consultas. Total y página de actas se leen en una transacción de solo lectura con snapshot consistente. Las fechas se interpretan en UTC.
- ExcelJS y PDFKit generan título, fecha de generación, filtros, detalle y totales, con porcentajes a dos decimales. Para reproducir exactamente el monitor, descargar `/api/reportes/xlsx?corteId=UUID` o `/api/reportes/pdf?corteId=UUID` usando el identificador devuelto por `/api/monitor`, sin combinarlo con filtros.
- Los cortes se guardan en memoria durante 15 minutos, con máximo de 500 entradas. Un corte eliminado, expirado o perdido al reiniciar devuelve HTTP 410. Sin `corteId`, se consulta un corte nuevo. El almacenamiento es local a una instancia.
- Validación de entradas, errores centralizados, logs con Pino, Helmet, CORS y límite de 30 reportes por minuto por IP. No se implementa autenticación, que no es obligatoria en la prueba.

## Comandos de pruebas y compilación

Ejecutar desde `iecm-backend`; todos están declarados en `package.json`.

| Comando | Alcance y requisitos |
|---|---|
| `pnpm dev` | Desarrollo con recarga y carga de `.env` |
| `pnpm typecheck` | Comprobación de tipos del código y las pruebas |
| `pnpm build` | Compilación TypeScript a `dist/` |
| `pnpm start` | Ejecuta `dist/server.js`; requiere compilación previa y `.env` configurado |
| `pnpm test` | Unitarias e integración HTTP con dobles; no requiere MySQL |
| `pnpm test:unit` | Solo pruebas unitarias |
| `pnpm test:integration` | Express y reportes con repositorio controlado |
| `pnpm test:watch` | Pruebas predeterminadas en modo observación |
| `pnpm test:coverage` | Pruebas predeterminadas con cobertura |
| `pnpm test:db` | MySQL real con la base ficticia cargada; no requiere servidor HTTP iniciado |
| `pnpm test:api` | Backend iniciado y base cargada; comprueba API y contenido Excel/PDF |

`test:api` escribe evidencia y reportes en `artifacts/api`; admite `API_BASE_URL`, predeterminada a `http://127.0.0.1:3000/api`. No carga `.env` ni necesita frontend. Las suites reales solo leen la base de datos.

## Estado y evidencia

El código implementa consultas, filtros, métricas, paginación y exportación. La evidencia existente [artifacts/api/integration-check.json](artifacts/api/integration-check.json), fechada el 12 de noviembre de 2026, registra diez comprobaciones aprobadas. Es un registro histórico, no una validación del entorno actual ni de una instalación nueva.

Esta actualización se basa en inspección de archivos; no ejecutó instalación, compilación, suites ni carga SQL. Quedan pendientes las discrepancias señaladas y la comprobación desde una instalación limpia. El tiempo de desarrollo no está acreditado en los archivos revisados; debe completarlo la persona postulante antes de entregar. Las capturas y la evaluación visual de la interfaz corresponden a la entrega del frontend.

## Uso de inteligencia artificial

Se utilizó OpenAI Codex como herramienta de apoyo durante el desarrollo de la solución y documentación.
