// Smoke test: pastikan semua file route/utils backend bisa di-require tanpa
// error. Ini menangkap kesalahan yang lolos dari `node -c` (yang cuma cek
// syntax) tapi baru muncul saat file BENERAN dijalankan -- misal referensi
// ke variabel/fungsi yang tidak ada, salah nama saat require file lain, dll.
//
// Catatan: file-file ini bikin koneksi database (pool) saat di-require,
// tapi itu tidak blocking dan errornya sudah ditangkap sendiri di db.js
// (lihat .catch di sana) -- jadi test ini tetap aman dijalankan walau
// database sedang tidak menyala, dan tidak akan menggantung/hang.
//
// Jalankan: npm test   (atau: node --test test/)

const test = require("node:test");
const assert = require("node:assert/strict");

process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret-untuk-smoke-test-saja";

const ROUTE_MODULES = [
  "../middleware/auth.js",
  "../routes/auth.js",
  "../routes/alerts.js",
  "../routes/vehicles.js",
  "../routes/notifications.js",
  "../routes/wa-recipients.js",
  "../routes/report-recipients.js",
  "../routes/export.js",
  "../routes/audit-log.js",
  "../utils/auditLog.js",
  "../utils/pagination.js",
  "../utils/errors.js",
];

for (const modulePath of ROUTE_MODULES) {
  test(`module "${modulePath}" bisa di-require tanpa error`, () => {
    assert.doesNotThrow(() => {
      // require() di-cache Node, jadi tiap modul cuma benar-benar
      // dieksekusi sekali meski dipanggil dari banyak test.
      require(modulePath);
    });
  });
}
