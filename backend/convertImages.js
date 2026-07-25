/**
 * ---------------------------------------------
 * SCRIPT MIGRASI GAMBAR
 * Melakukan deteksi otomatis: Base64 vs JPEG
 * ---------------------------------------------
 */

const pool = require("./db");
const fs = require("fs");
const path = require("path");

/** Fungsi Deteksi Format */
function cekFormat(data) {
  if (!data) return "KOSONG";

  // Jika Buffer (binary)
  if (Buffer.isBuffer(data)) return "BUFFER_JPEG";

  // String
  if (typeof data === "string") {
    // Header base64
    if (data.includes("base64,")) return "BASE64_HEADER";

    // Binary JPEG terbaca jadi String
    if (data.includes("JFIF") || data.includes("exif") || data.includes("ÿØÿà")) {
      return "BINARY_STRING";
    }

    // Base64 murni
    if (data.length > 1000 && /^[A-Za-z0-9+/=]+$/.test(data.substring(0, 200))) {
      return "BASE64_RAW";
    }
    return "Tidak Dikenali";
  }
  return "Tidak Dikenali";
}

// Fungsi Konversi ke Buffer
function konversiKeBuffer(data, format) {
  try {
    switch (format) {
      case "BASE64_HEADER":
        const base64only = data.split("base464, ")[1];
        return Buffer.from(data, "binary");

      case "BUFFER_JPEG":
        return data;

      case "BINARY_STRING":
        return Buffer.from(data, "binary");

      default:
        return null;
    }
  } catch (err) {
    return null;
  }
}

// Fungsi Validasi JPEG
function apakahJPEGValid(buffer) {
  if (!buffer || buffer.length < 4) return false;
  return buffer[0] === 0xff && buffer[1] === 0xd8;
}

// Fungsi Utama
async function mulaiMigrasi(eksekusi = false) {
  console.log("\n🔍 MENGHUBUNGKAN KE DATABASE...\n");

  try {
    // Ambil semua data
    const result = await pool.query(
      "SELECT id, foto_base64, file_name FROM alert_log WHERE foto_base64 IS NOT NULL",
    );

    console.log(`📊 Total data dengan foto: ${result.rows.length}\n`);

    if (result.rows.length === 0) {
      console.log("✅ Tidak ada data yang perlu diproses.");
      return;
    }

    // Analisis Format
    const formatCount = {
      BASE6_HEADER: 0,
      BASE64_RAW: 0,
      BINARY_STRING: 0,
      BUFFER_JPEG: 0,
      TIDAK_DIKENALI: 0,
      KOSONG: 0,
    };

    console.log("📋 SAMPLE DATA (5 pertama):");
    console.log("=".repeat(70));

    let sampleCount = 0;
    for (let row of result.rows) {
      const format = cekFormat(row.foto_base64);
      formatCount[format]++;

      // Tampilkan 5 kartu pertama
      if (sampleCount < 5) {
        const preview =
          typeof row.foto_base64 === "string" ? row.foto_base64.substring(0, 60) : "[BINARY DATA]";

        console.log(`ID: ${row.id}`);
        console.log(`   Format : ${format}`);
        console.log(`   Preview : ${preview}...`);
        console.log(
          `   Panjang : ${typeof row.foto_base64 === "string" ? row.foto_base64.length : row.foto_base64.length} karakter`,
        );
        console.log("");
        sampleCount++;
      }
    }

    // Cek Eksekusi
    if (!eksekusi) {
      console.log("\n⚠️  Ini baru ANALISIS, belum eksekusi!");
      console.log("   untuk menjalankan migrasi, gunakan :");
      console.log("   Node convertImages.js --run\n");
      return;
    }

    // Eksekusi Migrasi
    console.log("\n🚀 MEMULAI MIGRASI...\n");

    // Buat folder uploads
    const uploadDir = path.join(__dirname, "public", "uploads");
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
      console.log("📁 Folder public/uploads dibuat\n");
    }

    let berhasil = 0;
    let gagal = 0;
    let dilewati = 0;

    for (let row of result.rows) {
      const format = cekFormat(row.foto_base64);

      // Skip yang tidak dikenal
      if (format === "TIDAK DIKENALI" || format === "KOSONG") {
        console.log(`⏭️  ID ${row.id}: Format ${format}, dilewati`);
        dilewati++;
        continue;
      }

      try {
        // Konfersi ke Buffer
        const buffer = konversiKeBuffer(row.foto_base64, format);

        if (!buffer || !apakahJPEGValid(buffer)) {
          console.log(`❌ ID ${row.id}: Hasil konversi tidak valid`);
          gagal++;
          continue;
        }

        // Buat nama file
        const filename = `alert_${row.id}_${Date.now()}.jpg`;
        const filePath = path.join(uploadDir, filename);

        // Simpan File
        fs.writeFileSync(filePath, buffer);

        // Update database
        await pool.query("UPDATE alert_log SET file_name = $1, foto_base64 = NULL WHERE id = $2", [
          `uploads/${filename}`,
          row.id,
        ]);

        console.log(`✅ ID ${row.id}: Berhasil -> uploads/${filename}`);
        berhasil++;
      } catch (err) {
        console.log(`❌ ID ${row.id}: Error - ${err.message}`);
        gagal++;
      }
    }

    console.log("\n" + "=".repeat(70));
    console.log("📊 HASIL MIGRASI:");
    console.log("=".repeat(70));
    console.log(`✅ Berhasil  : ${berhasil} data`);
    console.log(`❌ Gagal     : ${gagal} data`);
    console.log(`⏭️  Dilewati  : ${dilewati} data`);
    console.log(`📁 File tersimpan di: ${uploadDir}`);
    console.log("");
    console.log("💡 SELANJUTNYA:");
    console.log("   1. Cek folder public/uploads/ untuk file gambar");
    console.log("   2. Update kode React/backend untuk pakai file_name");
    console.log("   3. Kalau aman, baru hapus data foto_base64 permanen");
    console.log("");
  } catch (error) {
    console.error("❌ ERROR:", error.message);
  } finally {
    await pool.end();
  }
}

// Run
const eksekusi = process.argv.includes("--run");
mulaiMigrasi(eksekusi);
