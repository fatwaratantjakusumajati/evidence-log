const express = require("express");
const router = express.Router();
const pool = require("../db");
const { clampLimit } = require("../utils/pagination");
const multer = require("multer");
const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { error } = require("console");
const { sendServerError } = require("../utils/errors");
const logger = require("../utils/logger");

// Batasi ukuran & tipe file upload foto enroll - tanpa ini, siapapun bisa upload file raksasa berkali-kali fan menghabiskan RAM server
// (storagenya memoryStorage, artinya seluruh file ditampung di memori proses node).
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 8 * 1024 * 1024, //8MB per file
    files: 20, // maksimal 20 foto per enroll/reenroll
  },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) {
      return cb(new Error("Hanya file gambar yang diperbolehkan"));
    }
    cb(null, true);
  },
});

const PYTHON_EXECUTABLE = process.env.PYTHON_EXECUTABLE;
const PYTHON_PROJECT_DIR = process.env.PYTHON_PROJECT_DIR;
const EXTRACT_SCRIPT_PATH = process.env.EXTRACT_SCRIPT_PATH;
const POSE_DB_PATH = process.env.POSE_DB_PATH;

logger.info("✅ Attendance API routes loaded");

// --- GET LOG ---
// --- GET LOG ---
router.get("/log", async (req, res) => {
  try {
    const { page = 1, limit: rawLimit = 20, start_date, end_date, search } = req.query;
    const limit = clampLimit(rawLimit, { defaultLimit: 20, maxLimit: 100 });
    const offset = (Number(page) - 1) * limit;
    let conditions = [];
    let params = [];

    conditions.push(`LOWER(ae.event_type) != 'manual_review_event'`);
    conditions.push(`ae.id NOT IN (
  SELECT id FROM attendance_event 
  WHERE employee_id = ae.employee_id 
  AND event_type = ae.event_type 
  AND "timestamp" = ae."timestamp"
  AND id < ae.id
)`);

    if (start_date) {
      params.push(start_date);
      conditions.push(`ae."timestamp" >= $${params.length}`);
    }
    if (end_date) {
      params.push(end_date + " 23:59:59");
      conditions.push(`ae."timestamp" <= $${params.length}`);
    }

    if (search?.trim()) {
      params.push(`%${search.trim()}%`);
      conditions.push(`(e.name ILIKE $${params.length} OR ae.employee_id ILIKE $${params.length})`);
    }

    const whereClause = "WHERE " + conditions.join(" AND ");

    // 💡 UBAH DI BAGIAN SINI: Cast ae."timestamp"::text
    const dataQuery = `
      SELECT
        ae.id, 
        ae."timestamp"::text AS "timestamp", 
        ae.event_type, 
        ae.direction,
        e.name AS employee_name, 
        ae.employee_id AS nik,
        ae.confidence, 
        ae.camera_id, 
        ae.is_visitor, 
        ae.snapshot_path
      FROM attendance_event ae
      LEFT JOIN employees e ON e.employee_id = ae.employee_id
      ${whereClause}
      ORDER BY ae."timestamp" DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `;

    const countQuery = `
      SELECT COUNT(*) AS total 
      FROM attendance_event ae 
      LEFT JOIN employees e ON e.employee_id = ae.employee_id
      ${whereClause}
    `;

    const dataParams = [...params, limit, offset];
    const dataResult = await pool.query(dataQuery, dataParams);
    const totalResult = await pool.query(countQuery, params);
    const total = parseInt(totalResult.rows[0].total, 10);

    res.json({
      data: dataResult.rows,
      total,
      page: Number(page),
      limit: Number(limit),
      totalPages: Math.max(1, Math.ceil(total / Number(limit))),
    });
  } catch (err) {
    logger.error("ERROR di /log:", err);
    sendServerError(res, err);
  }
});

