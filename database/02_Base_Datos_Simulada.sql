/* DATOS COMPLETAMENTE FICTICIOS - PRUEBA TECNICA */
/* Ejecutar en una base de datos de pruebas VACIA. El script crea MonitorCapturaPrueba si no existe. */
IF DB_ID(N'MonitorCapturaPrueba') IS NULL CREATE DATABASE MonitorCapturaPrueba;
GO
USE MonitorCapturaPrueba;
GO
IF OBJECT_ID('dbo.Acta','U') IS NOT NULL DROP TABLE dbo.Acta;
IF OBJECT_ID('dbo.TipoEleccion','U') IS NOT NULL DROP TABLE dbo.TipoEleccion;
IF OBJECT_ID('dbo.Distrito','U') IS NOT NULL DROP TABLE dbo.Distrito;
GO
CREATE TABLE dbo.Distrito (DistritoId INT NOT NULL PRIMARY KEY, Nombre NVARCHAR(80) NOT NULL);
CREATE TABLE dbo.TipoEleccion (TipoEleccionId INT NOT NULL PRIMARY KEY, Nombre NVARCHAR(100) NOT NULL);
CREATE TABLE dbo.Acta (
 ActaId INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
 DistritoId INT NOT NULL REFERENCES dbo.Distrito(DistritoId),
 TipoEleccionId INT NOT NULL REFERENCES dbo.TipoEleccion(TipoEleccionId),
 NumeroActa INT NOT NULL,
 Estado VARCHAR(12) NOT NULL CHECK (Estado IN ('Capturada','Pendiente')),
 FechaCaptura DATETIME2(0) NULL,
 CONSTRAINT UQ_Acta UNIQUE (DistritoId, TipoEleccionId, NumeroActa),
 CONSTRAINT CK_FechaCaptura CHECK ((Estado='Capturada' AND FechaCaptura IS NOT NULL) OR (Estado='Pendiente' AND FechaCaptura IS NULL))
);
INSERT INTO dbo.Distrito VALUES (1,N'Distrito 01'),(2,N'Distrito 02'),(3,N'Distrito 03'),(4,N'Distrito 04'),(5,N'Distrito 05');
INSERT INTO dbo.TipoEleccion VALUES (1,N'Diputaciones MR'),(2,N'Diputaciones RP'),(3,N'Alcaldias');
GO
/* 120 actas por cada combinacion distrito-eleccion; 1800 en total. */
WITH Numeros AS (
 SELECT 1 AS n UNION ALL SELECT n+1 FROM Numeros WHERE n<120
)
INSERT INTO dbo.Acta(DistritoId,TipoEleccionId,NumeroActa,Estado,FechaCaptura)
SELECT d.DistritoId,e.TipoEleccionId,n.n,
 CASE WHEN n.n <= CASE d.DistritoId WHEN 1 THEN 96 WHEN 2 THEN 108 WHEN 3 THEN 72 WHEN 4 THEN 114 ELSE 90 END - (e.TipoEleccionId-1)*6 THEN 'Capturada' ELSE 'Pendiente' END,
 CASE WHEN n.n <= CASE d.DistritoId WHEN 1 THEN 96 WHEN 2 THEN 108 WHEN 3 THEN 72 WHEN 4 THEN 114 ELSE 90 END - (e.TipoEleccionId-1)*6
 THEN DATEADD(MINUTE,n.n + d.DistritoId*100 + e.TipoEleccionId*10,CONVERT(DATETIME2(0),'2026-10-01T18:00:00')) ELSE NULL END
FROM dbo.Distrito d CROSS JOIN dbo.TipoEleccion e CROSS JOIN Numeros n
OPTION (MAXRECURSION 120);
GO
CREATE INDEX IX_Acta_FiltrosEstado ON dbo.Acta(DistritoId,TipoEleccionId,Estado);
GO
SELECT COUNT(*) AS ActasEsperadas,
 SUM(CASE WHEN Estado='Capturada' THEN 1 ELSE 0 END) AS Capturadas,
 SUM(CASE WHEN Estado='Pendiente' THEN 1 ELSE 0 END) AS Pendientes
FROM dbo.Acta;
GO
