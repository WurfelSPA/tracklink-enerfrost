# tracklink-enerfrost

Automatización del **Informe de Excesos de Velocidad (>120 km/h)** para ENERFROST,
clon parametrizado de [tracklink-santamarta](https://github.com/WurfelSPA/tracklink-santamarta).

Cada lunes a las 01:00 CLT, GitHub Actions descarga el reporte de TrackGTS,
lo fusiona con el historial y genera `reporte-semanal.pdf`. n8n lo descarga
y lo envía por email a las 07:00 CLT.

## Estado (2026-08-01)

- [x] **Diseño** — paleta definitiva derivada del logo real de ENERFROST
      (`logo Enerfrost.png`, teal #17B899 + carbón), usado en la portada del PDF.
      Layout de tabla con 3 columnas (Conductor/Unidad/Vel. Máx.) heredado de
      Santa Marta — pendiente que el cliente confirme si el contenido/estructura
      también le sirve, o solo la paleta.
- [x] `generate-pdf.js` — clon parametrizado, umbral 120 km/h
- [x] `download-weekly.js` — usa el reporte favorito "Excesos 120 Enerfrost semanal" (reportTypeId 24) ya existente en la cuenta de ENERFROST
- [x] `download-weekly-idle.js` — Ralentí excesivo vía `POST /api/historyNewReports/{hash}` (reportType 14), arma el .xlsx localmente
- [x] `weekly-report.yml` — mismo horario que Santa Marta (lunes 01:00 CLT), descarga excesos + ralentí
- [x] Listado completo de unitIds resuelto vía HealthCheck_171 (ver tabla abajo) y cargado como secret
- [x] Secrets `TL_USER` / `TL_PASSWORD` / `TL_DOMAIN` / `TL_UNIT_IDS` — cargados
- [x] Workflow n8n de envío creado (Lunes 07:00 CLT) — [ZXkDmFQlCrGzMGMZ](https://wurfel.app.n8n.cloud/workflow/ZXkDmFQlCrGzMGMZ), inactivo, solo TEST a wurfel.cl@gmail.com
- [x] Estructura del "Reporte Relentí" identificada y automatizada (hojas Detalle / Resumen Diario / Resumen Total)
- [x] Pipeline probado end-to-end: corrida exitosa 2026-08-01, 2 excesos + 60 eventos de ralentí detectados para el período 20-26/07
- [x] Dashboard (`index.html`) publicado en GitHub Pages: https://wurfelspa.github.io/tracklink-enerfrost/
- [x] Filtro por defecto del dashboard = "Últimos 7 días" contra la fecha real de hoy (con fallback a rango completo solo si no hay eventos, para no mostrar pantalla vacía) — verificado 2026-08-07
- [x] Pestaña "Reportes" en el dashboard con enlaces de descarga a Reporte (Excel) e Informe Ejecutivo (PDF), para Excesos de Velocidad y Ralentí Excesivo — agregada 2026-08-07
- [ ] Limpiar encoding (mojibake) en columnas Dirección/Posición del tab "Detalle de Eventos"
- [ ] **Activar envío real en n8n — lo hace Alex personalmente, NO automatizar**

## Nomenclatura de documentos (vigente desde 2026-08-07)

- **Reporte**: archivo Excel generado desde la plataforma, con el detalle y
  los datos base de los eventos.
- **Informe Ejecutivo**: documento PDF elaborado a partir del Reporte, con
  indicadores, análisis, gráficos, conclusiones y recomendaciones.

## Mapeo de unidades (HealthCheck_171, 2026-08-01)

Valor a cargar en el secret `TL_UNIT_IDS` (143 unidades, sin exclusiones):

```
3093,3103,3139,3171,3186,3588,3841,3860,3999,4000,4006,4029,4936,5199,5203,5204,5206,5209,5211,5212,5213,5215,5220,5223,5224,5225,5226,5227,5228,5229,5230,5231,5232,5234,5235,5236,5237,5238,5239,5240,5241,5243,5244,5245,5246,5247,5248,5286,5287,5288,5289,5290,5291,5292,5293,5294,5295,5296,5297,5298,5299,5300,5301,5302,5303,5304,5305,5306,5307,5308,5309,5310,5326,5328,5329,5331,5332,5333,5334,5336,5337,5338,5339,5340,5413,5414,5415,5416,5417,5418,5419,5420,5421,5422,5423,5424,5425,5426,5427,5428,5429,5430,5431,5432,5485,5486,5487,5488,5489,5490,5491,5492,5493,5494,5610,5611,5615,5625,5633,5635,5636,5651,5652,5995,5996,5998,5999,6000,6001,6002,6003,6004,6041,6042,6044,6045,6048,6049,6050,6051,6052,6094,6097
```

## Umbral de velocidad

La API de TrackGTS (`GetSpeedingReportByUnitsPagesZip`) no acepta un umbral
configurable — siempre devuelve lo que el sistema marca como "exceso" según
su propio default. `generate-pdf.js` aplica un filtro adicional
(`CONFIG.speedThreshold = 120`) como red de seguridad para respetar el
umbral pactado con el cliente.

### ⚠ Incidente 2026-08-08: excesos inflados por unidad sin patente (EN_0364)

El cliente reportó que el informe mostraba 48 excesos cuando la realidad
(portal TrackGTS) eran solo 2. Causa: la unidad `EN_0364 (Lux)` — un
equipo/activo sin patente, no un vehículo — acumuló decenas de lecturas de
velocidad de 177-374 km/h por sensor/GPS fallado. Fix aplicado:

1. Se purgó el historial acumulado (`INFORME EXCESOS DE VELOCIDAD.xlsx`) de
   las filas de `EN_0364`.
2. Se agregó `CONFIG.speedMaxPlausible = 200` en `generate-pdf.js` como red
   de seguridad ante velocidades físicamente imposibles.
3. A pedido de Rafael (2026-08-08): se agregó `CONFIG.excludeAliasPrefix =
   'EN_'` para excluir **todas** las unidades con alias `EN_XXXX` del
   informe de excesos, no solo `EN_0364` — son equipos sin patente y no
   corresponden a vehículos reales (se detectó también `EN_0378` con
   lecturas de 133,5 km/h en el mismo historial).

## Segundo informe pendiente: Ralentí Excesivo

El mail de Track Link pide también un informe de **ralentí excesivo** para
ENERFROST. TrackGTS no expone este dato por el mismo endpoint que excesos de
velocidad — falta identificar el reporte/endpoint correcto (probablemente
otro report de TrackGTS, a explorar en `page/Reports.html`). No incluido en
este repo todavía.

## Secrets requeridos (Settings → Secrets → Actions)

| Secret             | Descripción                                                                |
|--------------------|------------------------------------------------------------------------------|
| `TL_USER`          | Usuario TrackGTS                                                            |
| `TL_PASSWORD`      | Contraseña TrackGTS                                                        |
| `TL_DOMAIN`        | Subdominio (ej. `tlchile`)                                                 |
| `TL_UNIT_IDS`      | unitIds de ENERFROST, flota completa (143) — solo excesos de velocidad     |
| `TL_UNIT_IDS_IDLE` | unitIds de ENERFROST, subflota con placa (22) — solo ralentí excesivo      |

### ⚠ Incidente 2026-08-07: informe de ralentí con unidades ajenas

El cliente reportó que "Informe de ralentí excesivo" incluía unidades y
totales que no coincidían con el reporte favorito de TrackGTS ("Ralentí
semanal Enerfrost"), el cual solo debe considerar 22 unidades (la subflota
con patente: FORD RANGER, MAXUS, MITSUBISHI, NISSAN, PEUGEOT). El script
usaba el mismo secret `TL_UNIT_IDS` (143 unidades, incluye toda la flota con
tracker asignado a sitios SQM/faenas) que el informe de excesos de
velocidad — por eso aparecían unidades como `EN_0304`, `EN_0312`, `EN_0356`.

Fix: se separó en un secret nuevo, `TL_UNIT_IDS_IDLE`, con solo las 22
unidades correctas, y se agregó un filtro local en `download-weekly-idle.js`
como red de seguridad (la API de TrackGTS no garantiza respetar el filtro de
`unitIds` para este reportType). Valor a cargar en `TL_UNIT_IDS_IDLE`:

```
6769,6766,6767,6771,5206,3841,5204,5209,4936,5211,3860,5651,5633,5199,5220,5635,5625,5245,5215,5212,5213,5223
```

Mapeo (unitId → unidad), para referencia futura:

| unitId | Unidad                          |
|--------|----------------------------------|
| 6769   | FORD RANGER VYVC-38 (STGO PR)   |
| 6766   | FORD RANGER VYVC-47 (ANF)       |
| 6767   | FORD RANGER VYVC-51 (ANF)       |
| 6771   | FORD RANGER VYVC-65 (ANF)       |
| 5206   | MAXUS SPRV-87 (STGO)            |
| 3841   | MAXUS SRYB-26 (ANTOFA)          |
| 5204   | MAXUS SSRZ-79 (VENTAS Copiapo)  |
| 5209   | MAXUS TFWK-88 (STGO)            |
| 4936   | MAXUS TVVB-25 (CHILLAN)         |
| 5211   | MAXUS TVVB-26 (STGO)            |
| 3860   | MAXUS TYTC-88 (ANTOFA)          |
| 5651   | MAXUS VGVV-79 (STGO MA)         |
| 5633   | MAXUS VGVV-89 (STGO)            |
| 5199   | MITSUBISHI SRBG-21 (Ceniza)     |
| 5220   | MITSUBISHI VDYY-73 (Chillan)    |
| 5635   | MITSUBISHI VDYY-82 (ANTOFA)     |
| 5625   | MITSUBISHI VDYY-88 (Ventas)     |
| 5245   | MITSUBISHI VDYZ-59 (Copiapo)    |
| 5215   | NISSAN KBVJ-69 (STGO)           |
| 5212   | NISSAN RZSX-46 (STGO)           |
| 5213   | PEUGEOT SRTR-81 (STGO)          |
| 5223   | PEUGEOT SVCH-53 (STGO)          |

Pendiente de verificar tras el fix: incluso dentro de estas 22 unidades,
algunos conteos/duraciones de eventos no calzaban exactamente con el Excel
del favorito de TrackGTS (ej. SRYB-26: 23 eventos/10h11m vía API vs 19
eventos/5h44m en el favorito) — no explicado por unidades de más, podría ser
diferencia de ventana horaria o de-duplicación entre el endpoint crudo y el
reporte favorito. Comparar de nuevo con un Excel fresco del favorito una vez
que corra el próximo lunes con el secret corregido.

## Destinatarios finales (confirmar antes de activar envío real)

- denisse.diaz@enerfrost.cl
- makarena.ramirez@enerfrost.cl
- nelson.hinojosa@enerfrostchile.cl