// --- GET EMPLOYEES ---
router.get("/employees", async (req, res) => {
  try {
    const { page = 1, limit: rawLimit = 20 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);
    const query = `
      SELECT 
        id, 
        employee_id, 
        name, 
        COALESCE(arrival_time, '08:00') as arrival_time,
        COALESCE(departure_time, '17:00') as departure_time,
        COALESCE(max_breaks_per_day, 1) as max_breaks_per_day,
        break_windows,
        created_at
      FROM employees
      ORDER BY created_at DESC
      LIMIT $1 OFFSET $2
    `;
    const countQuery = `SELECT COUNT(*) AS total FROM employees`;
    const [dataResult, totalResult] = await Promise.all([
      pool.query(query, [limit, offset]),
      pool.query(countQuery),
    ]);
    const total = parseInt(totalResult.rows[0].total, 10);
    res.json({
      data: dataResult.rows,
      total,
      page: Number(page),
      limit: Number(limit),
      totalPages: Math.ceil(total / Number(limit)),
    });
  } catch (err) {
    sendServerError(res, err, "Error fetching employees");
  }
});

// --- GET STATS ---
router.get("/stats/daily", async (req, res) => {
  try {
    const query = `
      SELECT event_type, COUNT(*) AS total
      FROM attendance_event
      WHERE "timestamp" >= CURRENT_DATE AND "timestamp" < CURRENT_DATE + INTERVAL '1 day'
      GROUP BY event_type
    `;
    const result = await pool.query(query);
    const stats = {
      total_arrival: 0,
      total_departure: 0,
      total_break_out: 0,
      total_break_in: 0,
    };
    result.rows.forEach((r) => {
      if (r.event_type === "ARRIVAL") stats.total_arrival = Number(r.total);
      else if (r.event_type === "DEPARTURE") stats.total_departure = Number(r.total);
      else if (r.event_type === "BREAK_OUT") stats.total_break_out = Number(r.total);
      else if (r.event_type === "BREAK_IN") stats.total_break_in = Number(r.total);
    });
    res.json(stats);
  } catch (err) {
    logger.error(err);
    sendServerError(res, err);
  }
});

// GET manual-review-pending – JANGAN DIHAPUS
router.get("/manual-review-pending", async (req, res) => {
  try {
    const response = await fetch("http://localhost:5678/webhook/manual-review-pending");
    const data = await response.json();
    res.json(data);
  } catch (err) {
    logger.error("Error fetching manual-review-pending:", err);
    res.status(502).json({ error: "Gagal mengambil data dari n8n" });
  }
});

// -- GET Manual Review ---
router.post("/manual-review-decision", async (req, res) => {
  try {
    const { attendance_event_id, decision, reviewed_by } = req.body;
    logger.info("Mengirim ke n8n:", req.body);

    // Variabel untuk menampung path dan base64
    let snapshotPath = null;
    let imageBase64 = null;

    // Hanya APPROVE yang perlu memproses gambar
    if (decision === "APPROVE") {
      const eventResult = await pool.query(
        `SELECT snapshot_path FROM attendance_event WHERE id = $1`,
        [attendance_event_id],
      );

      if (eventResult.rows.length > 0 && eventResult.rows[0].snapshot_path) {
        snapshotPath = eventResult.rows[0].snapshot_path;

        // 🔥 KONVERSI .jpg KE BASE64 (HANYA 1 BLOK INI)
        try {
          if (!process.env.SNAPSHOT_DIR) {
            throw new Error("SNAPSHOT_DIR belum di-set di backend/.env");
          }
          const fullPath = path.join(process.env.SNAPSHOT_DIR, snapshotPath);
          const fileBuffer = fs.readFileSync(fullPath); // Baca file .jpg
          imageBase64 = fileBuffer.toString("base64"); // Ubah jadi base64
          logger.info(`✅ Berhasil mengubah ${snapshotPath} menjadi base64`);
        } catch (err) {
          logger.warn("⚠️ Gagal membaca file gambar:", err.message);
          imageBase64 = null;
        }
      }
    }

    // 🔥 KIRIM KEDUANYA KE N8N (Path untuk DB, Base64 untuk WA)
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const n8nPayload = {
      attendance_event_id,
      decision,
      reviewed_by,
      snapshot_path: snapshotPath, // Tetap kirim path untuk database
      image_base64: imageBase64, // Kirim base64 agar WA bisa kirim gambar
    };

    const response = await fetch("http://localhost:5678/webhook/manual-review-decision", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(n8nPayload),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const errorText = await response.text();
      logger.error("n8n error:", errorText);
      return res.status(502).json({
        error: "n8n returned error",
        details: errorText,
      });
    }

    const text = await response.text();
    let data = {};
    if (text) {
      try {
        data = JSON.parse(text);
      } catch (e) {
        logger.warn("n8n response bukan JSON:", text);
        data = { success: true };
      }
    } else {
      data = { success: true };
    }

    res.json(data);
  } catch (err) {
    logger.error("ERROR di /manual-review-decision:", err);
    if (err.name === "AbortError") {
      res.status(504).json({ error: "Timeout: n8n tidak merespons" });
    } else {
      res.status(502).json({
        error: "Gagal mengirim keputusan ke n8n",
        details: err.message,
      });
    }
  }
});

