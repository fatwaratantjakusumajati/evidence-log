// FITUR BARU: Laporan mingguan otomatis via email.
const cron = require("node-cron");
const pool = require("../db");
const { sendEmail } = require("./mailer");
const logger = require("./logger");

async function buildWeeklyReportHtml() {
  const [detectionRes, vehicleRes, vehicleHistoryRes, cameraRes, stagingRes] = await Promise.all([
    pool.query(
      `SELECT COUNT(*) AS total FROM alert_log
       WHERE class_name = 'box' AND created_at >= NOW() - INTERVAL '7 days'`,
    ),
    pool.query(
      `SELECT jenis_kendaraan, COUNT(*) AS total FROM vehicle_log
       WHERE timestamp >= NOW() - INTERVAL '7 days'
       GROUP BY jenis_kendaraan`,
    ),
    pool.query(
      `SELECT timestamp, jenis_kendaraan, plat_nomor, status_muatan, kamera_nama
       FROM vehicle_log
       WHERE timestamp >= NOW() - INTERVAL '7 days'
       ORDER BY timestamp DESC
       LIMIT 200`,
    ),
    pool.query(
      `WITH events AS (
         SELECT camera, class_name, duration
         FROM alert_log
         WHERE class_name IN ('KAMERA OFFLINE', 'KAMERA ONLINE')
           AND created_at >= NOW() - INTERVAL '7 days'
       )
       SELECT camera,
              COUNT(*) FILTER (WHERE class_name = 'KAMERA OFFLINE') AS offline_count,
              COALESCE(SUM(duration) FILTER (WHERE class_name = 'KAMERA OFFLINE'), 0) AS total_offline_seconds
       FROM events
       GROUP BY camera
       ORDER BY total_offline_seconds DESC
       LIMIT 5`,
    ),
    pool.query(
      `SELECT id, camera, class_name, first_detected, created_at, duration, alert_level, file_name
       FROM alert_log
       WHERE class_name = 'box' 
         AND duration >= 259200
         AND first_detected >= NOW() - INTERVAL '7 days'
       ORDER BY first_detected DESC
       LIMIT 20`,
    ),
  ]);

  const totalDetections = detectionRes.rows[0]?.total || 0;
  const vehicleRows = vehicleRes.rows;
  const totalVehicles = vehicleRows.reduce((s, r) => s + Number(r.total), 0);
  const vehicleBreakdown =
    vehicleRows.map((r) => `${r.jenis_kendaraan}: ${r.total}`).join(", ") || "Tidak ada data";

  const stagingRows = stagingRes.rows;
  const avgDuration = stagingRows.length
    ? Math.round(stagingRows.reduce((s, r) => s + Number(r.duration || 0), 0) / stagingRows.length)
    : 0;
  const avgDurationText =
    avgDuration >= 3600
      ? `${Math.floor(avgDuration / 3600)}j ${Math.floor((avgDuration % 3600) / 60)}m`
      : `${Math.floor(avgDuration / 60)}m`;

  // FORMAT DURASI SINGKAT (satu baris, tanpa line break)
  const formatDurationShort = (detik) => {
    if (!detik || detik <= 0) return "-";
    const jam = Math.floor(detik / 3600);
    const menit = Math.floor((detik % 3600) / 60);
    if (jam > 0) return `${jam}j ${menit}m`;
    return `${menit}m`;
  };

  const stagingHtml = stagingRows.length
    ? stagingRows
        .map((s) => {
          const mulai = new Date(s.first_detected).toLocaleString("id-ID", {
            dateStyle: "medium",
            timeStyle: "short",
          });
          const selesai = s.created_at
            ? new Date(s.created_at).toLocaleString("id-ID", {
                dateStyle: "medium",
                timeStyle: "short",
              })
            : "Masih ada";
          const durasi = formatDurationShort(s.duration);
          const levelColor =
            s.alert_level === "high"
              ? "#ef4444"
              : s.alert_level === "medium"
                ? "#f59e0b"
                : "#10b981";
          const levelText = s.alert_level?.toUpperCase() || "INFO";
          return `<tr style="border-bottom: 1px solid #f3f4f6;">
              <td style="padding: 12px 14px; font-size: 12px; color: #374151; white-space: nowrap;">${mulai}</td>
              <td style="padding: 12px 14px; font-size: 12px; color: #374151; white-space: nowrap;">${selesai}</td>
              <td style="padding: 12px 14px; font-size: 12px; color: #374151; text-align: center; white-space: nowrap;">${durasi}</td>
              <td style="padding: 12px 14px; font-size: 12px; text-align: center;">
                <span style="background: ${levelColor}20; color: ${levelColor}; padding: 4px 10px; border-radius: 9999px; font-weight: 600; font-size: 11px;">${levelText}</span>
              </td>
              <td style="padding: 12px 14px; font-size: 12px; color: #6b7280;">${s.camera || "-"}</td>
            </tr>`;
        })
        .join("")
    : `<tr><td colspan="5" style="padding: 20px; text-align: center; color: #9ca3af; font-style: italic;">Tidak ada barang staging minggu ini</td></tr>`;

  const vehicleHistoryRows = vehicleHistoryRes.rows;
  const vehicleHistoryHtml = vehicleHistoryRows.length
    ? vehicleHistoryRows
        .map((v) => {
          const waktu = new Date(v.timestamp).toLocaleString("id-ID", {
            dateStyle: "medium",
            timeStyle: "short",
          });
          const plat = v.plat_nomor?.trim() || "-";
          const muatan = v.status_muatan?.trim() || "-";
          return `<tr style="border-bottom: 1px solid #f3f4f6;">
              <td style="padding: 12px 14px; font-size: 12px; color: #374151; white-space: nowrap;">${waktu}</td>
              <td style="padding: 12px 14px; font-size: 12px; color: #374151;">${v.jenis_kendaraan || "-"}</td>
              <td style="padding: 12px 14px; font-size: 12px; font-weight: 600; color: #111827; background: #f0fdf4; border-radius: 6px; text-align: center;">${plat}</td>
              <td style="padding: 12px 14px; font-size: 12px; color: #374151;">${muatan}</td>
              <td style="padding: 12px 14px; font-size: 12px; color: #6b7280;">${v.kamera_nama || "-"}</td>
            </tr>`;
        })
        .join("")
    : `<tr><td colspan="5" style="padding: 20px; text-align: center; color: #9ca3af; font-style: italic;">Tidak ada kendaraan tercatat minggu ini</td></tr>`;
  const vehicleHistoryNote =
    vehicleHistoryRows.length === 200
      ? `<p style="font-size: 12px; color: #9ca3af; margin-top: 10px; text-align: center;">Menampilkan 200 kendaraan terbaru</p>`
      : "";

  const cameraRowsHtml = cameraRes.rows.length
    ? cameraRes.rows
        .map((r) => {
          const durasi = formatDurationShort(Number(r.total_offline_seconds));
          return `<tr style="border-bottom: 1px solid #f3f4f6;">
              <td style="padding: 14px 16px; font-size: 14px; color: #374151;">${r.camera}</td>
              <td style="padding: 14px 16px; font-size: 14px; text-align: center; color: #ef4444; font-weight: 600;">${r.offline_count}x</td>
              <td style="padding: 14px 16px; font-size: 14px; text-align: right; color: #374151; white-space: nowrap;">${durasi}</td>
            </tr>`;
        })
        .join("")
    : `<tr><td colspan="3" style="padding: 20px; text-align: center; color: #9ca3af; font-style: italic;">Tidak ada kamera offline minggu ini 🎉</td></tr>`;

  const periodeMulai = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toLocaleDateString("id-ID");
  const periodeAkhir = new Date().toLocaleDateString("id-ID");

  return `
    <!DOCTYPE html>
    <html lang="id">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin: 0; padding: 0; background-color: #f3f4f6; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">
      <!-- WRAPPER FULLSCREEN -->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f3f4f6; padding: 20px 0;">
        <tr>
          <td align="center">
            <!-- CARD UTAMA (Fullscreen) -->
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width: 1200px; background-color: #ffffff; border-radius: 20px; overflow: hidden; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1);">
              <tr>
                <td style="padding: 0;">
                  <!-- HEADER (Tema Merah-Biru) -->
                  <div style="background: linear-gradient(135deg, #dc2626 0%, #2563eb 100%); padding: 40px 50px; text-align: center;">
                    <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 800; letter-spacing: -0.5px;">📊 Laporan Mingguan</h1>
                    <p style="margin: 12px 0 0; color: #fecaca; font-size: 16px;">Warehouse Intelligence</p>
                    <p style="margin: 6px 0 0; color: #bfdbfe; font-size: 13px;">Periode: ${periodeMulai} - ${periodeAkhir}</p>
                  </div>

                  <!-- KPI CARDS (4 Cards, jarak jauh) -->
                  <div style="padding: 40px 50px 16px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse: separate; border-spacing: 16px;">
                      <tr>
                        <td width="25%" style="background: #fef2f2; border: 1px solid #fee2e2; border-radius: 16px; padding: 24px; text-align: center; vertical-align: top;">
                          <p style="margin: 0; font-size: 12px; color: #dc2626; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">Deteksi Barang</p>
                          <p style="margin: 12px 0 0; font-size: 40px; font-weight: 800; color: #dc2626; line-height: 1;">${totalDetections}</p>
                          <p style="margin: 8px 0 0; font-size: 12px; color: #6b7280;">di Staging</p>
                        </td>
                        <td width="25%" style="background: #eff6ff; border: 1px solid #dbeafe; border-radius: 16px; padding: 24px; text-align: center; vertical-align: top;">
                          <p style="margin: 0; font-size: 12px; color: #2563eb; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">Total Kendaraan</p>
                          <p style="margin: 12px 0 0; font-size: 40px; font-weight: 800; color: #2563eb; line-height: 1;">${totalVehicles}</p>
                          <p style="margin: 8px 0 0; font-size: 12px; color: #6b7280;">Masuk &amp; Keluar</p>
                        </td>
                        <td width="25%" style="background: #fdf2f8; border: 1px solid #fce7f3; border-radius: 16px; padding: 24px; text-align: center; vertical-align: top;">
                          <p style="margin: 0; font-size: 12px; color: #db2777; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">Kamera Offline</p>
                          <p style="margin: 12px 0 0; font-size: 40px; font-weight: 800; color: #db2777; line-height: 1;">${cameraRes.rows.reduce((s, r) => s + Number(r.offline_count), 0)}</p>
                          <p style="margin: 8px 0 0; font-size: 12px; color: #6b7280;">Kejadian</p>
                        </td>
                        <td width="25%" style="background: #f0f9ff; border: 1px solid #e0f2fe; border-radius: 16px; padding: 24px; text-align: center; vertical-align: top;">
                          <p style="margin: 0; font-size: 12px; color: #0284c7; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">Rata-rata Staging</p>
                          <p style="margin: 12px 0 0; font-size: 40px; font-weight: 800; color: #0284c7; line-height: 1;">${avgDurationText}</p>
                          <p style="margin: 8px 0 0; font-size: 12px; color: #6b7280;">${stagingRows.length} barang</p>
                        </td>
                      </tr>
                    </table>
                    <p style="margin: 20px 0 0; font-size: 13px; color: #6b7280; text-align: center; background: #f9fafb; padding: 12px; border-radius: 8px;">${vehicleBreakdown}</p>
                  </div>

                  <!-- TABEL SEJAJAR (Vehicle & Staging) -->
                  <div style="padding: 24px 50px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse: separate; border-spacing: 16px;">
                      <tr>
                        <!-- KOLOM KIRI: Vehicle -->
                        <td valign="top" width="50%">
                          <h2 style="margin: 0 0 16px; font-size: 16px; color: #111827; font-weight: 700; border-bottom: 2px solid #2563eb; padding-bottom: 8px; text-align: center;">🚗 Riwayat Kendaraan</h2>
                          <div style="border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden;">
                            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse: collapse;">
                              <thead>
                                <tr style="background: #f9fafb;">
                                  <th style="padding: 12px 10px; text-align: left; font-size: 10px; font-weight: 700; color: #6b7280; text-transform: uppercase;">Waktu</th>
                                  <th style="padding: 12px 10px; text-align: left; font-size: 10px; font-weight: 700; color: #6b7280; text-transform: uppercase;">Jenis</th>
                                  <th style="padding: 12px 10px; text-align: center; font-size: 10px; font-weight: 700; color: #6b7280; text-transform: uppercase;">Plat</th>
                                  <th style="padding: 12px 10px; text-align: left; font-size: 10px; font-weight: 700; color: #6b7280; text-transform: uppercase;">Muatan</th>
                                  <th style="padding: 12px 10px; text-align: left; font-size: 10px; font-weight: 700; color: #6b7280; text-transform: uppercase;">Kamera</th>
                                </tr>
                              </thead>
                              <tbody>${vehicleHistoryHtml}</tbody>
                            </table>
                          </div>
                          ${vehicleHistoryNote}
                        </td>

                        <!-- KOLOM KANAN: Staging -->
                        <td valign="top" width="50%">
                          <h2 style="margin: 0 0 16px; font-size: 16px; color: #111827; font-weight: 700; border-bottom: 2px solid #dc2626; padding-bottom: 8px; text-align: center;">📦 Barang di Staging</h2>
                          <div style="border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden;">
                            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse: collapse;">
                              <thead>
                                <tr style="background: #f9fafb;">
                                  <th style="padding: 12px 10px; text-align: left; font-size: 10px; font-weight: 700; color: #6b7280; text-transform: uppercase;">Mulai</th>
                                  <th style="padding: 12px 10px; text-align: left; font-size: 10px; font-weight: 700; color: #6b7280; text-transform: uppercase;">Selesai</th>
                                  <th style="padding: 12px 10px; text-align: center; font-size: 10px; font-weight: 700; color: #6b7280; text-transform: uppercase;">Durasi</th>
                                  <th style="padding: 12px 10px; text-align: center; font-size: 10px; font-weight: 700; color: #6b7280; text-transform: uppercase;">Level</th>
                                  <th style="padding: 12px 10px; text-align: left; font-size: 10px; font-weight: 700; color: #6b7280; text-transform: uppercase;">Kamera</th>
                                </tr>
                              </thead>
                              <tbody>${stagingHtml}</tbody>
                            </table>
                          </div>
                        </td>
                      </tr>
                    </table>
                  </div>

                  <!-- TABLE 3: KAMERA OFFLINE (Bawah, full width) -->
                  <div style="padding: 0 50px 40px;">
                    <h2 style="margin: 0 0 16px; font-size: 16px; color: #111827; font-weight: 700; border-bottom: 2px solid #db2777; padding-bottom: 8px; text-align: center;">📷 Top 5 Kamera Paling Sering Offline</h2>
                    <div style="border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden;">
                      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse: collapse;">
                        <thead>
                          <tr style="background: #f9fafb;">
                            <th style="padding: 14px 16px; text-align: left; font-size: 11px; font-weight: 700; color: #6b7280; text-transform: uppercase;">Kamera</th>
                            <th style="padding: 14px 16px; text-align: center; font-size: 11px; font-weight: 700; color: #6b7280; text-transform: uppercase;">Jml Offline</th>
                            <th style="padding: 14px 16px; text-align: right; font-size: 11px; font-weight: 700; color: #6b7280; text-transform: uppercase;">Total Durasi</th>
                          </tr>
                        </thead>
                        <tbody>${cameraRowsHtml}</tbody>
                      </table>
                    </div>
                  </div>

                  <!-- FOOTER -->
                  <div style="background: #f9fafb; padding: 24px 50px; text-align: center; border-top: 1px solid #e5e7eb;">
                    <p style="margin: 0; font-size: 13px; color: #6b7280;">Email ini dikirim otomatis oleh sistem Warehouse Intelligence.</p>
                    <p style="margin: 6px 0 0; font-size: 12px; color: #9ca3af;">PT Aristides Logistik Indonesia</p>
                  </div>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;
}

async function sendWeeklyReport() {
  try {
    const recipientsRes = await pool.query(
      "SELECT email, nama FROM report_recipients WHERE aktif = true",
    );
    if (recipientsRes.rows.length === 0) {
      logger.info("[Laporan Mingguan] Tidak ada penerima aktif, laporan tidak dikirim.");
      return {
        success: false,
        message: "Tidak ada penerima aktif terdaftar.",
        sent: 0,
        failed: [],
      };
    }
    const html = await buildWeeklyReportHtml();
    let sentCount = 0;
    const failed = [];
    for (const r of recipientsRes.rows) {
      const result = await sendEmail({
        to: r.email,
        subject: "Laporan Mingguan - Warehouse Intelligence",
        html,
      });
      if (result.success) {
        sentCount += 1;
        logger.info(`[Laporan Mingguan] Terkirim ke ${r.email}`);
      } else {
        failed.push({ email: r.email, error: result.error });
        logger.error(`[Laporan Mingguan] Gagal kirim ke ${r.email}: ${result.error}`);
      }
    }
    return {
      success: failed.length === 0,
      message:
        failed.length === 0
          ? `Berhasil dikirim ke ${sentCount} penerima.`
          : `Terkirim ke ${sentCount} penerima, gagal ke ${failed.length} penerima.`,
      sent: sentCount,
      failed,
    };
  } catch (err) {
    logger.error("[Laporan Mingguan] Gagal membuat/mengirim laporan:", err);
    return {
      success: false,
      message: err.message || "Gagal membuat/mengirim laporan.",
      sent: 0,
      failed: [],
    };
  }
}

// Jadwal: tiap Senin jam 07:00 WIB.
function startScheduledReports() {
  cron.schedule(
    "0 7 * * 1",
    () => {
      sendWeeklyReport();
    },
    { timezone: "Asia/Jakarta" },
  );
  logger.info("[Laporan Mingguan] Penjadwal aktif (tiap Senin 07:00 WIB).");
}

module.exports = { startScheduledReports, sendWeeklyReport };
