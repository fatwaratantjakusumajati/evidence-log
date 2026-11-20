# API Reference - Evidence Log

> Dokumen ini adalah kontrak antara frontend dan backend.
> Diverifikasi terhadap `backend/server.js` dan seluruh file di `backend/routes/` pada 20 November 2026.
> Untuk gambaran arsitektur lihat [docs/ARCHITECTURE.md](./ARCHITECTURE.md).

---

## 1. Base URL dan format

| Item | Nilai |
| :--- | :--- |
| Base URL dev | `http://localhost:5000` |
| Prefix API | `/api` |
| Format body | `application/json`, kecuali upload memakai `multipart/form-data` |
| Format respons | JSON, kecuali unduhan file dan SSE |
| Encoding waktu | ISO 8601 dari database; ingest tracking memakai `YYYY-MM-DD HH:mm:ss` lokal |

Frontend mengambil alamat dari `VITE_API_BASE_URL` (`src/lib/api-config.ts`), dengan fallback
`http://localhost:5000`.

---

## 2. Autentikasi

Ada tiga mekanisme berbeda. Pilih sesuai pemanggil.

### 2.1 JWT Bearer - untuk user di browser

```http
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
```

- Diterbitkan oleh `POST /api/auth/login`, berlaku **30 menit**.
- Payload: `{ userId, username, role }` dengan `role` bernilai `admin` atau `staff`.
- Diperpanjang lewat `POST /api/auth/refresh` **selama token lama masih valid**.
- Disimpan frontend di `localStorage` dengan key `evidence_log_token`.
- Request tanpa header yang valid ke endpoint terproteksi menghasilkan `401`.
- Endpoint dengan `requireAdmin` menghasilkan `403` bila role bukan `admin`.

### 2.2 x-ingest-key - untuk mesin (n8n, monitor kamera)

```http
x-ingest-key: <DOCUMENTS_INGEST_KEY atau TRACKING_INGEST_KEY>
```

Dipakai pada empat endpoint publik:

| Endpoint | Env yang dibandingkan |
| :--- | :--- |
| `POST /api/documents/ingest` | `DOCUMENTS_INGEST_KEY` |
| `POST /api/documents/ingest/aruco` | `DOCUMENTS_INGEST_KEY` |
| `POST /api/tracking/ingest` | `TRACKING_INGEST_KEY`, fallback `DOCUMENTS_INGEST_KEY` |
| `GET /api/events` | bukan header - lihat 2.3 |

Jika env kunci belum di-set, endpoint membalas `500` dengan pesan konfigurasi. Jika kunci
salah, membalas `401`.

### 2.3 Token di query string - khusus SSE

```http
GET /api/events?token=<jwt>
Accept: text/event-stream
```

`EventSource` browser tidak bisa mengirim header kustom, jadi token dikirim sebagai query.
Server memverifikasinya dengan `verifyTokenString()`. Respons berupa stream
`text/event-stream` dengan heartbeat komentar setiap 15 detik.

---

## 3. Konvensi respons

### 3.1 Sukses dengan paginasi

```json
{
  "data": [],
  "total": 120,
  "page": 1,
  "limit": 20,
  "totalPages": 6
}
```

Dipakai oleh: `/vehicles/log`, `/alerts`, `/tracking/pallets`, `/tracking/pos`,
`/documents`, `/wa-recipients`, `/report-recipients`.

Pengecualian yang perlu diingat:

| Endpoint | Bentuk respons |
| :--- | :--- |
| `GET /api/audit-log` | `{ data, total, page, limit }` tanpa `totalPages` |
| `GET /api/tracking/pos` | tambahan `total_po` |
| `GET /api/documents/pool` | `{ total, terpakai, sisa }` |
| `GET /api/documents/pallets/aktif` | array polos |
| `GET /api/vehicles/stats/hourly` | array `{ hour, jenis_kendaraan, total }` |
| `GET /api/tracking/summary` | objek tunggal |
| `GET /api/tracking/zones` | array polos |
| `GET /api/health` | objek status |

### 3.2 Error

Selalu berbentuk objek dengan satu field `error`:

```json
{ "error": "Pesan yang bisa ditampilkan ke user" }
```

| Status | Kapan muncul |
| :--- | :--- |
| `400` | Parameter tidak valid, tanggal salah format, body kurang |
| `401` | Token tidak ada / kadaluarsa / `x-ingest-key` salah |
| `403` | Role bukan admin pada endpoint `requireAdmin` |
| `404` | Data tidak ditemukan |
| `409` | Konflik: PO duplikat, pallet sudah tidak aktif, slot marker habis |
| `413` | File terlalu besar (maks 8 MB per file, 10 MB untuk body tracking) |
| `429` | Rate limit: 400 req/menit global, 10 percobaan login/15 menit per IP |
| `500` | Kesalahan server atau env belum di-set |
| `502` | n8n menolak file saat upload manual |
| `503` | `/api/health` saat database tidak bisa dihubungi |

