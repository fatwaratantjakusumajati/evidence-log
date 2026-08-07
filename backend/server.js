const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");
const rateLimit = require("express-rate-limit");
require("dotenv").config();
const { requireAuth, verifyTokenString } = require("./middleware/auth");
const logger = require("./utils/logger");

const app = express();

// Wajib diaktifkan karena app ini bisa diakses lewat cloudflare Tunnel
// tanpa ini, express mengira semua request datang dari IP yang sama (IP milik cloudflared), bukan IP asli user
app.set("trust proxy", 1);

// CORS origin sekarang dari env (pisahkan koma untuk multi-origin)
const corsOrigins = (process.env.CORS_ORIGIN || "http://localhost:8081")
  .split(",")
  .map((o) => o.trim());
app.use(cors({ origin: corsOrigins }));
app.use(express.json());
// Rate limit umum untuk semua /api/*, batasnya sengaja longgar (400 request/menit per IP) karena
// llive feed dan dashboard polling tiap 3-10 detik dan beberapa user bisa berbagi IP kantor yang sama.
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 400,
  standardHeaders: true,
  legacyHeaders: false,
  message: { eror: "Terlalu banyak request, coba lagi sebentar lagi. " },
});
app.use("/api", apiLimiter);

const path = require("path");

if (!process.env.SNAPSHOT_DIR) {
  logger.warn("⚠️  SNAPSHOT_DIR belum di-set di .env — endpoint /snapshots tidak akan berfungsi.");
}
app.use(
  "/snapshots",
  express.static(process.env.SNAPSHOT_DIR || path.join(__dirname, "snapshots")),
);

//Login (publik, tidak butuh token)
app.use("/api/auth", require("./routes/auth"));

// Semua /api/* lainnya wajib login, KKECUALI /api/events (SSE)
app.use("/api", (req, res, next) => {
  if (req.path === "/events") return next();
  return requireAuth(req, res, next);
});

// Route API
app.use("/api/alerts", require("./routes/alerts"));
app.use("/api/vehicles", require("./routes/vehicles"));
app.use("/api/live", require("./routes/live"));
app.use("/api/notifications", require("./routes/notifications"));
app.use("/api/wa-recipients", require("./routes/wa-recipients"));
app.use("/api/export", require("./routes/export"));
// app.use("/api/attendance", require("./routes/attendance"));

// --- KONFIGURASI SSE (REAL-TIME) ---
// Buat koneksi DB khusus untuk mendengarkan event (tidak boleh pakai pool biasa)
const listenerPool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

// Buat array untuk menyimpan koneksi client yang sedang membuka SSE
let clients = [];

// Function to send event to all connected clients
function sendEventToAll(data) {
  clients.forEach((client) => {
    client.res.write(`data: ${JSON.stringify(data)}\n\n`);
  });
}

// Endpoint SSE
app.get("/api/events", async (req, res) => {
  const user = verifyTokenString(req.query.token);
  if (!user) {
    return res.status(401).json({ error: "Unauthorized: silahkan login" });
  }
  // Setup SSE headers
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "Access-Control-Allow-Origin": "*",
  });

  // Simpan koneksi client
  const clientId = Date.now();
  const newClient = { id: clientId, res };
  clients.push(newClient);

  // Kirim heartbeat setiap 15 detik agar koneksi tidak putus
  const heartbeat = setInterval(() => {
    res.write(": heartbeat\n\n");
  }, 15000);

  // Jika client menutup koneksi (refresh browser), hapus dari list
  req.on("close", () => {
    clearInterval(heartbeat);
    clients = clients.filter((c) => c.id !== clientId);
  });
});

// --- LISTENER POSTGRESQL ---
listenerPool.connect((err, client, done) => {
  if (err) {
    logger.error("❌ Gagal connect listener DB:", err);
    return;
  }

  // Listen ke channel vehicle_log_event
  client.query("LISTEN vehicle_log_event");
  client.query("LISTEN alert_log_event");

  // Saat ada notifikasi dari PostgreSQL
  client.on("notification", (msg) => {
    if (msg.channel === "vehicle_log_event" || msg.channel === "alert_log_event") {
      const payload = JSON.parse(msg.payload);
      logger.info(
        `📡 Real-time update dari ${msg.channel}:`,
        payload.jenis_kendaraan || payload.class_name,
      );

      // Kirim ke semua client frontend yang terhubung
      sendEventToAll({
        channel: msg.channel,
        data: payload,
      });
    }
  });

  client.on("error", (err) => {
    logger.error("❌ Listener DB Error:", err);
  });
});

// Route awal
app.get("/", (req, res) => res.json({ message: "API berjalan!!!" }));

// Global error handler -> supaya error dari midlleware seperti multer
// (misal file upload kelewat besar) tetap balik sebagai JSON, bukan
// halaman HTML error bawaan Express yang bikin frontend gagal parse JSON
app.use((err, req, res, next) => {
  if (err?.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({ error: "Ukuran file terlalu besar (Maksimal 8 mb per foto)." });
  }
  if (err?.code === "LIMIT_FILE_COUNT") {
    return res.status(413).json({ error: "Terlalu banyak file (maksimal 20 foto)." });
  }
  if (err) {
    logger.error("Unhandled error:", err);
    return res.status(500).json({ error: err.message || "Terjadi kesalahan pada server." });
  }
  next();
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => logger.info(`🚀 Server berjalan di port ${PORT}`));
