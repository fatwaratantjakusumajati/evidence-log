const express = require("express");
const router = express.Router();
const pool = require("../db");
const logger = require("../utils/logger");

router.get("/feed", async (req, res) => {
  try {
    // Query 1: Ambil 10 kendaraan terbaru
    const vehicleQuery = `
      SELECT 
        'vehicle'::text as type, 
        id::text, 
        timestamp as event_time, 
        jenis_kendaraan::text as title, 
        warna::text as detail, 
        gambar_base64::text as image, 
        confidence::text as metadata
      FROM vehicle_log 
      ORDER BY timestamp DESC LIMIT 10
    `;

    // Query 2: Ambil 10 Staging terbaru
    const stagingQuery = `
      SELECT 
        'staging'::text as type, 
        id::text, 
        created_at as event_time, 
        class_name::text as title, 
        camera::text as detail, 
        foto_base64::text as image, 
        alert_level::text as metadata
      FROM alert_log 
      WHERE LOWER(class_name) LIKE '%box%' OR LOWER(class_name) LIKE '%staging%'
      ORDER BY created_at DESC LIMIT 10
    `;

    // Query 3: Ambil 10 Kamera Mati terbaru
    const cameraQuery = `
      SELECT 
        'camera'::text as type, 
        id::text, 
        created_at as event_time, 
        camera::text as title, 
        'KAMERA MATI'::text as detail, 
        null::text as image, 
        null::text as metadata
      FROM alert_log 
      WHERE LOWER(class_name) LIKE '%offline%' OR LOWER(class_name) LIKE '%mati%'
      ORDER BY created_at DESC LIMIT 10
    `;

    // Gabungkan dan urutkan berdasarkan waktu (paling baru di atas)
    const unionQuery = `
      (${vehicleQuery}) 
      UNION ALL 
      (${stagingQuery}) 
      UNION ALL 
      (${cameraQuery}) 
      ORDER BY event_time DESC LIMIT 20
    `;

    const result = await pool.query(unionQuery);
    res.json(result.rows);
  } catch (err) {
    // Cetak error detail di terminal backend
    logger.error("❌ ERROR DETAIL DI LIVE.JS:");
    logger.error(err);

    // Kembalikan error 500 dengan pesan yang lebih jelas
    const isDev = process.env.NODE_ENV !== "production";
    res.status(500).json({
      error: "Gagal mengambil live feed",
      detail: isDev ? err.message : undefined,
      stack: isDev ? err.stack : undefined,
    });
  }
});

module.exports = router;
