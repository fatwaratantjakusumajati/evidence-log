// Unit test untuk utils/validateDateRange.js.
//
// LATAR BELAKANG: fungsi ini sebelumnya menolak filter tanggal kalau cuma
// SALAH SATU dari start_date/end_date yang diisi -- padahal di UI, begitu
// user pilih tanggal mulai (belum sempat pilih tanggal akhir), frontend
// sudah langsung kirim request duluan. Efeknya SEMUA filter tanggal di web
// kelihatan "tidak jalan sama sekali". Test ini memastikan bug itu tidak
// balik lagi.
//
// Jalankan: npm test

const test = require("node:test");
const assert = require("node:assert/strict");
const { validateDateRange } = require("../utils/validateDateRange");

test("meloloskan kalau dua-duanya kosong (tidak ada filter tanggal)", () => {
  assert.equal(validateDateRange(undefined, undefined).ok, true);
});

test("meloloskan kalau cuma start_date yang diisi (rentang terbuka ke depan)", () => {
  const result = validateDateRange("2026-01-01", undefined);
  assert.equal(result.ok, true, "seharusnya boleh filter cuma dari tanggal mulai saja");
});

test("meloloskan kalau cuma end_date yang diisi (rentang terbuka ke belakang)", () => {
  const result = validateDateRange(undefined, "2026-01-31");
  assert.equal(result.ok, true, "seharusnya boleh filter cuma sampai tanggal akhir saja");
});

test("meloloskan kalau dua-duanya diisi dengan urutan benar", () => {
  assert.equal(validateDateRange("2026-01-01", "2026-01-31").ok, true);
});

test("menolak kalau start_date setelah end_date", () => {
  const result = validateDateRange("2026-02-01", "2026-01-01");
  assert.equal(result.ok, false);
});

test("menolak format tanggal yang salah", () => {
  assert.equal(validateDateRange("01-01-2026", undefined).ok, false);
  assert.equal(validateDateRange(undefined, "2026/01/31").ok, false);
});

test("menolak tanggal yang formatnya benar tapi tidak eksis (mis. 31 Februari)", () => {
  const result = validateDateRange("2026-02-31", undefined);
  assert.equal(result.ok, false);
});
