# Base de datos · Monitor de captura IECM

Adaptación a **MySQL 8.4 / InnoDB** de los datos ficticios de la prueba técnica. El [documento oficial](../../01_Instrucciones_Postulante.docx) permite sustituir SQL Server por MySQL. La rama 8.4 está declarada en el script; no se verificó una instancia activa durante esta revisión.

## Archivos y nombre de la base

- `02_Base_Datos_Simulada.sql`: referencia original para SQL Server; no ejecutarlo en MySQL.
- `03_Base_Datos_MySQL.sql`: crea las tablas, restricciones, índice y datos ficticios en MySQL.
- Base requerida por el script: **`MonitorCapturaPrueba`**. Configurar ese mismo nombre en `DB_NAME` del `.env` local; `.env.example` actualmente usa otra combinación de mayúsculas.

El script MySQL no crea la base ni usuarios, no elimina tablas y no se ejecuta al iniciar el backend. Para una instalación nueva necesita la preparación siguiente.

## Preparación en MySQL Workbench

1. Iniciar MySQL 8.4 y abrir una conexión de Workbench a la instancia de pruebas. Usar una cuenta autorizada para crear la base, tablas y relaciones e insertar y consultar datos (`CREATE`, `REFERENCES`, `INSERT` y `SELECT` según el alcance concedido). La cuenta de lectura del backend solo necesita `SELECT` sobre las tres tablas.
2. En una pestaña SQL, comprobar el servidor:

   ```sql
   SELECT VERSION() AS version_mysql;
   SHOW DATABASES LIKE 'monitorcapturaprueba';
   ```

3. Si la base no existe, crearla mediante esta sentencia independiente, sin modificar el script proporcionado:

   ```sql
   CREATE DATABASE `monitorcapturaprueba`
     CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
   ```

   Si ya existe, revisar su contenido antes de continuar:

   ```sql
   SHOW TABLES FROM `monitorcapturaprueba`;
   ```

   Las tablas `Distrito`, `TipoEleccion` y `Acta` deben estar ausentes. No eliminar datos existentes para repetir la carga.

4. Seleccionar **File → Open SQL Script** y abrir `iecm-backend/database/03_Base_Datos_MySQL.sql`. Confirmar la conexión de destino y ejecutar el archivo completo, no solo la sentencia seleccionada. El `USE` del archivo selecciona la base en minúsculas.
5. Revisar **Action Output** y detenerse ante cualquier error. El último resultado esperado es `ActasEsperadas=1800`, `Capturadas=1350`, `Pendientes=450`. Son valores deducidos del script, no una carga comprobada durante esta revisión.
6. Configurar la conexión del backend siguiendo [el README principal](../README.md) y ejecutar `pnpm test:db` desde `iecm-backend` para verificar consultas reales y datos.

## Tablas y relaciones

| Tabla | Contenido y claves | Filas esperadas |
|---|---|---:|
| `Distrito` | `DistritoId` como clave primaria y `Nombre` | 5 |
| `TipoEleccion` | `TipoEleccionId` como clave primaria y `Nombre` | 3 |
| `Acta` | `ActaId` autoincremental; distrito, elección, número, estado y fecha de captura | 1800 |

Cada distrito y cada tipo de elección se relacionan con muchas actas mediante claves foráneas. `UQ_Acta` impide repetir la combinación `(DistritoId, TipoEleccionId, NumeroActa)`.

`CK_Estado` permite únicamente `Capturada` y `Pendiente`, distinguiendo mayúsculas. `CK_FechaCaptura` exige fecha para las capturadas y `NULL` para las pendientes. `FechaCaptura` usa `DATETIME(0)` y el backend la interpreta como UTC. `IX_Acta_FiltrosEstado` indexa distrito, elección y estado.

## Carga y correspondencia con la prueba

El script inserta los cinco distritos y tres elecciones y genera los números de acta del 1 al 120 mediante una CTE recursiva. Su producto cartesiano produce 120 actas por cada una de las 15 combinaciones: 1800 en total.

El número de capturadas por distrito parte de 96, 108, 72, 114 y 90, respectivamente, y resta 6 por cada incremento del identificador de elección desde 1. Conserva la distribución y las fechas calculadas del original: 1350 capturadas, 450 pendientes y 75.00% global. Distrito 1 y elección 1 deben producir 120 esperadas, 96 capturadas y 24 pendientes (80.00%).

La adaptación sustituye las construcciones de SQL Server por `AUTO_INCREMENT`, `DATETIME`, `WITH RECURSIVE`, `TIMESTAMPADD` y claves foráneas explícitas. Conserva las tres tablas, sus relaciones y la unicidad exigidas. No requiere archivos de datos externos; tras crear la base vacía, contiene la definición y carga necesarias para reproducir el conjunto. Esta conclusión procede de inspección estática, no de una ejecución nueva.

## Consultas de comprobación de solo lectura

Ejecutar en Workbench después de la carga:

```sql
SELECT COUNT(*) AS distritos FROM monitorcapturaprueba.Distrito;
SELECT COUNT(*) AS elecciones FROM monitorcapturaprueba.TipoEleccion;

SELECT COUNT(*) AS esperadas,
       SUM(Estado = 'Capturada') AS capturadas,
       SUM(Estado = 'Pendiente') AS pendientes,
       COALESCE(ROUND(100.0 * SUM(Estado = 'Capturada') /
                      NULLIF(COUNT(*), 0), 2), 0) AS porcentaje
FROM monitorcapturaprueba.Acta;

SELECT DistritoId, TipoEleccionId, COUNT(*) AS esperadas,
       SUM(Estado = 'Capturada') AS capturadas,
       SUM(Estado = 'Pendiente') AS pendientes
FROM monitorcapturaprueba.Acta
GROUP BY DistritoId, TipoEleccionId
ORDER BY DistritoId, TipoEleccionId;

SELECT COUNT(*) AS esperadas,
       SUM(Estado = 'Capturada') AS capturadas,
       SUM(Estado = 'Pendiente') AS pendientes
FROM monitorcapturaprueba.Acta
WHERE DistritoId = 1 AND TipoEleccionId = 1;
```

Resultados esperados: 5 distritos, 3 elecciones, totales globales 1800/1350/450 y 75.00%; 15 grupos de 120 actas; para el filtro final, 120/96/24.

## Precauciones

- Usar una instancia de pruebas y verificar la conexión antes de ejecutar. Toda la información es ficticia.
- El script no es idempotente: los `CREATE TABLE` fallan si las tablas ya existen. No ejecutarlo repetidamente ni forzar la continuación tras errores.
- El DDL realiza commits implícitos. La transacción de inserción no revierte la creación de tablas; un fallo puede dejar un esquema parcial que debe revisarse antes de reintentar.
- La sensibilidad a mayúsculas del nombre de base y tablas depende de la instancia. Conservar los nombres exactos del script y hacer coincidir `DB_NAME`.
- `/api/health` solo ejecuta `SELECT 1`. Usar los conteos anteriores y `pnpm test:db` para comprobar también el esquema y los datos.
- No incluir contraseñas reales en scripts, documentación ni comandos compartidos. Los ejemplos ficticios deben identificarse como tales. Introducirlas localmente en la conexión de Workbench o en el `.env` privado.
