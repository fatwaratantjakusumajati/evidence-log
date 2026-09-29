const express = require("express");
const router = express.Router();
const pool = require("../db");
const { clampLimit } = require("../utils/pagination");
const { sendServerError } = require("../utils/errors");
const { requireAdmin } = require("../middleware/auth");
const { recordAudit } = require("../utils/auditLog");

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
router.post("/", requireAdmin, async (req, res) => {
  try {
    const {
      nama,
      nomor,
      aktif,
      akses_staging,
      akses_laporan_harian,
      akses_laporan_mingguan,
      akses_chatbot,
    } = req.body;
    if (!nama?.trim() || !nomor?.trim()) {
      return res.status(400).json({ error: "Nama dan nomor wajib diisi" });
    }
    if (!/^[0-9]{10,15}$/.test(nomor.trim())) {
      return res.status(400).json({ error: "Format nomor WA tidak valid (10-15 digit) " });
    }
    const isActive = aktif !== undefined ? aktif : true;
    await pool.query(
      `INSERT INTO wa_recipients
         (nama, nomor, aktif, akses_staging, akses_laporan_harian, akses_laporan_mingguan, akses_chatbot)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        nama.trim(),
        nomor.trim(),
        isActive,
        akses_staging ?? true,
        akses_laporan_harian ?? false,
        akses_laporan_mingguan ?? false,
        akses_chatbot ?? false,
      ],
    );
    recordAudit({
      req,
      action: "create_wa_recipient",
      targetType: "wa_recipient",
      targetLabel: `${nama.trim()} (${nomor.trim()})`,
    });
    res.status(201).json({ success: true });
  } catch (err) {
    sendServerError(res, err);
  }
});

// PUT: Edit nomor & hak akses kontak berdasarkan ID (partial update -- field
// yang tidak dikirim tidak akan berubah, cocok buat toggle akses satu-satu
// dari halaman Pengaturan tanpa perlu kirim ulang semua data kontak)
router.put("/:id", requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { nomor, akses_staging, akses_laporan_harian, akses_laporan_mingguan, akses_chatbot } =
      req.body;

    if (nomor !== undefined) {
      if (!nomor?.trim() || !/^[0-9]{10,15}$/.test(nomor.trim())) {
        return res
          .status(400)
          .json({ error: "Format nomor WA tidak valid (10-15 digit dan angka 0-9 saja) " });
      }
    }

    const result = await pool.query(
      `UPDATE wa_recipients SET
         nomor = COALESCE($1, nomor),
         akses_staging = COALESCE($2, akses_staging),
         akses_laporan_harian = COALESCE($3, akses_laporan_harian),
         akses_laporan_mingguan = COALESCE($4, akses_laporan_mingguan),
         akses_chatbot = COALESCE($5, akses_chatbot)
       WHERE id = $6`,
      [
        nomor ? nomor.trim() : null,
        akses_staging !== undefined ? akses_staging : null,
        akses_laporan_harian !== undefined ? akses_laporan_harian : null,
        akses_laporan_mingguan !== undefined ? akses_laporan_mingguan : null,
        akses_chatbot !== undefined ? akses_chatbot : null,
        id,
      ],
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Kontak tidak ditemukan" });
    }
    recordAudit({
      req,
      action: "update_wa_recipient",
      targetType: "wa_recipient",
      targetLabel: `id:${id}`,
      details: {
        ...(nomor !== undefined && { nomor_baru: nomor.trim() }),
        ...(akses_staging !== undefined && { akses_staging }),
        ...(akses_laporan_harian !== undefined && { akses_laporan_harian }),
        ...(akses_laporan_mingguan !== undefined && { akses_laporan_mingguan }),
        ...(akses_chatbot !== undefined && { akses_chatbot }),
      },
    });
    res.json({ success: true });
  } catch (err) {
    sendServerError(res, err);
  }
});

// DELETE: Hapus kontak WhatsApp berdasarkan ID
router.delete("/:id", requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const target = await pool.query("SELECT nama, nomor FROM wa_recipients WHERE id = $1", [id]);
    await pool.query("DELETE FROM wa_recipients WHERE id = $1", [id]);
    recordAudit({
      req,
      action: "delete_wa_recipient",
      targetType: "wa_recipient",
      targetLabel: target.rows[0] ? `${target.rows[0].nama} (${target.rows[0].nomor})` : `id:${id}`,
    });
    res.json({ success: true });
  } catch (err) {
    sendServerError(res, err);
  }
});

module.exports = router;
