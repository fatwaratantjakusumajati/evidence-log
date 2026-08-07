const express = require("express");
const router = express.Router();
const pool = require("../db");
const ExcelJS = require("exceljs");
const { ChartJSNodeCanvas } = require("chartjs-node-canvas");
const puppeteer = require("puppeteer");
const fs = require("fs");
const path = require("path");
const logger = require("../utils/logger");
const { getHours } = require("date-fns/getHours");

logger.info("✅ Export API loaded (EXCEL 3 SHEETS + PDF PREMIUM)");

// ============================================================
// CARI LOGO
// ============================================================
const possiblePaths = [
  path.join(process.cwd(), "assets", "aristides-logo.png"),
  path.join(process.cwd(), "assets", "aristides-logo.jpg"),
  path.join(process.cwd(), "assets", "aristides-logo.jpeg"),
  path.join(process.cwd(), "assets", "aristides-logo.webp"),
  path.join(process.cwd(), "assets", "logo.png"),
  path.join(process.cwd(), "assets", "logo.jpg"),
];

let logoPathFound = null;
for (const p of possiblePaths) {
  if (fs.existsSync(p)) {
    logoPathFound = p;
    break;
  }
}

let logoBase64 = "";
if (logoPathFound) {
  try {
    const logoBuffer = fs.readFileSync(logoPathFound);
    logoBase64 =
      "data:image/" +
      path.extname(logoPathFound).replace(".", "") +
      ";base64," +
      logoBuffer.toString("base64");
  } catch (err) {
    logger.error("Error loading logo:", err);
  }
}

// ============================================================
// CONSTANTS
// ============================================================
const A4_WIDTH_PX = 794;
const A4_HEIGHT_PX = 1123;
const DEFAULT_TOTAL_CAMERAS = 22;

// ============================================================
// HELPER: Format Date (Excel)
// ============================================================
function toExcelDate(date) {
  if (!date) return "";
  return new Date(date);
}

// ============================================================
// HELPER: Buffer bytea -> base64 string (foto_base64 dari Postgres
// datang sebagai Node Buffer, sama seperti di alerts.js)
// ============================================================
function convertFotoBase64(row) {
  if (row && row.foto_base64) {
    row.foto_base64 = Buffer.isBuffer(row.foto_base64)
      ? row.foto_base64.toString("base64")
      : row.foto_base64;
  }
  return row;
}

// ============================================================
// HELPER: Format durasi detik -> "X hari Y jam" (sama seperti
// formatDurationFromSeconds di frontend, biar konsisten)
// ============================================================
function formatDurationSeconds(totalSeconds) {
  const detik = typeof totalSeconds === "string" ? parseInt(totalSeconds, 10) : totalSeconds || 0;
  const days = Math.floor(detik / 86400);
  const hours = Math.floor((detik % 86400) / 3600);
  const minutes = Math.floor((detik % 3600) / 60);
  if (days > 0) return `${days} hari ${hours} jam`;
  if (hours > 0) return `${hours} jam ${minutes} menit`;
  return `${minutes} menit`;
}

// Batas jumlah foto yang dirender di grid PDF supaya ukuran file & waktu
// render puppeteer tetap wajar untuk laporan dengan rentang panjang
// (mingguan/bulanan/full histori). Sisanya tetap terhitung di KPI & Excel.
const STAGING_CARD_LIMIT = 30;

// ============================================================
// PALET WARNA (Excel)
// ============================================================
const THEME = {
  primary: "FF312E81",
  bgHeader: "FF4F46E5",
  bgZebra: "FDF8FAFC",
  textDark: "FF1E293B",
  textMuted: "FF64748B",
  borderLight: "FFE2E8F0",
  kpiBg: "FFF8FAFC",
  alertBg: "FFFEE2E2",
  alertText: "FF991B1B",
  totalBg: "FF1E1B4B",
  totalText: "FFFFFFFF",
};
const BORDERS = { thin: { style: "thin", color: { argb: THEME.borderLight } } };
const CHART_COLORS = ["#4F46E5", "#22C55E", "#F59E0B", "#EF4444", "#06B6D4", "#A855F7", "#F97316"];

// ============================================================
// CHART RENDERER (Excel)
// ============================================================
const DPR = 2;
const VEHICLE_CHART_DISPLAY = { width: 460, height: 260 };
const CAMERA_CHART_DISPLAY = { width: 320, height: 260 };

const vehicleChartCanvas = new ChartJSNodeCanvas({
  width: VEHICLE_CHART_DISPLAY.width * DPR,
  height: VEHICLE_CHART_DISPLAY.height * DPR,
  backgroundColour: "white",
});
const cameraChartCanvas = new ChartJSNodeCanvas({
  width: CAMERA_CHART_DISPLAY.width * DPR,
  height: CAMERA_CHART_DISPLAY.height * DPR,
  backgroundColour: "white",
});

async function renderChartBuffer(canvas, config) {
  try {
    return await canvas.renderToBuffer(config);
  } catch (err) {
    logger.error("Chart render error:", err.message);
    return null;
  }
}

function buildVehicleChartConfig(vStatsRows) {
  const hasData = vStatsRows.length > 0;
  return {
    type: "bar",
    data: {
      labels: hasData
        ? vStatsRows.map((r) => (r.jenis_kendaraan || "LAINNYA").toUpperCase())
        : ["Tidak ada data"],
      datasets: [
        {
          label: "Jumlah Kendaraan",
          data: hasData ? vStatsRows.map((r) => Number(r.total)) : [0],
          backgroundColor: hasData
            ? vStatsRows.map((_, i) => CHART_COLORS[i % CHART_COLORS.length])
            : ["#CBD5E1"],
          borderRadius: 6,
          maxBarThickness: 60,
        },
      ],
    },
    options: {
      devicePixelRatio: DPR,
      layout: { padding: { top: 8, right: 16, bottom: 4, left: 4 } },
      plugins: {
        legend: { display: false },
        title: {
          display: true,
          text: "Distribusi Jenis Kendaraan",
          font: { size: 16, weight: "bold" },
          color: "#1E293B",
          padding: { bottom: 12 },
        },
      },
      scales: {
        y: { beginAtZero: true, ticks: { precision: 0 }, grid: { color: "#E2E8F0" } },
        x: { grid: { display: false } },
      },
    },
  };
}

