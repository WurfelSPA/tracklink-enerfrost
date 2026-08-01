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
- [ ] **PENDIENTE: secret `TL_UNIT_IDS`** — falta el listado completo de
      unitIds de TrackGTS para la flota de ENERFROST (sin exclusiones, a
      diferencia de KADEL)
- [ ] Secrets `TL_USER` / `TL_PASSWORD` / `TL_DOMAIN` (confirmar si ENERFROST
      usa el mismo dominio TrackGTS que Santa Marta/KADEL o uno propio)
- [ ] Workflow n8n de envío (Lunes 07:00 CLT, TEST-only hasta validación del cliente)
- [ ] Prueba end-to-end antes de producción

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
