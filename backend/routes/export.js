const express = require('express');
const router = express.Router();
const pool = require('../db');
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

console.log('✅ Export API routes loaded (Compact Cards & Right Title)');

// --- CARI LOGO DENGAN BERBAGAI NAMA & EKSTENSI ---
const possiblePaths = [
    path.join(process.cwd(), 'assets', 'aristides-logo.png'),
    path.join(process.cwd(), 'assets', 'aristides-logo.jpg'),
    path.join(process.cwd(), 'assets', 'aristides-logo.jpeg'),
    path.join(process.cwd(), 'assets', 'aristides-logo.webp'),
    path.join(process.cwd(), 'assets', 'logo.png'),
    path.join(process.cwd(), 'assets', 'logo.jpg'),
];

let logoPathFound = null;
for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
        logoPathFound = p;
        break;
    }
}

let logoBase64 = '';
if (logoPathFound) {
    try {
        const logoBuffer = fs.readFileSync(logoPathFound);
        logoBase64 = `data:image/${path.extname(logoPathFound).replace('.', '')};base64,${logoBuffer.toString('base64')}`;
        console.log(`✅ LOGO BERHASIL DIMUAT! Ditemukan di: ${logoPathFound}`);
    } catch (err) {
        console.error('❌ Logo ditemukan, tapi gagal dibaca:', err.message);
    }
} else {
    console.warn('⚠️ LOGO TIDAK DITEMUKAN! Pastikan folder "assets" ada di sejajar server.js, dan berisi "aristides-logo.png" atau "logo.png"');
}

