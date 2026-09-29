const express = require("express");
const router = express.Router();
const pool = require("../db");
const { clampLimit } = require("../utils/pagination");
const { sendServerError } = require("../utils/errors");
const { requireAdmin } = require("../middleware/auth");
const { recordAudit } = require("../utils/auditLog");

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// GET: Ambil semua penerima laporan email (dengan pagination)
router.get("/", async (req, res) => {
  try {
    const { page = 1, limit: rawLimit = 20 } = req.query;
    const limit = clampLimit(rawLimit, { defaultLimit: 20, maxLimit: 100 });
    const offset = (Number(page) - 1) * limit;

    const dataQuery = "SELECT * FROM report_recipients ORDER BY id ASC LIMIT $1 OFFSET $2";
    const countQuery = "SELECT COUNT(*) AS total FROM report_recipients";

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

// POST: Tambah penerima laporan baru
router.post("/", requireAdmin, async (req, res) => {
  try {
    const { nama, email, aktif } = req.body;
    if (!nama?.trim() || !email?.trim()) {
      return res.status(400).json({ error: "Nama dan email wajib diisi" });
    }
    if (!EMAIL_RE.test(email.trim())) {
      return res.status(400).json({ error: "Format email tidak valid" });
    }
    const isActive = aktif !== undefined ? aktif : true;
    await pool.query("INSERT INTO report_recipients (nama, email, aktif) VALUES ($1, $2, $3)", [
      nama.trim(),
      email.trim().toLowerCase(),
      isActive,
    ]);
    recordAudit({
      req,
      action: "create_report_recipient",
      targetType: "report_recipient",
      targetLabel: `${nama.trim()} (${email.trim().toLowerCase()})`,
    });
    res.status(201).json({ success: true });
  } catch (err) {
    sendServerError(res, err);
  }
});

// PUT: Edit email/status aktif penerima berdasarkan ID
router.put("/:id", requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { email, aktif } = req.body;

    if (email !== undefined) {
      if (!email?.trim() || !EMAIL_RE.test(email.trim())) {
        return res.status(400).json({ error: "Format email tidak valid" });
      }
    }

    const result = await pool.query(
      `UPDATE report_recipients
       SET email = COALESCE($1, email), aktif = COALESCE($2, aktif)
       WHERE id = $3`,
      [email ? email.trim().toLowerCase() : null, aktif !== undefined ? aktif : null, id],
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Penerima tidak ditemukan" });
    }
    recordAudit({
      req,
      action: "update_report_recipient",
      targetType: "report_recipient",
      targetLabel: `id:${id}`,
      details: { email, aktif },
    });
    res.json({ success: true });
  } catch (err) {
    sendServerError(res, err);
  }
});

// DELETE: Hapus penerima laporan berdasarkan ID
router.delete("/:id", requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const target = await pool.query("SELECT nama, email FROM report_recipients WHERE id = $1", [
      id,
    ]);
    await pool.query("DELETE FROM report_recipients WHERE id = $1", [id]);
    recordAudit({
      req,
      action: "delete_report_recipient",
      targetType: "report_recipient",
      targetLabel: target.rows[0] ? `${target.rows[0].nama} (${target.rows[0].email})` : `id:${id}`,
    });
    res.json({ success: true });
  } catch (err) {
    sendServerError(res, err);
  }
});

// POST: kirim laporan mingguan SEKARANG JUGA (untuk uji coba, tidak menunggu
// jadwal cron tiap Senin 07:00). Mengembalikan detail sukses/gagal per email.
router.post("/test-send", requireAdmin, async (req, res) => {
  try {
    const { sendWeeklyReport } = require("../utils/scheduledReports");
    const result = await sendWeeklyReport();
    res.json(result);
  } catch (err) {
    sendServerError(res, err, "Gagal mengirim laporan uji coba");
  }
});

module.exports = router;