Pada `NODE_ENV=production`, `sendServerError` menyembunyikan pesan asli dan hanya
mengembalikan pesan generik.

---

## 4. Ringkasan endpoint

Kolom **Auth**: `-` publik, `JWT` butuh Bearer, `ADMIN` butuh Bearer + role admin,
`KEY` butuh `x-ingest-key`.

### Auth dan user

| Method | Path | Auth | Keterangan |
| :--- | :--- | :--- | :--- |
| POST | `/api/auth/login` | - | Login, balas token 30 menit |
| POST | `/api/auth/refresh` | JWT | Perpanjang token |
| PUT | `/api/auth/change-password` | JWT | Ganti password sendiri |
| GET | `/api/auth/users` | ADMIN | Daftar user |
| POST | `/api/auth/register` | ADMIN | Buat user baru |
| DELETE | `/api/auth/users/:id` | ADMIN | Hapus user |

### Kendaraan

| Method | Path | Auth | Keterangan |
| :--- | :--- | :--- | :--- |
| GET | `/api/vehicles/log` | JWT | Log terpaginasi per kendaraan |
| GET | `/api/vehicles/history/:vehicle_id` | JWT | Semua event satu kendaraan |
| PATCH | `/api/vehicles/log/:id/flag` | JWT | Tandai false positive |
| GET | `/api/vehicles/stats/hourly` | JWT | Distribusi per jam |
| GET | `/api/vehicles/stats/weekly` | JWT | Ringkasan mingguan |
| GET | `/api/vehicles/export-pdf` | JWT | PDF kendaraan |

### Alert, staging, dan kamera

| Method | Path | Auth | Keterangan |
| :--- | :--- | :--- | :--- |
| GET | `/api/alerts` | JWT | Daftar staging, default hanya duration >= 3 hari |
| GET | `/api/alerts/:id` | JWT | Detail satu alert |
| GET | `/api/alerts/stats/weekly` | JWT | Deteksi box per hari |
| GET | `/api/alerts/stats/camera-status` | JWT | Jumlah kamera yang sedang mati |
| GET | `/api/alerts/stats/camera-uptime` | JWT | Uptime per kamera |
| GET | `/api/alerts/stats/escalation-risk` | JWT | Prediksi risiko eskalasi |
| GET | `/api/alerts/export-pdf` | JWT | PDF staging atau kamera |

### Tracking pallet

| Method | Path | Auth | Keterangan |
| :--- | :--- | :--- | :--- |
| POST | `/api/tracking/ingest` | KEY | Event dari monitor ArUco |
| GET | `/api/tracking/pallets` | JWT | Daftar pallet + state |
| GET | `/api/tracking/summary` | JWT | Angka ringkasan dashboard |
| GET | `/api/tracking/zones` | JWT | Jumlah pallet per zona |
| GET | `/api/tracking/pos` | JWT | Daftar PO (kartu) |
| GET | `/api/tracking/pos/:documentId/pallets` | JWT | Pallet milik satu PO |
| POST | `/api/tracking/pallets/:id/store` | JWT | Konfirmasi disimpan |
| POST | `/api/tracking/pallets/:id/exit` | JWT | Konfirmasi keluar |
| GET | `/api/tracking/alerts` | JWT | Pallet PENDING dengan alert aktif |
| GET | `/api/tracking/pallets/:id/events` | JWT | Riwayat event satu pallet |
| GET | `/api/tracking/events` | JWT | Event terbaru untuk feed |
| GET | `/api/tracking/events/:id/image` | JWT | Foto event (file) |

### Dokumen dan ArUco

| Method | Path | Auth | Keterangan |
| :--- | :--- | :--- | :--- |
| POST | `/api/documents/ingest` | KEY | Terima hasil OCR |
| POST | `/api/documents/ingest/aruco` | KEY | Alokasikan marker + PO |
| POST | `/api/documents/upload` | JWT | Upload manual, diteruskan ke n8n |
| GET | `/api/documents` | JWT | Daftar + pencarian + paginasi |
| GET | `/api/documents/pool` | JWT | Sisa slot marker |
| GET | `/api/documents/pallets/aktif` | JWT | Pallet aktif untuk form gabung |
| GET | `/api/documents/pallets/pending` | JWT | Pallet RELEASED yang stiker belum dicopot |
| POST | `/api/documents/pallets/:palletId/sticker-removed` | JWT | Konfirmasi stiker dicopot |
| PATCH | `/api/documents/:id` | JWT | Ubah nomor PO / jumlah pallet |
| GET | `/api/documents/:id` | JWT | Detail dokumen + pallet |
| GET | `/api/documents/:id/file` | JWT | Unduh file asli |
| POST | `/api/documents/:id/gabung` | JWT | Gabung ke pallet yang ada |
| DELETE | `/api/documents/:id/gabung/:palletId` | JWT | Lepas gabungan |
| DELETE | `/api/documents/:id` | ADMIN | Hapus dokumen |

