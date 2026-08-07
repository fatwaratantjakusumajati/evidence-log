const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  console.warn(
    "⚠️ JWT_SECRET belum di-set di backend/.env - semua request ke API akan ditolak (401).",
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
      .json({ error: "Sesi login tidak valid atau kadaluwarsa, silahkan login kembali" });
  }
}

function verifyTokenString(token) {
  // PERBAIKAN: token parameter
  if (!JWT_SECRET || !token) return null; // PERBAIKAN: logika benar
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

module.exports = { requireAuth, verifyTokenString, JWT_SECRET };
