import { useQuery } from "@tanstack/react-query";
import { X, Clock, Loader2, History, Box, MapPin, AlertCircle, ZoomIn } from "lucide-react";
import { API_BASE_URL } from "@/lib/api-config";
import { authFetch } from "@/lib/auth";
import { formatDateTime, generateAutoDescription, classifyMuatanProcess } from "@/lib/evidence";
import { useState } from "react";

type HistoryEvent = {
  id: number;
  timestamp: string;
  jenis_kendaraan: string;
  warna?: string;
  confidence: number;
  gambar_base64: string;
  kamera_nama?: string;
  status_muatan?: string;
  track_id?: string;
  vehicle_id: string;
  plat_nomor?: string;
  plat_confidence?: number;
  jenis_kejadian?: string;
};

function eventLabel(jenis?: string) {
  if (!jenis) return "Terdeteksi";
  if (jenis === "MASUK") return "Masuk";
  if (jenis === "KELUAR" || jenis === "SIKLUS_SELESAI") return "Keluar";
  return jenis;
}

function eventColor(jenis?: string) {
  if (jenis === "MASUK")
    return "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-900/50";
  if (jenis === "KELUAR" || jenis === "SIKLUS_SELESAI")
    return "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/40 dark:text-orange-400 dark:border-orange-900/50";
  return "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800/50 dark:text-slate-400 dark:border-slate-700";
}

function dotColor(jenis?: string) {
  if (jenis === "MASUK") return "bg-emerald-500 dark:bg-[#34d399]";
  if (jenis === "KELUAR" || jenis === "SIKLUS_SELESAI") return "bg-orange-500";
  return "bg-slate-400";
}

function muatanBadgeInfo(status?: string) {
  if (!status || status.trim() === "") return null;
  if (status === "Bermuatan")
    return {
      text: status,
      cls: "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/40 dark:text-orange-400 dark:border-orange-900/50",
    };
  if (status === "Kosong / bak tertutup")
    return {
      text: status,
      cls: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-900/50",
    };
  return {
    text: status,
    cls: "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800/50 dark:text-slate-400 dark:border-slate-700",
  };
}

