const express = require('express');
const router = express.Router();
const pool = require('../db');

// GET semua alert_log
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM alert_log ORDER BY created_at DESC'
    );
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

module.exports = router;