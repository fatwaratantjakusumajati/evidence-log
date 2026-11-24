-- Migration: create_support_tables.sql
-- Tabel pendukung: audit log, penerima WhatsApp, penerima laporan, notifikasi.
-- Jalankan setelah create_core_tables.sql. Semua IF NOT EXISTS (idempoten).

-- Riwayat aksi admin (create_user, delete_user, dll.)
CREATE TABLE IF NOT EXISTS audit_log (
    id SERIAL PRIMARY KEY,
    actor_id INT,
    actor_username TEXT,
    action TEXT NOT NULL,
    target_type TEXT NOT NULL,
    target_label TEXT NOT NULL,
    details JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_actor_id ON audit_log (actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log (action);

-- Daftar penerima notifikasi WhatsApp
CREATE TABLE IF NOT EXISTS wa_recipients (
    id SERIAL PRIMARY KEY,
    nama TEXT NOT NULL,
    nomor TEXT NOT NULL,
    aktif BOOLEAN NOT NULL DEFAULT TRUE,
    akses_staging BOOLEAN NOT NULL DEFAULT FALSE,
    akses_laporan_harian BOOLEAN NOT NULL DEFAULT FALSE,
    akses_laporan_mingguan BOOLEAN NOT NULL DEFAULT FALSE,
    akses_chatbot BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wa_recipients_aktif ON wa_recipients (aktif);

-- Daftar penerima laporan lewat email
CREATE TABLE IF NOT EXISTS report_recipients (
    id SERIAL PRIMARY KEY,
    nama TEXT NOT NULL,
    email TEXT NOT NULL,
    aktif BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_report_recipients_aktif ON report_recipients (aktif);

-- Tabel notifikasi dalam aplikasi (skeleton; route saat ini hanya SELECT *)
CREATE TABLE IF NOT EXISTS notifications (
    id SERIAL PRIMARY KEY,
    user_id INT,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT,
    read_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications (user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications (created_at DESC);