### Export, penerima, audit, dan sistem

| Method | Path | Auth | Keterangan |
| :--- | :--- | :--- | :--- |
| GET | `/api/export/daily` | JWT | Laporan harian (xlsx/pdf) |
| GET | `/api/export/weekly` | JWT | Laporan mingguan |
| GET | `/api/export/monthly` | JWT | Laporan bulanan |
| GET | `/api/export/full-report` | JWT | Seluruh histori |
| GET | `/api/wa-recipients` | JWT | Daftar penerima WA |
| POST | `/api/wa-recipients` | ADMIN | Tambah penerima WA |
| PUT | `/api/wa-recipients/:id` | ADMIN | Ubah sebagian field |
| DELETE | `/api/wa-recipients/:id` | ADMIN | Hapus penerima WA |
| GET | `/api/report-recipients` | JWT | Daftar penerima email |
| POST | `/api/report-recipients` | ADMIN | Tambah penerima email |
| PUT | `/api/report-recipients/:id` | ADMIN | Ubah penerima email |
| DELETE | `/api/report-recipients/:id` | ADMIN | Hapus penerima email |
| POST | `/api/report-recipients/test-send` | ADMIN | Kirim laporan mingguan sekarang |
| GET | `/api/audit-log` | ADMIN | Riwayat aksi admin |
| GET | `/api/notifications` | JWT | Stub baca tabel notifications |
| GET | `/api/events` | TOKEN | Stream SSE |
| GET | `/api/health` | - | Status server + database |
| GET | `/` | - | Pesan sederhana `API berjalan` |

---

## 5. Auth dan user

### POST /api/auth/login

Publik. Rate limit 10 percobaan per 15 menit per IP.

```json
{ "username": "admin", "password": "rahasia123" }
```

Respons `200`:

```json
{ "token": "eyJ...", "username": "admin", "role": "admin" }
```

Error: `400` field kosong, `401` kredensial salah, `429` terlalu banyak percobaan,
`500` bila `JWT_SECRET` belum di-set.

### POST /api/auth/refresh

JWT. Tidak butuh body. Mengembalikan `{ token, username, role }` baru dengan masa berlaku
30 menit lagi. Hanya berhasil selama token lama masih valid.

### PUT /api/auth/change-password

JWT.

```json
{ "currentPassword": "lama12345", "newPassword": "baru12345" }
```

Password baru minimal 8 karakter. Respons `{ "success": true }`. Error `401` bila password
lama salah.

### GET /api/auth/users

ADMIN. Mengembalikan array `{ id, username, role, created_at }` urut dari yang paling awal.

### POST /api/auth/register

ADMIN.

```json
{ "username": "operator1", "password": "rahasia123", "role": "staff" }
```

Aturan: username 3-50 karakter (`huruf/angka/underscore/titik`), password minimal 8,
role selain `admin` otomatis menjadi `staff`. Respons `201` berisi baris user yang dibuat.
Error `409` bila username sudah dipakai.

### DELETE /api/auth/users/:id

ADMIN. Tidak boleh menghapus akun sendiri, dan tidak boleh menghapus user terakhir.
Respons `{ "success": true }`.

---

## 6. Kendaraan

### GET /api/vehicles/log

JWT. Paginasi dihitung **per kendaraan**, bukan per baris.

| Query | Default | Keterangan |
| :--- | :--- | :--- |
| `page` | `1` | Halaman |
| `limit` | `20` | Maks 100 |
| `jenis` | `all` | Filter `jenis_kendaraan` (case-insensitive) |
| `start_date` | - | `YYYY-MM-DD` |
| `end_date` | - | `YYYY-MM-DD`, inklusif sampai akhir hari |
| `search` | - | Cari plat nomor, spasi diabaikan |

Respons berisi `data` yang sudah mencakup seluruh baris milik kendaraan terpilih
(event MASUK, KELUAR, dan update status), diurutkan `latest_ts DESC` lalu `timestamp ASC`.

### GET /api/vehicles/history/:vehicle_id

JWT. Mengembalikan `{ vehicle_id, total_events, events[] }` untuk satu siklus kendaraan.

### PATCH /api/vehicles/log/:id/flag

JWT.

```json
{ "is_false_positive": true }
```

