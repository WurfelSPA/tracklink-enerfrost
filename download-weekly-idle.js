#!/usr/bin/env node
/**
 * download-weekly-idle.js — ENERFROST (Ralentí excesivo)
 *
 * A diferencia del reporte de excesos de velocidad, TrackGTS NO expone el
 * reporte de Ralentí excesivo vía un endpoint que devuelva un .zip con un
 * .xlsx ya armado. El botón "Descargar" de la UI, para el tipo de reporte
 * "Ralentí excesivo" (reportTypeId 14), en realidad llama a:
 *
 *   POST /api/historyNewReports/{hash}
 *   body: [{ startDate, endDate, unitIds, reportType: 14 }]
 *
 * y esa respuesta es un JSON CRUDO (no un zip) con un registro por cada
 * evento de ralentí detectado, con esta forma:
 *   {
 *     unitAlias:  "MAXUS SRYB-26 (ANTOFA)",
 *     unitId:     3841,
 *     idxDate:    "2026-07-25T12:04:17",   // inicio del ralentí (IDN)
 *     idxLat, idxLong,
 *     msgType:    "IDN",
 *     nextType:   "IDF",
 *     nextDate:   "2026-07-25T13:35:32",   // fin del ralentí (IDF)
 *   }
 * Unidades sin eventos de ralentí en el rango vienen con idxDate/nextDate
 * en null. Confirmado en vivo el 2026-08-01 interceptando el fetch real de
 * la UI de TrackGTS (Favoritos → "Relenti semanal Enerfrost").
 *
 * Este script arma el .xlsx localmente (no depende de que TrackGTS genere
 * el archivo), con 3 hojas — Detalle / Resumen Diario / Resumen Total —
 * según la estructura ya identificada en README.md.
 *
 * Variables de entorno:
 *   TL_START          — "YYYY/MM/DD 04:00:00" (convención +4h, ver README)
 *   TL_END            — "YYYY/MM/DD 03:59:59" (día siguiente)
 *   TL_UNIT_IDS_IDLE  — unitIds de las 22 unidades de ENERFROST que entran en
 *                        este informe (subconjunto de flota con placa, NO las
 *                        143 unidades de TL_UNIT_IDS que usa el informe de
 *                        excesos de velocidad — son reportes con alcance
 *                        distinto, confirmado por el cliente 2026-08-07:
 *                        el de ralentí solo debe considerar estas 22).
 *
 * Nota: se filtran localmente los eventos recibidos para quedarnos solo con
 * unitId dentro de TL_UNIT_IDS_IDLE, como red de seguridad — la API de
 * TrackGTS no garantiza respetar el filtro de unitIds enviado en el request
 * para este reportType (14); se confirmó en vivo que devolvía eventos de
 * otras unidades de ENERFROST fuera del alcance de este informe (ver
 * incidente 2026-08-07: EN_0304/EN_0312/EN_0356 no debían aparecer).
 */
'use strict';

const puppeteer = require('puppeteer');
const XLSX      = require('xlsx');
const fs        = require('fs');
const path      = require('path');

function toLocalDate(iso) {
  // El backend devuelve timestamps sin offset (hora local Chile ya aplicada
  // por TrackGTS al construir el JSON, igual que en los reportes de viajes).
  if (!iso) return null;
  return new Date(iso.replace(' ', 'T'));
}

