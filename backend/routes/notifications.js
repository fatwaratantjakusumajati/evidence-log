const express = require('express');
const router = express.Router();
const pool = require('../db');
const { route } = require('./alerts');

// GET semua notifikasi
router.get('/', async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT * FROM notifications ORDER BY created_at DESC'
        );
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message});
    }
});

module.exports= router;