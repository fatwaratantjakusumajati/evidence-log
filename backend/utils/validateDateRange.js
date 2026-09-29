const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// JS Date secara diam-diam "menggeser" tanggal yang nggak eksis di kalender
// (misal "2026-02-31" jadi 3 Maret) alih-alih menganggapnya invalid. Fungsi
// ini mengecek ulang komponen tahun/bulan/tanggal hasil parse HARUS sama
// persis dengan yang diketik user, supaya tanggal ngasal beneran ditolak.
function isTanggalEksis(dateStr) {
  const d = new Date(dateStr + "T00:00:00Z");
  if (Number.isNaN(d.getTime())) return false;
  const [y, m, day] = dateStr.split("-").map(Number);
  return d.getUTCFullYear() === y && d.getUTCMonth() + 1 === m && d.getUTCDate() === day;
}

/**
 * Batas akhir hari untuk filter "sampai tanggal Y" di query SQL.
 *
 * PERBAIKAN: sebelumnya tiap route bikin sendiri string `end_date + " 23:59:59"`
 * lalu dibandingkan pakai `<=`. Itu menyisakan celah kecil: baris dengan jam
 * PERSIS 23:59:59 tapi ada pecahan detiknya (mis. 23:59:59.482, yang normal
 * terjadi karena timestamp datang dari kamera/CV script, bukan diketik manual)
 * jatuh SETELAH "23:59:59" polos, sehingga ketinggalan dari hasil filter --
 * padahal jelas-jelas masih di tanggal yang sama. Helper ini dipakai bareng
 * operator `<=` seperti sebelumnya tapi menutup celah itu dengan menambahkan
 * presisi mikrodetik penuh.
 */
function endOfDayBoundary(dateStr) {
  return `${dateStr} 23:59:59.999999`;
}

/**
 * Validasi start_date/end_date dari query string sebelum dipakai di query DB.
 *
 * Sebelumnya nilai ini langsung dipakai apa adanya (walau lewat parameterized
 * query jadi aman dari SQL injection) -- kalau usernya mengetik URL yang aneh
 * atau format tanggal tidak valid, Postgres akan melempar error di level DB dan
 * endpoint balas 500 generik, bukan pesan yang jelas ke pemanggil. Fungsi ini
 * memastikan hanya format YYYY-MM-DD yang valid dan tanggal yang benar-benar
 * ada (menolak "2026-02-31" dsb) yang diteruskan ke query.
 *
 * @returns {{ ok: true } | { ok: false, message: string }}
 */
function validateDateRange(start_date, end_date) {
  if (!start_date && !end_date) return { ok: true };

  // PERBAIKAN: sebelumnya kalau cuma salah satu (start_date ATAU end_date)
  // yang diisi, ini ditolak dan minta "harus diisi bersamaan" -- padahal di
  // UI, begitu user milih tanggal MULAI doang (belum sempat milih tanggal
  // AKHIR), frontend sudah langsung kirim request. Efeknya filter tanggal
  // kelihatan "tidak jalan sama sekali" karena baru milih 1 tanggal langsung
  // ditolak. Sekarang salah satu boleh kosong (artinya rentang terbuka: dari
  // tanggal X ke depan, atau sampai tanggal Y ke belakang).
  if (start_date && !DATE_RE.test(start_date)) {
    return { ok: false, message: "Format start_date harus YYYY-MM-DD." };
  }
  if (end_date && !DATE_RE.test(end_date)) {
    return { ok: false, message: "Format end_date harus YYYY-MM-DD." };
  }
  if (start_date && !isTanggalEksis(start_date)) {
    return { ok: false, message: "start_date tidak valid (tanggal tidak ada di kalender)." };
  }
  if (end_date && !isTanggalEksis(end_date)) {
    return { ok: false, message: "end_date tidak valid (tanggal tidak ada di kalender)." };
  }

  if (start_date && end_date) {
    const start = new Date(start_date + "T00:00:00Z");
    const end = new Date(end_date + "T00:00:00Z");
    if (start > end) {
      return { ok: false, message: "start_date tidak boleh setelah end_date." };
    }
  }

  return { ok: true };
}

module.exports = { validateDateRange, endOfDayBoundary };