// --- ENROLL ---
router.post("/enroll", upload.array("photos"), async (req, res) => {
  const tempFiles = [];
  try {
    const { employee_id, name, arrival_time, departure_time, break_windows } = req.body;

    if (!employee_id || !name) {
      return res.status(400).json({ error: "employee_id dan name wajib diisi" });
    }
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: "Minimal 1 foto harus diupload" });
    }
    if (!PYTHON_EXECUTABLE || !PYTHON_PROJECT_DIR || !EXTRACT_SCRIPT_PATH || !POSE_DB_PATH) {
      return res.status(500).json({
        error: "Konfigurasi Python belum lengkap di backend/.env",
      });
    }

    let parsedBreakWindows = null;
    let maxBreaksPerDay = 0;

    if (break_windows) {
      try {
        parsedBreakWindows =
          typeof break_windows === "string" ? JSON.parse(break_windows) : break_windows;
        maxBreaksPerDay = parsedBreakWindows.length;
      } catch (e) {
        return res.status(400).json({ error: "Format break_windows tidak valid" });
      }
    }

    for (const file of req.files) {
      const tmpPath = path.join(
        os.tmpdir(),
        `enroll_${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`,
      );
      fs.writeFileSync(tmpPath, file.buffer);
      tempFiles.push(tmpPath);
    }

    const extraction = await runExtraction(tempFiles);
    if (extraction.error) {
      return res.status(502).json({ error: `Ekstraksi fitur gagal: ${extraction.error}` });
    }

    const results = extraction.results;
    const faceEmbeddings = results.map((r) => r.face_embedding).filter((e) => e !== null);
    const poseMeasurementsList = results.map((r) => r.pose_measurements).filter((m) => m !== null);

    if (faceEmbeddings.length === 0 && poseMeasurementsList.length === 0) {
      return res.status(422).json({
        error: "Tidak ada wajah maupun pose badan yang terdeteksi di foto manapun.",
      });
    }

    let avgEmbedding = null;
    if (faceEmbeddings.length > 0) {
      avgEmbedding = averageVectors(faceEmbeddings);
      avgEmbedding = l2Normalize(avgEmbedding);
    }

    await pool.query(
      `INSERT INTO employees (employee_id, name, embedding_face, arrival_time, departure_time, max_breaks_per_day, break_windows)
       VALUES ($1, $2, $3::jsonb, $4::time, $5::time, $6, $7::jsonb)
       ON CONFLICT (employee_id) DO UPDATE SET
         name = EXCLUDED.name,
         embedding_face = COALESCE(EXCLUDED.embedding_face, employees.embedding_face),
         arrival_time = COALESCE(EXCLUDED.arrival_time, employees.arrival_time),
         departure_time = COALESCE(EXCLUDED.departure_time, employees.departure_time),
         max_breaks_per_day = COALESCE(EXCLUDED.max_breaks_per_day, employees.max_breaks_per_day),
         break_windows = COALESCE(EXCLUDED.break_windows, employees.break_windows)`,
      [
        employee_id,
        name,
        avgEmbedding ? JSON.stringify(avgEmbedding) : null,
        arrival_time || null,
        departure_time || null,
        maxBreaksPerDay,
        parsedBreakWindows ? JSON.stringify(parsedBreakWindows) : null,
      ],
    );

    let poseSaved = false;
    if (poseMeasurementsList.length > 0) {
      const avgMeasurements = averageMeasurements(poseMeasurementsList);
      await savePoseToLocalDb(POSE_DB_PATH, employee_id, name, avgMeasurements, {
        num_images_used: poseMeasurementsList.length,
        num_images_total: req.files.length,
        face_detected: faceEmbeddings.length,
        time_window: null,
      });
      poseSaved = true;
    }

    res.json({
      employee_id,
      name,
      photos_received: req.files.length,
      face_photos_used: faceEmbeddings.length,
      pose_photos_used: poseMeasurementsList.length,
      face_saved: avgEmbedding !== null,
      pose_saved: poseSaved,
      break_windows_saved: parsedBreakWindows !== null,
    });
  } catch (err) {
    logger.error(err);
    sendServerError(res, err);
  } finally {
    tempFiles.forEach((f) => {
      fs.unlink(f, () => {});
    });
  }
});

