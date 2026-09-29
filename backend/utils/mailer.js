const nodemailer = require("nodemailer");

// Konfigurasi  transporter SMTP
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.gmail.com",
  port: process.env.SMTP_PORT || 587,
  secure: false, // true untuk port 465, false untuk port lain
  auth: {
    user: process.env.SMTP_USER, // Email pengirim
    pass: process.env.SMTP_PASS, // App Password (bukan password jika memakai gmail)
  },
});

/**
 * Fungsi helper untuk mengirim email otomatis
 * @param {string} to - Email penerima
 * @param {string} subject - Subjek email
 * @param {string} html - Isi email dalam format HTML
 */
const sendEmail = async ({ to, subject, html }) => {
  try {
    const info = await transporter.sendMail({
      from: `"System Alert" <${process.env.SMTP_USER}>`,
      to,
      subject,
      html,
    });

    console.log("Email berhasil dikirim: %s", info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error("Gagal mengirim email:", error);
    return { success: false, error: error.message };
  }
};

module.exports = { sendEmail };
