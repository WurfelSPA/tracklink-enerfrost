#!/usr/bin/env node
'use strict';
/**
 * generate-pdf-ralenti.js — ENERFROST
 * "Informe de Ralentí Excesivo", a partir de RALENTI EXCESIVO.xlsx (hoja
 * Detalle, generada por download-weekly-idle.js). Mismo estilo visual (5
 * páginas) y paleta que generate-pdf.js (Excesos de Velocidad) de este
 * mismo repo — logo y colores derivados de logo-enerfrost.png.
 *
 * Variables de entorno esperadas:
 *   REPORT_START — "YYYY-MM-DD"
 *   REPORT_END   — "YYYY-MM-DD"
 *
 * Entrada:  RALENTI EXCESIVO.xlsx (hoja "Detalle")
 * Salida:   reporte-ralenti.pdf
 */

const XLSX = require('xlsx');
const fs   = require('fs');
const path = require('path');

const CONFIG = {
  siteName:      'ENERFROST',
  footerLabel:   'ENERFROST',
  logoUrl:       'https://raw.githubusercontent.com/WurfelSPA/tracklink-enerfrost/main/logo-enerfrost.png',
  colorDark:     '#0e2f2a',
  colorDarker:   '#071a17',
  colorMid:      '#12554a',
  colorRankFrom: '#0e2f2a',
  colorRankTo:   '#17B899',
  colorAccent:   '#17B899',
};

const EXCEL_FILE = path.join(process.cwd(), 'RALENTI EXCESIVO.xlsx');
const OUTPUT_PDF = path.join(process.cwd(), 'reporte-ralenti.pdf');

const DIAS_ES      = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const DIAS_ES_FULL = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES_ES     = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];

const PAGE_W = 1280;
const PAGE_H = 720;

