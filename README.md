# tracklink-enerfrost

Automatización del **Informe de Excesos de Velocidad (>120 km/h)** para ENERFROST,
clon parametrizado de [tracklink-santamarta](https://github.com/WurfelSPA/tracklink-santamarta).

Cada lunes a las 01:00 CLT, GitHub Actions descarga el reporte de TrackGTS,
lo fusiona con el historial y genera `reporte-semanal.pdf`. n8n lo descarga
y lo envía por email a las 07:00 CLT.

## Estado (2026-08-01)

- [ ] **Diseño sin confirmar** — ENERFROST no envió una muestra de referencia
      (a diferencia de KADEL). `generate-pdf.js` usa una paleta teal/frost
      provisoria y el layout de 3 columnas (Conductor/Unidad/Vel. Máx.)
      heredado de Santa Marta — ajustar cuando el cliente confirme formato.
- [x] `generate-pdf.js` — clon parametrizado, umbral 120 km/h
- [x] `download-weekly.js` — clon parametrizado, unitIds vía secret `TL_UNIT_IDS`
- [x] `weekly-report.yml` — mismo horario que Santa Marta (lunes 01:00 CLT)
- [x] Listado completo de unitIds resuelto vía HealthCheck_171 (ver tabla abajo)
- [x] Secrets `TL_USER` / `TL_PASSWORD` / `TL_DOMAIN` — mismos que Santa Marta
- [x] Workflow n8n de envío creado (Lunes 07:00 CLT) — [ZXkDmFQlCrGzMGMZ](https://wurfel.app.n8n.cloud/workflow/ZXkDmFQlCrGzMGMZ), inactivo, solo TEST a wurfel.cl@gmail.com
- [x] Estructura del "Reporte Relentí" identificada (hojas Detalle / Resumen Diario / Resumen Total)
- [ ] **PENDIENTE: cargar el secret `TL_UNIT_IDS`** en GitHub (Settings → Secrets → Actions) con el valor de la sección siguiente
- [ ] Endpoint de API del Reporte Relentí (pendiente captura de Network tab)
- [ ] Prueba end-to-end antes de producción
- [ ] Activar workflow n8n y GitHub Action una vez validado

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

## Segundo informe pendiente: Ralentí Excesivo

El mail de Track Link pide también un informe de **ralentí excesivo** para
ENERFROST. TrackGTS no expone este dato por el mismo endpoint que excesos de
velocidad — falta identificar el reporte/endpoint correcto (probablemente
otro report de TrackGTS, a explorar en `page/Reports.html`). No incluido en
este repo todavía.

## Secrets requeridos (Settings → Secrets → Actions)

| Secret        | Descripción                                                  |
|---------------|---------------------------------------------------------------|
| `TL_USER`     | Usuario TrackGTS                                              |
| `TL_PASSWORD` | Contraseña TrackGTS                                            |
| `TL_DOMAIN`   | Subdominio (ej. `tlchile`)                                     |
| `TL_UNIT_IDS` | unitIds de ENERFROST separados por coma                       |

## Destinatarios finales (confirmar antes de activar envío real)

- denisse.diaz@enerfrost.cl
- makarena.ramirez@enerfrost.cl
- nelson.hinojosa@enerfrostchile.cl
