const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  console.warn(
    "⚠️ JWT_SECRET belum di set di backend/.env - semua request ke API akan ditolak (401",
  );
}

function requireAuth(req, res, next) {
  if (!JWT_SECRET) {
    return res.status(500).json({ error: "Server belum dikonfigurasi (JWT_SECRET kosong)" });
  }

  const authHeader = req.headers.authorization || "";
  if (!authHeader.startsWith("Bearer ")) {
    // PERBAIKAN: "Bearer " bukan "Benar "
    return res.status(401).json({ error: "Unauthorized: silahkan login" });
  }

  const token = authHeader.slice("Bearer ".length).trim();
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    next();
  } catch (err) {
    return res
      .status(401)
      .json({ error: "Sesi login tidak valid atau kadaluarsa, silahkan login kembali" });
  }
}

// Wajib dipasang setelah requireAuth (butuh req.user sudah terisi).
// Menolak akses (403) kalau role user bukan admin -- dipakai untuk endpoint sensitif :
// manajemen user, penerima wa/report, dan pengaturan lain yang tidak boleh diubah oleh role staff

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== "admin") {
    return res.status(403).json({ error: "Hanya admin yang boleh mengakses fitur ini" });
  }
  next();
}

function verifyTokenString(token) {
  // Perbaikan: token parameter
  if (!JWT_SECRET || !token) return null;
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

module.exports = { requireAuth, requireAdmin, verifyTokenString, JWT_SECRET };