function fmtDate(d) {
  if (!d) return '';
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function fmtDuration(ms) {
  const totalSec = Math.round(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// TrackGTS no siempre sostiene un login más si ya hubo 1-2 logins seguidos
// de la misma cuenta en poco tiempo (confirmado 2026-08-07 en Kadel: 5
// intentos seguidos fallaron en ~25 minutos, la página se queda en
// login.html y la API responde idResult=-11 "sesión expirada" — mismo
// comportamiento de rate-limit por cuenta ya visto en /api/sync de la app
// STLC, ahí con mensaje explícito de "~20 minutos"). Por eso:
//   - cada intento usa un browser nuevo desde cero (no solo una pestaña
//     nueva), para no heredar cookies/localStorage de un intento fallido
//   - la espera entre intentos es de minutos, no segundos — hay ~6 horas
//     de margen entre esta corrida (lunes 01:00 CLT) y el envío de n8n
//     (lunes 07:00 CLT), así que de sobra para esperar un rate-limit real
const MAX_ATTEMPTS = 4;
const RETRY_DELAY_MS = 7 * 60_000;

async function loginAndFetchRalenti({ TL_USER, TL_PASSWORD, TL_DOMAIN, TL_START, TL_END, TL_UNIT_IDS_IDLE }) {
  let lastError;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });
    try {
      const page = await browser.newPage();
      page.setDefaultTimeout(60_000);
      const loginUrl = `https://${TL_DOMAIN}.trackgts.com/admin/login.html`;
      console.log(`[1] Intento ${attempt}/${MAX_ATTEMPTS} — Login en: ${loginUrl}`);
      await page.goto(loginUrl, { waitUntil: 'networkidle0', timeout: 60_000 });
      await page.waitForSelector('#username', { timeout: 30_000 });

      await page.evaluate(() => localStorage.setItem('sltLanguage', '0'));
      await page.reload({ waitUntil: 'networkidle0' });
      await page.waitForSelector('#username', { timeout: 30_000 });

      await page.evaluate((user, password, domain) => {
        const K  = 'd5fg4df5sg4ds5fg';
        const S  = { a:'1', b:'2', c:'3', d:'4', e:'5', f:'6', g:'7', h:'8', i:'9' };
        const k  = CryptoJS.enc.Utf8.parse(K);
        const iv = CryptoJS.enc.Utf8.parse(K);
        const a  = [];
        for (const c of password) {
          a.push(
            CryptoJS.AES.encrypt(
              CryptoJS.enc.Utf8.parse(S[c] || c), k,
              { iv, mode: CryptoJS.mode.CBC, padding: CryptoJS.pad.Pkcs7 }
            ).toString()
          );
        }
        ARRAYPSWD = a;
        document.getElementById('username').value = user;
        document.getElementById('domain').value   = domain;
        document.getElementById('password').value = '********';
        LOGININPROCESS = false;
        onLoginOn();
      }, TL_USER, TL_PASSWORD, TL_DOMAIN);

      console.log('[2] Esperando sesión (15s)...');
      await new Promise(r => setTimeout(r, 15_000));
      console.log(`[2] URL actual: ${page.url()}`);

      console.log(`[3] Consultando ralentí: ${TL_START} → ${TL_END}`);
      const result = await page.evaluate(async (startDate, endDate, unitIds) => {
        const h = JSONUSER.hash;
        const body = JSON.stringify([{ startDate, endDate, unitIds, reportType: 14 }]);
        const res = await fetch(
          `https://www.trackgts.com:82/api/historyNewReports/${h}`,
          { method: 'POST', headers: { 'Content-Type': 'application/json;charset=UTF-8' }, body }
        );
        const text = await res.text();
        let json;
        try { json = JSON.parse(text); } catch (e) {
          return { error: `Respuesta no-JSON: ${text.slice(0, 300)}` };
        }
        if (json && json.idResult !== undefined) {
          return { error: `idResult=${json.idResult} (sesión expirada o sin datos)` };
        }
        return { rows: json };
      }, TL_START, TL_END, TL_UNIT_IDS_IDLE);

      if (result.error) throw new Error(result.error);
      return result.rows || [];
    } catch (err) {
      lastError = err;
      console.log(`[!] Intento ${attempt}/${MAX_ATTEMPTS} falló: ${err.message}`);
      if (attempt < MAX_ATTEMPTS) {
        console.log(`[!] Esperando ${Math.round(RETRY_DELAY_MS / 60_000)} min antes de reintentar (posible rate-limit de login en TrackGTS)...`);
        await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
      }
    } finally {
      await browser.close();
    }
  }
  throw lastError;
}

