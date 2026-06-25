const express = require('express');
const router = express.Router();
const pool = require('../db');

// GET: Ambil semua kontak WhatsApp
router.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM wa_recipients ORDER BY id ASC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST: Tambah kontak WhatsApp baru
router.post('/', async (req, res) => {
  try {
    const { nama, nomor, aktif } = req.body;
    const isActive = aktif !== undefined ? aktif : true;
    await pool.query('INSERT INTO wa_recipients (nama, nomor, aktif) VALUES ($1, $2, $3)', [nama, nomor, isActive]);
    res.status(201).json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT: Edit nomor kontak berdasarkan ID
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { nomor } = req.body;
    await pool.query('UPDATE wa_recipients SET nomor = $1 WHERE id = $2', [nomor, id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE: Hapus kontak WhatsApp berdasarkan ID
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM wa_recipients WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;