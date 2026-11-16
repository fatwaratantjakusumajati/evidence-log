# Evidence Log

Aplikasi web untuk mencatat dan memantau kejadian gudang dari kamera CCTV: log kendaraan, dokumen PO (hasil OCR), pelacakan marker ArUco per zona, notifikasi/alert, dan ekspor laporan.

## Teknologi

| Bagian   | Yang dipakai                                                            |
| -------- | ----------------------------------------------------------------------- |
| Frontend | React, TanStack Start/Router/Query, Vite, Tailwind CSS, Recharts        |
| Backend  | Node.js (Express), PostgreSQL (`pg`), JWT + bcrypt, Puppeteer, ExcelJS  |
| Deploy   | Docker (satu Dockerfile untuk frontend, satu untuk backend)             |

## Struktur folder

```
evidence-log
├─ src/                 Frontend
│  ├─ routes/           Halaman (dashboard, logs.*, settings, login)
│  ├─ components/       Komponen UI
│  └─ lib/              Helper (auth, api-config, tema, dll.)
├─ backend/             Backend (Express)
│  ├─ server.js         Titik masuk server
│  ├─ routes/           Endpoint API (auth, vehicles, documents, tracking, ...)
│  ├─ middleware/       Autentikasi JWT
│  ├─ utils/            Helper (laporan, notifikasi, dll.)
│  ├─ migrations/       File SQL
│  └─ scripts/          Skrip bantu (mis. create-admin.js)
├─ Dockerfile           Image frontend
└─ backend/Dockerfile   Image backend
```

## Menjalankan di komputer sendiri

Butuh: Node.js 22, PostgreSQL.

### 1. Backend

```bash
cd backend
npm install
cp .env.example .env     # lalu isi nilainya (lihat tabel di bawah)
npm run dev              # atau: npm start
```

Backend berjalan di port `5000` secara default. Saat start, server menolak jalan kalau `JWT_SECRET` atau pengaturan database kosong.

### 2. Frontend

Dari folder utama proyek:

```bash
npm install --legacy-peer-deps
cp .env.example .env     # isi VITE_API_BASE_URL dengan alamat backend
npm run dev
```

Buka alamat yang tampil di terminal. Opsi `--legacy-peer-deps` diperlukan karena ada bentrok versi antar paket beta (`nitro` dan `@lovable.dev/vite-tanstack-config`).

### 3. Database dan user admin

Jalankan file SQL di `backend/migrations/` pada database kamu, lalu buat user admin pertama:

```bash
cd backend
node scripts/create-admin.js
```

## Environment variables

Semua diisi lewat file `.env`. **Jangan pernah commit file `.env`.**

### Frontend (`.env` di folder utama)

| Nama                | Fungsi                                      |
| ------------------- | ------------------------------------------- |
| `VITE_API_BASE_URL` | Alamat backend, mis. `http://localhost:5000` |

### Backend (`backend/.env`)

Wajib diisi:

| Nama                                                    | Fungsi                                  |
| ------------------------------------------------------- | --------------------------------------- |
| `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` | Koneksi PostgreSQL                      |
| `JWT_SECRET`                                            | Kunci penanda token login (string acak panjang) |

Opsional / sesuai fitur yang dipakai:

| Nama                                        | Fungsi                                              |
| ------------------------------------------- | --------------------------------------------------- |
| `PORT`, `NODE_ENV`, `CORS_ORIGIN`           | Port server, mode, dan alamat frontend yang diizinkan |
| `SNAPSHOT_DIR`                              | Folder foto snapshot kamera                         |
| `DOCUMENTS_DIR`                             | Folder penyimpanan file dokumen                     |
| `TRACKING_DIR`                              | Folder foto pelacakan                               |
| `DOCUMENTS_INGEST_KEY`, `TRACKING_INGEST_KEY` | Kunci rahasia untuk kiriman otomatis dari n8n      |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` | Pengiriman email laporan                      |
| `OUTBOUND_ZONES`, `OUTBOUND_GRACE_MIN`      | Pengaturan zona outbound                            |
| `MARKER_POOL_MAX`, `MAX_PALLET_PER_PO`      | Batas marker ArUco dan pallet per PO                |
| `MISSING_ALERT_HOURS`, `MISSING_ALERT_CHECK_MIN` | Pengaturan alert barang hilang                |
| `TRACKING_ALERTS`, `TRACKING_TZ`, `CAMERA_SOURCE` | Pengaturan alert/zona waktu/sumber kamera tracking |

## Docker

```bash
# Backend
docker build -t evidence-log-backend ./backend
docker run -p 5000:5000 --env-file backend/.env evidence-log-backend

# Frontend (alamat backend ditentukan saat build)
docker build --build-arg VITE_API_BASE_URL=http://alamat-backend:5000 -t evidence-log-frontend .
docker run -p 3000:3000 evidence-log-frontend
```

Pastikan file `.env` tidak ikut masuk ke dalam image (cek `.dockerignore`).

## Tes dan pengecekan kode

```bash
cd backend && npm test      # tes backend
npm run lint                # ESLint (dari folder utama)
npm run build               # build frontend
```

## Catatan

- Folder `backend/migrations/` baru berisi tabel `users` dan indeks. Skema tabel lainnya belum terdokumentasi di repo ini.