function buildCameraChartConfig(totalOnline, totalCameraOff) {
  return {
    type: "doughnut",
    data: {
      labels: ["Kamera Online", "Kamera Offline"],
      datasets: [
        {
          data: [totalOnline, totalCameraOff],
          backgroundColor: ["#22C55E", "#EF4444"],
          borderColor: "#FFFFFF",
          borderWidth: 2,
        },
      ],
    },
    options: {
      devicePixelRatio: DPR,
      layout: { padding: { top: 8, bottom: 4 } },
      cutout: "62%",
      plugins: {
        legend: { position: "bottom", labels: { boxWidth: 14, padding: 14, font: { size: 11 } } },
        title: {
          display: true,
          text: "Status Jaringan CCTV",
          font: { size: 16, weight: "bold" },
          color: "#1E293B",
          padding: { bottom: 12 },
        },
      },
    },
  };
}

// ============================================================
// EXCEL: formatPremiumLogSheet
// ============================================================
function formatPremiumLogSheet(ws, title, headers, dataRows, columnSpecs, summary) {
  ws.views = [{ showGridLines: true }];

  ws.mergeCells("A2:C2");
  const wsTitle = ws.getCell("A2");
  wsTitle.value = title;
  wsTitle.font = { name: "Segoe UI", size: 16, bold: true, color: { argb: THEME.primary } };
  ws.getRow(2).height = 25;

  ws.getCell("A3").value = `Total Record: ${dataRows.length} baris data terformat.`;
  ws.getCell("A3").font = {
    name: "Segoe UI",
    size: 9,
    italic: true,
    color: { argb: THEME.textMuted },
  };
  ws.getRow(3).height = 18;

  const startRowIdx = 5;
  const headerRow = ws.getRow(startRowIdx);
  headerRow.values = headers;
  headerRow.height = 28;

  headerRow.eachCell((cell) => {
    cell.font = { name: "Segoe UI", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: THEME.bgHeader } };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = {
      top: BORDERS.thin,
      bottom: { style: "medium", color: { argb: "FF22C55E" } },
      left: BORDERS.thin,
      right: BORDERS.thin,
    };
  });

  dataRows.forEach((rowValues, i) => {
    const rNum = i + startRowIdx + 1;
    const row = ws.getRow(rNum);
    row.values = rowValues;
    row.height = 22;

    const isEven = i % 2 === 0;
    row.eachCell((cell, colNumber) => {
      cell.font = { name: "Segoe UI", size: 10, color: { argb: THEME.textDark } };
      cell.border = {
        top: BORDERS.thin,
        bottom: BORDERS.thin,
        left: BORDERS.thin,
        right: BORDERS.thin,
      };

      if (isEven)
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: THEME.bgZebra } };

      const spec = columnSpecs[colNumber - 1];
      if (spec) {
        cell.alignment = { horizontal: spec.align || "left", vertical: "middle" };
        if (spec.numFormat) cell.numFormat = spec.numFormat;

        if (spec.isStatus && cell.value) {
          const valLower = cell.value.toString().toLowerCase();
          if (valLower.includes("offline") || valLower.includes("high")) {
            cell.font = { name: "Segoe UI", size: 10, bold: true, color: { argb: "FFB91C1C" } };
          } else if (
            valLower.includes("normal") ||
            valLower.includes("empty") ||
            valLower.includes("in")
          ) {
            cell.font = { name: "Segoe UI", size: 10, color: { argb: "FF047857" } };
          }
        }
      }
    });
  });

  const lastDataRow = startRowIdx + dataRows.length;

  if (dataRows.length > 0) {
    ws.autoFilter = {
      from: { row: startRowIdx, column: 1 },
      to: { row: lastDataRow, column: headers.length },
    };
  }
  ws.views = [{ state: "frozen", ySplit: startRowIdx, showGridLines: true }];

  if (summary && summary.rows && summary.rows.length) {
    let r = lastDataRow + 2;

    ws.mergeCells(r, 1, r, headers.length);
    const summaryTitleCell = ws.getCell(r, 1);
    summaryTitleCell.value = summary.title || "JUMLAH ALOKASI";
    summaryTitleCell.font = {
      name: "Segoe UI",
      size: 12,
      bold: true,
      color: { argb: THEME.primary },
    };
    ws.getRow(r).height = 22;
    r++;

    summary.rows.forEach(([label, value]) => {
      const labelCell = ws.getCell(r, 1);
      ws.mergeCells(r, 1, r, headers.length - 1);
      labelCell.value = label;
      labelCell.font = { name: "Segoe UI", size: 10, bold: true, color: { argb: THEME.totalText } };
      labelCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: THEME.totalBg } };
      labelCell.alignment = { horizontal: "left", vertical: "middle", indent: 1 };
      labelCell.border = {
        top: BORDERS.thin,
        bottom: BORDERS.thin,
        left: BORDERS.thin,
        right: BORDERS.thin,
      };

      const valueCell = ws.getCell(r, headers.length);
      valueCell.value = value;
      valueCell.font = { name: "Segoe UI", size: 11, bold: true, color: { argb: THEME.totalText } };
      valueCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: THEME.totalBg } };
      valueCell.alignment = { horizontal: "center", vertical: "middle" };
      valueCell.border = {
        top: BORDERS.thin,
        bottom: BORDERS.thin,
        left: BORDERS.thin,
        right: BORDERS.thin,
      };

      ws.getRow(r).height = 20;
      r++;
    });
  }

  ws.columns.forEach((column, idx) => {
    let maxLen = headers[idx] ? headers[idx].toString().length : 10;
    column.eachCell({ includeEmpty: false }, (cell) => {
      if (cell.row >= startRowIdx) {
        let valStr = cell.value instanceof Date ? "2026-00-00 00:00:00" : cell.value?.toString();
        if (valStr && valStr.length > maxLen) maxLen = valStr.length;
      }
    });
    column.width = Math.min(Math.max(maxLen + 4, 12), 35);
  });
}

