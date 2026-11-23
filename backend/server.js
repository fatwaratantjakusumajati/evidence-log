const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");
const rateLimit = require("express-rate-limit");
require("dotenv").config();

const REQUIRED_ENV_VARS = ["JWT_SECRET", "DB_HOST", "DB_PORT", "DB_NAME", "DB_USER", "DB_PASSWORD"];
const missingEnvVars = REQUIRED_ENV_VARS.filter((key) => !process.env[key]);
if (missingEnvVars.length > 0) {
  console.error(
    `\n❌ Server gagal dijalankan: environment variable berikut belum di-set di file .env:\n` +
      missingEnvVars.map((v) => `   - ${v}`).join("\n") +
      `\n\nLengkapi dulu file backend/.env, lalu jalankan ulang server.\n`,
  );
  process.exit(1);
}
const { requireAuth, verifyTokenString } = require("./middleware/auth");
const logger = require("./utils/logger");

const app = express();

app.set("trust proxy", 1);

const corsOrigins = (process.env.CORS_ORIGIN || "http://localhost:3000")
  .split(",")
  .map((o) => o.trim());
app.use(cors({ origin: corsOrigins }));
// Body JSON dibatasi default 100kb; endpoint ingest tracking membawa foto base64,
// jadi parsernya diatur sendiri di routes/tracking.js (limit 10mb).
app.use((req, res, next) =>
  req.path === "/api/tracking/ingest" ? next() : express.json()(req, res, next),
);
app.set("etag", false);

app.use("/api", (_req, res, next) => {
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.set("Pragma", "no-cache");
  res.set("Expires", "0");
  next();
});
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 400,
  standardHeaders: true,
  legacyHeaders: false,
  message: { eror: "Terlalu banyak request, coba lagi sebentar lagi. " },
});
app.use("/api", apiLimiter);

// Login (publik, tidak butuh token)
app.use("/api/auth", require("./routes/auth"));

const healthPool = require("./db");
app.get("/api/health", async (_req, res) => {
  const startedAt = Date.now();
  try {
    await healthPool.query("SELECT 1");
    res.json({
      status: "ok",
      uptime_seconds: Math.floor(process.uptime()),
      database: { status: "ok", latency_ms: Date.now() - startedAt },
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    logger.error("Health check database error:", err);
    res.status(503).json({
      status: "degraded",
      uptime_seconds: Math.floor(process.uptime()),
      database: { status: "error" },
      timestamp: new Date().toISOString(),
    });
  }
});

// Semua /api/* lainnya wajib login, KKECUALI /api/events (SSE)
app.use("/api", (req, res, next) => {
  // Route yang dipanggil n8n memakai x-ingest-key (bukan login user)
  const PUBLIC_API_PATHS = [
    "/events",
    "/documents/ingest",
    "/documents/ingest/aruco",
    "/tracking/ingest",
  ];
  if (PUBLIC_API_PATHS.includes(req.path)) return next();
  return requireAuth(req, res, next);
});

// Route API
app.use("/api/alerts", require("./routes/alerts"));
app.use("/api/vehicles", require("./routes/vehicles"));
app.use("/api/notifications", require("./routes/notifications"));
app.use("/api/wa-recipients", require("./routes/wa-recipients"));
app.use("/api/report-recipients", require("./routes/report-recipients"));
app.use("/api/audit-log", require("./routes/audit-log"));
app.use("/api/export", require("./routes/export"));
app.use("/api/documents", require("./routes/documents"));
app.use("/api/tracking", require("./routes/tracking"));

// --- KONFIGURASI SSE (REAL-TIME) ---
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
  const token = req.query.token;
  const user = verifyTokenString(req.query.token);
  if (!user) {
    return res.status(401).json({ error: "Unauthorized: Token tidak valid atau kadaluarsa" });
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
let listenerRetryTimer;
function scheduleListenerReconnect() {
  if (listenerRetryTimer) return;
  listenerRetryTimer = setTimeout(() => {
    listenerRetryTimer = undefined;
    connectNotificationListener();
  }, 5000);
  listenerRetryTimer.unref?.();
}

function connectNotificationListener() {
  listenerPool.connect((err, client, done) => {
    if (err) {
      scheduleListenerReconnect();
      logger.error("❌ Gagal connect listener DB:", err);
      return;
    }

    let released = false;
    const releaseAndReconnect = (clientError) => {
      if (released) return;
      released = true;
      done(clientError);
      scheduleListenerReconnect();
    };
    client.on("error", releaseAndReconnect);
    client.on("end", () => releaseAndReconnect());

    // PERBAIKAN: 2 query LISTEN ini sebelumnya ditembak bersamaan tanpa
    // menunggu yang pertama selesai -- pg tidak izinkan itu di satu koneksi
    // yang sama (makanya muncul DeprecationWarning "client already executing
    // a query"). Sekarang dijalankan berurutan.
    client
      .query("LISTEN vehicle_log_event")
      .then(() => client.query("LISTEN alert_log_event"))
      .then(() => client.query("LISTEN pallet_event"))
      .catch((listenErr) => logger.error("❌ Gagal setup LISTEN:", listenErr));

    // Saat ada notifikasi dari PostgreSQL
    client.on("notification", (msg) => {
      if (
        msg.channel === "vehicle_log_event" ||
        msg.channel === "alert_log_event" ||
        msg.channel === "pallet_event"
      ) {
        let payload;
        try {
          payload = JSON.parse(msg.payload);
        } catch (parseErr) {
          logger.error(`Invalid JSON notification from ${msg.channel}:`, parseErr);
          return;
        }
        if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
          logger.error(`Invalid notification payload from ${msg.channel}`);
          return;
        }
        logger.info(
          `📡 Real-time update dari ${msg.channel}:`,
          payload.jenis_kendaraan || payload.class_name || payload.event_type,
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
}

connectNotificationListener();

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
    return res.status(500).json({ error: "Terjadi kesalahan pada server." });
  }
  next();
});

const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, () => logger.info(`🚀 Server berjalan di port ${PORT}`));

// === FIX KEEP-ALIVE RACE ===
// Node default keepAliveTimeout = 5s. Browser Chrome default idle pool = 6 menit.
// Kombinasi + SSE yang menahan koneksi lama = browser pakai koneksi "zombie"
// yang sudah ditutup server → request menggantung ("Provisional headers").
// Solusi: keepAliveTimeout server HARUS lebih tinggi dari yang diharapkan client,
// dan headersTimeout HARUS lebih tinggi dari keepAliveTimeout (aturan Node.js).
server.keepAliveTimeout = 65000; // 65 detik
server.headersTimeout = 66000; // WAJIB > keepAliveTimeout
server.requestTimeout = 0; // 0 = jangan putus request (penting untuk SSE)
server.timeout = 0; // 0 = jangan timeout socket (penting untuk SSE)
