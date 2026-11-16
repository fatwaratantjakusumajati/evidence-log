const express = require("express");
const router = express.Router();
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const multer = require("multer");
const pool = require("../db");
const { clampLimit } = require("../utils/pagination");
const { sendServerError } = require("../utils/errors");
const { requireAdmin } = require("../middleware/auth");
const logger = require("../utils/logger");

// Folder tempat file .xlsx hasil OCR disimpan. Sengaja terpisah dari
// SNAPSHOT_DIR (yang isinya foto CCTV) supaya gampang dibedakan saat backup.
const DOCUMENTS_DIR = process.env.DOCUMENTS_DIR || path.join(__dirname, "..", "documents-files");
if (!fs.existsSync(DOCUMENTS_DIR)) fs.mkdirSync(DOCUMENTS_DIR, { recursive: true });

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 }, // 8mb, sama seperti batas foto di server.js
});

// Ratakan informasi/tabel/ringkasan jadi satu blok teks polos supaya bisa
// dicari lewat search_vector, tanpa perlu n8n mengirim full_text terpisah.
function flattenForSearch({ informasi = [], tabel = [], ringkasan = [], catatan }) {
  const parts = [];
  for (const e of informasi)
    if (e?.label || e?.nilai != null) parts.push(`${e.label ?? ""} ${e.nilai ?? ""}`);
  for (const t of tabel) {
    if (t?.nama) parts.push(t.nama);
    if (Array.isArray(t?.kolom)) parts.push(t.kolom.join(" "));
    if (Array.isArray(t?.baris)) for (const row of t.baris) parts.push(row.join(" "));
  }
  for (const e of ringkasan)
    if (e?.label || e?.nilai != null) parts.push(`${e.label ?? ""} ${e.nilai ?? ""}`);
  if (catatan) parts.push(catatan);
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

function safeJsonParse(value, fallback) {
  if (value == null || value === "") return fallback;
  if (typeof value !== "string") return value; // sudah object (kalau dikirim sebagai JSON body, bukan form-data)
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

// Cek x-ingest-key. Dipakai route yang dipanggil n8n (tanpa login user).
// Mengembalikan true bila lolos; kalau gagal, respons error sudah dikirim.
function checkIngestKey(req, res) {
  const ingestKey = process.env.DOCUMENTS_INGEST_KEY;
  if (!ingestKey) {
    res.status(500).json({ error: "DOCUMENTS_INGEST_KEY belum di-set di .env" });
    return false;
  }
  if (req.headers["x-ingest-key"] !== ingestKey) {
    res.status(401).json({ error: "Unauthorized: x-ingest-key tidak valid" });
    return false;
  }
  return true;
}

function parseJumlahPallet(v) {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= maxPalletPerPo() ? n : null;
}

// Isi kolom jumlah_pallet dari dashboard/n8n: "N" (N pallet baru) atau "N+12,15" (N pallet baru
// + gabung ke pallet aktif dengan id 12 dan 15). Format ini dipakai supaya workflow n8n tidak perlu diubah.
function parsePalletInput(v) {
  const m = String(v ?? "").trim().match(/^(\d+)(?:\+(\d+(?:,\d+)*))?$/);
  if (!m) return null;
  const baru = Number(m[1]);
  const gabung = m[2] ? [...new Set(m[2].split(",").map(Number))] : [];
  if (baru > maxPalletPerPo() || baru + gabung.length < 1) return null;
  return { baru, gabung };
}

// Nomor "terpakai" = pallet ACTIVE, atau RELEASED tapi stikernya belum dicopot.
async function sisaSlot() {
  const r = await pool.query(
    `SELECT COUNT(*)::int AS n FROM document_pallets
      WHERE NOT (status = 'RELEASED' AND sticker_removed)`,
  );
  return POOL_MAX - POOL_MIN + 1 - r.rows[0].n;
}

async function withTx(fn) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const out = await fn(client);
    await client.query("COMMIT");
    return out;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

// Ambil n nomor bebas dari pool dan catat sebagai pallet dokumen ini.
// WAJIB dipanggil di dalam withTx().
async function alokasiPallet(client, documentId, n, mulaiDariNo = 1) {
  await client.query("SELECT pg_advisory_xact_lock(7001)"); // cegah dua upload dapat nomor sama
  const used = await client.query(
    `SELECT aruco_id FROM document_pallets
      WHERE NOT (status = 'RELEASED' AND sticker_removed)`,
  );
  const dipakai = new Set(used.rows.map((r) => r.aruco_id));
  const bebas = [];
  for (let id = POOL_MIN; id <= POOL_MAX && bebas.length < n; id++) {
    if (!dipakai.has(id)) bebas.push(id);
  }
  if (bebas.length < n) {
    const err = new Error(`Slot marker kurang: diminta ${n}, tersisa ${bebas.length}`);
    err.status = 409;
    throw err;
  }
  const hasil = [];
  for (let i = 0; i < n; i++) {
    const r = await client.query(
      `INSERT INTO document_pallets (document_id, pallet_no, aruco_id)
       VALUES ($1,$2,$3) RETURNING id, pallet_no, aruco_id`,
      [documentId, mulaiDariNo + i, bebas[i]],
    );
    // Satu pallet bisa berisi beberapa PO: pasangan pallet-PO dicatat di pallet_documents.
    await client.query(
      `INSERT INTO pallet_documents (pallet_id, document_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
      [r.rows[0].id, documentId],
    );
    hasil.push({ pallet_no: r.rows[0].pallet_no, aruco_id: r.rows[0].aruco_id });
  }
  return hasil;
}

// ------------------ INGEST DARI N8N (tanpa login user, pakai ingest key) ------------------
// PENTING: route ini HARUS dikecualikan dari gerbang requireAuth di server.js
// (lihat catatan integrasi), karena yang memanggil adalah workflow n8n, bukan
// user yang login lewat browser. Sebagai gantinya dia dilindungi header
// x-ingest-key yang dibandingkan dengan DOCUMENTS_INGEST_KEY di .env.
router.post("/ingest", upload.single("file"), async (req, res) => {
  try {
    if (!checkIngestKey(req, res)) return;

    const jenis_dokumen = req.body.jenis_dokumen || "dokumen";
    const judul = req.body.judul || null;
    const informasi = safeJsonParse(req.body.informasi, []);
    const tabel = safeJsonParse(req.body.tabel, []);
    const ringkasan = safeJsonParse(req.body.ringkasan, []);
    const catatan = req.body.catatan || null;
    const uploaded_by = req.body.uploaded_by || "n8n";
    const palletIn = parsePalletInput(req.body.jumlah_pallet);
    const jumlah_pallet = palletIn && palletIn.baru > 0 ? palletIn.baru : null; // pallet baru
    const gabung_ke = palletIn && palletIn.gabung.length ? palletIn.gabung : null; // pallet yang digabung
    const full_text =
      req.body.full_text && req.body.full_text.trim()
        ? req.body.full_text
        : flattenForSearch({ informasi, tabel, ringkasan, catatan });

    let file_name = null;
    let file_path = null;
    if (req.file) {
      const safeBase = (req.body.file_name || req.file.originalname || "dokumen.xlsx").replace(
        /[\\/:*?"<>|\s]+/g,
        "_",
      );
      file_name = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}-${safeBase}`;
      file_path = path.join(DOCUMENTS_DIR, file_name);
      fs.writeFileSync(file_path, req.file.buffer);
    }

    const result = await pool.query(
      `INSERT INTO documents
         (jenis_dokumen, judul, informasi, tabel, ringkasan, catatan, full_text, file_name, file_path, uploaded_by, jumlah_pallet, gabung_ke)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING id, created_at`,
      [
        jenis_dokumen,
        judul,
        JSON.stringify(informasi),
        JSON.stringify(tabel),
        JSON.stringify(ringkasan),
        catatan,
        full_text,
        file_name,
        file_path,
        uploaded_by,
        jumlah_pallet,
        gabung_ke,
      ],
    );

    logger.info(`📄 Dokumen baru diarsipkan: #${result.rows[0].id} (${jenis_dokumen})`);
    res
      .status(201)
      .json({ success: true, id: result.rows[0].id, created_at: result.rows[0].created_at });
  } catch (err) {
    sendServerError(res, err, "POST /api/documents/ingest");
  }
});

// ------------------ SIMPAN NOMOR PO + ID ARUCO (dipanggil n8n) ------------------
// Body JSON: { document_id, po_number }
// - Jumlah pallet dibaca dari baris dokumen (dititipkan oleh /ingest).
// - Backend mengalokasikan N nomor marker (1-100) dari pool, satu per pallet.
// - PO ganda -> 409, dokumen ditandai duplicate_of, tidak ada marker.
// Sama seperti /ingest, route ini harus dikecualikan dari requireAuth di server.js.
const ARUCO_MAX_ID = 999; // DICT_4X4_1000 (batas dictionary)
const POOL_MIN = 1; // 0 dipakai marker kamera
// Batas atas nomor marker yang dialokasikan ke pallet. Default 999 (semua ID yang tersedia).
// Bisa dibatasi lewat .env: MARKER_POOL_MAX=300 (maksimal 999 karena dictionary DICT_4X4_1000). Nomor dialokasikan dari yang terkecil,
// jadi nomor di atas pemakaian sekarang tetap "kosong" dan membantu menyaring salah baca kamera.
const _poolMax = Number(process.env.MARKER_POOL_MAX);
const POOL_MAX =
  Number.isInteger(_poolMax) && _poolMax >= POOL_MIN && _poolMax <= ARUCO_MAX_ID ? _poolMax : ARUCO_MAX_ID;
// Batas jumlah pallet dalam SATU PO. Default 999 (mengikuti pool). Bisa dibatasi lewat .env: MAX_PALLET_PER_PO=100
const _maxPerPo = Number(process.env.MAX_PALLET_PER_PO);
const MAX_PALLET_PER_PO = Number.isInteger(_maxPerPo) && _maxPerPo >= 1 ? _maxPerPo : ARUCO_MAX_ID;
const maxPalletPerPo = () => Math.min(MAX_PALLET_PER_PO, POOL_MAX);

router.post("/ingest/aruco", express.json(), async (req, res) => {
  try {
    if (!checkIngestKey(req, res)) return;

    const documentId = Number(req.body.document_id);
    const poNumber = String(req.body.po_number ?? "").trim();
    if (!Number.isInteger(documentId) || documentId <= 0) {
      return res.status(400).json({ error: "document_id tidak valid" });
    }
    if (!poNumber) return res.status(400).json({ error: "po_number kosong" });

    // 1) PO ganda -> jangan alokasikan marker, tandai sebagai duplikat
    const dup = await pool.query(
      `SELECT id FROM documents WHERE po_number = $1 AND id <> $2 ORDER BY id LIMIT 1`,
      [poNumber, documentId],
    );
    if (dup.rows.length) {
      await pool.query(`UPDATE documents SET po_number = $1, duplicate_of = $2 WHERE id = $3`, [
        poNumber,
        dup.rows[0].id,
        documentId,
      ]);
      return res.status(409).json({ error: "Nomor PO sudah ada", duplicate_of: dup.rows[0].id });
    }

    // 2) jumlah pallet baru + pallet yang digabung dibaca dari baris dokumen
    const doc = await pool.query(`SELECT jumlah_pallet, gabung_ke FROM documents WHERE id = $1`, [documentId]);
    if (!doc.rows.length) return res.status(404).json({ error: "Dokumen tidak ditemukan" });
    const jumlah = doc.rows[0].jumlah_pallet || 0;
    const gabung = doc.rows[0].gabung_ke || [];
    if (!jumlah && !gabung.length) {
      return res.status(400).json({ error: "jumlah_pallet belum tersimpan di dokumen" });
    }

    // 3) alokasi pallet baru + gabung ke pallet yang sudah ada; aman kalau n8n memanggil ulang
    const { pallets, shared } = await withTx(async (client) => {
      const ada = await client.query(
        `SELECT pallet_no, aruco_id FROM document_pallets
          WHERE document_id = $1 AND status = 'ACTIVE' ORDER BY pallet_no`,
        [documentId],
      );
      let baru = ada.rows;
      if (!baru.length && jumlah > 0) baru = await alokasiPallet(client, documentId, jumlah);
      await client.query(`UPDATE documents SET po_number = $1 WHERE id = $2`, [poNumber, documentId]);

      let sharedRows = [];
      if (gabung.length) {
        const ok = await client.query(
          `SELECT id FROM document_pallets WHERE id = ANY($1::int[]) AND status = 'ACTIVE'`,
          [gabung],
        );
        if (ok.rows.length !== gabung.length) {
          const e = new Error("Pallet yang dipilih untuk digabung sudah tidak aktif");
          e.status = 409;
          throw e;
        }
        await client.query(
          `INSERT INTO pallet_documents (pallet_id, document_id)
           SELECT id, $2 FROM document_pallets WHERE id = ANY($1::int[])
           ON CONFLICT DO NOTHING`,
          [gabung, documentId],
        );
        const sr = await client.query(
          `SELECT id AS pallet_id, aruco_id FROM document_pallets WHERE id = ANY($1::int[]) ORDER BY aruco_id`,
          [gabung],
        );
        sharedRows = sr.rows;
      }
      return { pallets: baru, shared: sharedRows };
    });

    logger.info(
      `🔖 Dokumen #${documentId}: PO ${poNumber} -> ${pallets.length} pallet baru (ID ${pallets.map((p) => p.aruco_id).join(",") || "-"})` +
        (shared.length ? `, digabung ke pallet ID ${shared.map((p) => p.aruco_id).join(",")}` : ""),
    );
    // pallets = marker BARU (perlu dicetak). shared = pallet lama yang sudah bertempel stiker.
    res.json({ success: true, id: documentId, po_number: poNumber, pallets, shared });
  } catch (err) {
    if (err.status === 409) return res.status(409).json({ error: err.message });
    sendServerError(res, err, "POST /api/documents/ingest/aruco");
  }
});

// ------------------ UPLOAD DARI DASHBOARD -> TERUSKAN KE N8N ------------------
// Route ini ikut gerbang requireAuth di server.js (wajib login). Browser tidak
// pernah bicara langsung ke n8n: backend yang meneruskan file ke webhook n8n
// lewat jaringan internal Docker, jadi webhook n8n tidak perlu dibuka ke publik.
const ALLOWED_UPLOAD_TYPES = ["image/jpeg", "image/png"];

router.post("/upload", upload.single("file"), async (req, res) => {
  try {
    const webhookUrl = process.env.N8N_WEBHOOK_URL;
    if (!webhookUrl) {
      return res.status(500).json({ error: "N8N_WEBHOOK_URL belum di-set di .env backend" });
    }
    if (!req.file) {
      return res.status(400).json({ error: "File belum dipilih." });
    }
    if (!ALLOWED_UPLOAD_TYPES.includes(req.file.mimetype)) {
      return res.status(400).json({ error: "Format file harus JPG atau PNG." });
    }

    // jumlah pallet BARU (boleh 0 bila hanya menggabung) + id pallet aktif yang digabung
    const jumlahBaru =
      req.body.jumlah_pallet === undefined || String(req.body.jumlah_pallet).trim() === ""
        ? 0
        : Number(req.body.jumlah_pallet);
    const gabung = [
      ...new Set(
        String(req.body.gabung_ke ?? "")
          .split(",")
          .map((x) => Number(x.trim()))
          .filter((n) => Number.isInteger(n) && n > 0),
      ),
    ];
    if (!Number.isInteger(jumlahBaru) || jumlahBaru < 0 || jumlahBaru > maxPalletPerPo() || jumlahBaru + gabung.length < 1) {
      return res
        .status(400)
        .json({ error: `Isi jumlah pallet baru (1-${maxPalletPerPo()}) atau pilih pallet yang digabung.` });
    }
    if (gabung.length) {
      const ok = await pool.query(
        `SELECT COUNT(*)::int AS n FROM document_pallets WHERE id = ANY($1::int[]) AND status = 'ACTIVE'`,
        [gabung],
      );
      if (ok.rows[0].n !== gabung.length) {
        return res.status(409).json({ error: "Ada pallet yang dipilih untuk digabung sudah tidak aktif." });
      }
    }
    const sisa = await sisaSlot();
    if (jumlahBaru > sisa) {
      return res.status(409).json({ error: `Slot marker tidak cukup (sisa ${sisa}).` });
    }

    const form = new FormData();
    form.append(
      "file",
      new Blob([req.file.buffer], { type: req.file.mimetype }),
      req.file.originalname || "dokumen.jpg",
    );
    // "N" atau "N+id,id": satu kolom supaya workflow n8n tidak perlu diubah
    form.append("jumlah_pallet", gabung.length ? `${jumlahBaru}+${gabung.join(",")}` : String(jumlahBaru));

    const headers = {};
    if (process.env.N8N_UPLOAD_KEY) headers["x-upload-key"] = process.env.N8N_UPLOAD_KEY;

    const n8nRes = await fetch(webhookUrl, {
      method: "POST",
      headers,
      body: form,
      signal: AbortSignal.timeout(30000),
    });
    if (!n8nRes.ok) {
      logger.error(`n8n webhook membalas ${n8nRes.status}`);
      return res.status(502).json({ error: `n8n menolak file (status ${n8nRes.status}).` });
    }

    logger.info(`📤 Dokumen dikirim ke n8n: ${req.file.originalname}`);
    res.status(202).json({ success: true, message: "File diterima, sedang diproses." });
  } catch (err) {
    sendServerError(res, err, "POST /api/documents/upload");
  }
});

// ------------------ DAFTAR + PENCARIAN + PAGINASI ------------------
router.get("/", async (req, res) => {
  try {
    const {
      page = 1,
      limit: rawLimit = 20,
      jenis = "all",
      search,
      start_date,
      end_date,
    } = req.query;
    const limit = clampLimit(rawLimit, { defaultLimit: 20, maxLimit: 100 });
    const offset = (Number(page) - 1) * limit;

    const conditions = [];
    const params = [];

    if (jenis && jenis !== "all") {
      params.push(jenis);
      conditions.push(`jenis_dokumen = $${params.length}`);
    }
    if (start_date) {
      params.push(start_date);
      conditions.push(`created_at >= $${params.length}`);
    }
    if (end_date) {
      params.push(end_date);
      conditions.push(`created_at <= $${params.length}`);
    }

    let searchSelect = "";
    let orderBy = "created_at DESC";
    if (search && search.trim()) {
      params.push(search.trim());
      const qIdx = params.length;
      conditions.push(`search_vector @@ plainto_tsquery('simple', $${qIdx})`);
      searchSelect = `, ts_rank(search_vector, plainto_tsquery('simple', $${qIdx})) AS rank`;
      orderBy = "rank DESC, created_at DESC";
    }

    const whereClause = conditions.length ? "WHERE " + conditions.join(" AND ") : "";

    const dataQuery = `
      SELECT id, jenis_dokumen, judul, ringkasan, file_name, po_number,
             jumlah_pallet, duplicate_of, created_at,
             COALESCE((SELECT array_agg(p.aruco_id ORDER BY (p.document_id = documents.id) DESC, p.pallet_no)
                         FROM pallet_documents pd JOIN document_pallets p ON p.id = pd.pallet_id
                        WHERE pd.document_id = documents.id AND p.status = 'ACTIVE'), '{}') AS pallet_ids,
             COALESCE((SELECT array_agg(p.aruco_id ORDER BY p.aruco_id)
                         FROM pallet_documents pd JOIN document_pallets p ON p.id = pd.pallet_id
                        WHERE pd.document_id = documents.id AND p.status = 'ACTIVE'
                          AND EXISTS (SELECT 1 FROM pallet_documents o
                                       WHERE o.pallet_id = p.id AND o.document_id <> documents.id)), '{}') AS pallet_bersama
             ${searchSelect}
      FROM documents
      ${whereClause}
      ORDER BY ${orderBy}
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `;
    const countQuery = `SELECT COUNT(*) AS total FROM documents ${whereClause}`;

    const dataResult = await pool.query(dataQuery, [...params, limit, offset]);
    const totalResult = await pool.query(countQuery, params);
    const total = parseInt(totalResult.rows[0].total, 10);

    res.json({
      data: dataResult.rows,
      total,
      page: Number(page),
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (err) {
    sendServerError(res, err, "GET /api/documents");
  }
});

// ------------------ SISA SLOT MARKER (dipakai form upload) ------------------
router.get("/pool", async (req, res) => {
  try {
    const total = POOL_MAX - POOL_MIN + 1;
    const sisa = await sisaSlot();
    res.json({ total, terpakai: total - sisa, sisa });
  } catch (err) {
    sendServerError(res, err, "GET /api/documents/pool");
  }
});

// Pallet aktif + PO yang ada di dalamnya (pilihan "gabung ke pallet yang sudah ada" di form upload)
router.get("/pallets/aktif", async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT p.id, p.aruco_id,
              COALESCE(array_agg(d.po_number ORDER BY d.po_number) FILTER (WHERE d.po_number IS NOT NULL), '{}') AS po_list
         FROM document_pallets p
         LEFT JOIN pallet_documents pd ON pd.pallet_id = p.id
         LEFT JOIN documents d ON d.id = pd.document_id
        WHERE p.status = 'ACTIVE'
        GROUP BY p.id, p.aruco_id
        ORDER BY p.aruco_id`,
    );
    res.json(r.rows);
  } catch (err) {
    sendServerError(res, err, "GET /api/documents/pallets/aktif");
  }
});

// Pallet yang sudah dilepas tapi stikernya belum dikonfirmasi dicopot
router.get("/pallets/pending", async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT p.id, p.pallet_no, p.aruco_id, p.released_at, d.po_number
         FROM document_pallets p LEFT JOIN documents d ON d.id = p.document_id
        WHERE p.status = 'RELEASED' AND NOT p.sticker_removed
        ORDER BY p.released_at DESC`,
    );
    res.json(r.rows);
  } catch (err) {
    sendServerError(res, err, "GET /api/documents/pallets/pending");
  }
});

// Konfirmasi: stiker sudah dicopot, nomor kembali ke pool
router.post("/pallets/:palletId/sticker-removed", async (req, res) => {
  try {
    const r = await pool.query(
      `UPDATE document_pallets SET sticker_removed = true
        WHERE id = $1 AND status = 'RELEASED' RETURNING id`,
      [req.params.palletId],
    );
    if (!r.rows.length) {
      return res.status(404).json({ error: "Pallet tidak ditemukan / belum dilepas" });
    }
    res.json({ success: true });
  } catch (err) {
    sendServerError(res, err, "POST /api/documents/pallets/:palletId/sticker-removed");
  }
});

// ------------------ EDIT PO: nomor PO dan/atau jumlah pallet ------------------
router.patch("/:id", express.json(), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const ubahPo = req.body.po_number !== undefined;
    const ubahJumlah = req.body.jumlah_pallet !== undefined;
    const poBaru = ubahPo ? String(req.body.po_number).trim() : null;
    const jumlahBaru = ubahJumlah ? parseJumlahPallet(req.body.jumlah_pallet) : null;
    if (ubahPo && !poBaru) return res.status(400).json({ error: "Nomor PO kosong" });
    if (ubahJumlah && !jumlahBaru) {
      return res.status(400).json({ error: `Jumlah pallet harus 1-${maxPalletPerPo()}` });
    }

    const hasil = await withTx(async (client) => {
      const doc = await client.query(`SELECT po_number FROM documents WHERE id = $1 FOR UPDATE`, [id]);
      if (!doc.rows.length) {
        const e = new Error("Dokumen tidak ditemukan");
        e.status = 404;
        throw e;
      }

      if (poBaru && poBaru !== doc.rows[0].po_number) {
        const dup = await client.query(
          `SELECT id FROM documents WHERE po_number = $1 AND id <> $2 LIMIT 1`,
          [poBaru, id],
        );
        if (dup.rows.length) {
          const e = new Error("Nomor PO sudah dipakai dokumen lain");
          e.status = 409;
          throw e;
        }
        await client.query(`UPDATE documents SET po_number = $1, duplicate_of = NULL WHERE id = $2`, [
          poBaru,
          id,
        ]);
      }

      let dilepas = [];
      if (jumlahBaru) {
        const aktif = await client.query(
          `SELECT id, pallet_no, aruco_id FROM document_pallets
            WHERE document_id = $1 AND status = 'ACTIVE' ORDER BY pallet_no`,
          [id],
        );
        const sekarang = aktif.rows.length;
        if (jumlahBaru > sekarang) {
          await alokasiPallet(client, id, jumlahBaru - sekarang, sekarang + 1);
        } else if (jumlahBaru < sekarang) {
          dilepas = aktif.rows.slice(jumlahBaru); // nomor pallet tertinggi dilepas dulu
          const bersama = await client.query(
            `SELECT DISTINCT p.aruco_id FROM pallet_documents pd
               JOIN document_pallets p ON p.id = pd.pallet_id
              WHERE pd.pallet_id = ANY($1::int[]) AND pd.document_id <> $2`,
            [dilepas.map((p) => p.id), id],
          );
          if (bersama.rows.length) {
            const e = new Error(
              `Pallet ID ${bersama.rows.map((r) => r.aruco_id).join(", ")} digabung dengan PO lain. Lepas gabungannya dulu.`,
            );
            e.status = 409;
            throw e;
          }
          await client.query(
            `UPDATE document_pallets SET status = 'RELEASED', released_at = now()
              WHERE id = ANY($1::int[])`,
            [dilepas.map((p) => p.id)],
          );
        }
        await client.query(`UPDATE documents SET jumlah_pallet = $1 WHERE id = $2`, [jumlahBaru, id]);
      }
      return { dilepas };
    });

    res.json({ success: true, ...hasil });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    sendServerError(res, err, "PATCH /api/documents/:id");
  }
});

