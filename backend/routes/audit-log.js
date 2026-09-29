const express = require("express");
const router = express.Router();
const pool = require("../db");
const { clampLimit } = require("../utils/pagination");
const { sendServerError } = require("../utils/errors");
const { requireAdmin } = require("../middleware/auth");

// GET: daftar aktivitas admin (admin-only), diurutkan dari yang terbaru.
router.get("/", requireAdmin, async (req, res) => {
  try {
    const { page = 1, limit: rawLimit = 20 } = req.query;
    const limit = clampLimit(rawLimit, { defaultLimit: 20, maxLimit: 100 });
    const offset = (Number(page) - 1) * limit;

    const dataQuery = `
      SELECT id, actor_username, action, target_type, target_label, details, created_at
      FROM audit_log
      ORDER BY created_at DESC
      LIMIT $1 OFFSET $2
    `;
    const countQuery = "SELECT COUNT(*)::int AS total FROM audit_log";

    const [dataResult, countResult] = await Promise.all([
      pool.query(dataQuery, [limit, offset]),
      pool.query(countQuery),
    ]);

    res.json({
      data: dataResult.rows,
      total: countResult.rows[0].total,
      page: Number(page),
      limit,
    });
  } catch (err) {
    sendServerError(res, err, "Gagal mengambil audit log");
  }
});

module.exports = router;