// ============================================================
// EXCEL: buildDashboard
// ============================================================
function buildDashboard(
  workbook,
  ws,
  titleText,
  subtitleText,
  totalKendaraan,
  totalStaging,
  totalCameraOff,
  vehicleChartBuf,
  cameraChartBuf,
) {
  const totalOnline = DEFAULT_TOTAL_CAMERAS - totalCameraOff;

  ws.mergeCells("B1:J1");
  ws.getCell("B1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: THEME.primary } };
  ws.getRow(1).height = 4;

  ws.mergeCells("B3:F3");
  const titleCell = ws.getCell("B3");
  titleCell.value = titleText;
  titleCell.font = { name: "Segoe UI", size: 18, bold: true, color: { argb: THEME.textDark } };

  ws.mergeCells("B4:G4");
  const subtitleCell = ws.getCell("B4");
  subtitleCell.value = subtitleText;
  subtitleCell.font = { name: "Segoe UI", size: 10, color: { argb: THEME.textMuted } };
  ws.getRow(3).height = 26;

  const kpis = [
    {
      label: "TOTAL KENDARAAN",
      val: totalKendaraan,
      desc: "Aktivitas log armada",
      colStart: 2,
      colEnd: 3,
    },
    {
      label: "STAGING TERDETEKSI",
      val: totalStaging,
      desc: "Total muatan Box",
      colStart: 4,
      colEnd: 5,
    },
    {
      label: "KAMERA OFFLINE",
      val: totalCameraOff,
      desc: "Butuh pengecekan",
      colStart: 6,
      colEnd: 7,
      isAlert: totalCameraOff > 0,
    },
    {
      label: "KAMERA ONLINE",
      val: `${totalOnline}/${DEFAULT_TOTAL_CAMERAS}`,
      desc: "Jaringan CCTV aktif",
      colStart: 8,
      colEnd: 9,
    },
  ];

  kpis.forEach((kpi) => {
    const start = kpi.colStart;
    const end = kpi.colEnd;
    for (let r = 6; r <= 8; r++) {
      for (let c = start; c <= end; c++) {
        const cell = ws.getCell(r, c);
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: kpi.isAlert ? THEME.alertBg : THEME.kpiBg },
        };
        cell.border = {
          top: r === 6 ? BORDERS.thin : null,
          bottom: r === 8 ? BORDERS.thin : null,
          left: c === start ? BORDERS.thin : null,
          right: c === end ? BORDERS.thin : null,
        };
      }
    }
    ws.getCell(6, start).value = kpi.label;
    ws.getCell(6, start).font = {
      name: "Segoe UI",
      size: 9,
      bold: true,
      color: { argb: kpi.isAlert ? THEME.alertText : THEME.textMuted },
    };
    ws.getCell(6, start).alignment = { horizontal: "center", vertical: "bottom" };

    ws.getCell(7, start).value = kpi.val;
    ws.getCell(7, start).font = {
      name: "Segoe UI",
      size: 18,
      bold: true,
      color: { argb: kpi.isAlert ? THEME.alertText : THEME.primary },
    };
    ws.getCell(7, start).alignment = { horizontal: "center", vertical: "middle" };

    ws.getCell(8, start).value = kpi.desc;
    ws.getCell(8, start).font = {
      name: "Segoe UI",
      size: 8,
      italic: true,
      color: { argb: kpi.isAlert ? THEME.alertText : "FF94A3B8" },
    };
    ws.getCell(8, start).alignment = { horizontal: "center", vertical: "top" };
  });

  ws.getRow(6).height = 18;
  ws.getRow(7).height = 28;
  ws.getRow(8).height = 16;
  ws.getColumn("A").width = 3;
  ws.getColumn("B").width = 17;
  ws.getColumn("C").width = 17;
  ws.getColumn("D").width = 17;
  ws.getColumn("E").width = 17;
  ws.getColumn("F").width = 4;
  ws.getColumn("G").width = 17;
  ws.getColumn("H").width = 17;
  ws.getColumn("I").width = 17;
  ws.getColumn("J").width = 17;

  ws.getCell("B10").value = "📊 Visualisasi Data";
  ws.getCell("B10").font = {
    name: "Segoe UI",
    size: 12,
    bold: true,
    color: { argb: THEME.textDark },
  };
  ws.getRow(10).height = 20;

  if (vehicleChartBuf) {
    const imgId = workbook.addImage({ buffer: vehicleChartBuf, extension: "png" });
    ws.addImage(imgId, { tl: { col: 1, row: 10.5 }, ext: { width: 460, height: 260 } });
  }
  if (cameraChartBuf) {
    const imgId2 = workbook.addImage({ buffer: cameraChartBuf, extension: "png" });
    ws.addImage(imgId2, { tl: { col: 6.9, row: 10.5 }, ext: { width: 320, height: 260 } });
  }
  for (let r = 11; r <= 28; r++) ws.getRow(r).height = 15;
}

// ============================================================
// PDF HELPERS
// ============================================================
function hitungPelanggaran(attendanceData) {
  let pelanggaran = 0;
  attendanceData.forEach((a) => {
    const waktu = new Date(a.timestamp);
    const totalMenit = waktu.getHours() * 60 + waktu.getMinutes();
    if (a.event_type === "ARRIVAL" && totalMenit > 7 * 60) pelanggaran++;
    if (a.event_type === "DEPARTURE" && totalMenit < 16 * 60) pelanggaran++;
  });
  return pelanggaran;
}