function runExtraction(photoPaths) {
  return new Promise((resolve) => {
    const proc = spawn(PYTHON_EXECUTABLE, [EXTRACT_SCRIPT_PATH], {
      cwd: PYTHON_PROJECT_DIR,
      shell: false,
      windowsHide: true,
    });

    let stdout = "",
      stderr = "";
    proc.stdout.on("data", (chunk) => (stdout += chunk.toString()));
    proc.stderr.on("data", (chunk) => (stderr += chunk.toString()));

    proc.on("close", (code) => {
      if (code !== 0) {
        logger.error("Python stderr:", stderr);
        return resolve({ error: stderr || `Python exit code ${code}` });
      }
      try {
        const parsed = JSON.parse(stdout);
        resolve(parsed);
      } catch (e) {
        resolve({
          error: `Gagal parse output Python: ${e.message}. stdout: ${stdout.slice(0, 500)}`,
        });
      }
    });

    proc.on("error", (err) => {
      resolve({ error: `Gagal menjalankan Python: ${err.message}` });
    });

    proc.stdin.write(JSON.stringify({ photos: photoPaths }));
    proc.stdin.end();
  });
}

function averageVectors(vectors) {
  const dim = vectors[0].length;
  const avg = new Array(dim).fill(0);
  for (const v of vectors) {
    for (let i = 0; i < dim; i++) avg[i] += v[i];
  }
  return avg.map((x) => x / vectors.length);
}

function l2Normalize(vec) {
  const norm = Math.sqrt(vec.reduce((sum, x) => sum + x * x, 0)) + 1e-8;
  return vec.map((x) => x / norm);
}

function averageMeasurements(measurementsList) {
  const keys = Object.keys(measurementsList[0]);
  const avg = {};
  for (const key of keys) {
    const sum = measurementsList.reduce((s, m) => s + (m[key] || 0), 0);
    avg[key] = sum / measurementsList.length;
  }
  return avg;
}

let poseDbWriteLock = Promise.resolve();
function savePoseToLocalDb(dbPath, employeeId, name, measurements, meta) {
  const task = poseDbWriteLock.then(() => {
    let db = {};
    if (fs.existsSync(dbPath)) {
      db = JSON.parse(fs.readFileSync(dbPath, "utf-8"));
    }
    db[employeeId] = {
      name,
      measurements,
      num_images_used: meta.num_images_used,
      num_images_total: meta.num_images_total,
      face_detected: meta.face_detected,
      time_window: meta.time_window,
    };
    fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
  });
  poseDbWriteLock = task.catch(() => {});
  return task;
}