router.get('/full-report', async (req, res) => {
  try {
    // Ambil 30 data terbaru dari masing-masing tabel
    const vehicleQuery = `
      SELECT timestamp, jenis_kendaraan, warna, confidence, gambar_base64 
      FROM vehicle_log ORDER BY timestamp DESC LIMIT 30`;
    
    const stagingQuery = `
      SELECT camera, class_name, first_detected, created_at, foto_base64 
      FROM alert_log WHERE LOWER(class_name) = 'box' ORDER BY created_at DESC LIMIT 30`;
    
    const cameraQuery = `
      SELECT camera, created_at 
      FROM alert_log WHERE class_name = 'KAMERA OFFLINE' ORDER BY created_at DESC LIMIT 30`;

    const [vehicles, stagings, cameras] = await Promise.all([
      pool.query(vehicleQuery),
      pool.query(stagingQuery),
      pool.query(cameraQuery)
    ]);

    // --- HTML UNTUK KARTU KENDARAAN ---
    let vehicleHtml = '';
    vehicles.rows.forEach(v => {
      vehicleHtml += `
        <div class="card">
          <div class="card-image"><img src="data:image/jpeg;base64,${v.gambar_base64}" /></div>
          <div class="card-body">
            <div class="card-title">${v.jenis_kendaraan}</div>
            <div class="card-detail"><span>Warna:</span> ${v.warna}</div>
            <div class="card-detail"><span>Waktu:</span> ${new Date(v.timestamp).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' })}</div>
            <div class="card-confidence">Akurasi: ${(v.confidence * 100).toFixed(1)}%</div>
          </div>
        </div>
      `;
    });

    // --- HTML UNTUK KARTU STAGING ---
    let stagingHtml = '';
    stagings.rows.forEach(s => {
      const duration = Math.floor((new Date(s.created_at) - new Date(s.first_detected)) / 60000);
      stagingHtml += `
        <div class="card">
          <div class="card-image"><img src="data:image/jpeg;base64,${s.foto_base64}" /></div>
          <div class="card-body">
            <div class="card-title"><span class="badge-box">${s.class_name || 'Tidak teridentifikasi'}</span></div>
            <div class="card-detail"><span>Kamera:</span> ${s.camera}</div>
            <div class="card-detail"><span>Waktu:</span> ${new Date(s.created_at).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' })}</div>
            <div class="card-detail"><span>Durasi:</span> ${duration} menit</div>
          </div>
        </div>
      `;
    });

    // --- HTML UNTUK TABEL KAMERA ---
    let cameraHtml = '';
    if (cameras.rows.length > 0) {
      cameraHtml = `
        <div class="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>No</th>
                <th>Nama Kamera</th>
                <th>Waktu Mati</th>
              </tr>
            </thead>
            <tbody>
              ${cameras.rows.map((c, i) => `
                <tr>
                  <td>${i + 1}</td>
                  <td><strong>${c.camera}</strong></td>
                  <td>${new Date(c.created_at).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' })}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
    } else {
      cameraHtml = `<p class="empty-state">Belum ada laporan kamera mati dalam rentang waktu ini.</p>`;
    }

    // --- TEMPLATE HTML UTAMA ---
    const html = `
      <html>
      <head>
        <style>
          /* GLOBAL RESET & TYPOGRAPHY */
          body { 
              font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; 
              background: #f1f5f9; 
              margin: 0; 
              padding: 30px; 
              color: #1e293b; 
              -webkit-font-smoothing: antialiased;
          }
          .page-container { 
              max-width: 1200px; 
              margin: 0 auto; 
              background: #ffffff; 
              border-radius: 20px; 
              padding: 40px; 
              box-shadow: 0 10px 30px -10px rgba(0,0,0,0.08); 
          }

          /* HEADER - FLEXBOX (KIRI LOGO, KANAN JUDUL) */
          .header { 
              display: flex;
              align-items: center; 
              padding-bottom: 20px; 
              margin-bottom: 30px; 
              border-bottom: 2px solid #e2e8f0; 
          }
          .header-left { 
              display: flex; 
              align-items: center; 
              gap: 15px; 
          }
          .header-left img { 
              height: 80px; width: auto; max-width: 250px; object-fit: contain; display: block; 
          }
          .header-left .company-name { 
              font-size: 18px; font-weight: 700; color: #0f172a; 
          }

          .header-right { 
              margin-left: auto; /* Ini akan mendorong konten ke paling kanan */
              text-align: right;
              display: flex;
              flex-direction: column;
              align-items: flex-end; 
          }
          .header-right h1 { 
              margin: 0; 
              font-size: 22px; 
              font-weight: 700; 
              color: #0f172a; 
          }
          .header-right p { 
              margin: 4px 0 0; 
              font-size: 13px; 
              color: #64748b; 
          }

          /* SECTION TITLES - DIUBAH: HAPUS EMOJI */
          .section-title { 
              font-size: 18px; font-weight: 600; 
              margin: 35px 0 20px 0; 
              color: #0f172a; 
              display: flex; 
              align-items: center; 
              gap: 12px; 
          }
          .section-title .accent-line { display: inline-block; width: 5px; height: 20px; background: #2563eb; border-radius: 10px; }

          /* --- GRID DIPERKECIL (200px agar padat) --- */
          .grid { 
              display: grid; 
              grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); 
              gap: 16px; 
              justify-content: center;
          }
          .card { 
              background: #ffffff; 
              border: 1px solid #e2e8f0; 
              border-radius: 12px; 
              overflow: hidden; 
              box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); 
              page-break-inside: avoid; 
              display: flex;
              flex-direction: column;
          }
          .card-image { height: 140px; background: #f8fafc; position: relative; overflow: hidden; border-bottom: 1px solid #f1f5f9; }
          .card-image img { width: 100%; height: 100%; object-fit: cover; }

          .card-body { padding: 12px; flex: 1; display: flex; flex-direction: column; justify-content: flex-start; }
          .card-title { font-weight: 600; font-size: 14px; color: #0f172a; margin-bottom: 10px; }
          .card-detail { font-size: 12px; color: #475569; margin-bottom: 4px; line-height: 1.4; }
          .card-detail span { font-weight: 500; color: #1e293b; }
          
          .badge-box { background: #dbeafe; color: #1d4ed8; padding: 2px 10px; border-radius: 16px; font-size: 11px; font-weight: 600; }
          .card-confidence { 
              background: #f1f5f9; 
              color: #475569; 
              padding: 4px 10px; 
              border-radius: 12px; 
              font-size: 11px; 
              font-weight: 500; 
              display: inline-block; 
              margin-top: 6px; 
              align-self: flex-start;
          }

          /* TABLE - Clean Corporate */
          .table-wrapper { border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 1px 2px 0 rgba(0,0,0,0.05); }
          table { width: 100%; border-collapse: collapse; font-size: 14px; }
          thead { background: #f8fafc; border-bottom: 2px solid #e2e8f0; }
          th { text-align: left; padding: 16px 20px; color: #64748b; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; font-size: 12px; }
          td { padding: 14px 20px; border-bottom: 1px solid #f1f5f9; color: #334155; }
          tr:nth-child(even) { background: #fafbfc; }
          tr:last-child td { border-bottom: none; }
          .empty-state { text-align: center; color: #94a3b8; padding: 30px; }

          /* FOOTER */
          .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #e2e8f0; text-align: center; font-size: 12px; color: #94a3b8; }

          /* PRINT SETTINGS */
          @page { size: A4 landscape; margin: 20px; }
          @media print { 
              body { background: white; padding: 0; } 
              .page-container { box-shadow: none; border-radius: 0; padding: 20px; } 
          }
        </style>
      </head>
      <body>
        <div class="page-container">
          <!-- HEADER FLEXBOX -->
          <div class="header">
            <div class="header-left">
              ${logoBase64 ? `<img src="${logoBase64}" alt="Logo Perusahaan" />` : ''}
              <span class="company-name">PT Aristides Logistik Indonesia</span>
            </div>
            <div class="header-right">
              <h1>Laporan Lengkap Monitoring</h1>
              <p>Dicetak: ${new Date().toLocaleString('id-ID', { dateStyle: 'full', timeStyle: 'short' })}</p>
            </div>
          </div>
          
          <!-- LOG KENDARAAN - TANPA EMOJI -->
          <div class="section-title"><span class="accent-line"></span>Log Kendaraan Terbaru</div>
          <div class="grid">${vehicleHtml || '<p class="empty-state">Belum ada data kendaraan.</p>'}</div>

          <!-- LOG STAGING - TANPA EMOJI -->
          <div class="section-title"><span class="accent-line"></span>Deteksi Barang Staging Terbaru</div>
          <div class="grid">${stagingHtml || '<p class="empty-state">Belum ada data staging.</p>'}</div>

          <!-- LOG KAMERA - TANPA EMOJI -->
          <div class="section-title"><span class="accent-line"></span>Laporan Kamera Mati Terbaru</div>
          ${cameraHtml}

          <!-- FOOTER -->
          <div class="footer">PT Aristides Logistik Indonesia · Sistem Monitoring Terintegrasi</div>
        </div>
      </body>
      </html>
    `;

    // --- Generate PDF dengan grayscale (hitam putih) ---
    const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdfBuffer = await page.pdf({ 
      format: 'A4', 
      landscape: true, 
      printBackground: true,
      grayscale: true  // <-- Ditambahkan untuk membuat PDF hitam putih
    });
    await browser.close();

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="laporan_lengkap.pdf"');
    res.send(pdfBuffer);
  } catch (err) {
    console.error('❌ Error generate PDF:', err);
    res.status(500).json({ error: 'Gagal generate laporan lengkap' });
  }
});

module.exports = router;