function generateDonutChart(total, offline) {
  const online = total - offline;
  const r = 38,
    circ = 2 * Math.PI * r;
  const color = offline > 0 ? "#f59e0b" : "#10b981";
  if (total === 0)
    return '<div style="text-align:center;padding:30px;color:#94a3b8;font-size:12px;">📡 No data</div>';
  return `<div style="display:flex;align-items:center;gap:16px;padding:8px 0;">
    <svg width="110" height="100" viewBox="0 0 110 100">
      <circle cx="55" cy="45" r="${r}" fill="none" stroke="#f1f5f9" stroke-width="10"/>
      <circle cx="55" cy="45" r="${r}" fill="none" stroke="${color}" stroke-width="10" stroke-dasharray="${circ}" stroke-dashoffset="${circ - (total > 0 ? online / total : 0) * circ}" transform="rotate(-90 55 45)" stroke-linecap="round"/>
      <text x="55" y="42" text-anchor="middle" font-size="20" font-weight="bold" fill="#1e293b">${total}</text>
      <text x="55" y="58" text-anchor="middle" font-size="9" fill="#64748b">CAMERAS</text>
    </svg>
    <div style="display:flex;flex-direction:column;gap:10px;font-size:11px;">
      <div><span style="width:10px;height:10px;border-radius:50%;background:#10b981;display:inline-block;"></span> Online: <strong>${online}</strong></div>
      <div><span style="width:10px;height:10px;border-radius:50%;background:#ef4444;display:inline-block;"></span> Offline: <strong>${offline}</strong></div>
    </div></div>`;
}

async function renderPdf(html) {
  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: A4_WIDTH_PX, height: A4_HEIGHT_PX, deviceScaleFactor: 1 });
    await page.setContent(html, { waitUntil: "domcontentloaded", timeout: 0 });
    await new Promise((resolve) => setTimeout(resolve, 800));
    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "0", bottom: "0", left: "0", right: "0" },
    });
    return pdfBuffer;
  } finally {
    await browser.close();
  }
}

