const express = require("express");
const router = express.Router();
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const pool = require("../db");
const { clampLimit } = require("../utils/pagination");
const { sendServerError } = require("../utils/errors");
const logger = require("../utils/logger");

// Foto kejadian disimpan sebagai file (bukan base64 di DB) supaya tabel tetap ringan.
const TRACKING_DIR = process.env.TRACKING_DIR || path.join(__dirname, "..", "tracking-images");
if (!fs.existsSync(TRACKING_DIR)) fs.mkdirSync(TRACKING_DIR, { recursive: true });

// cctv-monitor-aruco.py mengirim waktu lokal tanpa zona waktu.
const TRACKING_TZ = process.env.TRACKING_TZ || "Asia/Jakarta";

const EVENT_TYPES = [
  "NEW",
  "MOVED_ZONE",
  "MOVED_POS",
  "MISSING",
  "RETURNED",
  "CAMERA_OFFLINE",
  "CAMERA_ONLINE",
];
// Ambang alert pallet hilang (jam). Default 3 dan 6 jam = 2 tingkat alert.
// Ubah lewat .env, contoh: MISSING_ALERT_HOURS=3,6  (boleh lebih dari dua, dipisah koma)
const MISSING_ALERT_HOURS = (process.env.MISSING_ALERT_HOURS || "3,6")
  .split(",")
  .map((x) => Number(x.trim()))
  .filter((x) => Number.isFinite(x) && x > 0)
  .sort((a, b) => a - b);
const MISSING_ALERT_CHECK_MIN = Number(process.env.MISSING_ALERT_CHECK_MIN) || 5;
const TS_RE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;

// Zona outbound dikenali dari NAMA zona (huruf besar/kecil diabaikan, cukup mengandung kata ini).
// Contoh: zona "Outbound 1" cocok. Beberapa kata dipisah koma: OUTBOUND_ZONES=outbound,loading dock
const OUTBOUND_ZONES = (process.env.OUTBOUND_ZONES || "outbound,outbund")
  .split(",")
  .map((x) => x.trim().toLowerCase())
  .filter(Boolean);
const isOutboundZone = (z) => {
  const n = String(z || "").toLowerCase();
  return OUTBOUND_ZONES.some((term) => n.includes(term));
};

// Jeda (menit) sejak pallet hilang dari zona OUTBOUND sampai dianggap selesai.
// Kalau marker terbaca lagi sebelum jeda habis, pallet tidak jadi selesai.
// Default 1440 menit = 24 jam (marker bisa tertutup forklift/orang/plastik wrap cukup lama).
// Ubah lewat .env, contoh: OUTBOUND_GRACE_MIN=720  (12 jam)
const _grace = Number(process.env.OUTBOUND_GRACE_MIN);
const OUTBOUND_GRACE_MIN =
  process.env.OUTBOUND_GRACE_MIN != null &&
  process.env.OUTBOUND_GRACE_MIN !== "" &&
  Number.isFinite(_grace) &&
  _grace >= 0
    ? _grace
    : 1440;

const fmtGrace = (min) => (min >= 120 ? `${Math.round((min / 60) * 10) / 10} jam` : `${min} menit`);

// Kejadian kamera hanya diumumkan dari sini kalau sumber kamera sudah dipindah
// (supaya tidak dobel dengan notifikasi lama dari alert_log).
const CAMERA_FROM_TRACKING =
  (process.env.CAMERA_SOURCE || "alert_log").toLowerCase() === "pallet_events";

// Satu pallet bisa berisi beberapa PO (tabel pallet_documents). Gabungan nomor PO-nya,
// dipakai untuk tampilan dan notifikasi supaya semua PO di pallet itu tersebut.
const poLabelSql = (palletCol) => `(SELECT string_agg(d2.po_number, ', ' ORDER BY d2.po_number)
    FROM pallet_documents x JOIN documents d2 ON d2.id = x.document_id
   WHERE x.pallet_id = ${palletCol} AND d2.po_number IS NOT NULL)`;

// Kirim ke notifikasi web lewat Postgres NOTIFY -> server.js (LISTEN) -> SSE -> lonceng di __root.tsx
async function notifyPalletEvent(payload) {
  try {
    await pool.query("SELECT pg_notify('pallet_event', $1)", [JSON.stringify(payload)]);
  } catch (err) {
    logger.error("Gagal kirim notifikasi pallet_event:", err);
  }
}

// Sama seperti documents.js: dilindungi x-ingest-key, bukan login user.
function checkIngestKey(req, res) {
  const key = process.env.TRACKING_INGEST_KEY || process.env.DOCUMENTS_INGEST_KEY;
  if (!key) {
    res.status(500).json({ error: "TRACKING_INGEST_KEY belum di-set di .env" });
    return false;
  }
  if (req.headers["x-ingest-key"] !== key) {
    res.status(401).json({ error: "Unauthorized: x-ingest-key tidak valid" });
    return false;
  }
  return true;
}

const emptyToNull = (v) => (v == null || String(v).trim() === "" ? null : String(v).trim());