// ─────────────────────────────────────────────────────────────────────────────
async function main() {
  const startDate = process.env.REPORT_START;
  const endDate   = process.env.REPORT_END;
  if (!startDate || !endDate) throw new Error('Faltan variables REPORT_START y REPORT_END.');

  console.log(`[pdf-ralenti] Generando informe de ralentí: ${startDate} → ${endDate}`);
  if (!fs.existsSync(EXCEL_FILE)) throw new Error(`No se encontró: ${EXCEL_FILE}`);

  const rows = parseAndFilter(fs.readFileSync(EXCEL_FILE), startDate, endDate);
  console.log(`[pdf-ralenti] Eventos de ralentí en el período: ${rows.length}`);

  const stats = computeStats(rows, startDate, endDate);
  const html  = generateHTML(stats);

  fs.writeFileSync(path.join(process.cwd(), 'ralenti-preview.html'), html);

  const puppeteer = require('puppeteer');
  console.log('[pdf-ralenti] Iniciando Puppeteer...');
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: PAGE_W, height: PAGE_H });
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 40000 });
    const pdf = await page.pdf({
      width: `${PAGE_W}px`, height: `${PAGE_H}px`,
      printBackground: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
    });
    fs.writeFileSync(OUTPUT_PDF, pdf);
    console.log(`[pdf-ralenti] ✅ PDF guardado: ${OUTPUT_PDF} (${pdf.length} bytes)`);
  } finally {
    await browser.close();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PARSEO
// ─────────────────────────────────────────────────────────────────────────────
function parseDuracionToMin(str) {
  // "HH:MM:SS" (HH puede tener más de 2 dígitos si supera 99h)
  const m = String(str || '').match(/^(\d+):(\d{2}):(\d{2})$/);
  if (!m) return 0;
  return (+m[1]) * 60 + (+m[2]) + (+m[3]) / 60;
}

function parseAndFilter(buffer, startDate, endDate) {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const ws = wb.Sheets['Detalle'] || wb.Sheets[wb.SheetNames[0]];
  const data = XLSX.utils.sheet_to_json(ws, { raw: false });

  const [sy, sm, sd] = startDate.split('-').map(Number);
  const [ey, em, ed] = endDate.split('-').map(Number);
  const startTs = new Date(sy, sm - 1, sd, 0, 0, 0).getTime();
  const endTs   = new Date(ey, em - 1, ed, 23, 59, 59).getTime();

  const rows = [];
  for (const r of data) {
    const alias = String(r['Unidad'] || '').trim();
    const inicioStr = String(r['Inicio Ralentí'] || '').trim();
    if (!alias || !inicioStr) continue;

    const m = inicioStr.match(/^(\d{4})\/(\d{2})\/(\d{2})\s+(\d{2}):(\d{2}):(\d{2})/);
    if (!m) continue;
    const fecha = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
    const ts = fecha.getTime();
    if (ts < startTs || ts > endTs) continue;

    rows.push({
      alias,
      fecha,
      durMin: parseDuracionToMin(r['Duración']),
    });
  }
  return rows;
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
function pad(n) { return String(n).padStart(2, '0'); }

function splitAlias(alias) {
  const parts = String(alias || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { model: '', code: '' };
  const codeIdx = parts.findIndex(p => /-/.test(p));
  if (codeIdx >= 0) return { model: parts.slice(0, codeIdx).join(' '), code: parts[codeIdx] };
  return { model: parts.slice(0, -1).join(' '), code: parts[parts.length - 1] };
}

function fmtPct(v) { return Number(v).toFixed(1).replace('.', ','); }
function fmtHoras(min) {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return `${h}h ${pad(m)}m`;
}

function formatVerboseRange(startDate, endDate) {
  const [sy, sm, sd] = startDate.split('-').map(Number);
  const [ey, em, ed] = endDate.split('-').map(Number);
  if (sy === ey && sm === em) return `${sd} al ${ed} de ${MESES_ES[em - 1]} de ${ey}`;
  if (sy === ey) return `${sd} de ${MESES_ES[sm - 1]} – ${ed} de ${MESES_ES[em - 1]} de ${ey}`;
  return `${sd} de ${MESES_ES[sm - 1]} de ${sy} – ${ed} de ${MESES_ES[em - 1]} de ${ey}`;
}

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ─────────────────────────────────────────────────────────────────────────────
// ESTADÍSTICAS
// ─────────────────────────────────────────────────────────────────────────────
function computeStats(rows, startDate, endDate) {
  const totalEventos = rows.length;
  const totalMin = rows.reduce((s, r) => s + r.durMin, 0);

  const porUnidad = {};
  const byDayMap  = {};

  rows.forEach(r => {
    if (!porUnidad[r.alias]) porUnidad[r.alias] = { count: 0, min: 0 };
    porUnidad[r.alias].count++;
    porUnidad[r.alias].min += r.durMin;
    const d = r.fecha;
    const dayKey = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    byDayMap[dayKey] = (byDayMap[dayKey] || 0) + r.durMin;
  });

  const unidadesArr = Object.entries(porUnidad)
    .map(([alias, data]) => {
      const { model, code } = splitAlias(alias);
      return {
        alias, unitCode: code, unitModel: model,
        count: data.count, min: data.min,
        pct: totalMin ? (data.min / totalMin) * 100 : 0,
        promedioMin: data.count ? data.min / data.count : 0,
      };
    })
    .sort((a, b) => b.min - a.min);

  const [sy, sm, sd] = startDate.split('-').map(Number);
  const dayCount = Math.round((new Date(endDate).setHours(12) - new Date(startDate).setHours(12)) / 86400000) + 1;
  const weekDays = Array.from({ length: Math.max(dayCount, 1) }, (_, i) => {
    const d   = new Date(sy, sm - 1, sd + i);
    const key = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    return { key, date: d, label: `${DIAS_ES[d.getDay()]} ${pad(d.getDate())}/${pad(d.getMonth() + 1)}`, minTotal: byDayMap[key] || 0 };
  });
  const sortedDays = weekDays.slice().sort((a, b) => b.minTotal - a.minTotal);
  const peakDay = sortedDays[0] || { label: '—', minTotal: 0, key: '', date: null };

  const top3Min = unidadesArr.slice(0, 3).reduce((s, u) => s + u.min, 0);
  const top3Pct = totalMin ? (top3Min / totalMin) * 100 : 0;

  const globalMax = unidadesArr.slice().sort((a, b) => b.min - a.min)[0] || null;

  const [ey, em, ed] = endDate.split('-').map(Number);
  return {
    startDate, endDate,
    startDisplay: `${pad(sd)}/${pad(sm)}/${sy}`,
    endDisplay:   `${pad(ed)}/${pad(em)}/${ey}`,
    rangeVerbose: formatVerboseRange(startDate, endDate),
    totalEventos, totalMin,
    promedioMin: totalEventos ? totalMin / totalEventos : 0,
    unidadesArr,
    weekDays, sortedDays, peakDay,
    top3Min, top3Pct,
    globalMax,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// GRÁFICOS SVG
// ─────────────────────────────────────────────────────────────────────────────
function hexToRgb(hex) { const n = parseInt(hex.replace('#', ''), 16); return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }; }
function toHex(r, g, b) { return '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join(''); }
function lerpColor(c1, c2, t) {
  const p1 = hexToRgb(c1), p2 = hexToRgb(c2);
  return toHex(p1.r + (p2.r - p1.r) * t, p1.g + (p2.g - p1.g) * t, p1.b + (p2.b - p1.b) * t);
}
function lighten(hex, amt) { return lerpColor(hex, '#ffffff', amt); }
function darken(hex, amt)  { return lerpColor(hex, '#000000', amt); }

function rankColor(rank, n) {
  if (n <= 1) return CONFIG.colorDark;
  return lerpColor(CONFIG.colorRankFrom, CONFIG.colorRankTo, rank / (n - 1));
}
function valueRankColors(values) {
  const idx = values.map((v, i) => i).sort((a, b) => values[b] - values[a]);
  const colors = new Array(values.length);
  idx.forEach((origIdx, rank) => { colors[origIdx] = rankColor(rank, values.length); });
  return colors;
}
function niceTicks(maxVal, targetCount) {
  maxVal = Math.max(maxVal, 1);
  const rawStep = maxVal / targetCount;
  const mag  = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const norm = rawStep / mag;
  let step;
  if (norm < 1.5) step = 1 * mag; else if (norm < 3) step = 2 * mag; else if (norm < 7) step = 5 * mag; else step = 10 * mag;
  const max = Math.ceil(maxVal / step) * step;
  const ticks = [];
  for (let v = 0; v <= max + 1e-9; v += step) ticks.push(Math.round(v));
  return { ticks, max };
}

function barDefs(idPrefix, colors) {
  const grads = colors.map((c, i) => `
    <linearGradient id="${idPrefix}-g${i}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${lighten(c, 0.32)}"/>
      <stop offset="55%" stop-color="${c}"/>
      <stop offset="100%" stop-color="${darken(c, 0.08)}"/>
    </linearGradient>`).join('');
  const shadow = `
    <filter id="${idPrefix}-shadow" x="-40%" y="-40%" width="180%" height="180%">
      <feDropShadow dx="0" dy="2" stdDeviation="2.2" flood-color="#1e293b" flood-opacity="0.22"/>
    </filter>`;
  return `<defs>${grads}${shadow}</defs>`;
}

function horizontalBarChart(items, { width, height, labelWidth = 205, xAxisLabel = '', yAxisLabel = '', idPrefix = 'hbar' }) {
  const values = items.map((i) => i.value);
  const colors = valueRankColors(values);
  const { ticks, max } = niceTicks(Math.max(...values, 1), 6);
  const topLabelPad = yAxisLabel ? 22 : 0;
  const plotX = labelWidth, plotW = width - labelWidth - 46;
  const topPad = 6 + topLabelPad, bottomPad = xAxisLabel ? 46 : 26, plotH = height - topPad - bottomPad;
  const rowH = plotH / items.length;
  const barH = Math.min(27, rowH * 0.62);

  let grid = '', axis = '', bars = '';
  ticks.forEach((t) => {
    const x = plotX + (t / max) * plotW;
    grid += `<line x1="${x.toFixed(1)}" y1="${topPad}" x2="${x.toFixed(1)}" y2="${topPad + plotH}" stroke="#e2e8f0" stroke-width="1" stroke-dasharray="3,3"/>`;
    axis += `<text x="${x.toFixed(1)}" y="${topPad + plotH + 21}" font-size="13" fill="#94a3b8" text-anchor="middle" font-family="Inter,sans-serif">${t}</text>`;
  });
  items.forEach((it, i) => {
    const y = topPad + i * rowH + (rowH - barH) / 2;
    const w = Math.max((it.value / max) * plotW, 2);
    bars += `<text x="${plotX - 12}" y="${(y + barH / 2 + 5).toFixed(1)}" font-size="14.5" font-weight="700" fill="#334155" text-anchor="end" font-family="Inter,sans-serif">${escapeHtml(it.label)}</text>`;
    bars += `<rect x="${plotX}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${barH}" rx="${(barH / 2).toFixed(1)}" fill="url(#${idPrefix}-g${i})" filter="url(#${idPrefix}-shadow)"/>`;
    bars += `<text x="${(plotX + w + 9).toFixed(1)}" y="${(y + barH / 2 + 5).toFixed(1)}" font-size="15" font-weight="800" fill="#0f172a" font-family="Inter,sans-serif">${escapeHtml(it.valueLabel != null ? it.valueLabel : it.value)}</text>`;
  });
  const labels = `${yAxisLabel ? `<text x="0" y="14" font-size="13" font-weight="700" fill="#64748b" font-family="Inter,sans-serif">${escapeHtml(yAxisLabel)}</text>` : ''}${xAxisLabel ? `<text x="${(plotX + plotW / 2).toFixed(1)}" y="${height - 6}" font-size="13" font-weight="700" fill="#64748b" text-anchor="middle" font-family="Inter,sans-serif">${escapeHtml(xAxisLabel)}</text>` : ''}`;
  return `<svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">${barDefs(idPrefix, colors)}${grid}${bars}${axis}${labels}</svg>`;
}

function verticalBarChart(items, { width, height, showValueLabels = false, peakBadge = null, xAxisLabel = '', yAxisLabel = '', idPrefix = 'vbar' }) {
  const values = items.map((i) => i.value);
  const colors = valueRankColors(values);
  const { ticks, max } = niceTicks(Math.max(...values, 1), 5);
  const topBase = peakBadge ? 46 : (showValueLabels ? 34 : 14);
  const leftPad = 44, rightPad = 8, topPad = topBase + (yAxisLabel ? 20 : 0), bottomPad = xAxisLabel ? 46 : 30;
  const plotW = width - leftPad - rightPad, plotH = height - topPad - bottomPad;
  const n = items.length, slot = plotW / n;
  const barW = Math.min(slot * 0.62, 50);

  let grid = '', axisY = '', axisX = '', bars = '', peakLine = '';
  ticks.forEach((t) => {
    const y = topPad + plotH - (t / max) * plotH;
    grid  += `<line x1="${leftPad}" y1="${y.toFixed(1)}" x2="${leftPad + plotW}" y2="${y.toFixed(1)}" stroke="#e2e8f0" stroke-width="1" stroke-dasharray="3,3"/>`;
    axisY += `<text x="${leftPad - 8}" y="${(y + 3.5).toFixed(1)}" font-size="12.5" fill="#94a3b8" text-anchor="end" font-family="Inter,sans-serif">${t}</text>`;
  });

  let peakIdx = 0;
  items.forEach((it, i) => { if (it.value > items[peakIdx].value) peakIdx = i; });

  items.forEach((it, i) => {
    const x = leftPad + i * slot + (slot - barW) / 2;
    const h = (it.value / max) * plotH;
    const y = topPad + plotH - h;
    bars += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${Math.max(h,1).toFixed(1)}" rx="6" fill="url(#${idPrefix}-g${i})" filter="url(#${idPrefix}-shadow)"/>`;
    if (showValueLabels) {
      bars += `<text x="${(x + barW / 2).toFixed(1)}" y="${(y - 8).toFixed(1)}" font-size="14" font-weight="800" fill="#0f172a" text-anchor="middle" font-family="Inter,sans-serif">${escapeHtml(it.valueLabel != null ? it.valueLabel : it.value)}</text>`;
    }
    axisX += `<text x="${(x + barW / 2).toFixed(1)}" y="${(topPad + plotH + 20).toFixed(1)}" font-size="12" fill="#94a3b8" text-anchor="middle" font-family="Inter,sans-serif">${escapeHtml(it.label)}</text>`;
  });

  if (peakBadge) {
    const py = topPad + plotH - (items[peakIdx].value / max) * plotH;
    peakLine += `<line x1="${leftPad}" y1="${py.toFixed(1)}" x2="${leftPad + plotW}" y2="${py.toFixed(1)}" stroke="${CONFIG.colorAccent}" stroke-width="1.4" stroke-dasharray="4,3" opacity="0.6"/>`;
    const bw = 160, bh = 28, bx = leftPad, by = Math.max(py - bh - 6, 2);
    peakLine += `<rect x="${bx}" y="${by.toFixed(1)}" width="${bw}" height="${bh}" rx="6" fill="${CONFIG.colorDark}"/>`;
    peakLine += `<text x="${bx + bw / 2}" y="${(by + bh / 2 + 4.5).toFixed(1)}" font-size="13" font-weight="700" fill="#fff" text-anchor="middle" font-family="Inter,sans-serif">${escapeHtml(peakBadge)}</text>`;
  }

  const labels = `${yAxisLabel ? `<text x="${leftPad}" y="14" font-size="13" font-weight="700" fill="#64748b" font-family="Inter,sans-serif">${escapeHtml(yAxisLabel)}</text>` : ''}${xAxisLabel ? `<text x="${(leftPad + plotW / 2).toFixed(1)}" y="${height - 6}" font-size="13" font-weight="700" fill="#64748b" text-anchor="middle" font-family="Inter,sans-serif">${escapeHtml(xAxisLabel)}</text>` : ''}`;
  return `<svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">${barDefs(idPrefix, colors)}${grid}${bars}${axisX}${axisY}${peakLine}${labels}</svg>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// HTML — 5 páginas 1280×720 (16:9)
// ─────────────────────────────────────────────────────────────────────────────
function generateHTML(s) {
  const footer = `<div class="tl-footer">Tracklink Chile Fleet Dashboard · ${CONFIG.footerLabel} · ${s.startDisplay} — ${s.endDisplay}</div>`;

  const top12 = s.unidadesArr.slice(0, 12);
  const unidadChartItems = top12.map((u) => ({ label: u.unitCode || u.alias, value: Math.round(u.min), valueLabel: fmtHoras(u.min) }));
  const unidadChartSvg   = horizontalBarChart(unidadChartItems, { width: 620, height: 400, xAxisLabel: 'Tiempo Total de Ralentí (min)', yAxisLabel: 'Unidad', idPrefix: 'chartUnidad' });

  const tableRows = top12.map((u) => `<tr>
      <td>${escapeHtml(u.alias)}</td>
      <td class="num">${u.count}</td>
      <td class="num">${fmtHoras(u.min)}</td>
      <td class="num">${fmtHoras(u.promedioMin)}</td>
    </tr>`).join('');

  const condN = top12.length || 1;
  let condPadY, condFontSize;
  if (condN <= 8)       { condPadY = 10; condFontSize = 15.5; }
  else if (condN <= 11) { condPadY = 6;  condFontSize = 14;   }
  else                  { condPadY = 4;  condFontSize = 12.5; }

  const top3Names = s.unidadesArr.slice(0, 3).map((u) => u.unitCode || u.alias);
  const top3Text  = top3Names.length >= 2
    ? `${top3Names.slice(0, -1).join(', ')} y ${top3Names[top3Names.length - 1]}`
    : (top3Names[0] || '—');

  const dayChartItems = s.sortedDays.map((d) => ({ label: d.label, value: Math.round(d.minTotal), valueLabel: fmtHoras(d.minTotal) }));
  const dayChartSvg    = verticalBarChart(dayChartItems, { width: 1168, height: 380, peakBadge: `Máximo: ${fmtHoras(s.peakDay.minTotal)}`, xAxisLabel: 'Fecha', yAxisLabel: 'Tiempo Total de Ralentí', idPrefix: 'chartDay' });

  const criticalDayNames = s.sortedDays.filter(d => d.date).slice(0, 2).map((d) => DIAS_ES_FULL[d.date.getDay()]);
  const criticalDayText  = criticalDayNames.length >= 2 ? `${criticalDayNames[0]} y ${criticalDayNames[1]}` : (criticalDayNames[0] || '—');

  const eyebrow = CONFIG.logoUrl
    ? `<img src="${CONFIG.logoUrl}" style="height:70px;width:auto;object-fit:contain;" alt="">`
    : `<div style="font-size:15px;font-weight:800;letter-spacing:.35em;color:#1a202c;">${escapeHtml(CONFIG.siteName)}</div>`;

  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Poppins:wght@600;700;800&display=swap" rel="stylesheet">
<style>
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
  @page{size:${PAGE_W}px ${PAGE_H}px;margin:0;}
  html,body{height:100%;}
  body{font-family:'Inter',system-ui,Arial,sans-serif;background:#fff;color:#1a202c;}
  .page{width:${PAGE_W}px;height:${PAGE_H}px;position:relative;overflow:hidden;page-break-after:always;background:#fff;}
  .page:last-child{page-break-after:avoid;}
  h1,h2,h3,.num-font{font-family:'Poppins',sans-serif;}

  .cover{display:flex;width:100%;height:100%;}
  .cv-left{width:44%;height:100%;background:linear-gradient(150deg,${CONFIG.colorDark} 0%,${CONFIG.colorMid} 45%,${CONFIG.colorDarker} 100%);position:relative;overflow:hidden;display:flex;align-items:center;justify-content:center;}
  .cv-right{width:56%;height:100%;padding:64px 56px;display:flex;flex-direction:column;justify-content:center;gap:20px;}
  .cv-eyebrow{display:flex;align-items:center;justify-content:center;gap:16px;margin-bottom:14px;}
  .cv-title{font-size:46px;font-weight:800;color:#1a202c;line-height:1.15;}
  .cv-sub{font-size:18.5px;font-weight:600;color:#4a5568;}
  .cv-desc{font-size:17px;color:#718096;line-height:1.65;max-width:580px;}

  .pi{padding:46px 64px 40px;height:100%;display:flex;flex-direction:column;}
  .pg-title{font-size:38px;font-weight:800;color:#1a202c;margin-bottom:14px;}
  .pg-intro{font-size:17px;color:#4a5568;line-height:1.6;margin-bottom:18px;max-width:1180px;}
  .pg-intro strong{color:#1a202c;}
  .pf{position:absolute;bottom:16px;left:0;right:0;display:flex;justify-content:center;}
  .tl-footer{font-size:11px;color:#cbd5e0;letter-spacing:.03em;text-align:center;}

  .alert{padding:14px 18px;display:flex;gap:12px;align-items:flex-start;font-size:16px;line-height:1.5;border-radius:8px;}
  .alert span{flex-shrink:0;font-size:16px;margin-top:1px;}
  .alert-yellow{background:#fefce8;border-left:4px solid #eab308;color:#4a5568;}
  .alert-yellow strong{color:#1a202c;}
  .note-box{padding:14px 18px;display:flex;gap:12px;align-items:flex-start;font-size:15.5px;line-height:1.5;border-radius:8px;background:#eef2f7;color:#4a5568;}
  .note-box strong{color:#1a202c;}

  .kpi-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:18px;}
  .kpi{border:1px solid #e2e8f0;border-radius:10px;padding:18px 24px;text-align:center;}
  .kpi-val{font-size:50px;font-weight:800;color:#2d3748;line-height:1;margin-bottom:6px;}
  .kpi-lbl{font-size:17px;font-weight:700;color:#374151;margin-bottom:5px;}
  .kpi-desc{font-size:14px;color:#94a3b8;}

  .p3-row{display:flex;gap:32px;flex:1;min-height:0;align-items:stretch;}
  .p3-chart{flex:1 1 56%;}
  .p3-table-wrap{flex:1 1 44%;display:flex;flex-direction:column;min-height:0;}
  .cond-table-scroll{flex:1 1 auto;min-height:0;overflow:hidden;}
  table.cond-table{width:100%;border-collapse:collapse;font-size:${condFontSize}px;}
  .cond-table thead th{font-size:13px;font-weight:700;color:#fff;background:#374151;text-align:left;padding:11px 10px;}
  .cond-table td{padding:${condPadY}px 10px;border-bottom:1px solid #edf2f7;color:#334155;}
  .cond-table td.num{font-weight:600;text-align:right;}
  .p3-note{font-size:15px;color:#718096;line-height:1.6;margin-top:14px;flex-shrink:0;}

  .p4-chart-wrap{flex:1;display:flex;align-items:center;}

  .p5-row{display:flex;gap:32px;flex:1;min-height:0;}
  .p5-chart-col{flex:1 1 48%;display:flex;flex-direction:column;}
  .p5-chart-title{font-size:16px;font-weight:700;color:#374151;margin-bottom:8px;}
  .p5-actions-col{flex:1 1 52%;}
  .concl-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;}
  .concl-card{border-left:4px solid #2d3748;background:#f8fafc;border-radius:0 8px 8px 0;padding:14px 16px;}
  .concl-card h4{font-size:16px;font-weight:700;color:#2d3748;margin-bottom:6px;}
  .concl-card p{font-size:13.5px;color:#718096;line-height:1.5;}
</style>
</head><body>

<!-- PÁGINA 1 — PORTADA -->
<div class="page cover">
  <div class="cv-left">
    <svg width="360" height="230" viewBox="0 0 360 230" fill="none">
      <circle cx="180" cy="115" r="90" fill="#fff" opacity=".08"/>
      <circle cx="180" cy="115" r="62" fill="none" stroke="#fff" stroke-width="3" opacity=".35"/>
      <path d="M180 70 L180 115 L210 135" stroke="#fff" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" opacity=".85"/>
      <circle cx="180" cy="115" r="6" fill="#fbbf24"/>
    </svg>
  </div>
  <div class="cv-right">
    <div class="cv-eyebrow">${eyebrow}</div>
    <h1 class="cv-title">Informe de Ralentí Excesivo</h1>
    <p class="cv-sub">${CONFIG.siteName} · Período: ${s.rangeVerbose}</p>
    <p class="cv-desc">Durante la semana analizada se registraron <strong>${s.totalEventos} eventos de ralentí</strong>, acumulando un total de <strong>${fmtHoras(s.totalMin)}</strong> de motor encendido sin desplazamiento. Este reporte identifica las unidades con mayor tiempo de ralentí, con el objetivo de apoyar la eficiencia operacional y el ahorro de combustible.</p>
  </div>
</div>

<!-- PÁGINA 2 — RESUMEN EJECUTIVO -->
<div class="page"><div class="pi">
  <h2 class="pg-title">Resumen Ejecutivo</h2>
  <p class="pg-intro">Los indicadores del período permiten focalizar el control sobre las unidades con mayor tiempo de ralentí acumulado.</p>
  <div class="kpi-grid">
    <div class="kpi"><div class="kpi-val">${s.totalEventos}</div><div class="kpi-lbl">Eventos de Ralentí</div><div class="kpi-desc">Total registrado en el período</div></div>
    <div class="kpi"><div class="kpi-val">${fmtHoras(s.totalMin)}</div><div class="kpi-lbl">Tiempo Total</div><div class="kpi-desc">Acumulado de motor encendido sin desplazamiento</div></div>
    <div class="kpi"><div class="kpi-val">${fmtHoras(s.promedioMin)}</div><div class="kpi-lbl">Duración Promedio</div><div class="kpi-desc">Por evento de ralentí</div></div>
    <div class="kpi"><div class="kpi-val">${fmtPct(s.unidadesArr[0]?.pct || 0)}%</div><div class="kpi-lbl">Unidad Crítica</div><div class="kpi-desc">${s.unidadesArr[0]?.alias || '—'} concentra ${s.unidadesArr[0] ? fmtHoras(s.unidadesArr[0].min) : '—'}</div></div>
  </div>
  <div class="alert alert-yellow"><span class="icon-warn"><svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M12 3L22 20H2L12 3Z" stroke="#eab308" stroke-width="2" stroke-linejoin="round" fill="#fef9c3"/><path d="M12 10v4M12 17h.01" stroke="#a16207" stroke-width="2" stroke-linecap="round"/></svg></span><div>El ${DIAS_ES_FULL[s.peakDay.date ? s.peakDay.date.getDay() : 0]} ${s.peakDay.label.split(' ')[1] || ''} concentró el mayor tiempo de ralentí del período (<strong>${fmtHoras(s.peakDay.minTotal)}</strong>).</div></div>
  <div class="pf">${footer}</div>
</div></div>

<!-- PÁGINA 3 — RANKING POR UNIDAD -->
<div class="page"><div class="pi">
  <h2 class="pg-title">Ranking por Unidad</h2>
  <p class="pg-intro">Las tres unidades con mayor tiempo de ralentí acumulan el <strong>${fmtPct(s.top3Pct)}% del total</strong>, lo que indica la necesidad de intervención focalizada. Lidera ${top3Text}.</p>
  <div class="p3-row">
    <div class="p3-chart">${unidadChartSvg}</div>
    <div class="p3-table-wrap">
      <div class="cond-table-scroll"><table class="cond-table"><thead><tr><th>Unidad</th><th style="text-align:right;">Eventos</th><th style="text-align:right;">Tiempo Total</th><th style="text-align:right;">Promedio</th></tr></thead><tbody>${tableRows}</tbody></table></div>
      <p class="p3-note">"Promedio" es la duración promedio por evento de ralentí de esa unidad.</p>
    </div>
  </div>
  <div class="pf">${footer}</div>
</div></div>

<!-- PÁGINA 4 — CONCENTRACIÓN POR DÍA -->
<div class="page"><div class="pi">
  <h2 class="pg-title">Concentración por Día</h2>
  <p class="pg-intro">Distribución del tiempo total de ralentí por día del período. El día más crítico concentra ${fmtHoras(s.peakDay.minTotal)}.</p>
  <div class="p4-chart-wrap">${dayChartSvg}</div>
  <div class="note-box"><span class="icon-info"><svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="#64748b" stroke-width="2" fill="#e2e8f0"/><path d="M12 11v5M12 8h.01" stroke="#475569" stroke-width="2" stroke-linecap="round"/></svg></span><div>Se recomienda reforzar la política de apagado de motor en tiempos de espera prolongados, especialmente en los días de mayor concentración.</div></div>
  <div class="pf">${footer}</div>
</div></div>

<!-- PÁGINA 5 — CONCLUSIONES -->
<div class="page"><div class="pi">
  <h2 class="pg-title">Conclusiones y Recomendaciones</h2>
  <div class="p5-row">
    <div class="p5-actions-col" style="flex:1 1 100%;">
      <div class="concl-grid">
        <div class="concl-card"><h4>Intervención Focalizada</h4><p>Priorizar a las unidades ${top3Text} en la revisión de tiempos de ralentí; juntas concentran el ${fmtPct(s.top3Pct)}% del total.</p></div>
        <div class="concl-card"><h4>Día Crítico</h4><p>Reforzar la supervisión el día ${criticalDayText}, cuando se concentra la mayor cantidad de tiempo de ralentí.</p></div>
        <div class="concl-card"><h4>Revisión de Unidad ${s.unidadesArr[0]?.unitCode || '—'}</h4><p>Verificar el motivo operacional del ralentí prolongado de esta unidad, dado que concentra el mayor tiempo acumulado del período.</p></div>
        <div class="concl-card"><h4>Ahorro de Combustible</h4><p>Reducir el ralentí excesivo disminuye el consumo de combustible y el desgaste del motor — establecer alertas para eventos que superen umbrales definidos por la supervisión.</p></div>
      </div>
    </div>
  </div>
  <div class="pf">${footer}</div>
</div></div>

</body></html>`;
}

module.exports = { parseAndFilter, computeStats, generateHTML, PAGE_W, PAGE_H, CONFIG };
if (require.main === module) {
  main().catch((err) => { console.error('[pdf-ralenti] ERROR FATAL:', err.stack || err.message); process.exit(1); });
}
