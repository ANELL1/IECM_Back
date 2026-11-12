-- MySQL 8.4 / InnoDB. DATOS EXCLUSIVAMENTE FICTICIOS.
-- Ejecutar con usuario de carga con CREATE e INSERT sobre la base existente.
-- No elimina ni reemplaza tablas. Si ya existen, detenerse y revisar; no usar --force.

USE `MonitorCapturaPrueba`;
SET NAMES utf8mb4;

CREATE TABLE Distrito (
  DistritoId INT NOT NULL PRIMARY KEY,
  Nombre VARCHAR(80) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE TipoEleccion (
  TipoEleccionId INT NOT NULL PRIMARY KEY,
  Nombre VARCHAR(100) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE Acta (
  ActaId INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  DistritoId INT NOT NULL,
  TipoEleccionId INT NOT NULL,
  NumeroActa INT NOT NULL,
  Estado VARCHAR(12) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_as_cs NOT NULL,
  FechaCaptura DATETIME(0) NULL COMMENT 'UTC; se serializa como ISO 8601',
  CONSTRAINT FK_Acta_Distrito FOREIGN KEY (DistritoId) REFERENCES Distrito(DistritoId),
  CONSTRAINT FK_Acta_TipoEleccion FOREIGN KEY (TipoEleccionId) REFERENCES TipoEleccion(TipoEleccionId),
  CONSTRAINT UQ_Acta UNIQUE (DistritoId, TipoEleccionId, NumeroActa),
  CONSTRAINT CK_Estado CHECK (Estado IN ('Capturada', 'Pendiente')),
  CONSTRAINT CK_FechaCaptura CHECK (
    (Estado = 'Capturada' AND FechaCaptura IS NOT NULL) OR
    (Estado = 'Pendiente' AND FechaCaptura IS NULL)),
  INDEX IX_Acta_FiltrosEstado (DistritoId, TipoEleccionId, Estado)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

START TRANSACTION;
INSERT INTO Distrito VALUES (1,'Distrito 01'),(2,'Distrito 02'),(3,'Distrito 03'),(4,'Distrito 04'),(5,'Distrito 05');
INSERT INTO TipoEleccion VALUES (1,'Diputaciones MR'),(2,'Diputaciones RP'),(3,'Alcaldias');
INSERT INTO Acta (DistritoId, TipoEleccionId, NumeroActa, Estado, FechaCaptura)
WITH RECURSIVE Numeros AS (
  SELECT 1 AS n UNION ALL SELECT n + 1 FROM Numeros WHERE n < 120
), Datos AS (
  SELECT d.DistritoId, e.TipoEleccionId, n.n,
    CASE d.DistritoId WHEN 1 THEN 96 WHEN 2 THEN 108 WHEN 3 THEN 72 WHEN 4 THEN 114 ELSE 90 END
      - (e.TipoEleccionId - 1) * 6 AS capturadas
  FROM Distrito d CROSS JOIN TipoEleccion e CROSS JOIN Numeros n
)
SELECT DistritoId, TipoEleccionId, n,
  CASE WHEN n <= capturadas THEN 'Capturada' ELSE 'Pendiente' END,
  CASE WHEN n <= capturadas THEN TIMESTAMPADD(MINUTE, n + DistritoId * 100 + TipoEleccionId * 10,
    CAST('2026-10-01 18:00:00' AS DATETIME)) ELSE NULL END
FROM Datos ORDER BY DistritoId, TipoEleccionId, n;
COMMIT;
SELECT COUNT(*) AS ActasEsperadas,
  SUM(Estado = 'Capturada') AS Capturadas,
  SUM(Estado = 'Pendiente') AS Pendientes FROM Acta;
-- Esperado: 1800 / 1350 / 450. Distrito 1, elección 1: 120 / 96 / 24.