// ------------------ INGEST DARI N8N ------------------
// Body JSON = persis yang dikirim cctv-monitor-aruco.py:
// { time, event, id, from, to, zone, message, detail, image_base64 }
//
// Aturan selesai (pallet ACTIVE yang kejadiannya MISSING):
//  - hilang dari zona OUTBOUND  -> menunggu OUTBOUND_GRACE_MIN menit (default 1440 = 24 jam); bila tidak terbaca lagi -> otomatis SELESAI
//                                  (RELEASED, stiker menunggu dicopot). Penyelesaiannya dilakukan checkOutboundCompletions().
//  - hilang dari zona lain      -> menunggu ACC manual lewat web (approval_status = PENDING)
//  - terlihat lagi (RETURNED) saat masih PENDING -> permintaan ACC dibatalkan otomatis
router.post("/ingest", express.json({ limit: "10mb" }), async (req, res) => {
  let imageFile = null;
  try {
    if (!checkIngestKey(req, res)) return;

    const b = req.body || {};
    const eventType = String(b.event || "").toUpperCase();
    if (!EVENT_TYPES.includes(eventType)) {
      return res.status(400).json({ error: `event tidak dikenal: ${b.event}` });
    }
    const arucoId = Number(b.id);
    if (!Number.isInteger(arucoId) || arucoId < 0 || arucoId > 999) {
      return res.status(400).json({ error: "id marker tidak valid" });
    }

    const isCamera = eventType.startsWith("CAMERA_");
    const timeStr = TS_RE.test(String(b.time || "")) ? b.time : null;
    const zone = String(b.zone || b.to || b.from || "").trim();

    // Pallet/PO yang sedang aktif untuk marker ini (kejadian kamera tidak punya pallet)
    let pallet = {
      id: null,
      document_id: null,
      po_number: null,
      po_label: null,
      approval_status: null,
    };
    if (!isCamera) {
      const p = await pool.query(
        `SELECT p.id, p.document_id, p.approval_status, d.po_number, ${poLabelSql("p.id")} AS po_label
           FROM document_pallets p
           LEFT JOIN documents d ON d.id = p.document_id
          WHERE p.aruco_id = $1 AND p.status = 'ACTIVE'
          ORDER BY p.id DESC LIMIT 1`,
        [arucoId],
      );
      if (p.rows.length) pallet = p.rows[0];
    }

    // Simpan foto bila ada (kejadian kamera tidak membawa foto)
    if (!isCamera && b.image_base64) {
      imageFile = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}.jpg`;
      fs.writeFileSync(path.join(TRACKING_DIR, imageFile), Buffer.from(b.image_base64, "base64"));
    }

    const client = await pool.connect();
    let eventId = null;
    let outcome = null;
    try {
      await client.query("BEGIN");
      const r = await client.query(
        `INSERT INTO pallet_events
           (event_time, event_type, aruco_id, zone, from_zone, to_zone, detail, message,
            pallet_id, document_id, po_number, image_file)
         VALUES (
           COALESCE(($1::timestamp AT TIME ZONE $2), now()),
           $3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         ON CONFLICT (event_time, event_type, aruco_id, zone) DO NOTHING
         RETURNING id, event_time`,
        [
          timeStr,
          TRACKING_TZ,
          eventType,
          arucoId,
          zone,
          emptyToNull(b.from),
          emptyToNull(b.to),
          emptyToNull(b.detail),
          emptyToNull(b.message),
          pallet.id,
          pallet.document_id,
          pallet.po_number,
          imageFile,
        ],
      );

      if (!r.rows.length) {
        await client.query("ROLLBACK");
        if (imageFile) fs.unlink(path.join(TRACKING_DIR, imageFile), () => {});
        return res.json({ success: true, duplicate: true });
      }
      eventId = r.rows[0].id;
      const eventTime = r.rows[0].event_time;

      if (pallet.id && eventType === "MISSING") {
        if (isOutboundZone(zone)) {
          // Hilang dari outbound -> pallet TETAP aktif, hanya dicatat sejak kapan hilang.
          // Kalau sampai OUTBOUND_GRACE_MIN menit tidak terbaca lagi, checkOutboundCompletions()
          // yang menandainya selesai.
          await client.query(
            `UPDATE document_pallets
                SET missing_since = COALESCE(missing_since, $2)
              WHERE id = $1 AND status = 'ACTIVE'`,
            [pallet.id, eventTime],
          );
          outcome = "OUTBOUND_WAIT";
        } else {
          // Hilang bukan dari outbound -> perlu persetujuan manual
          await client.query(
            `UPDATE document_pallets SET approval_status = 'PENDING',
                   missing_since = CASE WHEN approval_status = 'PENDING' THEN missing_since ELSE $2 END,
                   alert_level = CASE WHEN approval_status = 'PENDING' THEN alert_level ELSE 0 END
              WHERE id = $1 AND status = 'ACTIVE'`,
            [pallet.id, eventTime],
          );
          outcome = "NEEDS_APPROVAL";
        }
      } else if (pallet.id) {
        // Marker terbaca lagi dengan tipe event apa pun (RETURNED, NEW, MOVED_ZONE, ...): batalkan status hilang / inventaris.
        const c = await client.query(
          `UPDATE document_pallets SET approval_status = NULL, missing_since = NULL, alert_level = 0,
                  stored_at = NULL, stored_by = NULL, stored_note = NULL
            WHERE id = $1 AND status = 'ACTIVE'
              AND (approval_status = 'PENDING' OR missing_since IS NOT NULL OR stored_at IS NOT NULL) RETURNING id`,
          [pallet.id],
        );
        if (c.rows.length) outcome = "APPROVAL_CANCELLED";
      }
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK");
      if (imageFile) fs.unlink(path.join(TRACKING_DIR, imageFile), () => {});
      throw e;
    } finally {
      client.release();
    }

    logger.info(
      `📍 ${eventType} ID ${arucoId} zona "${zone}" -> PO ${pallet.po_label || pallet.po_number || "(marker belum terdaftar)"}${outcome ? ` [${outcome}]` : ""}`,
    );

    // Notifikasi web. MOVED_POS tidak diumumkan (terlalu sering); kamera hanya kalau sumbernya sudah pindah.
    const announce = eventType !== "MOVED_POS" && (!isCamera || CAMERA_FROM_TRACKING);
    if (announce) {
      await notifyPalletEvent({
        id: eventId,
        event_type: eventType,
        aruco_id: arucoId,
        zone,
        from_zone: emptyToNull(b.from),
        to_zone: emptyToNull(b.to),
        po_number: pallet.po_label || pallet.po_number,
        pallet_id: pallet.id,
        outcome,
        timestamp: new Date().toISOString(),
      });
    }

    res.status(201).json({
      success: true,
      id: eventId,
      po_number: pallet.po_label || pallet.po_number,
      outcome,
    });
  } catch (err) {
    sendServerError(res, err, "POST /api/tracking/ingest");
  }
});

// ------------------ DAFTAR PALLET + POSISI TERAKHIR ------------------
// state: PRESENT (terlihat), MISSING (hilang), UNSEEN (belum pernah terbaca),
//        PENDING (hilang & menunggu ACC), COMPLETED (sudah selesai/RELEASED)
router.get("/pallets", async (req, res) => {
  try {
    const { page = 1, limit: rawLimit = 12, search, zone, state } = req.query;
    const limit = clampLimit(rawLimit, { defaultLimit: 12, maxLimit: 100 });
    const offset = (Number(page) - 1) * limit;
    const completed = state === "COMPLETED";

    const where = [];
    const params = [];
    if (search && String(search).trim()) {
      params.push(`%${String(search).trim()}%`);
      where.push(`(po_number ILIKE $${params.length} OR aruco_id::text ILIKE $${params.length})`);
    }
    if (zone) {
      params.push(zone);
      where.push(`current_zone = $${params.length}`);
    }
    if (state === "PENDING") where.push(`approval_status = 'PENDING'`);
    else if (["PRESENT", "MISSING", "UNSEEN", "STORED"].includes(state)) {
      params.push(state);
      where.push(`state = $${params.length}`);
    }
    const whereClause = where.length ? "WHERE " + where.join(" AND ") : "";

    const base = `
      WITH cur AS (
        SELECT p.id AS pallet_id, p.pallet_no, p.aruco_id, p.document_id,
               COALESCE(${poLabelSql("p.id")}, d.po_number) AS po_number,
               p.approval_status, p.completion_type, p.released_at, p.missing_since,
               p.approved_by, p.approved_at, p.stored_at, p.stored_by, p.stored_note, p.exit_at, p.exit_note,
               le.event_type AS last_event, le.event_time AS last_event_time,
               COALESCE(le.to_zone, le.from_zone, NULLIF(le.zone, '')) AS current_zone,
               fs.first_seen,
               lm.last_moved,
               CASE WHEN p.status = 'RELEASED' THEN 'COMPLETED'
                    WHEN p.stored_at IS NOT NULL THEN 'STORED'
                    WHEN le.id IS NULL THEN 'UNSEEN'
                    WHEN le.event_type = 'MISSING' THEN 'MISSING'
                    ELSE 'PRESENT' END AS state
          FROM document_pallets p
          JOIN documents d ON d.id = p.document_id
          LEFT JOIN LATERAL (
            SELECT * FROM pallet_events e WHERE e.pallet_id = p.id AND e.event_type <> 'MISSING_ALERT'
             ORDER BY e.event_time DESC, e.id DESC LIMIT 1) le ON true
          LEFT JOIN LATERAL (
            SELECT MIN(event_time) AS first_seen FROM pallet_events e WHERE e.pallet_id = p.id) fs ON true
          LEFT JOIN LATERAL (
            SELECT MAX(event_time) AS last_moved FROM pallet_events e
             WHERE e.pallet_id = p.id AND e.event_type IN ('MOVED_ZONE','MOVED_POS')) lm ON true
         WHERE p.status = ${completed ? "'RELEASED'" : "'ACTIVE'"}
      )`;

    const orderBy = completed
      ? "released_at DESC NULLS LAST, pallet_id"
      : "COALESCE(approval_status = 'PENDING', false) DESC, last_event_time DESC NULLS LAST, pallet_id";

    const data = await pool.query(
      `${base} SELECT * FROM cur ${whereClause}
        ORDER BY ${orderBy}
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset],
    );
    const count = await pool.query(
      `${base} SELECT COUNT(*) AS total FROM cur ${whereClause}`,
      params,
    );
    const total = parseInt(count.rows[0].total, 10);

    res.json({
      data: data.rows,
      total,
      page: Number(page),
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (err) {
    sendServerError(res, err, "GET /api/tracking/pallets");
  }
});

// ------------------ RINGKASAN (untuk kartu dashboard) ------------------
router.get("/summary", async (req, res) => {
  try {
    const r = await pool.query(`
      WITH cur AS (
        SELECT p.id, p.document_id, p.approval_status, p.stored_at,
               (SELECT e.event_type FROM pallet_events e WHERE e.pallet_id = p.id AND e.event_type <> 'MISSING_ALERT'
                 ORDER BY e.event_time DESC, e.id DESC LIMIT 1) AS last_event
          FROM document_pallets p WHERE p.status = 'ACTIVE')
      SELECT
        (SELECT COUNT(DISTINCT pd.document_id)::int FROM pallet_documents pd
           JOIN cur c2 ON c2.id = pd.pallet_id) AS po_aktif,
        (SELECT COUNT(DISTINCT pd.document_id)::int FROM pallet_documents pd
           JOIN cur c2 ON c2.id = pd.pallet_id WHERE c2.approval_status = 'PENDING') AS po_perlu_acc,
        COUNT(*)::int AS total_pallet,
        COUNT(*) FILTER (WHERE stored_at IS NULL AND last_event IS NOT NULL AND last_event <> 'MISSING')::int AS present,
        COUNT(*) FILTER (WHERE stored_at IS NULL AND last_event = 'MISSING')::int AS missing,
        COUNT(*) FILTER (WHERE stored_at IS NULL AND last_event IS NULL)::int AS unseen,
        COUNT(*) FILTER (WHERE stored_at IS NOT NULL)::int AS stored,
        COUNT(*) FILTER (WHERE approval_status = 'PENDING')::int AS pending_approval,
        (SELECT COUNT(*)::int FROM pallet_events
          WHERE event_type IN ('MOVED_ZONE','MOVED_POS') AND event_time >= date_trunc('day', now()))
          AS moved_today,
        (SELECT COUNT(*)::int FROM document_pallets
          WHERE status = 'RELEASED' AND completion_type IN ('OUTBOUND_AUTO','MANUAL_APPROVED')
            AND released_at >= date_trunc('day', now()))
          AS completed_today
      FROM cur`);
    res.json(r.rows[0]);
  } catch (err) {
    sendServerError(res, err, "GET /api/tracking/summary");
  }
});

// ------------------ DAFTAR PO (satu baris = satu PO) ------------------
// PO AKTIF = PO yang masih punya minimal 1 pallet ACTIVE. PO SELESAI = semua pallet-nya RELEASED.
// state: (kosong) PO aktif | PENDING (ada pallet perlu ACC) | MISSING | UNSEEN | COMPLETED (PO selesai)
const PALLET_CUR_SELECT = `
  SELECT p.id AS pallet_id, p.pallet_no, p.aruco_id, pd.document_id::int AS document_id, d.po_number, d.jumlah_pallet,
         (p.document_id = pd.document_id) AS milik_sendiri,
         COALESCE((SELECT array_agg(d3.po_number ORDER BY d3.po_number)
                     FROM pallet_documents y JOIN documents d3 ON d3.id = y.document_id
                    WHERE y.pallet_id = p.id AND y.document_id <> pd.document_id AND d3.po_number IS NOT NULL), '{}') AS po_lain,
         COALESCE((SELECT array_agg(d4.po_number ORDER BY d4.po_number)
                     FROM pallet_documents w JOIN documents d4 ON d4.id = w.document_id
                    WHERE w.pallet_id = p.id AND d4.po_number IS NOT NULL), '{}') AS po_semua,
         p.status, p.approval_status, p.completion_type, p.released_at, p.missing_since,
         p.approved_by, p.approved_at,
         p.stored_at, p.stored_by, p.stored_note, p.exit_at, p.exit_note,
         d.created_at AS po_created_at,
         p.alert_level, p.alert_at,
         le.event_type AS last_event, le.event_time AS last_event_time,
         COALESCE(le.to_zone, le.from_zone, NULLIF(le.zone, '')) AS current_zone,
         st.first_seen, st.zone_moves, st.zone_since,
         lm.last_moved,
         CASE WHEN p.status = 'RELEASED' THEN 'COMPLETED'
              WHEN p.stored_at IS NOT NULL THEN 'STORED'
              WHEN le.id IS NULL THEN 'UNSEEN'
              WHEN le.event_type = 'MISSING' THEN 'MISSING'
              ELSE 'PRESENT' END AS state
    FROM document_pallets p
    JOIN pallet_documents pd ON pd.pallet_id = p.id
    JOIN documents d ON d.id = pd.document_id
    LEFT JOIN LATERAL (
      SELECT * FROM pallet_events e WHERE e.pallet_id = p.id AND e.event_type <> 'MISSING_ALERT'
       ORDER BY e.event_time DESC, e.id DESC LIMIT 1) le ON true
    LEFT JOIN LATERAL (
      SELECT MAX(event_time) AS last_moved FROM pallet_events e
       WHERE e.pallet_id = p.id AND e.event_type IN ('MOVED_ZONE','MOVED_POS')) lm ON true
    LEFT JOIN LATERAL (
      SELECT MIN(event_time) AS first_seen,
             COUNT(*) FILTER (WHERE event_type = 'MOVED_ZONE')::int AS zone_moves,
             MAX(event_time) FILTER (WHERE event_type IN ('NEW','MOVED_ZONE')) AS zone_since
        FROM pallet_events e WHERE e.pallet_id = p.id) st ON true`;

// PO yang berbagi pallet (langsung atau berantai) dianggap satu kelompok dan tampil sebagai SATU kartu.
// grup = id dokumen terkecil di kelompok itu. Dipakai bersama WITH RECURSIVE.
const GRUP_CTE = `
  edges AS (SELECT a.document_id AS a, b.document_id AS b
              FROM pallet_documents a JOIN pallet_documents b ON a.pallet_id = b.pallet_id),
  conn(doc, reach) AS (
    SELECT document_id, document_id FROM pallet_documents
    UNION
    SELECT c.doc, e.b FROM conn c JOIN edges e ON e.a = c.reach),
  grp AS (SELECT doc, MIN(reach) AS grup FROM conn GROUP BY doc)`;

// Jumlah pallet aktif per zona (untuk kotak zona di halaman Tracking PO)
router.get("/zones", async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT current_zone AS zone,
              COUNT(DISTINCT pallet_id)::int AS total,
              COUNT(DISTINCT pallet_id) FILTER (WHERE state = 'PRESENT')::int AS present,
              COUNT(DISTINCT pallet_id) FILTER (WHERE state = 'MISSING')::int AS missing,
              COUNT(DISTINCT document_id)::int AS po_count
         FROM (${PALLET_CUR_SELECT} WHERE p.status = 'ACTIVE') c
        WHERE state IN ('PRESENT', 'MISSING') AND current_zone IS NOT NULL
        GROUP BY current_zone
        ORDER BY current_zone`,
    );
    res.json(r.rows);
  } catch (err) {
    sendServerError(res, err, "GET /api/tracking/zones");
  }
});

router.get("/pos", async (req, res) => {
  try {
    const { page = 1, limit: rawLimit = 12, search, state, zone } = req.query;
    const limit = clampLimit(rawLimit, { defaultLimit: 12, maxLimit: 100 });
    const offset = (Number(page) - 1) * limit;
    const completed = state === "COMPLETED";

    const where = [];
    const params = [];
    if (search && String(search).trim()) {
      params.push(`%${String(search).trim()}%`);
      where.push(`po_number ILIKE $${params.length}`);
    }
    if (zone && String(zone).trim()) {
      params.push(String(zone).trim());
      where.push(`$${params.length}::text = ANY(zones)`);
    }
    if (state === "PENDING") where.push("pending_approval > 0");
    else if (state === "MISSING") where.push("missing > 0");
    else if (state === "UNSEEN") where.push("unseen > 0");
    const whereClause = where.length ? "WHERE " + where.join(" AND ") : "";

    const base = `
      WITH RECURSIVE ${GRUP_CTE},
      cur0 AS (${PALLET_CUR_SELECT}),
      cur AS (
        SELECT DISTINCT ON (g.grup, c.pallet_id) c.*, g.grup
          FROM cur0 c JOIN grp g ON g.doc = c.document_id
         ORDER BY g.grup, c.pallet_id, c.document_id
      ),
      aktif AS (SELECT DISTINCT grup FROM cur WHERE state <> 'COMPLETED'),
      agg AS (
        SELECT grup::int AS document_id,
               (SELECT string_agg(DISTINCT d.po_number, ' + ' ORDER BY d.po_number)
                  FROM grp g2 JOIN documents d ON d.id = g2.doc WHERE g2.grup = cur.grup) AS po_number,
               (SELECT array_agg(g2.doc::int ORDER BY d.po_number, g2.doc) FROM grp g2 JOIN documents d ON d.id = g2.doc WHERE g2.grup = cur.grup) AS document_ids,
               ARRAY_AGG(aruco_id ORDER BY aruco_id) AS aruco_ids,
               (SELECT COUNT(*)::int FROM grp g2 WHERE g2.grup = cur.grup) AS jumlah_po,
               MAX(jumlah_pallet) AS jumlah_pallet,
               COUNT(*)::int AS total_pallet,
               COUNT(*) FILTER (WHERE state <> 'COMPLETED')::int AS active_pallet,
               COUNT(*) FILTER (WHERE state = 'COMPLETED')::int AS completed_pallet,
               COUNT(*) FILTER (WHERE state = 'PRESENT')::int AS present,
               COUNT(*) FILTER (WHERE state = 'MISSING')::int AS missing,
               COUNT(*) FILTER (WHERE state = 'UNSEEN')::int AS unseen,
               COUNT(*) FILTER (WHERE state = 'STORED')::int AS stored,
               COUNT(*) FILTER (WHERE approval_status = 'PENDING')::int AS pending_approval,
               ARRAY_REMOVE(ARRAY_AGG(current_zone) FILTER (WHERE state <> 'COMPLETED'), NULL) AS zones,
               (SELECT MIN(d.created_at) FROM grp g2 JOIN documents d ON d.id = g2.doc WHERE g2.grup = cur.grup) AS po_created_at,
               MAX(alert_level)::int AS alert_level,
               MIN(first_seen) AS first_seen,
               COALESCE(SUM(zone_moves), 0)::int AS zone_moves,
               MAX(last_event_time) AS last_event_time,
               MAX(last_moved) AS last_moved,
               MAX(released_at) AS completed_at,
               MAX(COALESCE(exit_at, missing_since)) AS shipped_at,
               COUNT(*) FILTER (WHERE completion_type = 'MANUAL_APPROVED')::int AS manual_pallet
          FROM cur
         WHERE grup ${completed ? "NOT IN" : "IN"} (SELECT grup FROM aktif)
         GROUP BY grup
      )`;

    const orderBy = completed
      ? "completed_at DESC NULLS LAST, po_number"
      : "(pending_approval > 0) DESC, last_event_time DESC NULLS LAST, po_number";

    const data = await pool.query(
      `${base} SELECT * FROM agg ${whereClause}
        ORDER BY ${orderBy}
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset],
    );
    const count = await pool.query(
      `${base} SELECT COUNT(*) AS total, COALESCE(SUM(jumlah_po), 0) AS total_po FROM agg ${whereClause}`,
      params,
    );
    const total = parseInt(count.rows[0].total, 10);
    const total_po = parseInt(count.rows[0].total_po, 10);

    res.json({
      data: data.rows,
      total,
      total_po,
      page: Number(page),
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (err) {
    sendServerError(res, err, "GET /api/tracking/pos");
  }
});

// ------------------ PALLET MILIK SATU PO (untuk jendela detail) ------------------
router.get("/pos/:documentId/pallets", async (req, res) => {
  try {
    const id = Number(req.params.documentId);
    if (!Number.isInteger(id)) return res.status(400).json({ error: "id dokumen tidak valid" });
    // semua pallet milik kelompok PO ini (PO yang berbagi pallet), tiap pallet satu baris
    const r = await pool.query(
      `WITH RECURSIVE ${GRUP_CTE},
       cur0 AS (${PALLET_CUR_SELECT})
       SELECT * FROM (
         SELECT DISTINCT ON (c.pallet_id) c.*
           FROM cur0 c
          WHERE c.document_id IN (SELECT doc FROM grp WHERE grup = (SELECT grup FROM grp WHERE doc = $1))
          ORDER BY c.pallet_id, c.document_id
       ) x ORDER BY document_id, pallet_no`,
      [id],
    );
    if (!r.rows.length) return res.status(404).json({ error: "PO tidak ditemukan" });
    const lab = await pool.query(
      `WITH RECURSIVE ${GRUP_CTE}
       SELECT string_agg(DISTINCT d.po_number, ' + ' ORDER BY d.po_number) AS po_number,
              array_agg(g.doc::int ORDER BY d.po_number, g.doc) AS document_ids
         FROM grp g JOIN documents d ON d.id = g.doc
        WHERE g.grup = (SELECT grup FROM grp WHERE doc = $1)`,
      [id],
    );
    res.json({
      po_number: lab.rows[0]?.po_number ?? r.rows[0].po_number,
      document_ids: lab.rows[0]?.document_ids ?? [id],
      jumlah_pallet: r.rows[0].jumlah_pallet,
      pallets: r.rows,
    });
  } catch (err) {
    sendServerError(res, err, "GET /api/tracking/pos/:documentId/pallets");
  }
});

// ------------------ KONFIRMASI MANUAL (hanya zona selain outbound) ------------------
// Pallet hilang dari zona selain outbound -> approval_status = PENDING. Pilihan konfirmasi:
//   /store   : barang disimpan di inventaris. Pallet TETAP aktif & tetap dilacak, alert berhenti.
//              Kalau marker terbaca lagi (RETURNED) status inventaris otomatis dibersihkan.
//   /exit    : barang sudah keluar (tanpa lewat outbound). Pallet selesai (RELEASED).
//              Boleh juga dipanggil untuk pallet yang sedang di inventaris.
//   /present : barang ternyata MASIH ADA (alarm palsu). Alert dibatalkan, pallet kembali normal
//              & tetap dipantau. Berguna saat kamera belum sempat membaca marker lagi.
async function confirmPalletAction(req, res, kind) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "id pallet tidak valid" });
  const who = req.user?.username || req.user?.name || req.user?.email || null; // sesuaikan dengan isi req.user di middleware/auth
  const note = emptyToNull(req.body?.note);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const p = await client.query(
      `SELECT p.id, p.aruco_id, p.document_id, p.status, p.approval_status, p.stored_at, d.po_number,
              ${poLabelSql("p.id")} AS po_label
         FROM document_pallets p LEFT JOIN documents d ON d.id = p.document_id
        WHERE p.id = $1 FOR UPDATE OF p`,
      [id],
    );
    if (!p.rows.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Pallet tidak ditemukan" });
    }
    const pal = p.rows[0];
    const pending = pal.status === "ACTIVE" && pal.approval_status === "PENDING";
    const stored = pal.status === "ACTIVE" && pal.stored_at != null;
    // Aksi yang diizinkan:
    //  store   -> hanya pallet yang sedang menunggu konfirmasi (pending)
    //  exit    -> pallet pending atau sedang di inventaris
    //  present -> hanya pallet pending (hilang, ternyata masih ada)
    const allowed =
      kind === "store"
        ? pending
        : kind === "exit"
          ? pending || stored
          : kind === "present"
            ? pending
            : false;
    if (!allowed) {
      await client.query("ROLLBACK");
      const errMsg =
        kind === "store"
          ? "Pallet ini tidak sedang menunggu konfirmasi"
          : kind === "present"
            ? "Pallet ini tidak sedang hilang / menunggu konfirmasi"
            : "Pallet ini tidak sedang hilang / di inventaris";
      return res.status(409).json({ error: errMsg });
    }

    const lastZone = `COALESCE((SELECT COALESCE(to_zone, from_zone, NULLIF(zone, '')) FROM pallet_events
                    WHERE pallet_id = $2 AND event_type = 'MISSING'
                    ORDER BY event_time DESC, id DESC LIMIT 1), '')`;
    let eventType, detail;
    if (kind === "store") {
      await client.query(
        `UPDATE document_pallets
            SET approval_status = NULL, missing_since = NULL, alert_level = 0,
                stored_at = now(), stored_by = $2, stored_note = $3
          WHERE id = $1`,
        [id, who, note],
      );
      eventType = "STORED";
      detail = `Dikonfirmasi masuk inventaris oleh ${who || "pengguna"}${note ? `: ${note}` : ""}`;
    } else if (kind === "exit") {
      // Dari inventaris: jam keluar tidak diketahui kamera -> pakai waktu konfirmasi.
      // Dari hilang: jam keluar = jam marker terakhir hilang.
      await client.query(
        `UPDATE document_pallets
            SET status = 'RELEASED', released_at = now(), completion_type = 'MANUAL_APPROVED',
                approval_status = 'APPROVED', approved_by = $2, approved_at = now(),
                exit_at = CASE WHEN stored_at IS NOT NULL THEN now() ELSE COALESCE(missing_since, now()) END,
                exit_note = $3
          WHERE id = $1`,
        [id, who, note],
      );
      eventType = "APPROVED";
      detail = `Dikonfirmasi sudah keluar oleh ${who || "pengguna"}${note ? `: ${note}` : ""}`;
    } else {
      // present: barang ternyata masih ada (alarm palsu) -> batalkan alert, kembali normal.
      // Pallet tetap ACTIVE & tetap dipantau; kalau marker terbaca lagi tidak ada perubahan status.
      await client.query(
        `UPDATE document_pallets
            SET approval_status = NULL, missing_since = NULL, alert_level = 0,
                stored_at = NULL, stored_by = NULL, stored_note = NULL
          WHERE id = $1`,
        [id],
      );
      eventType = "CHECKED_PRESENT";
      detail = `Dikonfirmasi masih ada oleh ${who || "pengguna"}${note ? `: ${note}` : ""}`;
    }
    const ev = await client.query(
      `INSERT INTO pallet_events
         (event_time, event_type, aruco_id, zone, detail, pallet_id, document_id, po_number)
       VALUES (now(), $6, $1, ${lastZone}, $3, $2, $4, $5)
       RETURNING id`,
      [pal.aruco_id, id, detail, pal.document_id, pal.po_number, eventType],
    );
    await client.query("COMMIT");

    await notifyPalletEvent({
      id: ev.rows[0].id,
      event_type: eventType,
      aruco_id: pal.aruco_id,
      po_number: pal.po_label || pal.po_number,
      pallet_id: id,
      approved_by: who,
      timestamp: new Date().toISOString(),
    });
    res.json({ success: true });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    sendServerError(res, err, `POST /api/tracking/pallets/:id/${kind}`);
  } finally {
    client.release();
  }
}
router.post("/pallets/:id/store", express.json(), (req, res) =>
  confirmPalletAction(req, res, "store"),
);
router.post("/pallets/:id/exit", express.json(), (req, res) =>
  confirmPalletAction(req, res, "exit"),
);
router.post("/pallets/:id/present", express.json(), (req, res) =>
  confirmPalletAction(req, res, "present"),
);