// ------------------ DETAIL SATU DOKUMEN ------------------
router.get("/:id", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, jenis_dokumen, judul, informasi, tabel, ringkasan, catatan, file_name,
              po_number, jumlah_pallet, duplicate_of, created_at
       FROM documents WHERE id = $1`,
      [req.params.id],
    );
    if (!result.rows.length) return res.status(404).json({ error: "Dokumen tidak ditemukan" });
    const pallets = await pool.query(
      `SELECT p.id, p.pallet_no, p.aruco_id, p.status, p.sticker_removed,
              (p.document_id = $1) AS milik_sendiri,
              COALESCE((SELECT array_agg(d2.po_number ORDER BY d2.po_number)
                          FROM pallet_documents x JOIN documents d2 ON d2.id = x.document_id
                         WHERE x.pallet_id = p.id AND x.document_id <> $1 AND d2.po_number IS NOT NULL), '{}') AS po_lain
         FROM pallet_documents pd JOIN document_pallets p ON p.id = pd.pallet_id
        WHERE pd.document_id = $1
        ORDER BY p.status, (p.document_id = $1) DESC, p.pallet_no`,
      [req.params.id],
    );
    res.json({ ...result.rows[0], pallets: pallets.rows });
  } catch (err) {
    sendServerError(res, err, "GET /api/documents/:id");
  }
});

// ------------------ UNDUH FILE EXCEL ASLI ------------------
router.get("/:id/file", async (req, res) => {
  try {
    const result = await pool.query(`SELECT file_name, file_path FROM documents WHERE id = $1`, [
      req.params.id,
    ]);
    if (!result.rows.length || !result.rows[0].file_path) {
      return res.status(404).json({ error: "File tidak ditemukan" });
    }
    const { file_name, file_path } = result.rows[0];
    if (!fs.existsSync(file_path)) {
      return res.status(404).json({ error: "File sudah tidak ada di server" });
    }
    res.download(file_path, file_name || "dokumen.xlsx");
  } catch (err) {
    sendServerError(res, err, "GET /api/documents/:id/file");
  }
});

// ------------------ GABUNG KE PALLET (setelah upload) ------------------
// Body JSON: { pallet_ids: [12, 15] }. Menambahkan PO ini ke pallet aktif yang sudah ada,
// hasilnya sama dengan memilih "Gabung ke pallet" saat upload. Tidak membuat marker baru.
router.post("/:id/gabung", express.json(), async (req, res) => {
  try {
    const docId = Number(req.params.id);
    if (!Number.isInteger(docId) || docId <= 0) return res.status(400).json({ error: "id tidak valid" });
    const palletIds = [
      ...new Set((Array.isArray(req.body?.pallet_ids) ? req.body.pallet_ids : []).map(Number)),
    ].filter((n) => Number.isInteger(n) && n > 0);
    if (!palletIds.length) return res.status(400).json({ error: "Pilih minimal satu pallet." });

    const hasil = await withTx(async (client) => {
      const doc = await client.query(
        `SELECT po_number, duplicate_of FROM documents WHERE id = $1 FOR UPDATE`,
        [docId],
      );
      if (!doc.rows.length) {
        const e = new Error("Dokumen tidak ditemukan");
        e.status = 404;
        throw e;
      }
      if (!doc.rows[0].po_number || doc.rows[0].duplicate_of) {
        const e = new Error("Dokumen ini belum punya nomor PO yang valid, jadi belum bisa digabung.");
        e.status = 409;
        throw e;
      }
      const ok = await client.query(
        `SELECT id, aruco_id FROM document_pallets WHERE id = ANY($1::int[]) AND status = 'ACTIVE'`,
        [palletIds],
      );
      if (ok.rows.length !== palletIds.length) {
        const e = new Error("Ada pallet yang dipilih sudah tidak aktif.");
        e.status = 409;
        throw e;
      }
      const ins = await client.query(
        `INSERT INTO pallet_documents (pallet_id, document_id)
         SELECT id, $2 FROM document_pallets WHERE id = ANY($1::int[])
         ON CONFLICT DO NOTHING
         RETURNING pallet_id`,
        [palletIds, docId],
      );
      return { ditambah: ins.rows.length, aruco_ids: ok.rows.map((r) => r.aruco_id).sort((a, b) => a - b) };
    });

    logger.info(`🔗 Dokumen #${docId} digabung ke pallet ID ${hasil.aruco_ids.join(",")}`);
    res.json({ success: true, ...hasil });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    sendServerError(res, err, "POST /api/documents/:id/gabung");
  }
});