Menandai deteksi salah. Deteksi bertanda ini dikecualikan dari grafik per jam dan PDF.

### GET /api/vehicles/stats/hourly

JWT. Query `start_date`, `end_date` (opsional; tanpa filter = hari ini).

```json
[{ "hour": "05:00", "jenis_kendaraan": "Truk", "total": 3 }]
```

Satu kendaraan dihitung sekali, memakai jam dan jenis dari event MASUK.

### GET /api/vehicles/stats/weekly

JWT. **Saat ini stub**: selalu mengembalikan `[]` dan tidak dipakai frontend.

### GET /api/vehicles/export-pdf

JWT. Query `start_date`, `end_date`. Menghasilkan PDF berisi ringkasan jumlah mobil, truk,
motor, staging, kamera mati, plus grid foto kendaraan dan staging terbaru.

---

## 7. Alert, staging, dan kamera

### GET /api/alerts

JWT. Khusus data legacy `alert_log`.

| Query | Default | Keterangan |
| :--- | :--- | :--- |
| `page` | `1` | |
| `limit` | `20` | Maks 100 |
| `class_name` | - | Mis. `KAMERA OFFLINE` |
| `start_date` | - | `YYYY-MM-DD` |
| `end_date` | - | `YYYY-MM-DD` |

Perilaku default yang sering membingungkan saat debugging:

1. Log kamera (`KAMERA OFFLINE`, `KAMERA ONLINE`) **selalu dikecualikan** dari listing.
2. Hanya baris dengan `duration >= 259200` detik (3 hari) yang diambil.
3. `predicted_risk` hanya terisi untuk item yang masih aktif (`STAGING` / `WARNING`),
   belum kena `alert_sent_2`, dan punya minimal 3 riwayat `SELESAI` pada kombinasi
   kamera + jenis barang yang sama. Selain itu `null`.
4. `foto_base64` dikonversi dari `bytea` ke string base64 sebelum dikirim.

### GET /api/alerts/:id

JWT. Mengembalikan seluruh kolom satu baris `alert_log` dengan `foto_base64` sebagai base64.

### GET /api/alerts/stats/weekly

JWT. Query `start_date`, `end_date` (default 7 hari terakhir).

```json
[{ "day": "Mon", "barang": "12" }]
```

### GET /api/alerts/stats/camera-status

JWT. Query `start_date`, `end_date` opsional. Menghitung kamera yang status terakhirnya
offline.

```json
{ "mati": "4" }
```

> Nilai `mati` bertipe **string** karena berasal dari `COUNT(*)` PostgreSQL tanpa cast.
> Frontend mengatasinya dengan `Number(cameraStats?.mati ?? 0)`.

### GET /api/alerts/stats/camera-uptime

JWT. Query `start_date`, `end_date` opsional.

```json
{
  "data": [
    {
      "camera": "CAM-01",
      "current_status": "KAMERA ONLINE",
      "last_event_at": "2026-11-19T10:00:00.000Z",
      "offline_count": 2,
      "total_offline_seconds": 5400,
      "uptime_percent": 98.2
    }
  ],
  "period_seconds": 604800
}
```

Bila hanya `end_date` yang diisi, periode dianggap 7 hari. Bila tidak ada filter,
perhitungan juga memakai 7 hari terakhir.

### GET /api/alerts/stats/escalation-risk

JWT. Tanpa query. Menggabungkan item aktif dengan histori item selesai.

```json
{
  "active_items": [
    {
      "id": 91,
      "camera": "CAM-03",
      "class_name": "box",
      "alert_level": "WARNING",
      "duration": 400000,
      "first_detected": "2026-11-10T02:00:00.000Z",
      "historical_total": 8,
      "historical_escalated": 5,
      "predicted_risk": 0.625
    }
  ],
  "camera_class_ranking": [],
  "generated_at": "2026-11-20T03:00:00.000Z"
}
```

`predicted_risk = null` berarti sampel historis belum cukup (< 3). Jangan ditampilkan
sebagai 0%.

### GET /api/alerts/export-pdf

JWT. Query `class_name`, `start_date`, `end_date`. Bila `class_name` mengandung `kamera`,
yang diekspor adalah kejadian kamera; selain itu staging.

---

## 8. Tracking pallet

### POST /api/tracking/ingest

KEY (`TRACKING_INGEST_KEY`). Body JSON maksimal **10 MB** (membawa foto base64).

```json
{
  "event": "MOVED_ZONE",
  "id": 42,
  "time": "2026-11-20 09:15:03",
  "zone": "Outbound 1",
  "from": "Staging A",
  "to": "Outbound 1",
  "detail": "terbaca 4 sudut",
  "message": null,
  "image_base64": "/9j/4AAQSkZJRg..."
}
```