// Pallet hilang dari zona non-outbound (approval_status = PENDING) dicek berkala.
// Tiap ambang terlewati -> 1x alert (event MISSING_ALERT + notifikasi lonceng).
// Alert berhenti hanya kalau ada tindakan: konfirmasi "inventaris" / "sudah keluar", atau marker terbaca lagi.
async function checkMissingAlerts() {
  if (!MISSING_ALERT_HOURS.length) return;
  try {
    const r = await pool.query(
      `SELECT p.id, p.aruco_id, p.document_id, p.alert_level, d.po_number,
              ${poLabelSql("p.id")} AS po_label,
              EXTRACT(EPOCH FROM (now() - p.missing_since)) / 3600.0 AS hours,
              (SELECT COALESCE(e.to_zone, e.from_zone, NULLIF(e.zone, ''))
                 FROM pallet_events e WHERE e.pallet_id = p.id AND e.event_type = 'MISSING'
                ORDER BY e.event_time DESC, e.id DESC LIMIT 1) AS zone
         FROM document_pallets p
         JOIN documents d ON d.id = p.document_id
        WHERE p.status = 'ACTIVE' AND p.approval_status = 'PENDING' AND p.missing_since IS NOT NULL`,
    );
    for (const row of r.rows) {
      const level = MISSING_ALERT_HOURS.filter((h) => Number(row.hours) >= h).length;
      if (level <= row.alert_level) continue;
      const jam = MISSING_ALERT_HOURS[level - 1];
      const up = await pool.query(
        `UPDATE document_pallets SET alert_level = $2, alert_at = now()
          WHERE id = $1 AND status = 'ACTIVE' AND approval_status = 'PENDING' AND alert_level < $2
          RETURNING id`,
        [row.id, level],
      );
      if (!up.rows.length) continue; // sudah ditangani proses lain / sudah dikonfirmasi
      const zone = row.zone || "";
      const ev = await pool.query(
        `INSERT INTO pallet_events
           (event_time, event_type, aruco_id, zone, detail, pallet_id, document_id, po_number)
         VALUES (now(), 'MISSING_ALERT', $1, $2, $3, $4, $5, $6) RETURNING id`,
        [
          row.aruco_id,
          zone,
          `Hilang lebih dari ${jam} jam, belum ada konfirmasi (alert ${level}/${MISSING_ALERT_HOURS.length})`,
          row.id,
          row.document_id,
          row.po_number,
        ],
      );
      logger.warn(
        `🚨 Alert ${level}/${MISSING_ALERT_HOURS.length}: PO ${row.po_label || row.po_number} ID ${row.aruco_id} hilang > ${jam} jam`,
      );
      await notifyPalletEvent({
        id: ev.rows[0].id,
        event_type: "MISSING_ALERT",
        aruco_id: row.aruco_id,
        zone,
        po_number: row.po_label || row.po_number,
        pallet_id: row.id,
        level,
        levels: MISSING_ALERT_HOURS.length,
        hours: jam,
        timestamp: new Date().toISOString(),
      });
    }
  } catch (err) {
    logger.error("Gagal cek alert pallet hilang:", err);
  }
}
if (process.env.TRACKING_ALERTS !== "off") {
  setTimeout(checkMissingAlerts, 20 * 1000).unref();
  setInterval(checkMissingAlerts, MISSING_ALERT_CHECK_MIN * 60 * 1000).unref();
}

