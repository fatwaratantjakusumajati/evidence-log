const express = require('express');
const router = express.Router();
const pool = require('../db');

// ============================================================
// GET semua vehicle_log (urut terbaru dulu)
// Dipakai frontend: GET /api/vehicles/log
// ============================================================
router.get('/log', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
         id,
         timestamp,
         jenis_kendaraan,
         warna,
         rgb_r, rgb_g, rgb_b,
         confidence,
         bbox_x1, bbox_y1, bbox_x2, bbox_y2,
         gambar_base64,
         created_at
       FROM vehicle_log
       ORDER BY timestamp DESC`
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error GET /log:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// GET log kendaraan per jam, untuk hari ini saja
// Dipakai frontend: GET /api/vehicles/stats/hourly
// Catatan: tabel ini TIDAK punya kolom status ('masuk'/'keluar'),
// jadi statistik per jam hanya berupa TOTAL deteksi per jam.
// ============================================================
router.get('/stats/hourly', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        TO_CHAR(DATE_TRUNC('hour', timestamp), 'HH24:MI') AS hour,
        COUNT(*) AS total
      FROM vehicle_log
      WHERE timestamp >= CURRENT_DATE
      GROUP BY DATE_TRUNC('hour', timestamp)
      ORDER BY DATE_TRUNC('hour', timestamp)
    `);
    res.json(result.rows);
  } catch (err) {
    console.error('Error GET /stats/hourly:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// GET rekap mingguan per jenis kendaraan + warna (opsional,
// berguna untuk laporan Sabtu nanti juga, bisa dipakai n8n)
// ============================================================
router.get('/stats/weekly', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        jenis_kendaraan,
        warna,
        COUNT(*) AS total
      FROM vehicle_log
      WHERE timestamp >= NOW() - INTERVAL '7 days'
      GROUP BY jenis_kendaraan, warna
      ORDER BY total DESC
    `);
    res.json(result.rows);
  } catch (err) {
    console.error('Error GET /stats/weekly:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
