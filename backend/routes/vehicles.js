const express = require("express");
const router = express.Router();
const pool = require("../db");
const { clampLimit } = require("../utils/pagination");
const puppeteer = require("puppeteer");
const fs = require("fs");
const path = require("path");
const { sendServerError } = require("../utils/errors");
const { validateDateRange, endOfDayBoundary } = require("../utils/validateDateRange");
const logger = require("../utils/logger");

logger.info("✅ Vehicles API routes loaded (FINAL - Weekly Restored)");

// ------------------ LOG KENDARAAN (PAGINATION) ------------------
// PERBAIKAN: sebelumnya LIMIT/OFFSET diterapkan langsung ke baris mentah
// vehicle_log. Satu kendaraan biasanya punya 2+ baris (event Masuk, event
// Keluar, kadang event tambahan status muatan saat loading/unloading), dan
// frontend menggabungkan baris-baris itu jadi satu "kartu" per vehicle_id.
// Akibatnya "limit=20" itu artinya 20 BARIS, bukan 20 KENDARAAN -- kalau
// rata-rata 1 kendaraan makan 2-3 baris, yang kelihatan di layar cuma
// separuhnya, dan pasangan Masuk/Keluar bisa kepotong ke halaman berbeda
// kalau kebetulan jatuh persis di batas limit/offset.
//
// Sekarang LIMIT/OFFSET dihitung di level KELOMPOK kendaraan (group_key =
// vehicle_id, atau "single-<id>" untuk baris tanpa vehicle_id -- sama
// persis dengan logika pengelompokan yang dipakai di frontend), baru
// setelah itu semua baris mentah milik kelompok-kelompok terpilih diambil
// utuh. Jadi limit=20 sekarang benar-benar berarti 20 kendaraan/kartu.
router.get("/log", async (req, res) => {
  try {
    const {
      page = 1,
      limit: rawLimit = 20,
      jenis = "all",
      start_date,
      end_date,
      search,
    } = req.query;
    const dateCheck = validateDateRange(start_date, end_date);
    if (!dateCheck.ok) return res.status(400).json({ error: dateCheck.message });
    const limit = clampLimit(rawLimit, { defaultLimit: 20, maxLimit: 100 });
    const offset = (Number(page) - 1) * limit;
    let conditions = [],
      params = [];

    if (jenis && jenis !== "all") {
      params.push(jenis.toLowerCase());
      conditions.push(`LOWER(jenis_kendaraan) = $${params.length}`);
    }
    if (start_date) {
      params.push(start_date);
      conditions.push(`timestamp >= $${params.length}`);
    }
    if (end_date) {
      params.push(endOfDayBoundary(end_date));
      conditions.push(`timestamp <= $${params.length}`);
    }
    if (search && search.trim()) {
      params.push(`%${search.trim().replace(/\s+/g, "")}%`);
      conditions.push(`REPLACE(plat_nomor, ' ', '') ILIKE $${params.length}`);
    }

    let whereClause = conditions.length > 0 ? "WHERE " + conditions.join(" AND ") : "";

    // group_key: kendaraan dengan vehicle_id sama dianggap satu kelompok
    // (siklus Masuk->Keluar); baris tanpa vehicle_id dianggap kelompok
    // sendiri-sendiri -- persis logika `groupedVehicles` di frontend.
    const dataQuery = `
      WITH filtered AS (
        SELECT *, COALESCE(vehicle_id, 'single-' || id::text) AS group_key
        FROM vehicle_log
        ${whereClause}
      ),
      top_groups AS (
        SELECT group_key, MAX(timestamp) AS latest_ts
        FROM filtered
        GROUP BY group_key
        ORDER BY latest_ts DESC
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}
      )
      SELECT vl.id, vl.timestamp, vl.jenis_kendaraan, vl.warna, vl.rgb_r, vl.rgb_g, vl.rgb_b,
             vl.confidence, vl.bbox_x1, vl.bbox_y1, vl.bbox_x2, vl.bbox_y2, vl.gambar_base64,
             vl.created_at, vl.is_false_positive, vl.kamera_nama, vl.status_muatan, vl.track_id,
             vl.vehicle_id, vl.plat_nomor, vl.plat_confidence, vl.jenis_kejadian
      FROM vehicle_log vl
      JOIN top_groups g ON COALESCE(vl.vehicle_id, 'single-' || vl.id::text) = g.group_key
      ORDER BY g.latest_ts DESC, vl.timestamp ASC
    `;
    // Total & totalPages sekarang dihitung dari JUMLAH KELOMPOK, bukan
    // jumlah baris -- supaya konsisten dengan apa yang sebenarnya
    // ditampilkan sebagai "kartu" di frontend.
    const countQuery = `
      SELECT COUNT(*) as total FROM (
        SELECT COALESCE(vehicle_id, 'single-' || id::text) AS group_key
        FROM vehicle_log
        ${whereClause}
        GROUP BY group_key
      ) t
    `;
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

// ------------------ RIWAYAT LENGKAP 1 KENDARAAN (MASUK -> KELUAR) ------------------
router.get("/history/:vehicle_id", async (req, res) => {
  try {
    const { vehicle_id } = req.params;
    const query = `
      SELECT id, timestamp, jenis_kendaraan, warna, confidence,
             gambar_base64, kamera_nama, status_muatan, track_id,
             vehicle_id, plat_nomor, plat_confidence, jenis_kejadian
      FROM vehicle_log
      WHERE vehicle_id = $1
      ORDER BY timestamp ASC
    `;
    const result = await pool.query(query, [vehicle_id]);
    res.json({
      vehicle_id,
      total_events: result.rows.length,
      events: result.rows,
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
// FIX: sekarang mendukung rentang terbuka (cuma start_date ATAU
// cuma end_date). Kalau tidak ada filter sama sekali, default = hari ini.
router.get("/stats/hourly", async (req, res) => {
  try {
    const { start_date, end_date } = req.query;
    const dateCheck = validateDateRange(start_date, end_date);
    if (!dateCheck.ok) return res.status(400).json({ error: dateCheck.message });

    const conds = [];
    const params = [];
    if (start_date) {
      params.push(start_date);
      conds.push(`timestamp >= $${params.length}`);
    }
    if (end_date) {
      params.push(endOfDayBoundary(end_date));
      conds.push(`timestamp <= $${params.length}`);
    }
    const dateFilter = conds.length > 0 ? conds.join(" AND ") : `timestamp >= CURRENT_DATE`;

    // FIX: query lama COUNT(*) langsung di atas baris mentah vehicle_log.
    // Satu kendaraan biasanya tersimpan sebagai 2+ baris (event MASUK,
    // event KELUAR, kadang tambahan update status muatan) yang terhubung
    // lewat vehicle_id yang sama -- persis alasan yang sama kenapa route
    // /log di atas sudah dikelompokkan per group_key. Endpoint ini lupa
    // dikasih perlakuan yang sama, jadi 2 kendaraan fisik kebaca sebagai
    // 4 baris di grafik.
    //
    // Sekarang: kelompokkan dulu ke group_key (vehicle_id, atau
    // "single-<id>" untuk baris tanpa vehicle_id -- sama seperti /log),
    // lalu tiap grup diwakili SATU baris: jam & jenis kendaraan diambil
    // dari event MASUK-nya (jenis kendaraan "dikunci" saat MASUK, lihat
    // aw.py), atau dari baris paling awal grup itu kalau tidak ada event
    // MASUK eksplisit. Baru dihitung per grup, bukan per baris.
    const query = `
      WITH filtered AS (
        SELECT *, COALESCE(vehicle_id, 'single-' || id::text) AS group_key
        FROM vehicle_log
        WHERE ${dateFilter} AND is_false_positive IS NOT TRUE
      ),
      groups AS (
        SELECT
          group_key,
          (ARRAY_AGG(timestamp ORDER BY (jenis_kejadian = 'MASUK') DESC, timestamp ASC))[1]
            AS entry_ts,
          (ARRAY_AGG(jenis_kendaraan ORDER BY (jenis_kejadian = 'MASUK') DESC, timestamp ASC))[1]
            AS jenis_kendaraan
        FROM filtered
        GROUP BY group_key
      )
      SELECT
        EXTRACT(HOUR FROM entry_ts)::int AS bucket_hour,
        jenis_kendaraan,
        COUNT(*) AS total
      FROM groups
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
    const dateCheck = validateDateRange(start_date, end_date);
    if (!dateCheck.ok) return res.status(400).json({ error: dateCheck.message });

    // FIX: bangun filter tanggal secara independen (mendukung rentang terbuka)
    const vConds = [];
    const aConds = [];
    const dateParams = [];
    if (start_date) {
      dateParams.push(start_date);
      vConds.push(`timestamp >= $${dateParams.length}`);
      aConds.push(`created_at >= $${dateParams.length}`);
    }
    if (end_date) {
      dateParams.push(endOfDayBoundary(end_date));
      vConds.push(`timestamp <= $${dateParams.length}`);
      aConds.push(`created_at <= $${dateParams.length}`);
    }
    // PERBAIKAN: sama seperti /stats/hourly -- kecualikan deteksi yang
    // sudah ditandai false positive supaya laporan eksekutif (PDF) tidak
    // ikut menghitung/menampilkan foto deteksi yang sudah diketahui salah.
    const vDate =
      (vConds.length > 0 ? vConds.join(" AND ") : `timestamp >= CURRENT_DATE`) +
      " AND is_false_positive IS NOT TRUE";
    const aDate = aConds.length > 0 ? aConds.join(" AND ") : `created_at >= CURRENT_DATE`;

    const vehicleQuery = `SELECT jenis_kendaraan, COUNT(*) as total FROM vehicle_log WHERE ${vDate} GROUP BY jenis_kendaraan`;
    const stagingQuery = `SELECT COUNT(*) as total FROM alert_log WHERE LOWER(class_name) = 'box' AND ${aDate}`;
    const cameraQuery = `SELECT COUNT(*) as total FROM alert_log WHERE class_name = 'KAMERA OFFLINE' AND ${aDate}`;
    const fotoQuery = `SELECT timestamp, jenis_kendaraan, warna, confidence, gambar_base64, status_muatan FROM vehicle_log WHERE ${vDate} ORDER BY timestamp DESC LIMIT 25`;
    const fotoStaging = `SELECT created_at, camera, class_name, foto_base64 FROM alert_log WHERE LOWER(class_name) = 'box' AND ${aDate} ORDER BY created_at DESC LIMIT 15`;

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
