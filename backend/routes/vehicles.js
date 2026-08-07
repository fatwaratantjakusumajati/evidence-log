const express = require("express");
const router = express.Router();
const pool = require("../db");
const { clampLimit } = require("../utils/pagination");
const puppeteer = require("puppeteer");
const fs = require("fs");
const path = require("path");
const { sendServerError } = require("../utils/errors");
const logger = require("../utils/logger");

logger.info("✅ Vehicles API routes loaded (FINAL - Weekly Restored)");

// ------------------ LOG KENDARAAN (PAGINATION) ------------------
router.get("/log", async (req, res) => {
  try {
    const { page = 1, limit: rawLimit = 20, jenis = "all", start_date, end_date } = req.query;
    const limit = clampLimit(rawLimit, { defaultLimit: 20, maxLimit: 100 });
    const offset = (Number(page) - 1) * limit;
    let conditions = [],
      params = [];

    if (jenis && jenis !== "all") {
      params.push(jenis);
      conditions.push(`LOWER(jenis_kendaraan) = $${params.length}`);
    }
    if (start_date) {
      params.push(start_date);
      conditions.push(`timestamp >= $${params.length}`);
    }
    if (end_date) {
      params.push(end_date + " 23:59:59");
      conditions.push(`timestamp <= $${params.length}`);
    }

    let whereClause = conditions.length > 0 ? "WHERE " + conditions.join(" AND ") : "";

    const dataQuery = `SELECT id, timestamp, jenis_kendaraan, warna, rgb_r, rgb_g, rgb_b, confidence, bbox_x1, bbox_y1, bbox_x2, bbox_y2, gambar_base64, created_at, is_false_positive, kamera_nama, status_muatan, track_id, jenis_kejadian FROM vehicle_log ${whereClause} ORDER BY timestamp DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    const countQuery = `SELECT COUNT(*) as total FROM vehicle_log ${whereClause}`;
    const dataParams = [...params, limit, offset];
    const dataResult = await pool.query(dataQuery, dataParams);
    const totalResult = await pool.query(countQuery, params);
    res.json({
      data: dataResult.rows,
      total: parseInt(totalResult.rows[0].total),
      page: Number(page),
      limit: Number(limit),
      totalPages: Math.ceil(parseInt(totalResult.rows[0].total) / Number(limit)),
    });
  } catch (err) {
    sendServerError(res, err);
  }
});

// ------------------ FLAG FALSE POSITIVE ------------------
router.patch("/log/:id/flag", async (req, res) => {
  try {
    const { id } = req.params;
    const { is_false_positive } = req.body;
    await pool.query("UPDATE vehicle_log SET is_false_positive = $1 WHERE id = $2", [
      is_false_positive,
      id,
    ]);
    res.json({ success: true });
  } catch (err) {
    sendServerError(res, err);
  }
});

// ------------------ STATISTIK PER JAM ------------------
router.get("/stats/hourly", async (req, res) => {
  try {
    const { start_date, end_date } = req.query;
    let dateFilter = `timestamp >= CURRENT_DATE`;
    let params = [];
    if (start_date && end_date) {
      dateFilter = `timestamp >= $1 AND timestamp <= $2`;
      params = [start_date, end_date + " 23:59:59"];
    }

    const query = `
      SELECT
        EXTRACT(HOUR FROM timestamp)::int AS bucket_hour,
        jenis_kendaraan,
        COUNT(*) AS total
      FROM vehicle_log
      WHERE ${dateFilter}
      GROUP BY bucket_hour, jenis_kendaraan
      ORDER BY bucket_hour
    `;
    const result = await pool.query(query, params);
    res.json(
      result.rows.map((r) => ({
        hour: `${String(r.bucket_hour).padStart(2, "0")}:00`,
        jenis_kendaraan: r.jenis_kendaraan,
        total: Number(r.total),
      })),
    );
  } catch (err) {
    sendServerError(res, err);
  }
});

// ✅ MENGEMBALIKAN ENDPOINT STATS WEEKLY YANG HILANG
router.get("/stats/weekly", async (req, res) => {
  res.json([]);
});

// ------------------ EKSPOR PDF (DENGAN STATUS MUATAN) ------------------
router.get("/export-pdf", async (req, res) => {
  try {
    const { start_date, end_date } = req.query;
    let dateFilter = `timestamp >= CURRENT_DATE`;
    let dateFilterAlerts = `created_at >= CURRENT_DATE`;
    let dateParams = [];
    if (start_date && end_date) {
      dateFilter = `timestamp >= $1 AND timestamp <= $2`;
      dateFilterAlerts = `CREATED_AT >= $1 and CREATED_AT <= $2`;
      params = [start_date, end_date + " 23:59:59"];
    }

    const vehicleQuery = `SELECT jenis_kendaraan, COUNT(*) as total FROM vehicle_log WHERE ${dateFilter} GROUP BY jenis_kendaraan`;
    const stagingQuery = `SELECT COUNT(*) as total FROM alert_log WHERE LOWER(class_name) = 'box' AND ${dateFilterAlerts}`;
    const cameraQuery = `SELECT COUNT(*) as total FROM alert_log WHERE class_name = 'KAMERA OFFLINE' AND ${dateFilterAlerts}`;
    const fotoQuery = `SELECT timestamp, jenis_kendaraan, warna, confidence, gambar_base64, status_muatan FROM vehicle_log WHERE ${dateFilter} ORDER BY timestamp DESC LIMIT 25`;
    const fotoStaging = `SELECT created_at, camera, class_name, foto_base64 FROM alert_log WHERE LOWER(class_name) = 'box' AND ${dateFilterAlerts} ORDER BY created_at DESC LIMIT 15`;

    const [vehicles, staging, cameras, fotos, stagings] = await Promise.all([
      pool.query(vehicleQuery, dateParams),
      pool.query(stagingQuery, dateParams),
      pool.query(cameraQuery, dateParams),
      pool.query(fotoQuery, dateParams),
      pool.query(fotoStaging, dateParams),
    ]);

    let totalMobil = 0,
      totalTruk = 0,
      totalMotor = 0;
    vehicles.rows.forEach((v) => {
      if (v.jenis_kendaraan === "Mobil") totalMobil = Number(v.total);
      else if (v.jenis_kendaraan === "Truk") totalTruk = Number(v.total);
      else if (v.jenis_kendaraan.includes("Motor")) totalMotor = Number(v.total);
    });

    let vehicleGrid = "",
      stagingGrid = "";
    fotos.rows.forEach((v) => {
      let muatanHtml = "";
      if (v.jenis_kendaraan === "Truk" && v.status_muatan) {
        muatanHtml = `<div class="detail">🚛 Muatan: ${v.status_muatan}</div>`;
      }
      vehicleGrid += `<div class="card"><div class="img"><img src="data:image/jpeg;base64,${v.gambar_base64}" /></div><div class="info"><div class="title">${v.jenis_kendaraan}</div><div class="detail">${v.warna} · ${new Date(v.timestamp).toLocaleString("id-ID")}</div>${muatanHtml}</div></div>`;
    });
    stagings.rows.forEach((s) => {
      stagingGrid += `<div class="card"><div class="img"><img src="data:image/jpeg;base64,${s.foto_base64}" /></div><div class="info"><div class="title">${s.class_name || "Box"}</div><div class="detail">${s.camera}</div></div></div>`;
    });

    const html = `
    <html><head><style>
      body { font-family: Arial, sans-serif; padding: 40px; background: #f8fafc; }
      .page { max-width: 1200px; margin: 0 auto; background: white; padding: 30px; border-radius: 16px; }
      .header { text-align: center; border-bottom: 3px solid #2563eb; padding-bottom: 20px; margin-bottom: 30px; }
      .header h1 { margin: 0; font-size: 28px; color: #0f172a; }
      .header p { color: #64748b; margin: 5px 0 0; font-size: 14px; }
      .summary-table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
      .summary-table th { background: #2563eb; color: white; padding: 12px; text-align: left; }
      .summary-table td { padding: 12px; border-bottom: 1px solid #e2e8f0; }
      .summary-table tr:nth-child(even) { background: #f1f5f9; }
      .section-title { font-size: 18px; font-weight: 600; margin: 30px 0 15px; color: #0f172a; }
      .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 15px; }
      .card { border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; background: white; }
      .img { height: 140px; background: #f1f5f9; }
      .img img { width: 100%; height: 100%; object-fit: cover; }
      .info { padding: 12px; }
      .title { font-weight: 600; font-size: 14px; color: #0f172a; margin-bottom: 4px; }
      .detail { font-size: 12px; color: #64748b; }
      .footer { text-align: center; margin-top: 40px; border-top: 1px solid #e2e8f0; padding-top: 20px; font-size: 12px; color: #94a3b8; }
      @page { size: A4 landscape; margin: 20px; }
      @media print { body { background: white; } .page { box-shadow: none; border-radius: 0; } }
    </style></head>
    <body>
      <div class="page">
        <div class="header">
          <h1>Laporan Lengkap Monitoring</h1>
          <p>PT Aristides Logistik Indonesia · Dicetak: ${new Date().toLocaleString("id-ID", { dateStyle: "full", timeStyle: "short" })}</p>
        </div>
        <h2>📊 Ringkasan Eksekutif</h2>
        <table class="summary-table">
          <thead><tr><th>Kategori</th><th>Jumlah</th><th>Keterangan</th></tr></thead>
          <tbody>
            <tr><td>🚗 Mobil</td><td><strong>${totalMobil}</strong></td><td>Total terdeteksi</td></tr>
            <tr><td>🚛 Truk</td><td><strong>${totalTruk}</strong></td><td>Total terdeteksi</td></tr>
            <tr><td>🏍️ Sepeda Motor</td><td><strong>${totalMotor}</strong></td><td>Total terdeteksi</td></tr>
            <tr><td>📦 Barang Staging (Box)</td><td><strong>${Number(staging.rows[0]?.total || 0)}</strong></td><td>Total terdeteksi</td></tr>
            <tr><td>📹 Kamera Mati</td><td><strong>${Number(cameras.rows[0]?.total || 0)}</strong></td><td>Kejadian offline</td></tr>
          </tbody>
        </table>

        <div class="section-title">🚗 Foto Kendaraan Terbaru</div>
        <div class="grid">${vehicleGrid || '<p style="color:#64748b;">Belum ada data kendaraan.</p>'}</div>

        <div class="section-title">📦 Foto Staging Terbaru</div>
        <div class="grid">${stagingGrid || '<p style="color:#64748b;">Belum ada data staging.</p>'}</div>

        <div class="footer">Sistem Monitoring Terintegrasi · PT Aristides Logistik Indonesia</div>
      </div>
    </body>
    </html>`;

    const browser = await puppeteer.launch({
      headless: "new",
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });
    const pdfBuffer = await page.pdf({ format: "A4", landscape: true, printBackground: true });
    await browser.close();

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", 'attachment; filename="laporan_eksekutif.pdf"');
    res.send(pdfBuffer);
  } catch (err) {
    logger.error(err);
    res.status(500).json({ error: "Gagal generate laporan lengkap" });
  }
});

module.exports = router;