function buildMainHTML(data) {
  const {
    title,
    subtitle,
    logo,
    kpiCards,
    chartsRow,
    cameraSection,
    attendanceSection,
    vehicleSection,
    stagingSection,
  } = data;

  const buildPage = (pageNum, pageTitle, badgeLabel, content) => {
    const tabs = [
      { num: 1, label: "📊 Dashboard" },
      { num: 2, label: "📡 Camera" },
      { num: 3, label: "👥 Attendance" },
      { num: 4, label: "🚛 Vehicle" },
      { num: 5, label: "📦 Staging" },
    ];

    const navTabs = tabs
      .map(
        (t) =>
          `<a href="#pg${t.num}" class="navtab${t.num === pageNum ? " active" : ""}">${t.label}</a>`,
      )
      .join("");

    const prevPage = pageNum > 1 ? pageNum - 1 : 1;
    const nextPage = pageNum < 5 ? pageNum + 1 : 5;

    return `
    <div class="page" id="pg${pageNum}">
      <div class="main-header">
        <div class="header-logo">${logo ? `<img src="${logo}" alt="Logo" />` : '<span style="color:#fff;font-weight:bold;font-size:20px;">A</span>'}</div>
        <div class="header-info"><div class="company">PT Aristides Logistik Indonesia</div><h1>${pageTitle}</h1><div class="period">${pageNum === 1 ? subtitle : ""}</div></div>
        <div class="header-badge">${badgeLabel}</div>
      </div>
      <div class="navtabs">${navTabs}</div>
      ${content}
      <div class="nav-btns">
        <a href="#pg${prevPage}" class="nav-btn2">← Back</a>
        <span class="page-ind">Page ${pageNum} of 5</span>
        <a href="#pg${nextPage}" class="nav-btn">Next →</a>
      </div>
      <div class="footer">🛡️ PT Aristides Logistik Indonesia · Confidential</div>
    </div>`;
  };

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8" /><style>
*{box-sizing:border-box;margin:0;padding:0;}
html,body{margin:0;padding:0;background:#f5f6fa;}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#1a1a2e;width:${A4_WIDTH_PX}px;}
.app{width:100%;min-height:${A4_HEIGHT_PX}px;background:#f5f6fa;}
.page{padding:24px 28px 20px 28px;page-break-after:always;background:#f5f6fa;}
.page:last-child{page-break-after:avoid;}
.main-header{background:linear-gradient(135deg,#eef2ff 0%,#e0e7ff 50%,#f5f3ff 100%);border-radius:16px;padding:22px 28px;margin-bottom:22px;display:flex;align-items:center;gap:18px;box-shadow:0 2px 12px rgba(99,102,241,.1);border:1px solid #e0e7ff;}
.header-logo{width:52px;height:52px;background:#fff;border-radius:14px;display:flex;align-items:center;justify-content:center;overflow:hidden;flex-shrink:0;box-shadow:0 2px 8px rgba(0,0,0,.06);}
.header-logo img{width:80%;height:80%;object-fit:contain;}
.header-info{flex:1;}
.header-info .company{font-size:11px;font-weight:600;color:#6366f1;letter-spacing:.5px;text-transform:uppercase;}
.header-info h1{font-size:22px;font-weight:800;margin:3px 0;letter-spacing:-.3px;color:#1e293b;}
.header-info .period{font-size:10px;color:#64748b;}
.header-badge{background:#6366f1;color:#fff;padding:8px 14px;border-radius:10px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;flex-shrink:0;}
.navtabs{display:flex;background:#fff;border-radius:12px;padding:4px;margin-bottom:20px;gap:2px;box-shadow:0 2px 8px rgba(0,0,0,.04);}
.navtab{flex:1;text-align:center;color:#64748b;text-decoration:none;padding:10px 8px;font-size:10px;font-weight:600;white-space:nowrap;border-radius:10px;transition:all .2s;}
.navtab:hover{background:#f1f5f9;color:#1e293b;}
.navtab.active{background:#6366f1;color:#fff;}
.kpi-row{display:grid;grid-template-columns:repeat(5,1fr);gap:12px;margin-bottom:20px;}
.kpi-card{background:#fff;border-radius:14px;padding:20px 14px;box-shadow:0 2px 8px rgba(0,0,0,.03);text-align:center;position:relative;overflow:hidden;}
.kpi-card::before{content:'';position:absolute;top:0;left:0;right:0;height:4px;}
.kpi-card.c1::before{background:linear-gradient(90deg,#6366f1,#818cf8);}
.kpi-card.c2::before{background:linear-gradient(90deg,#10b981,#34d399);}
.kpi-card.c3::before{background:linear-gradient(90deg,#ef4444,#f87171);}
.kpi-card.c4::before{background:linear-gradient(90deg,#8b5cf6,#a78bfa);}
.kpi-card.c5::before{background:linear-gradient(90deg,#f59e0b,#fbbf24);}
.kpi-val{font-size:28px;font-weight:800;color:#1a1a2e;letter-spacing:-.5px;}
.kpi-lbl{font-size:10px;color:#64748b;font-weight:600;margin-top:3px;}
.kpi-sub{font-size:9px;color:#94a3b8;margin-top:2px;}
.chart-row{display:grid;grid-template-columns:repeat(2,1fr);gap:12px;margin-bottom:20px;}
.card{background:#fff;border-radius:14px;padding:18px;box-shadow:0 2px 8px rgba(0,0,0,.03);}
.card-hd{font-size:13px;font-weight:700;color:#1a1a2e;margin-bottom:12px;padding-bottom:10px;border-bottom:1px solid #f1f5f9;display:flex;align-items:center;gap:8px;}
.sec-hd{display:flex;align-items:center;gap:10px;margin-bottom:12px;margin-top:6px;}
.sec-icon{width:34px;height:34px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:16px;}
.sec-title{font-size:15px;font-weight:700;color:#1a1a2e;}
.tbl-wrap{background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.03);}
table{width:100%;border-collapse:collapse;font-size:10px;}
thead th{background:#f8fafc;padding:10px 12px;text-align:left;font-weight:700;color:#475569;font-size:9px;text-transform:uppercase;letter-spacing:.5px;border-bottom:2px solid #e2e8f0;}
tbody td{padding:9px 12px;border-bottom:1px solid #f1f5f9;color:#334155;font-weight:500;}
tbody tr:nth-child(even) td{background:#fafcfd;}
.badge{display:inline-block;padding:3px 8px;border-radius:10px;font-size:8px;font-weight:700;text-transform:uppercase;letter-spacing:.3px;}
.badge-g{background:#dcfce7;color:#166534;}
.badge-y{background:#fef9c3;color:#854d0e;}
.badge-r{background:#fee2e2;color:#991b1b;}
.badge-b{background:#dbeafe;color:#1e40af;}
.empty{text-align:center;padding:32px;background:#fff;border-radius:12px;color:#94a3b8;font-size:11px;font-weight:500;}
.staging-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;}
.staging-card{background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.05);border:1px solid #f1f5f9;position:relative;break-inside:avoid;}
.staging-img{width:100%;height:110px;background:#f1f5f9;overflow:hidden;}
.staging-img img{width:100%;height:100%;object-fit:cover;}
.staging-level{position:absolute;top:8px;left:8px;padding:3px 8px;border-radius:8px;font-size:8px;font-weight:800;letter-spacing:.4px;text-transform:uppercase;color:#fff;background:rgba(0,0,0,.55);backdrop-filter:blur(2px);}
.staging-info{padding:10px 12px 12px;}
.staging-cls{font-size:11px;font-weight:700;color:#1a1a2e;margin-bottom:4px;}
.staging-row{font-size:8.5px;color:#64748b;line-height:1.6;}
.staging-row b{color:#334155;font-weight:700;}
.staging-dur{display:inline-flex;align-items:center;gap:4px;margin-top:6px;padding:3px 8px;border-radius:20px;font-size:8.5px;font-weight:700;background:#fee2e2;color:#991b1b;}
.staging-note{text-align:center;padding:12px;font-size:9.5px;color:#94a3b8;font-weight:600;}
.nav-btns{display:flex;justify-content:space-between;align-items:center;margin-top:18px;padding-top:14px;border-top:1px solid #e2e8f0;}
.nav-btn{display:inline-flex;align-items:center;gap:5px;padding:8px 16px;background:#6366f1;color:#fff;text-decoration:none;border-radius:10px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.3px;}
.nav-btn2{display:inline-flex;align-items:center;gap:5px;padding:8px 16px;background:#f1f5f9;color:#475569;text-decoration:none;border-radius:10px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.3px;}
.page-ind{font-size:10px;color:#94a3b8;font-weight:600;}
.footer{text-align:center;padding:8px 0;font-size:8px;color:#94a3b8;font-weight:600;}
@page{size:A4;margin:0;}
</style></head><body><div class="app">
  ${buildPage(1, title, "📋 REPORT", (kpiCards || "") + (chartsRow || ""))}
  ${buildPage(2, "Camera Status", "📡 CAMERA", cameraSection || '<div class="empty">✅ All cameras normal</div>')}
  ${buildPage(3, "Attendance Log", "👥 ATTENDANCE", attendanceSection || '<div class="empty">📋 No attendance records</div>')}
  ${buildPage(4, "Vehicle Log", "🚛 VEHICLE", vehicleSection || '<div class="empty">🚛 No vehicle records</div>')}
  ${buildPage(5, "Staging Detection", "📦 STAGING", stagingSection || '<div class="empty">📦 No staging records</div>')}
</div></body></html>`;
}

// ============================================================
// REUSABLE GENERATOR ENGINE (SUPPORT EXCEL & PDF)
// ============================================================
async function generateReportEngine(
  res,
  scopeTitle,
  subtitleInfo,
  conditions,
  params,
  filename,
  format = "xlsx",
) {
  let client;
  try {
    client = await pool.connect();

    const vWhere = conditions.length
      ? `WHERE ${conditions.map((c) => c.replace(/col/g, "timestamp")).join(" AND ")}`
      : "";
    const sWhere = conditions.length
      ? `WHERE LOWER(class_name) = 'box' AND ${conditions.map((c) => c.replace(/col/g, "created_at")).join(" AND ")}`
      : "WHERE LOWER(class_name) = 'box'";
    const cWhere = conditions.length
      ? `WHERE class_name = 'KAMERA OFFLINE' AND ${conditions.map((c) => c.replace(/col/g, "created_at")).join(" AND ")}`
      : "WHERE class_name = 'KAMERA OFFLINE'";
    const attWhere = conditions.length
      ? `AND ${conditions.map((c) => c.replace(/col/g, 'e."timestamp"')).join(" AND ")}`
      : "";

    const vStats = await client.query(
      `SELECT jenis_kendaraan, COUNT(*) as total FROM vehicle_log ${vWhere} GROUP BY jenis_kendaraan`,
      params,
    );
    const sStats = await client.query(`SELECT COUNT(*) as total FROM alert_log ${sWhere}`, params);
    const cStats = await client.query(`SELECT COUNT(*) as total FROM alert_log ${cWhere}`, params);
    const vLogs = await client.query(
      `SELECT timestamp, jenis_kendaraan, status_muatan, jenis_kejadian FROM vehicle_log ${vWhere} ORDER BY timestamp DESC`,
      params,
    );
    const sLogs = await client.query(
      `SELECT id, created_at, camera, class_name, duration, alert_level, first_detected, foto_base64
       FROM alert_log ${sWhere} ORDER BY created_at DESC`,
      params,
    );
    sLogs.rows.forEach(convertFotoBase64);
    const cLogs = await client.query(
      `SELECT camera, created_at FROM alert_log ${cWhere} ORDER BY created_at DESC`,
      params,
    );
    const attLogs = await client.query(
      `SELECT e."timestamp", e.event_type, e.confidence, emp.name AS employee_name, emp.employee_id AS nik FROM attendance_event e LEFT JOIN employees emp ON e.employee_id = emp.employee_id WHERE e.event_type != 'MANUAL_REVIEW_EVENT' AND e.event_type != 'UNRESOLVED' ${attWhere} ORDER BY e."timestamp" DESC`,
      params,
    );

    const totalKendaraan = vStats.rows.reduce((s, r) => s + Number(r.total), 0);
    const totalStaging = Number(sStats.rows[0]?.total || 0);
    const totalCameraOff = Number(cStats.rows[0]?.total || 0);
    const totalArrival = attLogs.rows.filter((a) => a.event_type === "ARRIVAL").length;
    const totalPelanggaran = hitungPelanggaran(attLogs.rows);

    // ============================================================
    // JIKA FORMAT PDF
    // ============================================================
    if (format === "pdf") {
      const kpiCards = `
        <div class="kpi-row">
          <div class="kpi-card c1"><div class="kpi-val">${totalKendaraan}</div><div class="kpi-lbl">Total Kendaraan</div><div class="kpi-sub">Mobil+Truk+Motor</div></div>
          <div class="kpi-card c2"><div class="kpi-val">${totalArrival}</div><div class="kpi-lbl">Kehadiran</div><div class="kpi-sub">Karyawan Hadir</div></div>
          <div class="kpi-card c3"><div class="kpi-val">${totalPelanggaran}</div><div class="kpi-lbl">Pelanggaran</div><div class="kpi-sub">Jam Kerja</div></div>
          <div class="kpi-card c4"><div class="kpi-val">${totalStaging}</div><div class="kpi-lbl">Staging</div><div class="kpi-sub">Box Terdeteksi</div></div>
          <div class="kpi-card c5"><div class="kpi-val">${DEFAULT_TOTAL_CAMERAS - totalCameraOff}/${DEFAULT_TOTAL_CAMERAS}</div><div class="kpi-lbl">Camera Online</div><div class="kpi-sub">${totalCameraOff} Offline</div></div>
        </div>`;

      const chartsRow = `
        <div class="chart-row">
          <div class="card"><div class="card-hd">📡 Camera Status</div>${generateDonutChart(DEFAULT_TOTAL_CAMERAS, totalCameraOff)}</div>
          <div class="card"><div class="card-hd">📋 Activity Summary</div>
            <div style="display:flex;flex-direction:column;gap:8px;font-size:11px;padding:8px 0;">
              <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #f1f5f9;"><span>🚛 Total Kendaraan</span><strong>${totalKendaraan}</strong></div>
              <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #f1f5f9;"><span>✅ Kehadiran</span><strong style="color:#10b981;">${totalArrival}</strong></div>
              <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #f1f5f9;"><span>⚠️ Pelanggaran</span><strong style="color:#ef4444;">${totalPelanggaran}</strong></div>
              <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #f1f5f9;"><span>📦 Staging</span><strong style="color:#8b5cf6;">${totalStaging}</strong></div>
              <div style="display:flex;justify-content:space-between;padding:6px 0;"><span>📡 Camera Online</span><strong style="color:#f59e0b;">${DEFAULT_TOTAL_CAMERAS - totalCameraOff}/${DEFAULT_TOTAL_CAMERAS}</strong></div>
            </div>
          </div>
        </div>`;

      const cameraSection =
        cLogs.rows.length > 0
          ? `<div class="tbl-wrap"><table><thead><tr><th>No</th><th>Camera</th><th>Time</th></tr></thead><tbody>${cLogs.rows
              .slice(0, 20)
              .map(
                (c, i) =>
                  `<tr><td>${i + 1}</td><td>🔴 ${c.camera}</td><td>${new Date(c.created_at).toLocaleString("id-ID", { dateStyle: "short", timeStyle: "short" })}</td></tr>`,
              )
              .join("")}</tbody></table></div>`
          : '<div class="empty">✅ All cameras normal</div>';

      const attendanceSection =
        attLogs.rows.length > 0
          ? `<div class="tbl-wrap"><table><thead><tr><th>No</th><th>Name</th><th>NIK</th><th>Status</th><th>Time</th><th>Conf</th></tr></thead><tbody>${attLogs.rows
              .map((a, i) => {
                const badge =
                  a.event_type === "ARRIVAL"
                    ? "badge-g"
                    : a.event_type === "DEPARTURE"
                      ? "badge-y"
                      : a.event_type === "BREAK_OUT"
                        ? "badge-r"
                        : "badge-b";
                const label =
                  a.event_type === "ARRIVAL"
                    ? "Masuk"
                    : a.event_type === "DEPARTURE"
                      ? "Pulang"
                      : a.event_type === "BREAK_OUT"
                        ? "Istirahat"
                        : "Kembali";
                return `<tr><td>${i + 1}</td><td><strong>${a.employee_name || "Unknown"}</strong></td><td>${a.nik || "-"}</td><td><span class="badge ${badge}">${label}</span></td><td>${new Date(a.timestamp).toLocaleString("id-ID", { dateStyle: "short", timeStyle: "short" })}</td><td>${a.confidence ? (a.confidence * 100).toFixed(1) + "%" : "-"}</td></tr>`;
              })
              .join("")}</tbody></table></div>`
          : '<div class="empty">📋 No attendance records</div>';

      const vehicleSection =
        vLogs.rows.length > 0
          ? `<div class="tbl-wrap"><table><thead><tr><th>No</th><th>Time</th><th>Vehicle</th><th>Load</th><th>Kejadian</th></tr></thead><tbody>${vLogs.rows.map((v, i) => `<tr><td>${i + 1}</td><td>${v.timestamp ? new Date(v.timestamp).toLocaleString("id-ID", { dateStyle: "short", timeStyle: "medium" }) : "-"}</td><td>${(v.jenis_kendaraan || "-").toUpperCase()}</td><td>${v.status_muatan || "-"}</td><td>${v.jenis_kejadian || "-"}</td></tr>`).join("")}</tbody></table></div>`
          : '<div class="empty">🚛 No vehicle records</div>';

      const stagingCards = sLogs.rows.slice(0, STAGING_CARD_LIMIT);
      const stagingSection =
        sLogs.rows.length > 0
          ? `<div class="staging-grid">${stagingCards
              .map((s) => {
                const mulai = s.first_detected
                  ? new Date(s.first_detected).toLocaleString("id-ID", {
                      dateStyle: "short",
                      timeStyle: "short",
                    })
                  : "-";
                const alertTerakhir = new Date(s.created_at).toLocaleString("id-ID", {
                  dateStyle: "short",
                  timeStyle: "short",
                });
                const level = s.alert_level || "STAGING";
                return `<div class="staging-card">
                  <div class="staging-img">
                    ${s.foto_base64 ? `<img src="data:image/jpeg;base64,${s.foto_base64}" alt="Bukti" />` : ""}
                  </div>
                  <div class="staging-level">${level}</div>
                  <div class="staging-info">
                    <div class="staging-cls">${s.class_name || "Box"}</div>
                    <div class="staging-row">📍 <b>${s.camera || "-"}</b></div>
                    <div class="staging-row">🟢 Mulai terdeteksi: <b>${mulai}</b></div>
                    <div class="staging-row">🔔 Alert terakhir: <b>${alertTerakhir}</b></div>
                    <div class="staging-dur">⏱ ${formatDurationSeconds(s.duration)}</div>
                  </div>
                </div>`;
              })
              .join("")}</div>${
              sLogs.rows.length > STAGING_CARD_LIMIT
                ? `<div class="staging-note">Menampilkan ${STAGING_CARD_LIMIT} dari ${sLogs.rows.length} deteksi staging. Lihat halaman "Deteksi Barang Staging" di dashboard untuk daftar lengkap.</div>`
                : ""
            }`
          : '<div class="empty">📦 No staging records</div>';

      const html = buildMainHTML({
        title: scopeTitle,
        subtitle: subtitleInfo,
        logo: logoBase64,
        kpiCards,
        chartsRow,
        cameraSection,
        attendanceSection,
        vehicleSection,
        stagingSection,
      });

      const pdfBuffer = await renderPdf(html);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(pdfBuffer);
      return;
    }

    // ============================================================
    // JIKA FORMAT EXCEL (DEFAULT)
    // ============================================================
    const totalOnline = DEFAULT_TOTAL_CAMERAS - totalCameraOff;

    const [vehicleChartBuf, cameraChartBuf] = await Promise.all([
      renderChartBuffer(vehicleChartCanvas, buildVehicleChartConfig(vStats.rows)),
      renderChartBuffer(cameraChartCanvas, buildCameraChartConfig(totalOnline, totalCameraOff)),
    ]);

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Warehouse Intelligence Suite";
    workbook.created = new Date();

    // SHEET 1: Dashboard
    const wsDash = workbook.addWorksheet("Dashboard", { views: [{ showGridLines: false }] });
    buildDashboard(
      workbook,
      wsDash,
      `${scopeTitle} Warehouse Report`,
      subtitleInfo,
      totalKendaraan,
      totalStaging,
      totalCameraOff,
      vehicleChartBuf,
      cameraChartBuf,
    );

    // SHEET 2: Log Kendaraan
    const wsVehicle = workbook.addWorksheet("Log Kendaraan");
    const vHeaders = [
      "No",
      "Waktu Terdeteksi",
      "Jenis Kendaraan",
      "Status Muatan",
      "Jenis Kejadian",
    ];
    const vSpecs = [
      { align: "center" },
      { align: "center" },
      { align: "left" },
      { align: "center", isStatus: true },
      { align: "left" },
    ];
    const vRows = vLogs.rows.map((v, i) => {
      // Format manual: dd/mm/yyyy jam/menit/detik
      let waktu = "-";
      if (v.timestamp) {
        const d = new Date(v.timestamp);
        const pad = (n) => String(n).padStart(2, "0");
        waktu = `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
      }

      return [
        i + 1,
        waktu,
        v.jenis_kendaraan ? v.jenis_kendaraan.toUpperCase() : "-",
        v.status_muatan || "-",
        v.jenis_kejadian || "-",
      ];
    });
    const vSummary = {
      title: "📦 JUMLAH ALOKASI KENDARAAN",
      rows: [
        ...vStats.rows.map((r) => [
          `Jenis: ${(r.jenis_kendaraan || "LAINNYA").toUpperCase()}`,
          Number(r.total),
        ]),
        ["TOTAL KESELURUHAN KENDARAAN", totalKendaraan],
      ],
    };
    formatPremiumLogSheet(
      wsVehicle,
      `📋 LOG KENDARAAN (${scopeTitle.toUpperCase()})`,
      vHeaders,
      vRows,
      vSpecs,
      vSummary,
    );

    // SHEET 3: Log Staging & Alert
    const wsStaging = workbook.addWorksheet("Log Staging");
    const sHeaders = [
      "No",
      "Mulai Terdeteksi",
      "Alert Terakhir",
      "Durasi",
      "Kamera ID",
      "Kelas Objek",
      "Alert Level",
    ];
    const sSpecs = [
      { align: "center" },
      { align: "center", numFormat: "yyyy-mm-dd hh:mm:ss" },
      { align: "center", numFormat: "yyyy-mm-dd hh:mm:ss" },
      { align: "center" },
      { align: "left" },
      { align: "center" },
      { align: "center" },
    ];
    const sRows = sLogs.rows.map((s, i) => [
      i + 1,
      toExcelDate(s.first_detected),
      toExcelDate(s.created_at),
      formatDurationSeconds(s.duration),
      s.camera,
      s.class_name || "Box",
      s.alert_level || "STAGING",
    ]);
    const sSummary = {
      title: "⚠️ JUMLAH ALOKASI ALERT",
      rows: [
        ["TOTAL STAGING (BOX) TERDETEKSI", totalStaging],
        ["TOTAL ALERT KAMERA OFFLINE", totalCameraOff],
        ["TOTAL KESELURUHAN ALERT", totalStaging + totalCameraOff],
      ],
    };
    formatPremiumLogSheet(
      wsStaging,
      `⚠️ LOG ALERTS & STAGING (${scopeTitle.toUpperCase()})`,
      sHeaders,
      sRows,
      sSpecs,
      sSummary,
    );

    // SHEET 4: Log Kehadiran
    const wsAtt = workbook.addWorksheet("Log Kehadiran");
    const aHeaders = [
      "No",
      "Waktu Absen",
      "Nama Karyawan",
      "NIK Karyawan",
      "Tipe Event",
      "Confidence Face",
    ];
    const aSpecs = [
      { align: "center" },
      { align: "center", numFormat: "yyyy-mm-dd hh:mm:ss" },
      { align: "left" },
      { align: "center" },
      { align: "center", isStatus: true },
      { align: "right", numFormat: "0.00%" },
    ];
    const aRows = attLogs.rows.map((a, i) => [
      i + 1,
      toExcelDate(a.timestamp),
      a.employee_name || "Unknown",
      a.nik || "-",
      a.event_type,
      Number(a.confidence || 0),
    ]);
    const eventCounts = attLogs.rows.reduce((acc, a) => {
      const key = a.event_type || "LAINNYA";
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    const aSummary = {
      title: "👤 JUMLAH ALOKASI PRESENSI",
      rows: [
        ...Object.entries(eventCounts).map(([type, count]) => [`Event: ${type}`, count]),
        ["TOTAL KESELURUHAN PRESENSI", attLogs.rows.length],
      ],
    };
    formatPremiumLogSheet(
      wsAtt,
      `👤 LOG PRESENSI KARYAWAN (${scopeTitle.toUpperCase()})`,
      aHeaders,
      aRows,
      aSpecs,
      aSummary,
    );

    const buffer = await workbook.xlsx.writeBuffer();
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (err) {
    logger.error(`Report ${scopeTitle} ERROR:`, err);
    res.status(500).json({ error: `Gagal memproses laporan ${scopeTitle.toLowerCase()}` });
  } finally {
    if (client) client.release();
  }
}

// ============================================
// ROUTES
// ============================================
router.get("/daily", async (req, res) => {
  const selectedDate = req.query.date;
  const format = req.query.format || "xlsx";
  if (!selectedDate)
    return res.status(400).json({ error: "Parameter 'date' (YYYY-MM-DD) wajib diisi." });
  await generateReportEngine(
    res,
    "Daily",
    `Periode Tanggal: ${selectedDate}`,
    ["col::date = $1"],
    [selectedDate],
    `Laporan_Harian_${selectedDate}.${format === "pdf" ? "pdf" : "xlsx"}`,
    format,
  );
});

router.get("/weekly", async (req, res) => {
  const selectedDate = req.query.date;
  const format = req.query.format || "xlsx";
  if (!selectedDate) return res.status(400).json({ error: "Parameter 'date' wajib diisi." });
  const conditions = [
    "col::date >= DATE_TRUNC('week', $1::date)::date",
    "col::date <= (DATE_TRUNC('week', $1::date)::date + INTERVAL '6 days')::date",
  ];
  await generateReportEngine(
    res,
    "Weekly",
    `Rentang Minggu: ${selectedDate}`,
    conditions,
    [selectedDate],
    `Laporan_Mingguan_${selectedDate}.${format === "pdf" ? "pdf" : "xlsx"}`,
    format,
  );
});

router.get("/monthly", async (req, res) => {
  const { year, month } = req.query;
  const format = req.query.format || "xlsx";
  if (!year || !month)
    return res.status(400).json({ error: "Parameter 'year' dan 'month' wajib diisi." });
  const conditions = ["EXTRACT(YEAR FROM col) = $1", "EXTRACT(MONTH FROM col) = $2"];
  await generateReportEngine(
    res,
    "Monthly",
    `Periode Bulan: ${month}-${year}`,
    conditions,
    [parseInt(year), parseInt(month)],
    `Laporan_Bulanan_${year}_${month}.${format === "pdf" ? "pdf" : "xlsx"}`,
    format,
  );
});

router.get("/full-report", async (req, res) => {
  const format = req.query.format || "xlsx";
  await generateReportEngine(
    res,
    "Full Histori",
    "Semua data log tersimpan",
    [],
    [],
    `Laporan_Lengkap_Warehouse.${format === "pdf" ? "pdf" : "xlsx"}`,
    format,
  );
});

module.exports = router;
