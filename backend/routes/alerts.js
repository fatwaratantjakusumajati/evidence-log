const express = require("express");
const router = express.Router();
const pool = require("../db");
const puppeteer = require("puppeteer");
const path = require("path");

console.log("✅ Alerts API routes loaded (FIXED PARAM BINDING + BYTEA BASE64)");

// ============================================================
// PERBAIKAN: kolom foto_base64 bertipe bytea di Postgres.
// Driver 'pg' mengembalikan kolom bytea sebagai Node.js Buffer,
// BUKAN string base64. Kalau langsung di-JSON-kan, hasilnya jadi
// { type: "Buffer", data: [...] } yang tidak valid dipakai sebagai
// src gambar. Helper ini mengonversinya jadi string base64 asli.
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
// GET : List Alert dengan Pagination & Filter Tanggal/Kelas
// ============================================================
router.get("/", async (req, res) => {
  try {
    const { page = 1, limit = 20, class_name, start_date, end_date } = req.query;
    const offset = (Number(page) - 1) * Number(limit);
    let conditions = [];
    let params = [];

    // 🔽 Filter default: jangan tampilkan log kamera
    conditions.push(`class_name NOT IN ('KAMERA OFFLINE', 'KAMERA ONLINE')`);

    if (class_name) {
      params.push(class_name);
      conditions.push(`class_name = $${params.length}`);
    }
    if (start_date) {
      params.push(start_date);
      conditions.push(`created_at >= $${params.length}`);
    }
    if (end_date) {
      params.push(end_date + " 23:59:59");
      conditions.push(`created_at <= $${params.length}`);
    }

    let whereClause = "WHERE " + conditions.join(" AND ");

    const dataQuery = `
      SELECT id, camera, class_name, duration, timestamp, foto_base64, file_name, alert_level,
             created_at, alert_sent_1, alert_sent_2, alert_sent_3, first_detected
      FROM alert_log ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;

    const countQuery = `
      SELECT COUNT(*) as total
      FROM alert_log ${whereClause}`;

    const dataParams = [...params, limit, offset];
    const dataResult = await pool.query(dataQuery, dataParams);
    const totalResult = await pool.query(countQuery, params);

    const rows = dataResult.rows.map(convertFotoBase64);

    res.json({
      data: rows,
      total: parseInt(totalResult.rows[0].total),
      page: Number(page),
      limit: Number(limit),
      totalPages: Math.ceil(parseInt(totalResult.rows[0].total) / Number(limit)),
    });
  } catch (err) {
    console.error("Error GET /:", err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// GET stats/weekly : Statistik Barang Box (7 hari / Rentang Tanggal) - FIXED
// ============================================================
router.get("/stats/weekly", async (req, res) => {
  try {
    const { start_date, end_date } = req.query;
    let dateClause = `created_at >= NOW() - INTERVAL '7 days'`;
    let params = [];

    // Jika user memilih rentang tanggal
    if (start_date && end_date) {
      dateClause = `created_at >= $1 AND created_at <= $2`;
      params = [start_date, end_date + " 23:59:59"];
    }

    // Query sederhana, filter hanya class_name = 'box'
    const query = `
      SELECT TO_CHAR(created_at, 'Dy') AS day, COUNT(*) AS barang
      FROM alert_log
      WHERE ${dateClause} AND class_name = 'box'
      GROUP BY TO_CHAR(created_at, 'Dy'), DATE_TRUNC('day', created_at)
      ORDER BY DATE_TRUNC('day', created_at)
    `;

    // Eksekusi query dengan atau tanpa parameter
    const result = params.length > 0 ? await pool.query(query, params) : await pool.query(query);
    res.json(result.rows);
  } catch (err) {
    console.error("Error GET /stats/weekly:", err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// GET stats/camera-status : Status Kamera Mati (dengan Filter Tanggal) - FIXED
// ============================================================
router.get("/stats/camera-status", async (req, res) => {
  try {
    const { start_date, end_date } = req.query;
    let dateClause = ``;
    let params = [];

    // Jika user memilih rentang tanggal (Periode di dashboard)
    if (start_date && end_date) {
      dateClause = `AND created_at >= $1 AND created_at <= $2`;
      params = [start_date, end_date + " 23:59:59"];
    } else {
      // Default: Hanya hitung kamera yang status OFFLINE terakhirnya terjadi dalam 1 jam terakhir
      dateClause = `AND created_at >= NOW() - INTERVAL '1 hour'`;
    }

    const query = `
      SELECT COUNT(*) AS mati
      FROM (
        SELECT DISTINCT ON (camera) camera, class_name
        FROM alert_log
        WHERE class_name IN ('KAMERA OFFLINE', 'KAMERA ONLINE') ${dateClause}
        ORDER BY camera, created_at DESC
      ) latest_status
      WHERE class_name = 'KAMERA OFFLINE'
    `;

    const result = await pool.query(query, params);
    res.json(result.rows[0]);
  } catch (err) {
    console.error("Error GET /stats/camera-status:", err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// GET export-pdf : Ekspor PDF Staging & Kamera
// ============================================================
router.get("/export-pdf", async (req, res) => {
  try {
    const { class_name, start_date, end_date } = req.query;
    let conditions = [];
    let params = [];

    if (class_name) {
      params.push(class_name);
      conditions.push(`class_name = $${params.length}`);
    }
    if (start_date) {
      params.push(start_date);
      conditions.push(`created_at >= $${params.length}`);
    }
    if (end_date) {
      params.push(end_date + " 23:59:59");
      conditions.push(`created_at <= $${params.length}`);
    }

    let whereClause = conditions.length > 0 ? "WHERE " + conditions.join(" AND ") : "";
    const result = await pool.query(
      `
      SELECT id, camera, class_name, duration, timestamp, foto_base64, file_name, alert_level, first_detected, created_at
      FROM alert_log ${whereClause}
      ORDER BY created_at DESC
    `,
      params,
    );

    if (result.rows.length === 0) {
      return res.status(404).send("Tidak ada data untuk diekspor.");
    }

    // PERBAIKAN: konversi Buffer -> base64 string sebelum dipakai di template HTML
    const rows = result.rows.map(convertFotoBase64);

    const isCameraReport = class_name && class_name.toLowerCase().includes("kamera");
    let itemsHtml = "";

    if (isCameraReport) {
      itemsHtml = `
        <table style="width: 100%; border-collapse: collapse; margin-top: 20px;">
          <thead>
            <tr style="background-color: #f3f4f6; border-bottom: 2px solid #e5e7eb;">
              <th style="padding: 12px; text-align: left; font-size: 14px;">No.</th>
              <th style="padding: 12px; text-align: left; font-size: 14px;">Nama Kamera</th>
              <th style="padding: 12px; text-align: right; font-size: 14px;">Waktu Kejadian</th>
            </tr>
          </thead>
          <tbody>
            ${rows
              .map(
                (r, i) => `
              <tr style="border-bottom: 1px solid #e5e7eb;">
                <td style="padding: 10px 12px; font-size: 13px; color: #6b7280;">${i + 1}</td>
                <td style="padding: 10px 12px; font-size: 13px; font-weight: 500;">${r.camera}</td>
                <td style="padding: 10px 12px; font-size: 13px; text-align: right; color: #6b7280;">${new Date(r.created_at).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })}</td>
              </tr>
            `,
              )
              .join("")}
          </tbody>
        </table>
      `;
    } else {
      rows.forEach((r) => {
        const durationMinutes = Math.floor(
          (new Date(r.created_at).getTime() - new Date(r.first_detected).getTime()) / 60000,
        );
        const durationStr =
          durationMinutes < 60
            ? `${durationMinutes} menit`
            : `${Math.floor(durationMinutes / 60)} jam`;

        itemsHtml += `
          <div class="item-card">
            <div class="img-container">
              <img src="data:image/jpeg;base64,${r.foto_base64}" alt="Barang Staging" />
            </div>
            <div class="info">
              <div class="row"><strong>Barang:</strong> ${r.class_name || "Tidak teridentifikasi"}</div>
              <div class="row"><strong>Kamera:</strong> ${r.camera}</div>
              <div class="row"><strong>Terdeteksi:</strong> ${new Date(r.created_at).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })}</div>
              <div class="row"><strong>Durasi:</strong> ${durationStr}</div>
            </div>
          </div>
        `;
      });
    }

    const title = isCameraReport ? "Laporan Kamera Mati" : "Laporan Deteksi Staging";

    const html = `
      <html>
      <head>
        <style>
          body { font-family: 'Helvetica', Arial, sans-serif; padding: 40px; background: #f9fafb; margin: 0; }
          .page-container { max-width: 1200px; margin: 0 auto; background: #ffffff; padding: 30px; border-radius: 16px; box-shadow: 0 4px 20px rgba(0,0,0,0.08); }
          h1 { text-align: center; color: #1f2937; margin-bottom: 30px; font-size: 24px; }
          .grid { display: flex; flex-wrap: wrap; gap: 20px; justify-content: center; }
          .item-card { width: 280px; background: #ffffff; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); overflow: hidden; border: 1px solid #e5e7eb; page-break-inside: avoid; }
          .img-container { width: 100%; height: 190px; background: #f3f4f6; overflow: hidden; }
          .img-container img { width: 100%; height: 100%; object-fit: contain; }
          .info { padding: 15px; }
          .row { font-size: 13px; color: #374151; margin-bottom: 6px; line-height: 1.5; }
          .row strong { color: #111827; }
          table { width: 100%; border-collapse: collapse; }
          th, td { padding: 10px; border-bottom: 1px solid #e5e7eb; text-align: left; }
          .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #e2e8f0; text-align: center; font-size: 12px; color: #94a3b8; }
          @page { size: A4 landscape; margin: 20px; }
          @media print { body { background: white; } .page-container { box-shadow: none; } }
        </style>
      </head>
      <body>
        <div class="page-container">
          <h1>${title}</h1>
          ${itemsHtml}
          <div class="footer">PT Aristides Logistik Indonesia · Dicetak: ${new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })}</div>
        </div>
      </body>
      </html>
    `;

    const browser = await puppeteer.launch({
      headless: "new",
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });
    const pdfBuffer = await page.pdf({ format: "A4", landscape: true, printBackground: true });
    await browser.close();

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${isCameraReport ? "laporan_kamera_mati" : "laporan_staging"}.pdf"`,
    );
    res.send(pdfBuffer);
  } catch (err) {
    console.error("Error GET /export-pdf:", err);
    res.status(500).json({ error: "Gagal generate laporan lengkap" });
  }
});

// ============================================================
// GET :id : Ambil Detail Alert by ID
// ============================================================
router.get("/:id", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM alert_log WHERE id = $1", [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: "Tidak ditemukan" });
    // PERBAIKAN: konversi Buffer -> base64 string
    res.json(convertFotoBase64(result.rows[0]));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
