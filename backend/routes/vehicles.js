const express = require('express');
const router = express.Router();
const pool = require('../db');

// GET semua vehicle_logs
router.get('/logs', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM vehicle_logs ORDER BY entry_time DESC'
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
      'SELECT * FROM vehicles ORDER BY created_at DESC'
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;