| Field | Wajib | Keterangan |
| :--- | :--- | :--- |
| `event` | ya | `NEW`, `MOVED_ZONE`, `MOVED_POS`, `MISSING`, `RETURNED`, `CAMERA_OFFLINE`, `CAMERA_ONLINE` |
| `id` | ya | ID ArUco 0-999. `0` dipakai marker kamera |
| `time` | tidak | Harus `YYYY-MM-DD HH:mm:ss`. Bila kosong dipakai `now()` |
| `zone` | ya | Nama zona; fallback ke `to` lalu `from` |
| `from`, `to` | tidak | Diisi untuk perpindahan zona |
| `image_base64` | tidak | Foto disimpan ke `TRACKING_DIR`, bukan ke DB |

Respons `201`:

```json
{ "success": true, "id": 1183, "po_number": "PO-2026-001", "outcome": "NEEDS_APPROVAL" }
```

`outcome` yang mungkin: `null`, `OUTBOUND_WAIT`, `NEEDS_APPROVAL`, `APPROVAL_CANCELLED`.
Bila event duplikat (kombinasi waktu, tipe, marker, zona sudah ada):
`{ "success": true, "duplicate": true }`.

### GET /api/tracking/pallets

JWT. Query `page`, `limit` (default 12), `search` (PO), `zone`, `state`.

`state` yang diterima: `PENDING`, `PRESENT`, `MISSING`, `UNSEEN`, `STORED`, `COMPLETED`.
Respons paginasi standar dengan tambahan field per baris: `state`, `current_zone`,
`last_event`, `last_event_time`, `first_seen`, `last_moved`, `approval_status`,
`completion_type`, `stored_*`, `exit_*`, `approved_*`.

### GET /api/tracking/summary

JWT. Tanpa query.

```json
{
  "po_aktif": 12,
  "po_perlu_acc": 2,
  "total_pallet": 38,
  "present": 30,
  "missing": 5,
  "unseen": 1,
  "pending_approval": 2,
  "moved_today": 7
}
```

### GET /api/tracking/zones

JWT. Tanpa query.

```json
[{ "zone": "Staging A", "total": 14, "present": 13, "missing": 1, "po_count": 5 }]
```

### GET /api/tracking/pos

JWT. Satu baris = satu kelompok PO (PO yang berbagi pallet digabung jadi satu kartu).

Query: `page`, `limit` (default 12), `search` (nomor PO), `zone`, `state`
(`PENDING`, `MISSING`, `UNSEEN`, `COMPLETED`).

Respons: `{ data, total, total_po, page, limit, totalPages }`. Field penting per baris:
`document_id`, `document_ids`, `po_number` (bisa `PO-A + PO-B`), `jumlah_po`,
`aruco_ids`, `total_pallet`, `active_pallet`, `completed_pallet`, `present`, `missing`,
`unseen`, `stored`, `pending_approval`, `zones`.

### GET /api/tracking/pos/:documentId/pallets

JWT. Detail seluruh pallet milik kelompok PO tersebut.

```json
{
  "po_number": "PO-2026-001 + PO-2026-002",
  "document_ids": [1, 2],
  "jumlah_pallet": 6,
  "pallets": []
}
```

### POST /api/tracking/pallets/:id/store

JWT. Body opsional `{ "note": "disimpan di rak B" }`. Pallet tetap aktif dan tetap dilacak,
tetapi alert berhenti. Event `STORED` dicatat dan notifikasi dikirim.

### POST /api/tracking/pallets/:id/exit

JWT. Body opsional `{ "note": "..." }`. Pallet menjadi `RELEASED` (selesai) tanpa menunggu
zona outbound. Boleh dipanggil untuk pallet yang sedang `STORED`.

Keduanya membalas `{ "success": true }`, `400` bila id bukan bilangan bulat, `404` bila
pallet tidak ditemukan, `409` bila state tidak memungkinkan.

### GET /api/tracking/alerts

JWT. Daftar pallet `PENDING` yang `alert_level > 0`, urut level tertinggi lalu paling lama
hilang. Dipakai untuk badge peringatan di halaman Tracking PO.

### GET /api/tracking/pallets/:id/events

JWT. Query `include_pos=1` untuk ikut menampilkan event `MOVED_POS` (default disembunyikan).
Maksimal 200 baris, urut terbaru. Field `has_image` menandakan ada foto yang bisa diambil.

### GET /api/tracking/events

JWT. Feed event terbaru untuk dashboard.

| Query | Default | Keterangan |
| :--- | :--- | :--- |
| `limit` | `4` | Maks 100 |
| `start_date` | - | Dihitung pada zona waktu `TRACKING_TZ` |
| `end_date` | - | idem |
| `hide_moved_pos` | - | `1` untuk menyembunyikan `MOVED_POS` |

