export type EvidenceEntry = {
  id: number;
  image_url: string;
  location: string;
  latitude: number | null;
  longitude: number | null;
  occurred_at: string;
  description: string | null;
};

export function formatDateTime(dateString: string | null | undefined): string {
  if (!dateString) return "-";

  const date = new Date(dateString);
  if (isNaN(date.getTime())) return "-";

  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit", // sertakan second jika butuh detik
    hour12: false,
  }).format(date);
}

export function formatShortDate(iso: string) {
  try {
    return new Intl.DateTimeFormat("id-ID", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export type VehicleForDescription = {
  jenis_kendaraan: string;
  kamera_nama?: string | null;
  plat_nomor?: string | null;
  confidence: number;
  timestamp: string;
  status_muatan?: string | null;
};

// Fungsi untuk auto-generate deskripsi paragraf, dipakai bersama oleh
// dashboard.tsx dan logs.vehicles.tsx supaya hasilnya selalu konsisten.
// Fungsi untuk auto-generate deskripsi paragraf, dipakai bersama oleh
// dashboard.tsx dan logs.vehicles.tsx supaya hasilnya selalu konsisten.
// Membandingkan status muatan saat kendaraan Masuk vs Keluar untuk truk,
// supaya bisa disimpulkan apakah itu proses muat (loading) atau bongkar (unloading).
export function classifyMuatanProcess(
  statusMasuk?: string | null,
  statusKeluar?: string | null,
): { label: string; tone: "loading" | "unloading" | "neutral" } | null {
  const m = (statusMasuk || "").trim();
  const k = (statusKeluar || "").trim();
  if (!m || !k) return null;

  const isKosong = (s: string) => s === "Kosong / bak tertutup";
  const isBermuatan = (s: string) => s === "Bermuatan";

  if (isKosong(m) && isBermuatan(k)) {
    return { label: "Proses Muat (datang kosong, keluar bermuatan)", tone: "loading" };
  }
  if (isBermuatan(m) && isKosong(k)) {
    return { label: "Proses Bongkar (datang bermuatan, keluar kosong)", tone: "unloading" };
  }
  if (isBermuatan(m) && isBermuatan(k)) {
    return { label: "Tetap bermuatan (tidak ada perubahan)", tone: "neutral" };
  }
  if (isKosong(m) && isKosong(k)) {
    return { label: "Tetap kosong (tidak ada perubahan)", tone: "neutral" };
  }
  return null;
}

// [AKTIVITAS] Mengubah teks status_aktivitas (hasil activity_estimator di aw.py) jadi label + warna.
// Nilai dari aw.py: "Mengambil Muatan (Loading)", "Bongkar Muatan (Unloading)", "Transit / membawa Muatan",
// "Lewat Kosong", "Tidak Dapat Dipastikan", "Aktivitas Forklift (arah belum pasti)".
export function classifyAktivitas(
  statusAktivitas?: string | null,
): { label: string; tone: "loading" | "unloading" | "neutral" } | null {
  const s = (statusAktivitas || "").trim();
  if (!s) return null;
  const low = s.toLowerCase();
  // "unloading" dicek duluan karena kata itu mengandung "loading".
  if (low.includes("unloading") || low.includes("bongkar")) {
    return { label: "Unloading", tone: "unloading" };
  }
  if (low.includes("loading") || low.includes("mengambil muatan")) {
    return { label: "Loading", tone: "loading" };
  }
  return { label: s, tone: "neutral" };
}

// [AKTIVITAS] Aktivitas hanya terisi di event KELUAR/SIKLUS_SELESAI, jadi ambil dari event terbaru
// (di antara event satu kendaraan) yang punya status_aktivitas.
export function classifyAktivitasFromEvents(
  events: { timestamp: string; status_aktivitas?: string | null }[],
): { label: string; tone: "loading" | "unloading" | "neutral" } | null {
  const sorted = [...events].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );
  for (const e of sorted) {
    const r = classifyAktivitas(e.status_aktivitas);
    if (r) return r;
  }
  return null;
}

export function generateAutoDescription(vehicle: VehicleForDescription) {
  const { jenis_kendaraan, kamera_nama, plat_nomor, confidence, timestamp, status_muatan } =
    vehicle;

  const dateObj = new Date(timestamp);
  const dateStr = dateObj.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const timeStr = dateObj.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });

  let desc = `Sebuah kendaraan berjenis ${jenis_kendaraan} terdeteksi oleh sistem pada ${dateStr} pukul ${timeStr} di area ${kamera_nama || "pemantauan"}. `;

  // Info plat nomor - selalu tampilkan statusnya
  if (plat_nomor) {
    desc += `Nomor plat kendaraan terdeteksi yaitu ${plat_nomor}. `;
  } else {
    desc += `Nomor plat kendaraan tidak terdeteksi pada saat pemantauan. `;
  }

  // Info muatan - HANYA untuk truk di cam1/cam3 DAN jika ada data
  // "-" = penanda sementara dari aw.py (status muatan baru ditentukan saat KELUAR), jangan ditampilkan
  if (
    jenis_kendaraan.includes("Truk") &&
    status_muatan &&
    status_muatan.trim() !== "" &&
    status_muatan.trim() !== "-"
  ) {
    desc += `Status muatan kendaraan terdeteksi: ${status_muatan}. `;
  }

  const confidencePercent = Math.round(confidence * 100);
  desc += `Proses identifikasi ini memiliki tingkat kepercayaan (akurasi) sebesar ${confidencePercent}%.`;

  return desc;
}
