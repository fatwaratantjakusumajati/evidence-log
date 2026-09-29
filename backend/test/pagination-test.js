// Unit test untuk utils/pagination.js. Fungsi ini kecil tapi dipakai di
// banyak endpoint (termasu audit-log yang baru) untuk mencegah orang minta
// limit=999999999 dan bikin query berat -- kalau logicnya rusak, efeknya
// nyebar ke semua endpoint yang pakai paginasi.
//
// Jalankan: npm test

const test = require("node:test");
const assert = require("node:assert/strict");
const { clampLimit } = require("../utils/pagination");

test("clampLimit pakai default kalau input kosong/undefined", () => {
  assert.equal(clampLimit(undefined), 20);
  assert.equal(clampLimit(undefined, { defaultLimit: 15 }), 15);
});

test("clampLimit pakai default kalau input bukan angka valid", () => {
  assert.equal(clampLimit("abc"), 20);
  assert.equal(clampLimit(null), 20);
  assert.equal(clampLimit({}), 20);
});

test("clampLimit pakai default kalau input <= 0 (mencegah limit negatif/nol)", () => {
  assert.equal(clampLimit(0), 20);
  assert.equal(clampLimit(-5), 20);
});

test("clampLimit membulatkan ke bawah kalau input desimal", () => {
  assert.equal(clampLimit(10.9), 10);
});

test("clampLimit memotong ke maxLimit kalau input kebesaran (cegah query berat)", () => {
  assert.equal(clampLimit(999999), 100);
  assert.equal(clampLimit(999999, { maxLimit: 50 }), 50);
});

test("clampLimit meloloskan angka valid apa adanya", () => {
  assert.equal(clampLimit(30), 30);
  assert.equal(clampLimit("30"), 30);
});