router.get("/employees/all", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT employee_id, name, arrival_time, departure_time, 
              max_breaks_per_day, break_windows, created_at
       FROM employees ORDER BY created_at DESC`,
    );
    res.json(result.rows);
  } catch (err) {
    logger.error(err);
    sendServerError(res, err);
  }
});

async function refreshFastAPICache() {
  try {
    await fetch("http://localhost:8000/api/employees/refresh-cache", {
      method: "POST",
    });
  } catch (e) {}
}

router.delete("/employees/:employee_id", async (req, res) => {
  try {
    const { employee_id } = req.params;

    await pool.query(`DELETE FROM attendance_event WHERE employee_id = $1`, [employee_id]);

    await pool.query(`DELETE FROM employee_attendance_status WHERE employee_id = $1`, [
      employee_id,
    ]);

    await pool.query(`DELETE FROM attendance_summary WHERE employee_id = $1`, [employee_id]);

    const result = await pool.query(
      `DELETE FROM employees WHERE employee_id = $1 RETURNING employee_id, name`,
      [employee_id],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Karyawan tidak ditemukan" });
    }

    if (fs.existsSync(POSE_DB_PATH)) {
      const db = JSON.parse(fs.readFileSync(POSE_DB_PATH, "utf-8"));
      if (db[employee_id]) {
        delete db[employee_id];
        fs.writeFileSync(POSE_DB_PATH, JSON.stringify(db, null, 2));
      }
    }

    refreshFastAPICache();

    res.json({ message: "Karyawan dan semua data attendance dihapus", ...result.rows[0] });
  } catch (err) {
    logger.error(err);
    sendServerError(res, err);
  }
});

router.put("/employees/:employee_id", async (req, res) => {
  try {
    const { employee_id } = req.params;
    const { name, arrival_time, departure_time, break_windows } = req.body;

    let parsedBreakWindows = null;
    let maxBreaksPerDay = 0;

    if (break_windows) {
      parsedBreakWindows =
        typeof break_windows === "string" ? break_windows : JSON.stringify(break_windows);
      const bwArray = typeof break_windows === "string" ? JSON.parse(break_windows) : break_windows;
      maxBreaksPerDay = Array.isArray(bwArray) ? bwArray.length : 0;
    }

    const result = await pool.query(
      `UPDATE employees 
       SET name = COALESCE($1, name),
           arrival_time = COALESCE($2, arrival_time),
           departure_time = COALESCE($3, departure_time),
           max_breaks_per_day = $4,
           break_windows = COALESCE($5, break_windows)
       WHERE employee_id = $6
       RETURNING employee_id, name, arrival_time, departure_time, max_breaks_per_day, break_windows`,
      [name, arrival_time, departure_time, maxBreaksPerDay, parsedBreakWindows, employee_id],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Karyawan tidak ditemukan" });
    }

    refreshFastAPICache();

    res.json(result.rows[0]);
  } catch (err) {
    logger.error(err);
    sendServerError(res, err);
  }
});

router.put("/employees/:employee_id/reenroll", upload.array("photos"), async (req, res) => {
  const tempFiles = [];
  try {
    const { employee_id } = req.params;
    const { name, arrival_time, departure_time, break_windows } = req.body;

    let parsedBreakWindows = null;
    let maxBreaksPerDay = 0;

    if (break_windows) {
      parsedBreakWindows =
        typeof break_windows === "string" ? break_windows : JSON.stringify(break_windows);
      const bwArray = typeof break_windows === "string" ? JSON.parse(break_windows) : break_windows;
      maxBreaksPerDay = Array.isArray(bwArray) ? bwArray.length : 0;
    }

    let faceUpdated = false;
    let poseUpdated = false;
    let faceCount = 0;
    let poseCount = 0;

    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        const tmpPath = path.join(
          os.tmpdir(),
          `reenroll_${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`,
        );
        fs.writeFileSync(tmpPath, file.buffer);
        tempFiles.push(tmpPath);
      }

      const extraction = await runExtraction(tempFiles);

      if (!extraction.error) {
        const results = extraction.results;
        const faceEmbeddings = results.map((r) => r.face_embedding).filter((e) => e !== null);
        const poseMeasurementsList = results
          .map((r) => r.pose_measurements)
          .filter((m) => m !== null);

        let avgEmbedding = null;
        if (faceEmbeddings.length > 0) {
          avgEmbedding = averageVectors(faceEmbeddings);
          avgEmbedding = l2Normalize(avgEmbedding);
          faceCount = faceEmbeddings.length;
          faceUpdated = true;
        }

        await pool.query(
          `UPDATE employees 
           SET name = $1,
               arrival_time = $2::time,
               departure_time = $3::time,
               max_breaks_per_day = $4,
               break_windows = $5::jsonb,
               embedding_face = $6::jsonb
           WHERE employee_id = $7`,
          [
            name,
            arrival_time,
            departure_time,
            maxBreaksPerDay,
            parsedBreakWindows,
            avgEmbedding ? JSON.stringify(avgEmbedding) : null,
            employee_id,
          ],
        );

        if (poseMeasurementsList.length > 0) {
          const avgMeasurements = averageMeasurements(poseMeasurementsList);
          await savePoseToLocalDb(POSE_DB_PATH, employee_id, name, avgMeasurements, {
            num_images_used: poseMeasurementsList.length,
            num_images_total: req.files.length,
            face_detected: faceCount,
            time_window: null,
          });
          poseUpdated = true;
          poseCount = poseMeasurementsList.length;
        }
      } else {
        return res.status(502).json({ error: `Ekstraksi gagal: ${extraction.error}` });
      }
    } else {
      await pool.query(
        `UPDATE employees 
         SET name = $1,
             arrival_time = $2::time,
             departure_time = $3::time,
             max_breaks_per_day = $4,
             break_windows = $5::jsonb
         WHERE employee_id = $6`,
        [name, arrival_time, departure_time, maxBreaksPerDay, parsedBreakWindows, employee_id],
      );
    }

    refreshFastAPICache();

    res.json({
      employee_id,
      name,
      arrival_time,
      departure_time,
      max_breaks_per_day: maxBreaksPerDay,
      face_updated: faceUpdated,
      face_photos_used: faceCount,
      pose_updated: poseUpdated,
      pose_photos_used: poseCount,
    });
  } catch (err) {
    logger.error(err);
    sendServerError(res, err);
  } finally {
    tempFiles.forEach((f) => fs.unlink(f, () => {}));
  }
});

// Helper: gabungkan tanggal + jam jadi Date lokal
function combineDateAndTime(targetDate, timeStr) {
  const [h = 0, m = 0, s = 0] = timeStr.split(":").map(Number);
  const d = new Date(`${targetDate}T00:00:00`);
  d.setHours(h, m, s, 0);
  return d;
}

router.get("/late-report", async (req, res) => {
  try {
    const { date } = req.query;
    const targetDate = date || new Date().toISOString().split("T")[0];

    const events = await pool.query(
      `SELECT ae.*, e.name AS employee_name, e.arrival_time, e.departure_time, e.break_windows FROM attendance_event ae LEFT JOIN employees e ON e.employee_id = ae.employee_id WHERE ae."timestamp"::date = $1::date ORDER BY ae."timestamp" ASC`,
      [targetDate],
    );

    const lateEmployees = [];
    const employeeEvents = {};

    for (const ev of events.rows) {
      if (!employeeEvents[ev.employee_id]) {
        employeeEvents[ev.employee_id] = [];
      }
      employeeEvents[ev.employee_id].push(ev);
    }

    for (const [empId, evs] of Object.entries(employeeEvents)) {
      const emp = evs[0];
      const arrivalTime = emp.arrival_time;
      let breakWindows = emp.break_windows;
      if (typeof breakWindows === "string") {
        try {
          breakWindows = JSON.parse(breakWindows);
        } catch {
          breakWindows = null;
        }
      }

      const arrivalEvent = evs.find((e) => e.event_type === "ARRIVAL");
      if (arrivalEvent && arrivalTime) {
        const arrivalTimestamp = new Date(arrivalEvent.timestamp);
        const arrivalLimit = conmbineDateAndTime(targetDate, arrivalTime);
        const diffMin = Math.round((arrivalTimestamp.getTime() - arrivalLimit.getTime()) / 60000);
        if (diffMin > 0) {
          lateEmployees.push({
            employee_id: empId,
            name: emp.employee_name || empId,
            type: "ARRIVAL_LATE",
            late_minutes: diffMin,
            timestamp: arrivalEvent.timestamp,
            scheduled_timne: arrivalTime,
          });
        }
      }
    }

    // -- Cek Keterlambatan datang ---
    if (breakWindows && Array.isArray(breakWindows)) {
      for (let bw of breakWindows) {
        if (typeof bw === "string") bw = JSON.parse(bw);
        if (!bw?.strat || !bw?.end) continue;
        const windowStart = combineDateAndTime(targetDate, bw.start);
        const breakLimit = evs.filter(
          (e) => e.event_type === "BREAK_IN" && new Date(e.timestamp) > windowStart,
        );
        for (const bi of breakInEvents) {
          const biTimestamp = new DAte(bi.timestamp);
          const breakLimit = combineDateAndTime(targetDate, bw.end);
          const diffMin = Math.round((biTimestamp.getTime() - breakLimit.getTime()) / 60000);
          if (diffMin > 0) {
            lateEmployees.push({
              employee_id: empId,
              name: emp.employee_name || empId,
              type: "BREAK_RETURN_LATE",
              late_minutes: diffMin,
              timestamp: bi.timestamp,
              scheduled_end: bw.end,
            });
          }
        }
      }
    }
    res.json({
      date: targetDate,
      total_late: lateEmployees.length,
      data: lateEmployees,
    });
  } catch (err) {
    logger.error("Error di /late-report:", err);
    sendServerError(res, err);
  }
});

module.exports = router;
