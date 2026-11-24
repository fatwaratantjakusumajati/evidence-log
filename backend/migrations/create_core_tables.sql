-- Migration: create_core_tables.sql
-- Tabel inti aplikasi Evidence Log yang sebelumnya belum ada di repo migrations.
-- Jalankan setelah create_user_table.sql dan create_login_attempts_table.sql.
-- Semua pakai CREATE TABLE IF NOT EXISTS untuk idempoten (aman dijalankan ulang).

-- Tabel dokumen (PO, Surat Jalan, Invoice, dll.) hasil ingest OCR / n8n
CREATE TABLE IF NOT EXISTS documents (
    id SERIAL PRIMARY KEY,
    jenis_dokumen TEXT NOT NULL DEFAULT 'dokumen',
    judul TEXT,
    informasi JSONB DEFAULT '[]'::jsonb,
    tabel JSONB DEFAULT '[]'::jsonb,
    ringkasan JSONB DEFAULT '[]'::jsonb,
    catatan TEXT,
    po_number TEXT,
    jumlah_pallet INT,
    duplicate_of INT REFERENCES documents(id),
    file_name TEXT,
    file_path TEXT,
    search_vector TSVECTOR,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Tabel pallet fisik yang terikat ke dokumen pembuatnya (document_id)
CREATE TABLE IF NOT EXISTS document_pallets (
    id SERIAL PRIMARY KEY,
    document_id INT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    pallet_no INT NOT NULL,
    aruco_id INT NOT NULL,
    status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'RELEASED')),
    sticker_removed BOOLEAN NOT NULL DEFAULT FALSE,
    approval_status TEXT,
    completion_type TEXT,
    released_at TIMESTAMP,
    missing_since TIMESTAMP,
    alert_level INT NOT NULL DEFAULT 0,
    stored_at TIMESTAMP,
    stored_by TEXT,
    stored_note TEXT,
    exit_at TIMESTAMP,
    exit_note TEXT,
    approved_by TEXT,
    approved_at TIMESTAMP,
    UNIQUE (aruco_id)
);

-- Relasi many-to-many: satu pallet fisik bisa memuat lebih dari satu PO (gabungan)
CREATE TABLE IF NOT EXISTS pallet_documents (
    pallet_id INT NOT NULL REFERENCES document_pallets(id) ON DELETE CASCADE,
    document_id INT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    PRIMARY KEY (pallet_id, document_id)
);

-- Riwayat kejadian pallet (event tracking dari monitor ArUco + konfirmasi manual)
CREATE TABLE IF NOT EXISTS pallet_events (
    id SERIAL PRIMARY KEY,
    event_time TIMESTAMP NOT NULL DEFAULT NOW(),
    event_type TEXT NOT NULL,
    aruco_id INT NOT NULL,
    zone TEXT,
    from_zone TEXT,
    to_zone TEXT,
    detail TEXT,
    message TEXT,
    pallet_id INT REFERENCES document_pallets(id),
    document_id INT REFERENCES documents(id),
    po_number TEXT,
    image_file TEXT
);

-- Unique constraint untuk idempotensi ingest (mencegah duplikasi event saat kirim ulang)
CREATE UNIQUE INDEX IF NOT EXISTS idx_pallet_events_unique
    ON pallet_events (event_time, event_type, aruco_id, zone);

-- Index untuk query tracking yang sering dipakai
CREATE INDEX IF NOT EXISTS idx_pallet_events_pallet_id ON pallet_events (pallet_id);
CREATE INDEX IF NOT EXISTS idx_pallet_events_event_time ON pallet_events (event_time DESC);
CREATE INDEX IF NOT EXISTS idx_document_pallets_aruco_id ON document_pallets (aruco_id);
CREATE INDEX IF NOT EXISTS idx_document_pallets_status ON document_pallets (status);
CREATE INDEX IF NOT EXISTS idx_document_pallets_document_id ON document_pallets (document_id);
CREATE INDEX IF NOT EXISTS idx_pallet_documents_pallet_id ON pallet_documents (pallet_id);
CREATE INDEX IF NOT EXISTS idx_pallet_documents_document_id ON pallet_documents (document_id);
CREATE INDEX IF NOT EXISTS idx_documents_po_number ON documents (po_number);
CREATE INDEX IF NOT EXISTS idx_documents_created_at ON documents (created_at DESC);

-- Tabel log kendaraan (ditulis script CV / ALPR di luar repo)
CREATE TABLE IF NOT EXISTS vehicle_log (
    id SERIAL PRIMARY KEY,
    timestamp TIMESTAMP NOT NULL,
    jenis_kendaraan TEXT,
    warna TEXT,
    confidence FLOAT,
    bbox_x1 FLOAT,
    bbox_y1 FLOAT,
    bbox_x2 FLOAT,
    bbox_y2 FLOAT,
    gambar_base64 TEXT,
    kamera_nama TEXT,
    status_muatan TEXT,
    status_aktivitas TEXT,
    track_id TEXT,
    vehicle_id TEXT,
    plat_nomor TEXT,
    plat_confidence FLOAT,
    jenis_kejadian TEXT,
    is_false_positive BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vehicle_log_timestamp ON vehicle_log (timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_vehicle_log_jenis ON vehicle_log (jenis_kendaraan);
CREATE INDEX IF NOT EXISTS idx_vehicle_log_vehicle_id ON vehicle_log (vehicle_id);
CREATE INDEX IF NOT EXISTS idx_vehicle_log_plat_nomor ON vehicle_log (plat_nomor);
CREATE INDEX IF NOT EXISTS idx_vehicle_log_created_at ON vehicle_log (created_at DESC);

-- Tabel log alert kamera / staging (model legacy, masih dipakai halaman Staging & Kamera)
CREATE TABLE IF NOT EXISTS alert_log (
    id SERIAL PRIMARY KEY,
    camera TEXT,
    class_name TEXT,
    first_detected TIMESTAMP,
    duration INT,
    alert_level TEXT,
    file_name TEXT,
    foto_base64 BYTEA,
    alert_sent_1 BOOLEAN NOT NULL DEFAULT FALSE,
    alert_sent_2 BOOLEAN NOT NULL DEFAULT FALSE,
    alert_sent_3 BOOLEAN NOT NULL DEFAULT FALSE,
    predicted_risk TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_alert_log_created_at ON alert_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_alert_log_class_name ON alert_log (class_name);
CREATE INDEX IF NOT EXISTS idx_alert_log_camera ON alert_log (camera);
