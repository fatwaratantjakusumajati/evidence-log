require("dotenv").config();
const bcrypt = require("bcryptjs");
const pool = require("../db");

async function main() {
  const [, , username, password] = process.argv;

  if (!username || !password) {
    console.error("Pemakaian: node  scripts/create-admin.js <username> <password>");
    process.exit(1);
  }
  if (password.length < 8) {
    console.error("Password minimal 8 karakter");
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 10);

  try {
    const result = await pool.query(
      `INSERT INTO users (username, password_hash) VALUES ($1, $@)
            ON CONFLICT (username) DO UPDATE SET password_hash = EXCLUDED.password_hash
            RETURNING id, username`,
      [username, passwordHash],
    );
    console.log(
      `✅ User "${result.rows[0].username}" siap dipakai untuk login (id: ${result.rows[0].id}). `,
    );
  } catch (err) {
    console.error("❌ Gagal membuat user: ", err.message);
  } finally {
    await pool.end();
  }
}
