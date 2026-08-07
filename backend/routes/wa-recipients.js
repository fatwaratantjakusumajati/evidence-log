const express = require("express");
const router = express.Router();
const pool = require("../db");
const { error } = require("node:console");
const { clampLimit } = require("../utils/pagination");
const { sendServerError } = require("../utils/errors");

// GET: Ambil semua kontak WhatsApp (dengan pagination)
router.get("/", async (req, res) => {
  try {
    const { page = 1, limit: rawLimit = 20 } = req.query;
    const limit = clampLimit(rawLimit, { defaultLimit: 20, maxLimit: 100 });
    const offset = (Number(page) - 1) * limit;

    const dataQuery = "SELECT * FROM wa_recipients ORDER BY id ASC LIMIT $1 OFFSET $2";
    const countQuery = "SELECT COUNT(*) AS total FROM wa_recipients";

    const [dataResult, totalResult] = await Promise.all([
      pool.query(dataQuery, [limit, offset]),
      pool.query(countQuery),
    ]);

    const total = parseInt(totalResult.rows[0].total, 10);

    res.json({
      data: dataResult.rows,
      total,
      page: Number(page),
      limit: Number(limit),
      totalPages: Math.max(1, Math.ceil(total / Number(limit))),
    });
  } catch (err) {
    sendServerError(res, err);
  }
});

// POST: Tambah kontak WhatsApp baru
router.post("/", async (req, res) => {
  try {
    const { nama, nomor, aktif } = req.body;
    if (!nama?.trim() || !nomor?.trim()) {
      return res.status(400).json({ error: "Nama dan nomor wajib diisi" });
    }
    if (!/^[0-9]{10,15}$/.test(nomor.trim())) {
      return res.status(400).json({ error: "Format nomor WA tidak valid (10-15 digit) " });
    }
    const isActive = aktif !== undefined ? aktif : true;
    await pool.query("INSERT INTO wa_recipients (nama, nomor, aktif) VALUES ($1, $2, $3)", [
      nama,
      nomor,
      nama.trim(),
      nomor.trim(),
      isActive,
    ]);
    res.status(201).json({ success: true });
  } catch (err) {
    sendServerError(res, err);
  }
});

// PUT: Edit nomor kontak berdasarkan ID
router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { nomor } = req.body;

    if (!nomor?.trim()) {
      return req.status(400).json({ error: "Nomor wajib diisi" });
    }
    if (!/^[0-9]{10,15}$/.test(nomor.trim())) {
      return res
        .status(400)
        .json({ error: "Format nomor WA tidak valid (10-15 digit dan angka 0-9 saja) " });
    }

    const result = await pool.query("UPDATE wa_recipients SET nomor = $1 WHERE id = $2", [
      nomor.trim(),
      id,
    ]);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Kontak tidak ditemukan" });
    }
    res.json({ success: true });
  } catch (err) {
    sendServerError(res, err);
  }
});

// DELETE: Hapus kontak WhatsApp berdasarkan ID
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query("DELETE FROM wa_recipients WHERE id = $1", [id]);
    res.json({ success: true });
  } catch (err) {
    sendServerError(res, err);
  }
});

module.exports = router;