export function VehicleHistoryModal({
  vehicleId,
  onClose,
}: {
  vehicleId: string;
  onClose: () => void;
}) {
  const [zoomImage, setZoomImage] = useState<string | null>(null);

  const { data, isLoading, isError } = useQuery<{
    vehicle_id: string;
    total_events: number;
    events: HistoryEvent[];
  }>({
    queryKey: ["vehicle_history", vehicleId],
    queryFn: async () => {
      const res = await authFetch(`${API_BASE_URL}/api/vehicles/history/${vehicleId}`);
      if (!res.ok) throw new Error("Gagal mengambil riwayat kendaraan");
      return res.json();
    },
    enabled: !!vehicleId,
  });

  return (
    <>
      <div
        className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
        onClick={onClose}
      >
        <div
          className="viewfinder relative w-full max-w-2xl max-h-[85vh] overflow-hidden rounded-xl bg-white dark:bg-[#1e293b] border border-[#e2e8f0] dark:border-[#334155] shadow-2xl flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          <span className="vf-tr" />
          <span className="vf-bl" />

          <div className="flex items-center justify-between border-b border-[#e2e8f0] dark:border-[#334155] px-5 py-4">
            <div className="flex items-center gap-2">
              <History className="h-4 w-4 text-[#4338ca] dark:text-[#818cf8]" />
              <div>
                <h3 className="text-sm font-semibold font-space dark:text-slate-100">
                  Riwayat Kendaraan
                </h3>
                <p className="text-[11px] font-mono text-[#64748b] dark:text-[#94a3b8]">
                  ID: {vehicleId}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              aria-label="Tutup"
              className="p-1.5 rounded-md hover:bg-[#f1f5f9] dark:hover:bg-[#1e293b] transition-colors"
            >
              <X className="h-4 w-4 dark:text-slate-400" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-4">
            {isLoading && (
              <div className="flex items-center justify-center gap-2 py-10 text-sm text-[#64748b] dark:text-[#94a3b8]">
                <Loader2 className="h-4 w-4 animate-spin" /> Memuat riwayat...
              </div>
            )}

            {isError && (
              <div className="py-10 text-center text-sm text-red-600 dark:text-red-400">
                Gagal memuat riwayat kendaraan ini.
              </div>
            )}

            {data && data.events.length === 0 && (
              <div className="py-10 text-center text-sm text-[#64748b] dark:text-[#94a3b8]">
                Belum ada riwayat lain untuk kendaraan ini.
              </div>
            )}

            {data && data.events.length > 0 && (
              <>
                {(() => {
                  const isTrukHistory = data.events[0]?.jenis_kendaraan.includes("Truk");
                  const muatanEvents = [...data.events]
                    .filter((e) => e.status_muatan && e.status_muatan.trim() !== "")
                    .sort(
                      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
                    );
                  const process =
                    isTrukHistory && muatanEvents.length >= 1
                      ? classifyMuatanProcess(
                          muatanEvents[0].status_muatan,
                          muatanEvents[muatanEvents.length - 1].status_muatan,
                        )
                      : null;

                  if (!process) return null;

                  const toneCls =
                    process.tone === "loading"
                      ? "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/30 dark:text-orange-400 dark:border-orange-900/50"
                      : process.tone === "unloading"
                        ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-900/50"
                        : "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800/40 dark:text-slate-400 dark:border-slate-700";

                  return (
                    <div
                      className={`mb-4 flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium ${toneCls}`}
                    >
                      <Box className="h-4 w-4 shrink-0" /> {process.label}
                    </div>
                  );
                })()}

                <ol className="relative border-l border-[#e2e8f0] dark:border-[#334155] ml-2 space-y-6">
                  {data.events.map((ev) => {
                    const isTruk = ev.jenis_kendaraan.includes("Truk");
                    const isCam1OrCam3 =
                      ev.kamera_nama &&
                      (ev.kamera_nama === "Loading Kiri" || ev.kamera_nama === "Loading Kanan");

                    const muatan =
                      isTruk && isCam1OrCam3 ? muatanBadgeInfo(ev.status_muatan) : null;

                    return (
                      <li key={ev.id} className="ml-4">
                        <span
                          className={`absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full ring-4 ring-white dark:ring-[#1e293b] ${dotColor(ev.jenis_kejadian)}`}
                        />
                        <div className="flex flex-wrap items-center gap-2 mb-2">
                          <span
                            className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold font-mono ${eventColor(ev.jenis_kejadian)}`}
                          >
                            {eventLabel(ev.jenis_kejadian)}
                          </span>
                          <span className="text-[11px] font-mono text-[#64748b] dark:text-[#94a3b8] flex items-center gap-1">
                            <Clock className="h-3 w-3" /> {formatDateTime(ev.timestamp)}
                          </span>
                          {ev.kamera_nama && (
                            <span className="text-[11px] font-mono text-[#64748b] dark:text-[#94a3b8] flex items-center gap-1">
                              <MapPin className="h-3 w-3" /> {ev.kamera_nama}
                            </span>
                          )}
                        </div>

                        <div className="flex gap-3 rounded-lg border border-[#e2e8f0] dark:border-[#334155] bg-[#f8fafc] dark:bg-[#10140f] p-3">
                          {ev.gambar_base64 && (
                            <div className="viewfinder relative h-24 w-32 flex-shrink-0 overflow-hidden rounded-lg bg-[#f1f5f9] dark:bg-[#0f172a] shadow-sm">
                              <span className="vf-tr" />
                              <span className="vf-bl" />
                              <img
                                src={`data:image/jpeg;base64,${ev.gambar_base64}`}
                                alt={`${ev.jenis_kendaraan} - ${eventLabel(ev.jenis_kejadian)}`}
                                loading="lazy"
                                className="h-full w-full object-cover cursor-zoom-in transition-transform duration-300 hover:scale-105"
                                onClick={() => setZoomImage(ev.gambar_base64)}
                              />
                              <button
                                onClick={() => setZoomImage(ev.gambar_base64)}
                                className="absolute inset-0 z-10 flex items-center justify-center bg-black/0 hover:bg-black/30 transition-all group"
                                title="Perbesar Gambar"
                                aria-label="Perbesar gambar"
                              >
                                <span className="flex items-center gap-1.5 rounded-full bg-black/70 px-4 py-2 text-xs font-semibold text-white opacity-0 group-hover:opacity-100 transition-opacity shadow-lg">
                                  <ZoomIn className="h-4 w-4" />
                                  Perbesar
                                </span>
                              </button>
                            </div>
                          )}
                          <div className="min-w-0 flex-1 space-y-1.5">
                            <p className="text-xs leading-relaxed text-slate-700 dark:text-slate-300">
                              {generateAutoDescription(ev)}
                            </p>
                            <div className="flex flex-wrap items-center gap-1.5">
                              {muatan && (
                                <span
                                  className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-semibold font-mono ${muatan.cls}`}
                                >
                                  <Box className="h-3 w-3" /> {muatan.text}
                                </span>
                              )}
                              {ev.plat_nomor ? (
                                <span className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-900/20 dark:text-emerald-400 font-mono">
                                  📋 {ev.plat_nomor}
                                  {ev.plat_confidence && (
                                    <span className="opacity-70">
                                      ({Math.round(ev.plat_confidence * 100)}%)
                                    </span>
                                  )}
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-gray-50 px-2 py-0.5 text-[10px] font-semibold text-gray-500 dark:border-gray-700 dark:bg-gray-800/50 dark:text-gray-400 font-mono">
                                  <AlertCircle className="h-3 w-3" /> Plat tidak terdeteksi
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </>
            )}
          </div>

          {data && (
            <div className="border-t border-[#e2e8f0] dark:border-[#334155] px-5 py-3 text-[11px] font-mono text-[#64748b] dark:text-[#94a3b8]">
              Total {data.total_events} kejadian tercatat untuk kendaraan ini.
            </div>
          )}
        </div>
      </div>

      {/* ============================================================ */}
      {/* MODAL ZOOM FULLSCREEN - GAMBAR DIPERBESAR PAKAI SCALE */}
      {/* ============================================================ */}
      {zoomImage && (
        <div
          className="fixed inset-0 z-[100000] flex items-center justify-center bg-black/95 backdrop-blur-sm"
          onClick={() => setZoomImage(null)}
        >
          {/* Tombol Close */}
          <button
            onClick={() => setZoomImage(null)}
            aria-label="Tutup gambar"
            className="absolute top-5 right-5 z-20 rounded-full bg-white/10 p-3 text-white hover:bg-white/20 transition-colors shadow-lg border border-white/20"
          >
            <X className="h-6 w-6" />
          </button>

          {/* Judul */}
          <div className="absolute top-5 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-black/60 px-5 py-2.5 rounded-full border border-white/10 backdrop-blur-md">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            <p className="text-sm font-semibold text-white font-space tracking-wide">
              Perbesar Gambar
            </p>
          </div>

          {/* Gambar - selalu ditampilkan utuh, muat di layar */}
          <div className="relative flex items-center justify-center w-full h-full p-4">
            <img
              src={`data:image/jpeg;base64,${zoomImage}`}
              alt="Zoom Kendaraan"
              className="max-h-[85vh] max-w-[90vw] w-auto h-auto object-contain rounded-lg shadow-2xl border border-white/20"
            />
          </div>

          {/* Petunjuk */}
          <p className="absolute bottom-5 left-1/2 -translate-x-1/2 text-xs text-white/70 font-mono bg-black/50 px-4 py-2 rounded-full">
            Klik di mana saja untuk menutup
          </p>
        </div>
      )}
    </>
  );
}