Event kamera tidak pernah muncul di endpoint ini.

### GET /api/tracking/events/:id/image

JWT. Mengirim file gambar dari `TRACKING_DIR`. `404` bila nama file kosong atau sudah
terhapus dari disk.

---

## 9. Dokumen dan ArUco

### POST /api/documents/ingest

KEY (`DOCUMENTS_INGEST_KEY`). **multipart/form-data**, maksimal 8 MB.

| Field | Wajib | Keterangan |
| :--- | :--- | :--- |
| `file` | tidak | File dokumen (xlsx/pdf/gambar). Disimpan ke `DOCUMENTS_DIR` |
| `jenis_dokumen` | tidak | Default `dokumen` |
| `judul` | tidak | |
| `informasi` | tidak | Array JSON **dalam bentuk string** |
| `tabel` | tidak | Array JSON dalam bentuk string |
| `ringkasan` | tidak | Array JSON dalam bentuk string |
| `catatan` | tidak | |
| `full_text` | tidak | Bila kosong, dibentuk otomatis dari field lain untuk pencarian |
| `jumlah_pallet` | tidak | `N` untuk N pallet baru, atau `N+12,15` untuk N baru + gabung ke pallet 12 dan 15 |
| `uploaded_by` | tidak | Default `n8n` |

Respons `201`: `{ "success": true, "id": 41, "created_at": "..." }`.

### POST /api/documents/ingest/aruco

KEY. Body JSON. Biasa dipanggil n8n **setelah** ingest dokumen.

```json
{ "document_id": 41, "po_number": "PO-2026-001" }
```

Perilaku:

1. Bila `po_number` sudah dipakai dokumen lain -> `409` dengan `{ error, duplicate_of }`
   dan dokumen ditandai duplikat. Tidak ada marker yang dialokasikan.
2. `jumlah_pallet` dan `gabung_ke` dibaca dari baris dokumen, bukan dari body.
3. Alokasi marker berjalan dalam transaksi dan aman dipanggil ulang: bila pallet aktif
   untuk dokumen itu sudah ada, alokasi dilewati.

Respons `200`:

```json
{
  "success": true,
  "id": 41,
  "po_number": "PO-2026-001",
  "pallets": [{ "id": 88, "pallet_no": 1, "aruco_id": 7 }],
  "shared": [{ "pallet_id": 12, "aruco_id": 12 }]
}
```

`pallets` = marker baru yang perlu dicetak. `shared` = pallet lama yang sudah bertempel stiker.

### POST /api/documents/upload

JWT. **multipart/form-data** `file` (wajib JPG/PNG, maks 8 MB), plus field
`jumlah_pallet` dan `gabung_ke` (id dipisah koma).

Backend meneruskan file ke `N8N_WEBHOOK_URL` (header `x-upload-key` dari `N8N_UPLOAD_KEY`)
dengan timeout 30 detik. Respons yang dikembalikan ke browser adalah `202`:

```json
{ "success": true, "message": "File diterima, sedang diproses." }
```

Error: `500` bila `N8N_WEBHOOK_URL` kosong, `400` format salah, `409` slot marker tidak cukup,
`502` bila n8n menolak.

### GET /api/documents

JWT.

| Query | Default | Keterangan |
| :--- | :--- | :--- |
| `page` | `1` | |
| `limit` | `20` | Maks 100 |
| `jenis` | `all` | Filter `jenis_dokumen` |
| `search` | - | Full-text search (`search_vector @@ plainto_tsquery`) |
| `start_date` | - | `YYYY-MM-DD` |
| `end_date` | - | `YYYY-MM-DD` |

Saat `search` diisi, hasil diurutkan berdasarkan `rank` lalu `created_at`. Setiap baris
memuat `pallet_ids` (semua marker aktif) dan `pallet_bersama` (marker yang dipakai PO lain).

### GET /api/documents/pool

JWT. Tanpa query.

```json
{ "total": 999, "terpakai": 46, "sisa": 953 }
```

### GET /api/documents/pallets/aktif

JWT. Array `{ id, aruco_id, po_list[] }` untuk form "gabung ke pallet yang sudah ada".

### GET /api/documents/pallets/pending

JWT. Array `{ id, pallet_no, aruco_id, released_at, po_number }` untuk pallet yang sudah
`RELEASED` tetapi stiker fisiknya belum dicopot.

### POST /api/documents/pallets/:palletId/sticker-removed

JWT. Tanpa body. Menandai `sticker_removed = true`, sehingga nomor marker kembali ke pool.
`404` bila pallet tidak ada atau belum `RELEASED`.

### PATCH /api/documents/:id

JWT. Body boleh hanya salah satu.

