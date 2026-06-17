const express = require('express');
const router = express.Router();
const pool = require('../db');

// GET semua alert_log (dengan optional filter class_name)
router.get('/', async (req, res) => {
  try {
    const { class_name } = req.query;
    let query = 'SELECT * FROM alert_log';
    const params = [];
    if (class_name) {
      query += ' WHERE class_name = $1';
      params.push(class_name);
    }
    query += ' ORDER BY created_at DESC';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET alert by ID
router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM alert_log WHERE id = $1', [req.params.id]
    );
    if (result.rows.length === 0)
      return res.status(404).json({ error: 'Tidak ditemukan' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET deteksi barang mingguan
router.get('/stats/weekly', async (req, res) => {
  try {
    const result = await pool.query(`SELECT 
        TO_CHAR(created_at, 'Dy') AS day,
        COUNT(*) AS barang
      FROM alert_log
      WHERE created_at >= NOW() - INTERVAL '7 days'
      GROUP BY TO_CHAR(created_at, 'Dy'), DATE_TRUNC('day', created_at)
      ORDER BY DATE_TRUNC('day', created_at)`);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message});
  }
});

// GET status kamera
router.get('/stats/camera-status', async (req, res) => {
  try {
    const result = await pool.query(`SELECT COUNT(DISTINCT camera) AS mati FROM camera_log WHERE created_at >= NOW() - INTERVAL '1 day'
    `);
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message});
  }
});

module.exports = router;