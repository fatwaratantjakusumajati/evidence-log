// Smoke test untuk middleware/auth.js.
//
// LATAR BELAKANG: beberapa kali kejadian kode ini rusak gara-gara typo pas
// copy-paste manual -- misal "next;" (lupa tanda kurung, jadi TIDAK PERNAH
// benar-benar memanggil next()) atau "reactUse.status(...)" (nama variabel
// ngaco, harusnya "res"). Bug semacam ini SAH secara syntax (node -c tidak
// akan komplain) tapi bikin middleware diam-diam gagal jalan -- gejalanya
// baru ketauan belakangan sebagai "tombol muter terus tanpa henti" di UI.
//
// Test di file ini menjalankan middleware dengan req/res/next palsu dan
// mengecek middleware BENERAN memanggil next() atau BENERAN mengirim
// response -- jadi bug seperti itu ketahuan dalam hitungan detik lewat
// `npm test`, bukan pas sudah dipakai user.
//
// Jalankan: npm test   (atau: node --test test/)

const test = require("node:test");
const assert = require("node:assert/strict");

// requireAuth & requireAdmin baca process.env.JWT_SECRET SEKALI pas file
// di-require, jadi env var ini harus di-set SEBELUM require modulnya.
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret-untuk-smoke-test-saja";

const jwt = require("jsonwebtoken");
const { requireAuth, requireAdmin } = require("../middleware/auth");

function buatMockResponse() {
  const res = {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
  return res;
}

test("requireAuth menolak request tanpa header Authorization (401)", () => {
  const req = { headers: {} };
  const res = buatMockResponse();
  let nextCalled = false;

  requireAuth(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false, "next() TIDAK boleh dipanggil kalau tidak ada token");
  assert.equal(res.statusCode, 401);
});

test("requireAuth menolak token yang tidak valid (401)", () => {
  const req = { headers: { authorization: "Bearer token-ngasal-yang-salah" } };
  const res = buatMockResponse();
  let nextCalled = false;

  requireAuth(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 401);
});

test("requireAuth meloloskan token valid dan mengisi req.user", () => {
  const token = jwt.sign({ userId: 1, username: "test", role: "admin" }, process.env.JWT_SECRET, {
    expiresIn: "5m",
  });
  const req = { headers: { authorization: `Bearer ${token}` } };
  const res = buatMockResponse();
  let nextCalled = false;

  requireAuth(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true, "next() HARUS dipanggil kalau token valid");
  assert.equal(req.user.username, "test");
});

test("requireAdmin menolak role staff (403) dan TIDAK memanggil next()", () => {
  const req = { user: { userId: 2, username: "staffuser", role: "staff" } };
  const res = buatMockResponse();
  let nextCalled = false;

  requireAdmin(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false, "next() TIDAK boleh dipanggil untuk role staff");
  assert.equal(res.statusCode, 403);
});

test("requireAdmin meloloskan role admin (memanggil next())", () => {
  // Ini test yang langsung menangkap bug "next;" (tanpa kurung) dan
  // "reactUse.status(...)" yang pernah kejadian -- kalau next() diam-diam
  // tidak terpanggil, assert di bawah ini akan GAGAL dengan jelas.
  const req = { user: { userId: 1, username: "adminuser", role: "admin" } };
  const res = buatMockResponse();
  let nextCalled = false;

  requireAdmin(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true, "next() HARUS dipanggil untuk role admin");
  assert.equal(res.statusCode, null, "tidak boleh ada response error terkirim untuk admin");
});
