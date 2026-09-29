const express = require("express");
const router = express.Router();
const pool = require("../db");
const ExcelJS = require("exceljs");
const { ChartJSNodeCanvas } = require("chartjs-node-canvas");
const puppeteer = require("puppeteer");
const fs = require("fs");
const path = require("path");
const logger = require("../utils/logger");

logger.info("✅ ExportZ API loaded (EXCEL 3 SHEETS + PDF PREMIUM - MERGED CYCLES FIX)");

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
// HELPER: Format Date (Excel)
// ============================================================
function toExcelDate(date) {
  if (!date) return "";
  return new Date(date);
}

// ============================================================
// HELPER: Buffer bytea -> base64 string
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
// HELPER: Format durasi detik -> "X hari Y jam"
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

// ============================================================
// PALET WARNA (Excel)
// ============================================================
const THEME = {
  primary: "FF312E81",
  primaryAccent: "FF4F46E5",
  bgHeader: "FF4F46E5",
  bgZebra: "FFF8FAFC",
  textDark: "FF1E293B",
  textMuted: "FF64748B",
  borderLight: "FFE2E8F0",
  borderMedium: "FFCBD5E1",
  kpiBg: "FFF8FAFC",
  totalBg: "FF312E81",
  totalText: "FFFFFFFF",
};
const BORDERS = {
  thin: { style: "thin", color: { argb: THEME.borderLight } },
  outer: { style: "thin", color: { argb: THEME.borderMedium } },
};
const CHART_COLORS = ["#4F46E5", "#22C55E", "#F59E0B", "#EF4444", "#06B6D4", "#A855F7", "#F97316"];