async function main() {
  const { TL_USER, TL_PASSWORD, TL_DOMAIN, TL_START, TL_END, TL_UNIT_IDS_IDLE } = process.env;

  if (!TL_USER || !TL_PASSWORD || !TL_DOMAIN) {
    throw new Error('Faltan variables de entorno: TL_USER, TL_PASSWORD, TL_DOMAIN');
  }
  if (!TL_START || !TL_END) {
    throw new Error('Faltan variables TL_START y TL_END (calculadas por el step anterior)');
  }
  if (!TL_UNIT_IDS_IDLE) {
    throw new Error('Falta TL_UNIT_IDS_IDLE — las 22 unitIds de ENERFROST para este informe. Ver README.md.');
  }

  const allowedUnitIds = new Set(TL_UNIT_IDS_IDLE.split(',').map(s => s.trim()).filter(Boolean));

  console.log(`=== Download Weekly ENERFROST (Ralentí excesivo): ${TL_START} → ${TL_END} ===`);
  console.log(`Unidades incluidas (${allowedUnitIds.size}): ${TL_UNIT_IDS_IDLE}`);

  const rows = await loginAndFetchRalenti({ TL_USER, TL_PASSWORD, TL_DOMAIN, TL_START, TL_END, TL_UNIT_IDS_IDLE });
  const receivedRows = rows.filter(r => r.idxDate && r.nextDate);
    const rawRows = receivedRows.filter(r => allowedUnitIds.has(String(r.unitId)));
    const descartados = receivedRows.length - rawRows.length;
    console.log(`[4] Eventos de ralentí recibidos: ${receivedRows.length}`);
    if (descartados > 0) {
      const unidadesFuera = [...new Set(receivedRows.filter(r => !allowedUnitIds.has(String(r.unitId))).map(r => `${r.unitAlias} (${r.unitId})`))];
      console.log(`[4] ⚠ Descartados ${descartados} eventos fuera de las 22 unidades autorizadas: ${unidadesFuera.join(', ')}`);
    }
    console.log(`[4] Eventos de ralentí válidos para el informe: ${rawRows.length}`);

    // ── 3. Armar hoja Detalle ───────────────────────────────────────────────────
    const detalle = rawRows.map(r => {
      const start = toLocalDate(r.idxDate);
      const end   = toLocalDate(r.nextDate);
      const durMs = end - start;
      return {
        Unidad:        r.unitAlias,
        unitId:        r.unitId,
        'Inicio Ralentí': fmtDate(start),
        'Fin Ralentí':    fmtDate(end),
        'Duración':       fmtDuration(durMs),
        _durMs: durMs,
        _day: start.toISOString().slice(0, 10),
      };
    }).sort((a, b) => a.Unidad.localeCompare(b.Unidad) || (new Date(a['Inicio Ralentí']) - new Date(b['Inicio Ralentí'])));

    // ── 4. Resumen Diario (unidad x día) ────────────────────────────────────────
    const dailyMap = new Map(); // key: unidad|día
    for (const row of detalle) {
      const key = `${row.Unidad}|${row._day}`;
      if (!dailyMap.has(key)) {
        dailyMap.set(key, { Unidad: row.Unidad, Día: row._day, _durMs: 0, Eventos: 0 });
      }
      const acc = dailyMap.get(key);
      acc._durMs += row._durMs;
      acc.Eventos += 1;
    }
    const resumenDiario = [...dailyMap.values()]
      .map(r => ({ Unidad: r.Unidad, Día: r.Día, Eventos: r.Eventos, 'Tiempo Total Ralentí': fmtDuration(r._durMs) }))
      .sort((a, b) => a.Unidad.localeCompare(b.Unidad) || a.Día.localeCompare(b.Día));

    // ── 5. Resumen Total (unidad, toda la semana) ───────────────────────────────
    const totalMap = new Map();
    for (const row of detalle) {
      if (!totalMap.has(row.Unidad)) totalMap.set(row.Unidad, { Unidad: row.Unidad, _durMs: 0, Eventos: 0 });
      const acc = totalMap.get(row.Unidad);
      acc._durMs += row._durMs;
      acc.Eventos += 1;
    }
    const resumenTotal = [...totalMap.values()]
      .map(r => ({ Unidad: r.Unidad, Eventos: r.Eventos, 'Tiempo Total Ralentí': fmtDuration(r._durMs) }))
      .sort((a, b) => a.Unidad.localeCompare(b.Unidad));

    // ── 6. Escribir .xlsx ────────────────────────────────────────────────────────
    const detalleClean = detalle.map(({ _durMs, _day, ...rest }) => rest);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detalleClean), 'Detalle');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resumenDiario), 'Resumen Diario');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resumenTotal), 'Resumen Total');

  const dest = path.join(process.cwd(), 'latest-idle.xlsx');
  XLSX.writeFile(wb, dest);
  console.log(`[5] Guardado como: ${dest}`);
  console.log('=== COMPLETADO ===');
}

main().catch(err => {
  console.error('ERROR FATAL:', err.message);
  process.exit(1);
});
