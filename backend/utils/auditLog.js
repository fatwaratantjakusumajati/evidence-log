const pool = require("../db");
const logger = require("./logger");

// Mencatat satu baris aktivitas admin ke tabel audit_log. Dipanggil dari
// endpoint-endpoint yang mengubah data sensitif (user, penerima WA, penerima
// laporan). Sengaja "fire and forget" (tidak di-await sebelum response
// dikirim ke client, dan kalau gagal cuma di-log) -- audit log itu penting,
// tapi kegagalan mencatatnya TIDAK BOLEH bikin aksi utama (misal hapus user)
// ikut gagal juga.
async function recordAudit({ req, action, targetType, targetLabel, details }) {
  try {
    await pool.query(
      `INSERT INTO audit_log (actor_id, actor_username, action, target_type, target_label, details)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        req.user?.userId ?? null,
        req.user?.username ?? "unknown",
        action,
        targetType,
        targetLabel ?? null,
        details ? JSON.stringify(details) : null,
      ],
    );
  } catch (err) {
    logger.error("Gagal mencatat audit log (aksi tetap dianggap berhasil):", err.message);
  }
}

module.exports = { recordAudit };
