const express = require("express");
const router = express.Router();
const pool = require("../db");
const { clampLimit } = require("../utils/pagination");
const puppeteer = require("puppeteer");
const path = require("path");
const { sendServerError } = require("../utils/errors");
const { validateDateRange, endOfDayBoundary } = require("../utils/validateDateRange");
const logger = require("../utils/logger");

logger.info("✅ Alerts API routes loaded (FIXED PARAM BINDING + BYTEA BASE64)");

// ============================================================
// Ambang waktu "barang mengendap" sebelum boleh dianggap staging
// yang layak ditampilkan di dashboard. Harus SAMA PERSIS dengan
// WAKTU_MAKSIMAL_DIAM di script Python (cctv-monitor.py) = 3 hari.
// Kolom `duration` di alert_log satuannya detik.
// ============================================================
const MIN_STAGING_DURATION_SECONDS = 259200; // 3 hari

// ============================================================
// FITUR BARU: Prediksi Risiko Eskalasi
// ------------------------------------------------------------
// Ground truth "masih aktif/staging" vs "sudah selesai" DIAMBIL DARI
// alert_level yang ditulis cctv-monitor.py, BUKAN dari resolved_at
// (kolom itu ada di tabel tapi tidak pernah diisi oleh script manapun):
//   - alert_level = 'STAGING'  -> baru terdeteksi, level 0
//   - alert_level = 'WARNING'  -> sudah eskalasi (tercatat di alert_sent_N)
//   - alert_level = 'SELESAI'  -> objek sudah keluar dari ROI (resolved)
//
// Definisi "risiko eskalasi ke level 2" (ambang 5 hari, ESCALATION_THRESHOLDS
// di cctv-monitor.py): probabilitas historis, per kombinasi camera+class_name,
// bahwa sebuah item yang SUDAH SELESAI (alert_level='SELESAI') ternyata sempat
// mencapai alert_sent_2 sebelum akhirnya dipindah. Ini diterapkan ke item yang
// SEKARANG masih aktif (alert_level IN ('STAGING','WARNING')) dan belum kena
// alert_sent_2, sebagai early warning SEBELUM eskalasi beneran terjadi.
// ============================================================
const ESCALATION_RISK_LABEL_COLUMN = "alert_sent_2"; // ambang 5 hari

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
    const { page = 1, limit: rawLimit = 20, class_name, start_date, end_date } = req.query;
    const dateCheck = validateDateRange(start_date, end_date);
    if (!dateCheck.ok) return res.status(400).json({ error: dateCheck.message });
    const limit = clampLimit(rawLimit, { defaultLimit: 20, maxLimit: 100 });
    const offset = (Number(page) - 1) * limit;
    let conditions = [];
    let params = [];

    // 🔽 Filter default: jangan tampilkan log kamera
    conditions.push(`class_name NOT IN ('KAMERA OFFLINE', 'KAMERA ONLINE')`);

    // 🔽 Hanya tampilkan barang yang SUDAH mengendap >= 3 hari.
    params.push(MIN_STAGING_DURATION_SECONDS);
    conditions.push(`duration >= $${params.length}`);

    if (class_name) {
      params.push(class_name);
      conditions.push(`class_name = $${params.length}`);
    }
    if (start_date) {
      params.push(start_date);
      conditions.push(`created_at >= $${params.length}`);
    }
    if (end_date) {
      params.push(endOfDayBoundary(end_date));
      conditions.push(`created_at <= $${params.length}`);
    }

    let whereClause = "WHERE " + conditions.join(" AND ");

    // predicted_risk cuma bermakna untuk item yang MASIH AKTIF
    // (alert_level != 'SELESAI' dan belum kena alert_sent_2) --
    // untuk item yang sudah SELESAI, hasilnya akan NULL di response
    // (outcome-nya sudah jadi fakta historis, bukan prediksi lagi).
    const dataQuery = `
      SELECT a.id, a.camera, a.class_name, a.duration, a.timestamp, a.foto_base64, a.file_name,
             a.alert_level, a.created_at, a.alert_sent_1, a.alert_sent_2, a.alert_sent_3,
             a.first_detected,
             CASE
               WHEN a.alert_level IN ('STAGING', 'WARNING') AND a.alert_sent_2 IS NULL
                 THEN (
                   SELECT ROUND(
                     COUNT(*) FILTER (WHERE alert_sent_2 IS NOT NULL)::numeric
                     / NULLIF(COUNT(*), 0), 4
                   )
                   FROM alert_log rs
                   WHERE rs.camera = a.camera
                     AND rs.class_name = a.class_name
                     AND rs.alert_level = 'SELESAI'
                   HAVING COUNT(*) >= 3
                 )
               ELSE NULL
             END AS predicted_risk
      FROM alert_log a ${whereClause}
      ORDER BY a.created_at DESC
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
    logger.error("Error GET /:", err);
    sendServerError(res, err);
  }
});

// ============================================================
// GET stats/weekly : Statistik Barang Box (7 hari / Rentang Tanggal)
// FIX: sekarang mendukung rentang terbuka (cuma start_date ATAU
// cuma end_date). Kalau tidak ada filter sama sekali, tetap default
// 7 hari terakhir seperti sebelumnya.
// ============================================================
router.get("/stats/weekly", async (req, res) => {
  try {
    const { start_date, end_date } = req.query;
    const dateCheck = validateDateRange(start_date, end_date);
    if (!dateCheck.ok) return res.status(400).json({ error: dateCheck.message });

    const conds = [];
    const params = [];
    if (start_date) {
      params.push(start_date);
      conds.push(`created_at >= $${params.length}`);
    }
    if (end_date) {
      params.push(endOfDayBoundary(end_date));
      conds.push(`created_at <= $${params.length}`);
    }
    const dateClause =
      conds.length > 0 ? conds.join(" AND ") : `created_at >= NOW() - INTERVAL '7 days'`;

    const query = `
      SELECT TO_CHAR(created_at, 'Dy') AS day, COUNT(*) AS barang
      FROM alert_log
      WHERE ${dateClause} AND class_name = 'box'
      GROUP BY TO_CHAR(created_at, 'Dy'), DATE_TRUNC('day', created_at)
      ORDER BY DATE_TRUNC('day', created_at)
    `;

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    logger.error("Error GET /stats/weekly:", err);
    sendServerError(res, err);
  }
});

// ============================================================
// GET stats/camera-status : Status Kamera Mati (dengan Filter Tanggal)
// FIX: sekarang mendukung rentang terbuka.
// PENTING: jika TIDAK ada filter tanggal, JANGAN batasi ke 1 jam
// terakhir — status kamera harus selalu dihitung dari event TERBARU
// kamera itu, walau event tersebut terjadi lebih dari 1 jam lalu.
// ============================================================
router.get("/stats/camera-status", async (req, res) => {
  try {
    const { start_date, end_date } = req.query;
    const dateCheck = validateDateRange(start_date, end_date);
    if (!dateCheck.ok) return res.status(400).json({ error: dateCheck.message });

    const conds = [];
    const params = [];
    if (start_date) {
      params.push(start_date);
      conds.push(`created_at >= $${params.length}`);
    }
    if (end_date) {
      params.push(endOfDayBoundary(end_date));
      conds.push(`created_at <= $${params.length}`);
    }
    const dateClause = conds.length > 0 ? `AND ${conds.join(" AND ")}` : "";

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
    logger.error("Error GET /stats/camera-status:", err);
    sendServerError(res, err);
  }
});

// ============================================================
// GET export-pdf : Ekspor PDF Staging & Kamera
// ============================================================
router.get("/export-pdf", async (req, res) => {
  try {
    const { class_name, start_date, end_date } = req.query;
    const dateCheck = validateDateRange(start_date, end_date);
    if (!dateCheck.ok) return res.status(400).json({ error: dateCheck.message });
    let conditions = [];
    let params = [];

    const isCameraExport = class_name && class_name.toLowerCase().includes("kamera");
    if (!isCameraExport) {
      params.push(MIN_STAGING_DURATION_SECONDS);
      conditions.push(`duration >= $${params.length}`);
    }

    if (class_name) {
      params.push(class_name);
      conditions.push(`class_name = $${params.length}`);
    }
    if (start_date) {
      params.push(start_date);
      conditions.push(`created_at >= $${params.length}`);
    }
    if (end_date) {
      params.push(endOfDayBoundary(end_date));
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
    logger.error("Error GET /export-pdf:", err);
    res.status(500).json({ error: "Gagal generate laporan lengkap" });
  }
});

// ============================================================
// GET stats/camera-uptime : Ringkasan uptime per kamera
// FIX: mendukung rentang terbuka (cuma start_date / cuma end_date).
// ============================================================
router.get("/stats/camera-uptime", async (req, res) => {
  try {
    const { start_date, end_date } = req.query;
    const dateCheck = validateDateRange(start_date, end_date);
    if (!dateCheck.ok) return res.status(400).json({ error: dateCheck.message });

    const conds = [];
    const params = [];
    if (start_date) {
      params.push(start_date);
      conds.push(`created_at >= $${params.length}`);
    }
    if (end_date) {
      params.push(endOfDayBoundary(end_date));
      conds.push(`created_at <= $${params.length}`);
    }

    let dateClause;
    let periodSeconds;

    if (start_date && end_date) {
      dateClause = conds.join(" AND ");
      const days =
        (new Date(end_date).getTime() - new Date(start_date).getTime()) / (1000 * 60 * 60 * 24) + 1;
      periodSeconds = Math.max(1, days) * 24 * 3600;
    } else if (start_date) {
      dateClause = conds.join(" AND ");
      const days = (Date.now() - new Date(start_date).getTime()) / (1000 * 60 * 60 * 24) + 1;
      periodSeconds = Math.max(1, days) * 24 * 3600;
    } else if (end_date) {
      dateClause = conds.join(" AND ");
      periodSeconds = 7 * 24 * 3600;
    } else {
      dateClause = `created_at >= NOW() - INTERVAL '7 days'`;
      periodSeconds = 7 * 24 * 3600;
    }

    const query = `
      WITH events AS (
        SELECT camera, class_name, duration, created_at
        FROM alert_log
        WHERE class_name IN ('KAMERA OFFLINE', 'KAMERA ONLINE') AND ${dateClause}
      ),
      latest AS (
        SELECT DISTINCT ON (camera) camera, class_name AS current_status, created_at AS last_event_at
        FROM alert_log
        WHERE class_name IN ('KAMERA OFFLINE', 'KAMERA ONLINE')
        ORDER BY camera, created_at DESC
      )
      SELECT
        latest.camera,
        latest.current_status,
        latest.last_event_at,
        COALESCE(agg.offline_count, 0) AS offline_count,
        COALESCE(agg.total_offline_seconds, 0) AS total_offline_seconds
      FROM latest
      LEFT JOIN (
        SELECT camera, COUNT(*) AS offline_count, SUM(duration) AS total_offline_seconds
        FROM events
        WHERE class_name = 'KAMERA OFFLINE'
        GROUP BY camera
      ) agg ON agg.camera = latest.camera
      ORDER BY latest.camera ASC
    `;

    const result = await pool.query(query, params);
    const rows = result.rows.map((r) => {
      const offlineSeconds = Number(r.total_offline_seconds) || 0;
      const uptimePercent = Math.max(
        0,
        Math.min(100, ((periodSeconds - offlineSeconds) / periodSeconds) * 100),
      );
      return {
        camera: r.camera,
        current_status: r.current_status,
        last_event_at: r.last_event_at,
        offline_count: Number(r.offline_count) || 0,
        total_offline_seconds: offlineSeconds,
        uptime_percent: Math.round(uptimePercent * 10) / 10,
      };
    });

    res.json({ data: rows, period_seconds: periodSeconds });
  } catch (err) {
    logger.error("Error GET /stats/camera-uptime:", err);
    sendServerError(res, err);
  }
});

// ============================================================
// GET stats/escalation-risk : Prediksi risiko eskalasi barang staging
// yang MASIH AKTIF sekarang, berdasarkan histori item yang sudah SELESAI.
// Lihat catatan "FITUR BARU: Prediksi Risiko Eskalasi" di atas.
// ============================================================
router.get("/stats/escalation-risk", async (req, res) => {
  try {
    // Item aktif (belum SELESAI) dan belum mencapai eskalasi level 2,
    // digabung dengan tingkat eskalasi historis dari item sejenis yang
    // sudah SELESAI (camera + class_name yang sama).
    const query = `
      WITH resolved_stats AS (
        SELECT
          camera,
          class_name,
          COUNT(*) AS historical_total,
          COUNT(*) FILTER (WHERE ${ESCALATION_RISK_LABEL_COLUMN} IS NOT NULL) AS historical_escalated
        FROM alert_log
        WHERE alert_level = 'SELESAI'
          AND class_name NOT IN ('KAMERA OFFLINE', 'KAMERA ONLINE')
        GROUP BY camera, class_name
      )
      SELECT
        a.id,
        a.camera,
        a.class_name,
        a.alert_level,
        a.duration,
        a.first_detected,
        rs.historical_total,
        rs.historical_escalated,
        CASE
          WHEN rs.historical_total >= 3
            THEN ROUND(rs.historical_escalated::numeric / rs.historical_total, 4)
          ELSE NULL
        END AS predicted_risk
      FROM alert_log a
      LEFT JOIN resolved_stats rs
        ON rs.camera = a.camera AND rs.class_name = a.class_name
      WHERE a.alert_level IN ('STAGING', 'WARNING')
        AND a.${ESCALATION_RISK_LABEL_COLUMN} IS NULL
        AND a.class_name NOT IN ('KAMERA OFFLINE', 'KAMERA ONLINE')
      ORDER BY predicted_risk DESC NULLS LAST, a.first_detected ASC
      LIMIT 50;
    `;

    // Ranking per kamera+jenis barang, buat chart terpisah di dashboard.
    const rankingQuery = `
      SELECT
        camera,
        class_name,
        COUNT(*) AS historical_total,
        COUNT(*) FILTER (WHERE ${ESCALATION_RISK_LABEL_COLUMN} IS NOT NULL) AS historical_escalated,
        ROUND(
          COUNT(*) FILTER (WHERE ${ESCALATION_RISK_LABEL_COLUMN} IS NOT NULL)::numeric
          / NULLIF(COUNT(*), 0),
          4
        ) AS escalation_rate
      FROM alert_log
      WHERE alert_level = 'SELESAI'
        AND class_name NOT IN ('KAMERA OFFLINE', 'KAMERA ONLINE')
      GROUP BY camera, class_name
      HAVING COUNT(*) >= 3
      ORDER BY escalation_rate DESC
      LIMIT 10;
    `;

    const [activeResult, rankingResult] = await Promise.all([
      pool.query(query),
      pool.query(rankingQuery),
    ]);

    res.json({
      // NOTE: catatan penting untuk konsumen endpoint ini — kalau
      // historical_total suatu kombinasi camera+class_name masih < 3,
      // predicted_risk sengaja dikembalikan null (bukan 0) karena
      // sampel historisnya belum cukup untuk dipercaya. Tampilkan
      // sebagai "belum cukup data", jangan dianggap risiko 0%.
      active_items: activeResult.rows,
      camera_class_ranking: rankingResult.rows,
      generated_at: new Date().toISOString(),
    });
  } catch (err) {
    logger.error("Error GET /stats/escalation-risk:", err);
    sendServerError(res, err);
  }
});

// ============================================================
// GET :id : Ambil Detail Alert by ID
// ============================================================
router.get("/:id", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM alert_log WHERE id = $1", [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: "Tidak ditemukan" });

    const row = result.rows[0];
    if (row && row.foto_base64) {
      row.foto_base64 = Buffer.isBuffer(row.foto_base64)
        ? row.foto_base64.toString("base64")
        : row.foto_base64;
    }

    res.json(row);
  } catch (err) {
    sendServerError(res, err);
  }
});

module.exports = router;