// ------------------ LEPAS GABUNGAN: keluarkan PO dari pallet yang dipakai bersama ------------------
// Pallet tetap ada untuk PO lain. Kalau PO ini pembuat pallet, kepemilikan pindah ke PO lain.
router.delete("/:id/gabung/:palletId", async (req, res) => {
  try {
    const docId = Number(req.params.id);
    const palletId = Number(req.params.palletId);
    if (!Number.isInteger(docId) || !Number.isInteger(palletId)) {
      return res.status(400).json({ error: "id tidak valid" });
    }
    await withTx(async (client) => {
      const link = await client.query(
        `SELECT 1 FROM pallet_documents WHERE pallet_id = $1 AND document_id = $2`,
        [palletId, docId],
      );
      if (!link.rows.length) {
        const e = new Error("Pallet ini tidak terhubung ke PO tersebut");
        e.status = 404;
        throw e;
      }
      const lain = await client.query(
        `SELECT document_id FROM pallet_documents WHERE pallet_id = $1 AND document_id <> $2 ORDER BY document_id`,
        [palletId, docId],
      );
      if (!lain.rows.length) {
        const e = new Error("Pallet ini hanya milik PO ini. Kurangi jumlah pallet atau hapus dokumennya.");
        e.status = 409;
        throw e;
      }
      await client.query(`DELETE FROM pallet_documents WHERE pallet_id = $1 AND document_id = $2`, [palletId, docId]);
      await client.query(`UPDATE document_pallets SET document_id = $3 WHERE id = $1 AND document_id = $2`, [
        palletId,
        docId,
        lain.rows[0].document_id,
      ]);
    });
    res.json({ success: true });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    sendServerError(res, err, "DELETE /api/documents/:id/gabung/:palletId");
  }
});

