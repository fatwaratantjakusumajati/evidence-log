const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const pool = require("../db");
const { JWT_SECRET, requireAuth, requireAdmin } = require("../middleware/auth");
const logger = require("../utils/logger");
const { recordAudit } = require("../utils/auditLog");

const attemptsByIp = new Map();
const MAX_ATTEMPTS = 10;
const WINDOW_MS = 15 * 60 * 1000;

// PERBAIKAN: sebelumnya entry di attemptsByIp tidak pernah dihapus setelah
// window waktunya lewat -- Map ini terus bertambah selamanya selagi server
// jalan (kebocoran memori kecil tapi terus-menerus). Sekarang dibersihkan
// setiap 15 menit, membuang entry yang window-nya sudah lewat.
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of attemptsByIp) {
    if (now - entry.firstAttempt > WINDOW_MS) {
      attemptsByIp.delete(ip);
    }
  }
}, WINDOW_MS).unref();

function isRateLimited(ip) {
  const now = Date.now();
  const entry = attemptsByIp.get(ip);
  if (!entry || now - entry.firstAttempt > WINDOW_MS) {
    attemptsByIp.set(ip, { count: 1, firstAttempt: now });
    return false;
  }
  entry.count += 1;
  return entry.count > MAX_ATTEMPTS;
}

router.post("/login", async (req, res) => {
  try {
    if (!JWT_SECRET) {
      return res.status(500).json({ error: "Server belum dikonfigurasi (JWT_SECRET kosong)" });
    }

    const ip = req.ip || req.socket.remoteAddress || "unknown";
    if (isRateLimited(ip)) {
      return res.status(429).json({ error: "Terlalu banyak percobaan login, coba lagi nanti" });
    }

    const { username, password } = req.body;
    if (!username?.trim() || !password) {
      return res.status(400).json({ error: "Username dan password wajib diisi!" });
    }

    const result = await pool.query(
      "SELECT id, username, password_hash, role FROM users WHERE username = $1",
      [username.trim()],
    );

    const user = result.rows[0];

    const hashToCompare =
      user?.password_hash || "$2a$10$invalidsaltinvalidsaltinvalidsaltinvalidsaltuXO";
    const passwordMatches = await bcrypt.compare(password, hashToCompare);

    if (!user || !passwordMatches) {
      return res.status(401).json({ error: "Username atau password anda salah" });
    }

    // Token berlaku 30 menit, tapi diperpanjang otomatis di background selama
    // user masih aktif berinteraksi (lihat idle-timer di __root.tsx + endpoint
    // /refresh) -- jadi user aktif tidak pernah ke-logout paksa, sementara user
    // yang benar-benar diam >30 menit akan kena expired sungguhan.
    const token = jwt.sign(
      { userId: user.id, username: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: "30m" },
    );

    res.json({ token, username: user.username, role: user.role });
  } catch (err) {
    logger.error("Login error: ", err);
    res.status(500).json({ error: "Gagal memproses login" });
  }
});

// GET: daftar semua user (admin-only)
router.get("/users", requireAuth, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, username, role, created_at FROM users ORDER BY created_at ASC",
    );
    res.json(result.rows);
  } catch (err) {
    logger.error("Gagal ambil daftar user: ", err);
    res.status(500).json({ error: "Gagal mengambil daftar user" });
  }
});

// POST: daftarkan user baru (admin-only)
router.post("/register", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { username, password, role } = req.body;

    if (!username?.trim() || !password) {
      return res.status(400).json({ error: "Username dan password wajib diisi" });
    }
    if (!/^[a-zA-Z0-9_.]{3,50}$/.test(username.trim())) {
      return res.status(400).json({
        error: "Username 3-50 karakter, hanya huruf/angka/underscore/titik",
      });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: "Password minimal 8 karakter" });
    }
    const finalRole = role === "admin" ? "admin" : "staff";
    const passwordHash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      "INSERT INTO users (username, password_hash, role) VALUES ($1, $2, $3) RETURNING id, username, role, created_at",
      [username.trim(), passwordHash, finalRole],
    );

    recordAudit({
      req,
      action: "create_user",
      targetType: "user",
      targetLabel: result.rows[0].username,
      details: { role: finalRole },
    });

    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === "23505") {
      return res.status(409).json({ error: "Username sudah dipakai" });
    }
    logger.error("Gagal daftar user", err);
    res.status(500).json({ error: "Gagal mendaftarkan user" });
  }
});

// DELETE: hapus user (admin-only)
router.delete("/users/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    if (Number(id) === req.user.userId) {
      return res.status(400).json({ error: "Tidak bisa menghapus akun sendiri" });
    }

    const countResult = await pool.query("SELECT COUNT(*)::int AS total FROM users");
    if (countResult.rows[0].total <= 1) {
      return res.status(400).json({ error: "Tidak bisa menghapus user terakhir" });
    }

    const targetResult = await pool.query("SELECT username FROM users WHERE id = $1", [id]);
    await pool.query("DELETE FROM users WHERE id = $1", [id]);

    recordAudit({
      req,
      action: "delete_user",
      targetType: "user",
      targetLabel: targetResult.rows[0]?.username || `id:${id}`,
    });

    res.json({ success: true });
  } catch (err) {
    logger.error("Gagal hapus user: ", err);
    res.status(500).json({ error: "Gagal menghapus user" });
  }
});

// PUT: ganti password
router.put("/change-password", requireAuth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: "Password lama dan baru wajib diisi" });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ error: "Password baru minimal 8 karakter" });
    }

    const result = await pool.query("SELECT password_hash FROM users WHERE id = $1", [
      req.user.userId,
    ]);
    const user = result.rows[0];
    if (!user) {
      return res.status(404).json({ error: "User tidak ditemukan" });
    }

    const matches = await bcrypt.compare(currentPassword, user.password_hash);
    if (!matches) {
      return res.status(401).json({ error: "Password lama salah" });
    }

    const newHash = await bcrypt.hash(newPassword, 10);
    await pool.query("UPDATE users SET password_hash = $1 WHERE id = $2", [
      newHash,
      req.user.userId,
    ]);

    res.json({ success: true });
  } catch (err) {
    logger.error("Gagal ganti password: ", err);
    res.status(500).json({ error: "Gagal mengganti password" });
  }
});

// POST: perpanjang token (silent refresh) selama token LAMA masih valid.
// PENTING: fitur baru ini memperbaiki masalah usability nyata -- sebelumnya
// token cuma berlaku 30 menit dan TIDAK ADA cara memperpanjang selain login
// ulang total, jadi siapapun yang membuka dashboard untuk monitoring seharian
// dipaksa login ulang tiap 30 menit. Endpoint ini dipanggil diam-diam dari
// frontend sebelum token lama kadaluwarsa, selama user masih memakai app.
router.post("/refresh", requireAuth, async (req, res) => {
  try {
    const token = jwt.sign(
      { userId: req.user.userId, username: req.user.username, role: req.user.role },
      JWT_SECRET,
      { expiresIn: "30m" },
    );
    res.json({ token, username: req.user.username, role: req.user.role });
  } catch (err) {
    logger.error("Gagal refresh token: ", err);
    res.status(500).json({ error: "Gagal memperpanjang sesi" });
  }
});

module.exports = router;