// ============================================================
// CHART RENDERER (Excel)
// ============================================================
const DPR = 2;
const VEHICLE_CHART_DISPLAY = { width: 460, height: 260 };
const vehicleChartCanvas = new ChartJSNodeCanvas({
  width: VEHICLE_CHART_DISPLAY.width * DPR,
  height: VEHICLE_CHART_DISPLAY.height * DPR,
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

// ============================================================
// EXCEL: formatPremiumLogSheet (clean banded table, no double-grid)
// ============================================================
function formatPremiumLogSheet(ws, title, headers, dataRows, columnSpecs, summary) {
  ws.views = [{ showGridLines: false }];

  // --- Accent rule + title block ---
  ws.mergeCells(1, 1, 1, headers.length);
  ws.getCell(1, 1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: THEME.primaryAccent },
  };
  ws.getRow(1).height = 4;

  ws.mergeCells("A2:F2");
  const wsTitle = ws.getCell("A2");
  wsTitle.value = title;
  wsTitle.font = { name: "Segoe UI", size: 15, bold: true, color: { argb: THEME.primary } };
  ws.getRow(2).height = 26;

  ws.getCell("A3").value = `Total Data: ${dataRows.length} baris`;
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
  headerRow.height = 30;

  headerRow.eachCell((cell, colNumber) => {
    cell.font = { name: "Segoe UI", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: THEME.bgHeader } };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.border = {
      bottom: { style: "medium", color: { argb: THEME.primary } },
      left: colNumber === 1 ? BORDERS.outer : undefined,
      right: colNumber === headers.length ? BORDERS.outer : undefined,
    };

    const col = ws.getColumn(colNumber);
    if (colNumber === 1) col.width = 10;
    else if (colNumber === 2 || colNumber === 3) col.width = 24;
    else if (colNumber >= 4 && colNumber <= 7) col.width = 32;
    else col.width = 28;
  });

  dataRows.forEach((rowValues, i) => {
    const rNum = i + startRowIdx + 1;
    const row = ws.getRow(rNum);
    row.values = rowValues;
    const isLastDataRow = i === dataRows.length - 1;

    const isEven = i % 2 === 0;
    row.eachCell((cell, colNumber) => {
      cell.font = { name: "Segoe UI", size: 10, color: { argb: THEME.textDark } };
      // Baris dipisah cuma dengan garis bawah tipis (bukan kotak penuh di
      // tiap sel) supaya tampilannya seperti tabel laporan, bukan grid
      // spreadsheet mentah. Sisi kiri/kanan tabel dikasih 1 garis tegas
      // sebagai "bingkai" keseluruhan tabel.
      cell.border = {
        bottom: isLastDataRow
          ? { style: "medium", color: { argb: THEME.borderMedium } }
          : BORDERS.thin,
        left: colNumber === 1 ? BORDERS.outer : undefined,
        right: colNumber === headers.length ? BORDERS.outer : undefined,
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
          } else if (valLower.includes("bongkar")) {
            cell.font = { name: "Segoe UI", size: 10, bold: true, color: { argb: "FF047857" } };
          } else if (valLower.includes("muat (loading)")) {
            cell.font = { name: "Segoe UI", size: 10, bold: true, color: { argb: "FFC2410C" } };
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
  ws.views = [{ state: "frozen", ySplit: startRowIdx, showGridLines: false }];

  // ================= REKAP DI KOLOM A & B =================
  if (summary && summary.rows && summary.rows.length) {
    let r = lastDataRow + 2;

    ws.mergeCells(r, 1, r, 2);
    const summaryTitleCell = ws.getCell(r, 1);
    summaryTitleCell.value = summary.title || "Ringkasan";
    summaryTitleCell.font = {
      name: "Segoe UI",
      size: 12,
      bold: true,
      color: { argb: THEME.primary },
    };
    ws.getRow(r).height = 24;
    r++;

    const labelHeaderCell = ws.getCell(r, 1);
    labelHeaderCell.value = "Keterangan";
    labelHeaderCell.font = { name: "Segoe UI", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
    labelHeaderCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: THEME.bgHeader } };
    labelHeaderCell.alignment = { horizontal: "left", vertical: "middle", indent: 1 };
    labelHeaderCell.border = { bottom: { style: "medium", color: { argb: THEME.primary } } };

    const valueHeaderCell = ws.getCell(r, 2);
    valueHeaderCell.value = "Jumlah";
    valueHeaderCell.font = { name: "Segoe UI", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
    valueHeaderCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: THEME.bgHeader } };
    valueHeaderCell.alignment = { horizontal: "center", vertical: "middle" };
    valueHeaderCell.border = { bottom: { style: "medium", color: { argb: THEME.primary } } };

    ws.getRow(r).height = 22;
    r++;

    summary.rows.forEach(([label, value], idx) => {
      const isGrandTotal = idx === summary.rows.length - 1;
      const fillColor = isGrandTotal ? THEME.totalBg : THEME.kpiBg;
      const labelColor = isGrandTotal ? THEME.totalText : THEME.textDark;
      const valueColor = isGrandTotal ? THEME.totalText : THEME.primary;

      const labelCell = ws.getCell(r, 1);
      labelCell.value = label;
      labelCell.font = {
        name: "Segoe UI",
        size: 10,
        bold: isGrandTotal,
        color: { argb: labelColor },
      };
      labelCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fillColor } };
      labelCell.alignment = { horizontal: "left", vertical: "middle", indent: 1 };
      labelCell.border = { bottom: BORDERS.thin };

      const valueCell = ws.getCell(r, 2);
      valueCell.value = value;
      valueCell.font = {
        name: "Segoe UI",
        size: 11,
        bold: true,
        color: { argb: valueColor },
      };
      valueCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fillColor } };
      valueCell.alignment = { horizontal: "center", vertical: "middle" };
      valueCell.border = { bottom: BORDERS.thin };

      ws.getRow(r).height = isGrandTotal ? 24 : 20;
      r++;
    });
  }
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
  vehicleChartBuf,
) {
  ws.views = [{ showGridLines: false }];
  ws.mergeCells("B1:J1");
  ws.getCell("B1").fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: THEME.primaryAccent },
  };
  ws.getRow(1).height = 6;

  ws.mergeCells("B3:F3");
  const titleCell = ws.getCell("B3");
  titleCell.value = titleText;
  titleCell.font = { name: "Segoe UI", size: 18, bold: true, color: { argb: THEME.textDark } };

  ws.mergeCells("B4:G4");
  const subtitleCell = ws.getCell("B4");
  subtitleCell.value = subtitleText;
  subtitleCell.font = { name: "Segoe UI", size: 10, color: { argb: THEME.textMuted } };
  ws.getRow(3).height = 26;

  const totalAktivitas = totalKendaraan + totalStaging;
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
      colStart: 5,
      colEnd: 6,
    },
    {
      label: "TOTAL AKTIVITAS",
      val: totalAktivitas,
      desc: "Gabungan kendaraan + staging",
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
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: THEME.kpiBg } };
        cell.border = {
          top: r === 6 ? BORDERS.outer : null,
          bottom: r === 8 ? BORDERS.outer : null,
          left: c === start ? BORDERS.outer : null,
          right: c === end ? BORDERS.outer : null,
        };
      }
    }
    ws.getCell(6, start).value = kpi.label;
    ws.getCell(6, start).font = {
      name: "Segoe UI",
      size: 9,
      bold: true,
      color: { argb: THEME.textMuted },
    };
    ws.getCell(6, start).alignment = { horizontal: "center", vertical: "bottom" };

    ws.getCell(7, start).value = kpi.val;
    ws.getCell(7, start).font = {
      name: "Segoe UI",
      size: 18,
      bold: true,
      color: { argb: THEME.primary },
    };
    ws.getCell(7, start).alignment = { horizontal: "center", vertical: "middle" };

    ws.getCell(8, start).value = kpi.desc;
    ws.getCell(8, start).font = {
      name: "Segoe UI",
      size: 8,
      italic: true,
      color: { argb: "FF94A3B8" },
    };
    ws.getCell(8, start).alignment = { horizontal: "center", vertical: "top" };
  });

  ws.getRow(6).height = 18;
  ws.getRow(7).height = 28;
  ws.getRow(8).height = 16;
  ws.getColumn("A").width = 4;
  ws.getColumn("B").width = 20;
  ws.getColumn("C").width = 20;
  ws.getColumn("D").width = 4;
  ws.getColumn("E").width = 20;
  ws.getColumn("F").width = 20;
  ws.getColumn("G").width = 4;
  ws.getColumn("H").width = 20;
  ws.getColumn("I").width = 20;

  ws.getCell("B10").value = "Visualisasi Data";
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
}