// ------------------ HAPUS DOKUMEN (admin only) ------------------
router.delete("/:id", requireAdmin, async (req, res) => {
  try {
    const docId = Number(req.params.id);
    // Pallet yang masih dipakai PO lain: serahkan ke PO lain, JANGAN dilepas.
    // Pallet yang hanya milik dokumen ini: dilepas (nomor TIDAK langsung bebas karena stiker masih menempel).
    await withTx(async (client) => {
      const linked = await client.query(
        `SELECT pd.pallet_id, p.document_id AS pembuat, p.status
           FROM pallet_documents pd JOIN document_pallets p ON p.id = pd.pallet_id
          WHERE pd.document_id = $1`,
        [docId],
      );
      for (const row of linked.rows) {
        const lain = await client.query(
          `SELECT document_id FROM pallet_documents WHERE pallet_id = $1 AND document_id <> $2 ORDER BY document_id`,
          [row.pallet_id, docId],
        );
        if (lain.rows.length) {
          if (Number(row.pembuat) === docId) {
            await client.query(`UPDATE document_pallets SET document_id = $2 WHERE id = $1`, [
              row.pallet_id,
              lain.rows[0].document_id,
            ]);
          }
          await client.query(`DELETE FROM pallet_documents WHERE pallet_id = $1 AND document_id = $2`, [
            row.pallet_id,
            docId,
          ]);
        } else if (row.status === "ACTIVE") {
          await client.query(`UPDATE document_pallets SET status = 'RELEASED', released_at = now() WHERE id = $1`, [
            row.pallet_id,
          ]);
        }
      }
    });
    const result = await pool.query(`DELETE FROM documents WHERE id = $1 RETURNING file_path`, [docId]);
    if (!result.rows.length) return res.status(404).json({ error: "Dokumen tidak ditemukan" });
    const { file_path } = result.rows[0];
    if (file_path && fs.existsSync(file_path)) fs.unlinkSync(file_path);
    res.json({ success: true });
  } catch (err) {
    sendServerError(res, err, "DELETE /api/documents/:id");
  }
});

module.exports = router;