```json
{ "po_number": "PO-2026-002", "jumlah_pallet": 5 }
```

- Mengubah `po_number` dicek duplikatnya (`409`).
- Menaikkan `jumlah_pallet` mengalokasikan marker tambahan.
- Menurunkan `jumlah_pallet` melepas pallet bernomor tertinggi (`RELEASED`), tetapi ditolak
  `409` bila pallet tersebut sedang digabung dengan PO lain.

### GET /api/documents/:id

JWT. Detail lengkap: `informasi`, `tabel`, `ringkasan`, `catatan`, `duplicate_of`, dan
`pallets[]` berisi `milik_sendiri` serta `po_lain[]`.

### GET /api/documents/:id/file

JWT. Mengirim file asli sebagai attachment. `404` bila `file_path` kosong atau file sudah
hilang dari disk.

### POST /api/documents/:id/gabung

JWT.

```json
{ "pallet_ids": [12, 15] }
```

Menambahkan PO ini ke pallet aktif yang sudah ada tanpa membuat marker baru. Ditolak `409`
bila dokumen belum punya PO valid, masih duplikat, atau ada pallet yang sudah tidak aktif.

### DELETE /api/documents/:id/gabung/:palletId

JWT. Melepas satu pallet dari PO. Ditolak `409` bila pallet itu **hanya** milik PO tersebut -
untuk kasus itu kurangi `jumlah_pallet` atau hapus dokumen.

### DELETE /api/documents/:id

ADMIN. Menyerahkan pallet bersama ke PO lain, melepas pallet yang hanya milik dokumen ini,
lalu menghapus baris dokumen dan file di disk.

---

## 10. Export dan laporan

Semua endpoint di bawah ini JWT dan mengembalikan file attachment.

| Endpoint | Query wajib | Query opsional | Nama file |
| :--- | :--- | :--- | :--- |
| `GET /api/export/daily` | `date=YYYY-MM-DD` | `format=xlsx|pdf` | `Laporan_Harian_<date>.<format>` |
| `GET /api/export/weekly` | `date=YYYY-MM-DD` | `format` | `Laporan_Mingguan_<date>.<format>` |
| `GET /api/export/monthly` | `month=YYYY-MM` atau `year` + `month` | `format` | `Laporan_Bulanan_<year>_<month>.<format>` |
| `GET /api/export/full-report` | - | `format` | `Laporan_Lengkap_Warehouse.<format>` |

- `format` default `xlsx`.
- `weekly` memakai `DATE_TRUNC('week')`, yaitu minggu kalender PostgreSQL (mulai Senin).
- `monthly` menerima dua gaya parameter: `?month=2026-11` (dipakai frontend) atau
  `?year=2026&month=11`.
- Tanpa parameter tanggal pada `/full-report`, seluruh histori ikut.
- Excel berisi beberapa sheet sekaligus (kendaraan, staging/alert, dan rekap).

---

## 11. Penerima notifikasi

### WA recipients

| Method | Path | Auth | Body |
| :--- | :--- | :--- | :--- |
| GET | `/api/wa-recipients` | JWT | Query `page`, `limit` |
| POST | `/api/wa-recipients` | ADMIN | `nama`, `nomor`, `aktif?`, `akses_staging?`, `akses_laporan_harian?`, `akses_laporan_mingguan?`, `akses_chatbot?` |
| PUT | `/api/wa-recipients/:id` | ADMIN | Parsial: `nomor?`, semua field `akses_*?` |
| DELETE | `/api/wa-recipients/:id` | ADMIN | - |

Validasi nomor: hanya digit, 10-15 karakter. Default akses: `akses_staging = true`,
sisanya `false`. PUT bersifat parsial memakai `COALESCE`, jadi mengirim satu field saja aman.

### Report recipients (email)

| Method | Path | Auth | Body |
| :--- | :--- | :--- | :--- |
| GET | `/api/report-recipients` | JWT | Query `page`, `limit` |
| POST | `/api/report-recipients` | ADMIN | `nama`, `email`, `aktif?` |
| PUT | `/api/report-recipients/:id` | ADMIN | `email?`, `aktif?` |
| DELETE | `/api/report-recipients/:id` | ADMIN | - |
| POST | `/api/report-recipients/test-send` | ADMIN | - |

`test-send` menjalankan `sendWeeklyReport()` dan membalas
`{ success, message, sent, failed[] }`.

> Catatan: halaman Pengaturan saat ini hanya memakai API `wa-recipients`. Pengelolaan
> penerima email belum punya UI, jadi harus lewat API langsung.

---

## 12. Audit, notifikasi, dan sistem

### GET /api/audit-log

