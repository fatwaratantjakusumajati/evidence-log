const express = require('express');
const router = express.Router();
const pool = require('../db');

// GET semua vehicle_logs
router.get('/logs', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM vehicle_log ORDER BY entry_time DESC`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET semua vehicles
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM vehicle_log ORDER BY created_at DESC`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET log kendaraan per jam hari ini
router.get('/stats/hourly', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        TO_CHAR(DATE_TRUNC('hour', entry_time), 'HH24:MI') AS hour,
        COUNT(*) FILTER (WHERE status = 'masuk') AS masuk,
        COUNT(*) FILTER (WHERE status = 'keluar') AS keluar
      FROM vehicle_log
      WHERE entry_time >= CURRENT_DATE
      GROUP BY DATE_TRUNC('hour', entry_time)
      ORDER BY DATE_TRUNC('hour', entry_time)
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message});
  }
});

module.exports = router;