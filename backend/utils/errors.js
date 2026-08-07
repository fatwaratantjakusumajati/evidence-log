const { error } = require("node:console");
const logger = require("./logger");

function sendServerError(res, err, context = "") {
  logger.error(`${context || "Unhandled error"}:`, err);
  const isDev = process.env.NODE_ENV !== "production";
  res.status(500).json({
    error: isDev
      ? err.message
      : "Terjadi kesalahan pada server. Silahkan coba lagi dalam waktu sesaat.",
  });
}

module.exports = { sendServerError };