// ------------------ SELESAI OTOMATIS SETELAH JEDA OUTBOUND ------------------
// Pallet ACTIVE yang kejadian terakhirnya MISSING di zona outbound, tanpa menunggu ACC,
// dan sudah hilang >= OUTBOUND_GRACE_MIN menit -> ditandai selesai (RELEASED).
async function checkOutboundCompletions() {
  try {
    const r = await pool.query(
      `SELECT p.id, p.aruco_id, p.document_id, d.po_number,
              ${poLabelSql("p.id")} AS po_label,
              COALESCE(le.to_zone, le.from_zone, NULLIF(le.zone, '')) AS zone
         FROM document_pallets p
         JOIN documents d ON d.id = p.document_id
         LEFT JOIN LATERAL (
           SELECT * FROM pallet_events e
            WHERE e.pallet_id = p.id AND e.event_type <> 'MISSING_ALERT'
            ORDER BY e.event_time DESC, e.id DESC LIMIT 1) le ON true
        WHERE p.status = 'ACTIVE' AND p.approval_status IS NULL
          AND p.missing_since IS NOT NULL
          AND p.missing_since <= now() - make_interval(secs => $1::int)
          AND le.event_type = 'MISSING'`,
      [Math.round(OUTBOUND_GRACE_MIN * 60)],
    );
    for (const row of r.rows) {
      if (!isOutboundZone(row.zone)) continue;
      const zone = row.zone || "";
      const client = await pool.connect();
      let evId = null;
      try {
        await client.query("BEGIN");
        const up = await client.query(
          `UPDATE document_pallets
              SET status = 'RELEASED', released_at = now(), completion_type = 'OUTBOUND_AUTO',
                  approval_status = NULL
            WHERE id = $1 AND status = 'ACTIVE' AND approval_status IS NULL AND missing_since IS NOT NULL
            RETURNING id`,
          [row.id],
        );
        if (!up.rows.length) {
          await client.query("ROLLBACK");
          continue; // sudah ditangani proses lain / marker sempat terbaca lagi
        }
        const ev = await client.query(
          `INSERT INTO pallet_events
             (event_time, event_type, aruco_id, zone, from_zone, detail, pallet_id, document_id, po_number)
           VALUES (now(), 'COMPLETED_OUTBOUND', $1, $2, $2, $3, $4, $5, $6) RETURNING id`,
          [
            row.aruco_id,
            zone,
            `Otomatis selesai: hilang dari zona outbound lebih dari ${fmtGrace(OUTBOUND_GRACE_MIN)}`,
            row.id,
            row.document_id,
            row.po_number,
          ],
        );
        evId = ev.rows[0].id;
        await client.query("COMMIT");
      } catch (e) {
        await client.query("ROLLBACK").catch(() => {});
        logger.error("Gagal menyelesaikan pallet outbound:", e);
        continue;
      } finally {
        client.release();
      }
      logger.info(
        `✅ PO ${row.po_label || row.po_number} ID ${row.aruco_id} selesai otomatis (hilang dari outbound "${zone}")`,
      );
      await notifyPalletEvent({
        id: evId,
        event_type: "COMPLETED_OUTBOUND",
        aruco_id: row.aruco_id,
        zone,
        from_zone: zone,
        po_number: row.po_label || row.po_number,
        pallet_id: row.id,
        outcome: "COMPLETED_OUTBOUND",
        timestamp: new Date().toISOString(),
      });
    }
  } catch (err) {
    logger.error("Gagal cek penyelesaian outbound:", err);
  }
}
setTimeout(checkOutboundCompletions, 15 * 1000).unref();
setInterval(checkOutboundCompletions, 60 * 1000).unref();

