const { Pool } = require("pg");
require("dotenv").config();
const logger = require("./utils/logger");

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

pool
  .query("SELECT 1")
  .then(() => logger.info("Terhubung ke PostgreSQL"))
  .catch((err) => logger.error("Gagal koneksi:", err.message));

module.exports = pool;
