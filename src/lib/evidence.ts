import { time } from "node:console";

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
  if (jenis_kendaraan.includes("Truk") && status_muatan && status_muatan.trim() !== "") {
    desc += `Status muatan kendaraan terdeteksi: ${status_muatan}. `;
  }

  const confidencePercent = Math.round(confidence * 100);
  desc += `Proses identifikasi ini memiliki tingkat kepercayaan (akurasi) sebesar ${confidencePercent}%.`;

  return desc;
}
