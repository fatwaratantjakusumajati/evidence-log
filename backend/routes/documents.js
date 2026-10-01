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
         (jenis_dokumen, judul, informasi, tabel, ringkasan, catatan, full_text, file_name, file_path, uploaded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
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
// Body JSON: { document_id, po_number, aruco_id? }
// - aruco_id kosong  -> backend mengalokasikan ID berikutnya dari sequence.
// - PO yang sama (po_number sama) selalu memakai ID ArUco yang sama.
// Sama seperti /ingest, route ini harus dikecualikan dari requireAuth di server.js.
const ARUCO_MAX_ID = 999; // DICT_4X4_1000

router.post("/ingest/aruco", express.json(), async (req, res) => {
  try {
    if (!checkIngestKey(req, res)) return;

    const documentId = Number(req.body.document_id);
    const poNumber = String(req.body.po_number ?? "").trim();
    if (!Number.isInteger(documentId) || documentId <= 0) {
      return res.status(400).json({ error: "document_id tidak valid" });
    }
    if (!poNumber) return res.status(400).json({ error: "po_number kosong" });

    let arucoId = null;
    if (req.body.aruco_id !== undefined && req.body.aruco_id !== null && req.body.aruco_id !== "") {
      arucoId = Number(req.body.aruco_id);
      if (!Number.isInteger(arucoId) || arucoId < 0 || arucoId > ARUCO_MAX_ID) {
        return res.status(400).json({ error: `aruco_id harus 0-${ARUCO_MAX_ID}` });
      }
    } else {
      // PO yang sama -> pakai ID yang sudah ada
      const existing = await pool.query(
        `SELECT aruco_id FROM documents WHERE po_number = $1 AND aruco_id IS NOT NULL LIMIT 1`,
        [poNumber],
      );
      if (existing.rows.length) {
        arucoId = existing.rows[0].aruco_id;
      } else {
        const seq = await pool.query(`SELECT nextval('documents_aruco_seq') AS id`);
        arucoId = Number(seq.rows[0].id);
        if (arucoId > ARUCO_MAX_ID) {
          return res.status(409).json({ error: `ID ArUco habis (maksimal ${ARUCO_MAX_ID})` });
        }
      }
    }

    const result = await pool.query(
      `UPDATE documents SET po_number = $1, aruco_id = $2 WHERE id = $3 RETURNING id`,
      [poNumber, arucoId, documentId],
    );
    if (!result.rows.length) return res.status(404).json({ error: "Dokumen tidak ditemukan" });

    logger.info(`🔖 Dokumen #${documentId}: PO ${poNumber} -> ArUco ID ${arucoId}`);
    res.json({ success: true, id: documentId, po_number: poNumber, aruco_id: arucoId });
  } catch (err) {
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

    const form = new FormData();
    form.append(
      "file",
      new Blob([req.file.buffer], { type: req.file.mimetype }),
      req.file.originalname || "dokumen.jpg",
    );

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
      SELECT id, jenis_dokumen, judul, ringkasan, file_name, po_number, aruco_id, created_at ${searchSelect}
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

// ------------------ DETAIL SATU DOKUMEN ------------------
router.get("/:id", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, jenis_dokumen, judul, informasi, tabel, ringkasan, catatan, file_name, po_number, aruco_id, created_at
       FROM documents WHERE id = $1`,
      [req.params.id],
    );
    if (!result.rows.length) return res.status(404).json({ error: "Dokumen tidak ditemukan" });
    res.json(result.rows[0]);
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

// ------------------ HAPUS DOKUMEN (admin only) ------------------
router.delete("/:id", requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(`DELETE FROM documents WHERE id = $1 RETURNING file_path`, [
      req.params.id,
    ]);
    if (!result.rows.length) return res.status(404).json({ error: "Dokumen tidak ditemukan" });
    const { file_path } = result.rows[0];
    if (file_path && fs.existsSync(file_path)) fs.unlinkSync(file_path);
    res.json({ success: true });
  } catch (err) {
    sendServerError(res, err, "DELETE /api/documents/:id");
  }
});

module.exports = router;