// ============================================================
// PDF HELPERS
// ============================================================
async function renderPdf(html) {
  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1200, height: 800, deviceScaleFactor: 1 });
    await page.setContent(html, { waitUntil: "domcontentloaded", timeout: 0 });
    await new Promise((resolve) => setTimeout(resolve, 800));
    return await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "0", bottom: "0", left: "0", right: "0" },
    });
  } finally {
    await browser.close();
  }
}

function escapeHtml(val) {
  const s = val === null || val === undefined || val === "" ? "-" : String(val);
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Membangun satu blok tabel data untuk halaman PDF: judul + jumlah data,
// tabel dengan header gelap & baris selang-seling, dibatasi jumlah baris
// supaya PDF tidak membengkak — sisanya diarahkan ke file Excel.
function buildHtmlTable(sectionTitle, headers, rows, maxRows = 40) {
  const total = rows.length;
  const shown = rows.slice(0, maxRows);

  const theadHtml = headers.map((h) => `<th>${escapeHtml(h)}</th>`).join("");
  const bodyHtml = shown.length
    ? shown.map((r) => `<tr>${r.map((c) => `<td>${escapeHtml(c)}</td>`).join("")}</tr>`).join("")
    : `<tr><td colspan="${headers.length}" class="empty-cell">Tidak ada data pada periode ini.</td></tr>`;

  const noteHtml =
    total > maxRows
      ? `<div class="table-note">Menampilkan ${maxRows} dari ${total} data teratas &middot; unduh format Excel untuk data lengkap.</div>`
      : "";

  return `
    <div class="section">
      <div class="section-head"><h2>${escapeHtml(sectionTitle)}</h2><span class="section-count">${total} data</span></div>
      <table class="data-table"><thead><tr>${theadHtml}</tr></thead><tbody>${bodyHtml}</tbody></table>
      ${noteHtml}
    </div>`;
}

function buildMainHTML(data) {
  const { title, subtitle, logo, kpiCards, tablesHtml } = data;
  const buildPage = (pageNum, pageTitle, badgeLabel, content) => {
    return `
    <div class="page" id="pg${pageNum}">
      <div class="main-header">
        <div class="header-logo">${logo ? `<img src="${logo}" alt="Logo" />` : '<span style="color:#312e81;font-weight:700;font-size:20px;">A</span>'}</div>
        <div class="header-info"><div class="company">PT Aristides Logistik Indonesia</div><h1>${pageTitle}</h1><div class="period">${pageNum === 1 ? subtitle : ""}</div></div>
        <div class="header-badge">${badgeLabel}</div>
      </div>
      ${content}
      <div class="footer">PT Aristides Logistik Indonesia &middot; Dokumen Internal &middot; Confidential</div>
    </div>`;
  };

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8" /><style>
*{box-sizing:border-box;margin:0;padding:0;}
html,body{margin:0;padding:0;background:#ffffff;}
body{font-family:'Segoe UI',-apple-system,BlinkMacSystemFont,Arial,sans-serif;color:#1e293b;}
.page{padding:26px 30px 20px 30px;page-break-after:always;background:#ffffff;}

/* Header: flat, satu warna aksen, tanpa gradasi/bayangan warna */
.main-header{background:#ffffff;border:1px solid #e2e8f0;border-top:3px solid #312e81;border-radius:6px;padding:18px 24px;margin-bottom:22px;display:flex;align-items:center;gap:16px;}
.header-logo{width:46px;height:46px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;display:flex;align-items:center;justify-content:center;overflow:hidden;flex-shrink:0;}
.header-logo img{width:78%;height:78%;object-fit:contain;}
.header-info{flex:1;}
.header-info .company{font-size:10px;font-weight:600;color:#64748b;letter-spacing:.6px;text-transform:uppercase;}
.header-info h1{font-size:20px;font-weight:700;margin:2px 0;color:#1e293b;}
.header-info .period{font-size:11px;color:#94a3b8;}
.header-badge{background:#312e81;color:#fff;padding:6px 14px;border-radius:4px;font-size:9px;font-weight:700;letter-spacing:.6px;text-transform:uppercase;}

/* KPI cards: flat putih, garis aksen tipis di atas, tanpa warna blok mencolok */
.kpi-row{display:flex;gap:16px;margin-bottom:24px;}
.kpi-card{flex:1;background:#ffffff;border:1px solid #e2e8f0;border-top:3px solid #4f46e5;border-radius:6px;padding:16px 18px;}
.kpi-lbl{font-size:10px;font-weight:600;color:#64748b;letter-spacing:.5px;text-transform:uppercase;margin-bottom:6px;}
.kpi-val{font-size:26px;font-weight:700;color:#1e293b;}

/* Tabel data: flat, header gelap, baris selang-seling, tanpa warna mencolok */
.section{margin-bottom:20px;}
.section-head{display:flex;align-items:baseline;justify-content:space-between;margin-bottom:8px;border-bottom:2px solid #312e81;padding-bottom:4px;}
.section-head h2{font-size:13px;font-weight:700;color:#1e293b;}
.section-count{font-size:10px;color:#64748b;font-weight:600;}
/* Warna & border disamakan persis dengan tabel di Excel (formatPremiumLogSheet):
   header indigo #4F46E5 dengan garis bawah tegas #312E81, baris zebra #F8FAFC,
   teks data #1E293B, garis antar-baris #E2E8F0, dan bingkai luar tabel #CBD5E1. */
.data-table{width:100%;border-collapse:collapse;font-size:9px;page-break-inside:auto;border:1px solid #cbd5e1;}
.data-table thead{display:table-header-group;}
.data-table tr{page-break-inside:avoid;}
.data-table th{background:#4f46e5;color:#ffffff;font-weight:600;text-transform:uppercase;letter-spacing:.3px;font-size:8px;padding:6px 8px;text-align:left;border-bottom:2px solid #312e81;}
.data-table td{padding:5px 8px;border-bottom:1px solid #e2e8f0;color:#1e293b;}
.data-table tbody tr:nth-child(even){background:#f8fafc;}
.data-table td.empty-cell{text-align:center;color:#94a3b8;font-style:italic;padding:14px 8px;}
.table-note{font-size:8px;color:#94a3b8;margin-top:4px;font-style:italic;}

.footer{text-align:center;padding:14px 0;font-size:8px;color:#94a3b8;font-weight:500;letter-spacing:.3px;}
@page{size:A4;margin:0;}
</style></head><body><div class="app">
  ${buildPage(1, title, "REPORT", (kpiCards || "") + (tablesHtml || ""))}
</div></body></html>`;
}

// ============================================================
// GENERATOR ENGINE
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

    // PERBAIKAN: laporan Excel/PDF (harian/mingguan/bulanan/lengkap) sebelumnya
    // ikut menghitung & menampilkan deteksi kendaraan yang sudah ditandai staff
    // sebagai false positive lewat fitur "Tandai deteksi salah" di halaman Log
    // Kendaraan. Akibatnya angka di laporan resmi bisa lebih tinggi dari jumlah
    // kendaraan yang benar-benar valid. Sekarang selalu dikecualikan, baik saat
    // ada filter tanggal maupun saat "Laporan Lengkap" (tanpa filter tanggal).
    const vDateConditions = conditions.map((c) => c.replace(/col/g, "timestamp"));
    const vWhere = `WHERE is_false_positive IS NOT TRUE${
      vDateConditions.length ? ` AND ${vDateConditions.join(" AND ")}` : ""
    }`;
    const sWhere = conditions.length
      ? `WHERE LOWER(class_name) = 'box' AND ${conditions.map((c) => c.replace(/col/g, "created_at")).join(" AND ")}`
      : "WHERE LOWER(class_name) = 'box'";

    const vStats = await client.query(
      `SELECT jenis_kendaraan, COUNT(*) as total FROM vehicle_log ${vWhere} GROUP BY jenis_kendaraan`,
      params,
    );
    const sStats = await client.query(`SELECT COUNT(*) as total FROM alert_log ${sWhere}`, params);
    const vLogs = await client.query(
      `SELECT timestamp, jenis_kendaraan, status_muatan, jenis_kejadian, vehicle_id, gambar_base64, kamera_nama, plat_nomor FROM vehicle_log ${vWhere} ORDER BY timestamp DESC`,
      params,
    );
    const sLogs = await client.query(
      `SELECT id, created_at, camera, class_name, duration, alert_level, first_detected, foto_base64 FROM alert_log ${sWhere} ORDER BY created_at DESC`,
      params,
    );
    sLogs.rows.forEach(convertFotoBase64);

    const totalKendaraan = vStats.rows.reduce((s, r) => s + Number(r.total), 0);
    const totalStaging = Number(sStats.rows[0]?.total || 0);

    // Helper untuk memetakan log mentah & menggabungkan masuk-keluar yang berdekatan
    const processCycles = (logsList) => {
      const perVehicleCycles = {};
      const logsAscending = [...logsList].sort(
        (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
      );

      logsAscending.forEach((v) => {
        const vehicleId =
          v.vehicle_id ||
          `VEH_${v.jenis_kendaraan || "UNKNOWN"}_${Math.floor(new Date(v.timestamp).getTime() / 15000)}`;
        if (!perVehicleCycles[vehicleId]) perVehicleCycles[vehicleId] = [];
        const cycles = perVehicleCycles[vehicleId];

        const jenisNormalized = (v.jenis_kejadian || "").toUpperCase().replace(/[_\s]/g, "");
        const isMasuk = jenisNormalized === "MASUK";
        const isKeluar = jenisNormalized === "KELUAR" || jenisNormalized === "SIKLUSSELESAI";

        let targetCycle = null;
        if (cycles.length > 0) {
          const lastCycle = cycles[cycles.length - 1];
          const timeLog = new Date(v.timestamp).getTime();
          const timeMasuk = lastCycle.waktu_masuk ? new Date(lastCycle.waktu_masuk).getTime() : 0;
          const timeKeluar = lastCycle.waktu_keluar
            ? new Date(lastCycle.waktu_keluar).getTime()
            : 0;

          if (isMasuk && !lastCycle.waktu_masuk) {
            targetCycle = lastCycle;
          } else if (isKeluar && !lastCycle.waktu_keluar) {
            targetCycle = lastCycle;
          } else if (!lastCycle.waktu_keluar && Math.abs(timeLog - timeMasuk) < 300000) {
            targetCycle = lastCycle;
          }
        }

        if (!targetCycle) {
          targetCycle = {
            jenis_kendaraan: v.jenis_kendaraan || "-",
            kamera: v.kamera_nama || "-",
            waktu_masuk: null,
            muatan_masuk: "-",
            foto_masuk: null,
            waktu_keluar: null,
            muatan_keluar: "-",
            foto_keluar: null,
            durasi_detik: 0,
            aktivitas: "-",
            plat_nomor: v.plat_nomor || null,
          };
          cycles.push(targetCycle);
        }

        if (v.jenis_kendaraan) targetCycle.jenis_kendaraan = v.jenis_kendaraan;
        if (v.kamera_nama) targetCycle.kamera = v.kamera_nama;
        if (v.plat_nomor) targetCycle.plat_nomor = v.plat_nomor;

        if (isMasuk || (!isKeluar && !targetCycle.waktu_masuk)) {
          targetCycle.waktu_masuk = v.timestamp;
          targetCycle.muatan_masuk = v.status_muatan || "-";
          targetCycle.foto_masuk = v.gambar_base64 || targetCycle.foto_masuk;
          targetCycle.aktivitas = v.jenis_kejadian || targetCycle.aktivitas;
        } else if (isKeluar || (!isMasuk && targetCycle.waktu_masuk && !targetCycle.waktu_keluar)) {
          targetCycle.waktu_keluar = v.timestamp;
          targetCycle.muatan_keluar = v.status_muatan || "-";
          targetCycle.foto_keluar = v.gambar_base64 || targetCycle.foto_keluar;
          targetCycle.aktivitas = v.jenis_kejadian || targetCycle.aktivitas;
        }
      });

      const flattened = Object.values(perVehicleCycles).flat();
      const getLatestEventTime = (g) =>
        Math.max(
          g.waktu_masuk ? new Date(g.waktu_masuk).getTime() : 0,
          g.waktu_keluar ? new Date(g.waktu_keluar).getTime() : 0,
        );
      return flattened.sort((a, b) => getLatestEventTime(b) - getLatestEventTime(a));
    };

    const isCameraDepan = (kamera) => (kamera || "").toLowerCase().includes("depan");
    const groupedListDepan = processCycles(vLogs.rows.filter((g) => isCameraDepan(g.kamera_nama)));
    const groupedListLoading = processCycles(
      vLogs.rows.filter((g) => !isCameraDepan(g.kamera_nama)),
    );

    const formatDateShared = (date) => {
      if (!date) return "-";
      const d = new Date(date);
      const pad = (n) => String(n).padStart(2, "0");
      return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    };

    const mapRowsToTable = (groupedList) => {
      return groupedList.map((g, i) => {
        const formatDurasi = (detik) => {
          if (!detik || detik === 0) return "-";
          const jam = Math.floor(detik / 3600);
          const menit = Math.floor((detik % 3600) / 60);
          if (jam > 0) return `${jam} jam ${menit} menit`;
          return `${menit} menit`;
        };
        let durasiDetik = 0;
        if (g.waktu_masuk && g.waktu_keluar) {
          const selisihMs = new Date(g.waktu_keluar).getTime() - new Date(g.waktu_masuk).getTime();
          durasiDetik = selisihMs > 0 ? Math.round(selisihMs / 1000) : 0;
        }

        // --- SIMPULKAN JENIS AKTIVITAS DARI PERUBAHAN STATUS MUATAN ---
        // Membandingkan status muatan saat masuk vs keluar untuk truk, supaya
        // langsung kelihatan itu proses muat (loading) atau bongkar (unloading),
        // bukan cuma nampilin jenis_kejadian mentah dari database.
        let aktivitas = "-";
        const masuk = (g.muatan_masuk || "").toLowerCase();
        const keluar = (g.muatan_keluar || "").toLowerCase();

        if (
          (masuk.includes("kosong") || masuk === "-") &&
          (keluar.includes("bermuatan") || keluar.includes("terpal"))
        ) {
          aktivitas = "Proses Muat (Loading)";
        } else if (
          (masuk.includes("bermuatan") || masuk.includes("terpal")) &&
          (keluar.includes("kosong") || keluar === "-")
        ) {
          aktivitas = "Proses Bongkar (Unloading)";
        } else if (
          masuk !== "-" &&
          keluar !== "-" &&
          !masuk.includes("kosong") &&
          !keluar.includes("kosong")
        ) {
          aktivitas = "Transit / Membawa Muatan";
        } else if (masuk.includes("kosong") && keluar.includes("kosong")) {
          aktivitas = "Lewat Kosong";
        }

        if (aktivitas === "-" && g.aktivitas) {
          aktivitas =
            g.aktivitas.toUpperCase() === "SIKLUS_SELESAI" ? "Siklus Normal" : g.aktivitas;
        }

        return [
          i + 1,
          "",
          "",
          g.kamera || "-",
          formatDateShared(g.waktu_masuk),
          formatDateShared(g.waktu_keluar),
          g.jenis_kendaraan ? g.jenis_kendaraan.toUpperCase() : "-",
          g.plat_nomor || "-",
          g.muatan_masuk,
          g.muatan_keluar,
          formatDurasi(durasiDetik),
          aktivitas,
        ];
      });
    };

    const vRowsDepan = mapRowsToTable(groupedListDepan);
    const vRowsLoading = mapRowsToTable(groupedListLoading);

    const countByJenis = (list) => {
      const counts = {};
      list.forEach((g) => {
        const key = (g.jenis_kendaraan || "LAINNYA").toUpperCase();
        counts[key] = (counts[key] || 0) + 1;
      });
      return counts;
    };

    if (format === "pdf") {
      const totalAktivitas = totalKendaraan + totalStaging;
      const kpiCards = `<div class="kpi-row">
        <div class="kpi-card"><div class="kpi-val">${totalKendaraan}</div><div class="kpi-lbl">Total Kendaraan</div></div>
        <div class="kpi-card"><div class="kpi-val">${totalStaging}</div><div class="kpi-lbl">Staging Terdeteksi</div></div>
        <div class="kpi-card"><div class="kpi-val">${totalAktivitas}</div><div class="kpi-lbl">Total Aktivitas</div></div>
      </div>`;

      const pdfVehicleHeaders = [
        "No",
        "Kamera",
        "Waktu Masuk",
        "Waktu Keluar",
        "Jenis Kendaraan",
        "Plat Nomor",
        "Muatan Masuk",
        "Muatan Keluar",
        "Durasi",
        "Aktivitas",
      ];
      // vRowsDepan/vRowsLoading disusun untuk Excel dengan 2 kolom foto (index 1 & 2)
      // yang tidak relevan untuk tabel PDF, jadi dibuang di sini.
      const toPdfVehicleRow = (r) => [r[0], r[3], r[4], r[5], r[6], r[7], r[8], r[9], r[10], r[11]];

      const tableDepan = buildHtmlTable(
        "Log Kendaraan — Halaman Depan",
        pdfVehicleHeaders,
        vRowsDepan.map(toPdfVehicleRow),
      );
      const tableLoading = buildHtmlTable(
        "Log Kendaraan — Loading Kiri",
        pdfVehicleHeaders,
        vRowsLoading.map(toPdfVehicleRow),
      );

      const pdfStagingHeaders = [
        "No",
        "Mulai Terdeteksi",
        "Alert Terakhir",
        "Durasi",
        "Kamera",
        "Kelas Objek",
        "Alert Level",
      ];
      const pdfStagingRows = sLogs.rows.map((s, i) => [
        i + 1,
        formatDateShared(s.first_detected),
        formatDateShared(s.created_at),
        formatDurationSeconds(s.duration),
        s.camera || "-",
        s.class_name || "Box",
        s.alert_level || "STAGING",
      ]);
      const tableStaging = buildHtmlTable("Log Alert & Staging", pdfStagingHeaders, pdfStagingRows);

      const html = buildMainHTML({
        title: scopeTitle,
        subtitle: subtitleInfo,
        logo: logoBase64,
        kpiCards,
        tablesHtml: tableDepan + tableLoading + tableStaging,
      });
      const pdfBuffer = await renderPdf(html);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      return res.send(pdfBuffer);
    }

    // ============================================================
    // EXCEL GENERATOR (SEPARATE CAMERA CYCLES & MERGED DUAL PHOTOS)
    // ============================================================
    const [vehicleChartBuf] = await Promise.all([
      renderChartBuffer(vehicleChartCanvas, buildVehicleChartConfig(vStats.rows)),
    ]);

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Warehouse Intelligence Suite";
    workbook.created = new Date();

    const wsDash = workbook.addWorksheet("Dashboard", { views: [{ showGridLines: false }] });
    buildDashboard(
      workbook,
      wsDash,
      `${scopeTitle} Warehouse Report`,
      subtitleInfo,
      totalKendaraan,
      totalStaging,
      vehicleChartBuf,
    );

    const sharedHeaders = [
      "No",
      "Foto Masuk",
      "Foto Keluar",
      "Kamera",
      "Waktu Masuk",
      "Waktu Keluar",
      "Jenis Kendaraan",
      "Plat Nomor",
      "Status Muatan (Masuk)",
      "Status Muatan (Keluar)",
      "Durasi Aktivitas",
      "Jenis Aktivitas",
    ];
    const sharedSpecs = [
      { align: "center" },
      { align: "center" },
      { align: "center" },
      { align: "left" },
      { align: "center", numFormat: "dd/mm/yyyy hh:mm:ss" },
      { align: "center", numFormat: "dd/mm/yyyy hh:mm:ss" },
      { align: "left" },
      { align: "center" },
      { align: "center", isStatus: true },
      { align: "center", isStatus: true },
      { align: "center" },
      { align: "left", isStatus: true },
    ];

    const wsVehicleDepan = workbook.addWorksheet("Log Kendaraan (Halaman Depan)");
    const wsVehicleLoading = workbook.addWorksheet("Log Kendaraan (Loading Kiri)");

    formatPremiumLogSheet(
      wsVehicleDepan,
      `Log Kendaraan — Halaman Depan (${scopeTitle})`,
      sharedHeaders,
      vRowsDepan,
      sharedSpecs,
      {
        title: "Rekap Kendaraan — Halaman Depan",
        rows: [
          ...Object.entries(countByJenis(groupedListDepan)).map(([jenis, total]) => [
            `Jenis: ${jenis}`,
            total,
          ]),
          ["Total di Halaman Depan", groupedListDepan.length],
        ],
      },
    );

    formatPremiumLogSheet(
      wsVehicleLoading,
      `Log Kendaraan — Loading Kiri (${scopeTitle})`,
      sharedHeaders,
      vRowsLoading,
      sharedSpecs,
      {
        title: "Rekap Kendaraan — Loading Kiri",
        rows: [
          ...Object.entries(countByJenis(groupedListLoading)).map(([jenis, total]) => [
            `Jenis: ${jenis}`,
            total,
          ]),
          ["Total di Loading Kiri", groupedListLoading.length],
          ["Total Keseluruhan Kendaraan", totalKendaraan],
        ],
      },
    );

    // ============================================================
    // EMBED FOTO & TINGGI BARIS SANGAT LUAS
    // ============================================================
    const MAX_PHOTOS_IN_EXPORT = 300;
    const V_START_ROW = 6;
    const PHOTO_WIDTH = 120;
    const PHOTO_HEIGHT = 120;
    const ROW_HEIGHT_FOR_PHOTO = 110;

    const embedPhotoCell = (ws, base64, rowNumber, colNumber) => {
      if (!base64) return false;
      try {
        const imageId = workbook.addImage({
          base64: `data:image/jpeg;base64,${base64}`,
          extension: "jpeg",
        });
        ws.addImage(imageId, {
          tl: { col: colNumber - 1 + 0.1, row: rowNumber - 1 + 0.05 },
          ext: { width: PHOTO_WIDTH, height: PHOTO_HEIGHT },
          editAs: "oneCell",
        });
        return true;
      } catch (e) {
        return false;
      }
    };

    [
      { ws: wsVehicleDepan, list: groupedListDepan },
      { ws: wsVehicleLoading, list: groupedListLoading },
    ].forEach(({ ws, list }) => {
      ws.getColumn(2).width = 24;
      ws.getColumn(3).width = 24;
      list.forEach((g, i) => {
        if (i >= MAX_PHOTOS_IN_EXPORT) return;
        const rowNumber = V_START_ROW + i;
        ws.getRow(rowNumber).height = ROW_HEIGHT_FOR_PHOTO;
        embedPhotoCell(ws, g.foto_masuk, rowNumber, 2);
        embedPhotoCell(ws, g.foto_keluar, rowNumber, 3);
      });
    });

    // SHEET 3: Staging
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
      { align: "center" },
      { align: "center" },
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
    formatPremiumLogSheet(
      wsStaging,
      `Log Alert & Staging (${scopeTitle})`,
      sHeaders,
      sRows,
      sSpecs,
      {
        title: "Rekap Alert",
        rows: [
          ["Total Staging (Box) Terdeteksi", totalStaging],
          ["Total Keseluruhan Alert", totalStaging],
        ],
      },
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
    res.status(500).json({ error: `Gagal memproses laporan` });
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
  if (!selectedDate) return res.status(400).json({ error: "Parameter 'date' wajib diisi." });
  await generateReportEngine(
    res,
    "Daily",
    `Periode Tanggal: ${selectedDate}`,
    ["col::date = $1"],
    [selectedDate],
    `Laporan_Harian_${selectedDate}.${format}`,
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
    `Laporan_Mingguan_${selectedDate}.${format}`,
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
    `Laporan_Bulanan_${year}_${month}.${format}`,
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
    `Laporan_Lengkap_Warehouse.${format}`,
    format,
  );
});

module.exports = router;