ADMIN. Query `page`, `limit` (default 20, maks 100). Baris berisi `actor_username`,
`action`, `target_type`, `target_label`, `details`, `created_at`.

Aksi yang tercatat: `create_user`, `delete_user`, `create_wa_recipient`,
`update_wa_recipient`, `delete_wa_recipient`, `create_report_recipient`,
`update_report_recipient`, `delete_report_recipient`.

### GET /api/notifications

JWT. Stub: `SELECT * FROM notifications ORDER BY created_at DESC`. Belum dipakai frontend.

### GET /api/health

Publik.

```json
{
  "status": "ok",
  "uptime_seconds": 8123,
  "database": { "status": "ok", "latency_ms": 2 },
  "timestamp": "2026-11-20T03:00:00.000Z"
}
```

Bila database gagal: status `503` dengan `status: degraded`.

### GET /api/events (SSE)

Token JWT di query. Contoh event yang diterima:

```text
event: message
data: {"channel":"pallet_event","data":{"event_type":"MOVED_ZONE","aruco_id":42,"from_zone":"Staging A","to_zone":"Outbound 1"}}

: heartbeat
```

Kanal: `vehicle_log_event`, `alert_log_event`, `pallet_event`. Heartbeat dikirim tiap 15 detik.

---

## 13. Contoh pemanggilan

### Monitor ArUco mengirim event

```bash
curl -X POST http://localhost:5000/api/tracking/ingest \
  -H "Content-Type: application/json" \
  -H "x-ingest-key: $TRACKING_INGEST_KEY" \
  -d '{
    "event": "MOVED_ZONE",
    "id": 42,
    "time": "2026-11-20 09:15:03",
    "zone": "Outbound 1",
    "from": "Staging A",
    "to": "Outbound 1"
  }'
```

### n8n mengirim hasil OCR

```bash
curl -X POST http://localhost:5000/api/documents/ingest \
  -H "x-ingest-key: $DOCUMENTS_INGEST_KEY" \
  -F "file=@surat_jalan.xlsx" \
  -F "jenis_dokumen=surat_jalan" \
  -F "judul=Surat Jalan 001" \
  -F "jumlah_pallet=3" \
  -F 'informasi=[{"label":"Vendor","nilai":"PT Contoh"}]'
```

### n8n meminta alokasi marker

```bash
curl -X POST http://localhost:5000/api/documents/ingest/aruco \
  -H "Content-Type: application/json" \
  -H "x-ingest-key: $DOCUMENTS_INGEST_KEY" \
  -d '{"document_id": 41, "po_number": "PO-2026-001"}'
```

### Frontend mengambil log kendaraan

```bash
curl http://localhost:5000/api/vehicles/log?page=1\&limit=20\&jenis=truk \
  -H "Authorization: Bearer $TOKEN"
```

### Konfirmasi pallet disimpan

```bash
curl -X POST http://localhost:5000/api/tracking/pallets/88/store \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"note": "disimpan di rak B"}'
```

---

## 14. Catatan debugging yang sering dibutuhkan

1. **`total` tidak cocok dengan jumlah baris `data`** pada `/vehicles/log` dan
   `/tracking/pos` adalah normal: `total` menghitung kendaraan/PO, sedangkan `data`
   berisi banyak baris mentah per grup.
2. **`GET /api/alerts` terasa kosong** padahal ada data: filter default hanya menampilkan
   `duration >= 3 hari` dan membuang log kamera. Kirim `class_name=KAMERA OFFLINE` untuk
   melihat log kamera, atau lihat tabel langsung.
3. **`camera-status` mengembalikan string** (`"mati": "2"`). Selalu cast ke Number.
4. **`predicted_risk: null` bukan berarti risiko 0**. Artinya histori belum cukup.
5. **`GET /api/documents` dengan `search`** memakai konfigurasi teks `simple`, bukan bahasa
   Indonesia. Pencarian bersifat kata utuh, bukan substring bebas.
6. **`POST /api/documents/upload` membalas 202**, bukan data hasil OCR. Hasil muncul
   belakangan lewat halaman Dokumen setelah n8n selesai.
7. **Marker yang baru dilepas belum tentu bisa dipakai lagi**. Nomor kembali ke pool hanya
   setelah `sticker_removed = true`.
8. **`/api/vehicles/stats/weekly` adalah stub** yang mengembalikan `[]`. Jika grafik mingguan
   dibutuhkan, endpoint ini harus diimplementasikan lebih dulu.
9. **Semua respons `/api` memakai `no-store`**; jangan mengandalkan cache HTTP di browser.
10. **Rate limit berlaku per IP**. Saat menguji dengan banyak request paralel, `429` bisa
    muncul sebelum 400 request jika `trust proxy` salah dikonfigurasi di depan reverse proxy.