// Alert yang masih terbuka (dipakai lonceng di sidebar)
router.get("/alerts", async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT p.id, p.pallet_no, p.aruco_id, p.document_id, COALESCE(${poLabelSql("p.id")}, d.po_number) AS po_number, p.alert_level, p.alert_at, p.missing_since,
              (SELECT COALESCE(e.to_zone, e.from_zone, NULLIF(e.zone, ''))
                 FROM pallet_events e WHERE e.pallet_id = p.id AND e.event_type = 'MISSING'
                ORDER BY e.event_time DESC, e.id DESC LIMIT 1) AS zone
         FROM document_pallets p JOIN documents d ON d.id = p.document_id
        WHERE p.status = 'ACTIVE' AND p.approval_status = 'PENDING' AND p.alert_level > 0
        ORDER BY p.alert_level DESC, p.missing_since ASC`,
    );
    res.json(r.rows);
  } catch (err) {
    sendServerError(res, err, "GET /api/tracking/alerts");
  }
});

// ------------------ KONFIRMASI TINDAKAN: pallet hilang ternyata masih ada ------------------
// Body JSON (opsional): { note }. Menghentikan alert; pallet kembali berstatus terlihat.
// ------------------ RIWAYAT SATU PALLET ------------------
router.get("/pallets/:id/events", async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT id, event_time, event_type, aruco_id, zone, from_zone, to_zone, detail, message,
              (image_file IS NOT NULL) AS has_image
         FROM pallet_events
        WHERE pallet_id = $1 AND ($2::boolean OR event_type <> 'MOVED_POS')
        ORDER BY event_time DESC, id DESC LIMIT 200`,
      [req.params.id, req.query.include_pos === "1"],
    );
    res.json(r.rows);
  } catch (err) {
    sendServerError(res, err, "GET /api/tracking/pallets/:id/events");
  }
});

// ------------------ KEJADIAN TERBARU (panel dashboard) ------------------
// Kejadian kamera tidak ikut; opsional dibatasi rentang tanggal (YYYY-MM-DD).
router.get("/events", async (req, res) => {
  try {
    const { start_date, end_date } = req.query;
    const limit = clampLimit(req.query.limit, { defaultLimit: 4, maxLimit: 100 });
    const where = ["event_type NOT IN ('CAMERA_OFFLINE','CAMERA_ONLINE')"];
    // ?hide_moved_pos=1 -> sembunyikan "bergeser posisi" (terlalu sering) untuk feed ringkas
    if (req.query.hide_moved_pos === "1") where.push("event_type <> 'MOVED_POS'");
    const params = [];
    if (start_date) {
      params.push(start_date);
      where.push(`(event_time AT TIME ZONE '${TRACKING_TZ}')::date >= $${params.length}::date`);
    }
    if (end_date) {
      params.push(end_date);
      where.push(`(event_time AT TIME ZONE '${TRACKING_TZ}')::date <= $${params.length}::date`);
    }
    params.push(limit);
    const r = await pool.query(
      `SELECT e.id, e.event_time, e.event_type, e.aruco_id, e.zone, e.from_zone, e.to_zone,
              COALESCE(${poLabelSql("e.pallet_id")}, e.po_number) AS po_number, e.pallet_id
         FROM pallet_events e
        WHERE ${where.join(" AND ")}
        ORDER BY event_time DESC, id DESC
        LIMIT $${params.length}`,
      params,
    );
    res.json(r.rows);
  } catch (err) {
    sendServerError(res, err, "GET /api/tracking/events");
  }
});

// ------------------ FOTO KEJADIAN (wajib login) ------------------
router.get("/events/:id/image", async (req, res) => {
  try {
    const r = await pool.query(`SELECT image_file FROM pallet_events WHERE id = $1`, [
      req.params.id,
    ]);
    const file = r.rows[0]?.image_file;
    if (!file) return res.status(404).json({ error: "Foto tidak ada" });
    const full = path.join(TRACKING_DIR, path.basename(file));
    if (!fs.existsSync(full))
      return res.status(404).json({ error: "Foto sudah tidak ada di server" });
    res.sendFile(full);
  } catch (err) {
    sendServerError(res, err, "GET /api/tracking/events/:id/image");
  }
});

module.exports = router;
