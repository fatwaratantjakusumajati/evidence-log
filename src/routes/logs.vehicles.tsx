import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { API_BASE_URL } from "@/lib/api-config";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
  ArrowLeft,
  Car,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  X,
  MapPin,
  Calendar,
  BarChart3,
  Box,
  Eye,
  AlertCircle,
  Truck,
  Clock,
  Flag,
  FlagOff,
} from "lucide-react";
import { useState, useEffect } from "react";
import { formatDateTime, formatShortDate } from "@/lib/evidence";
import { toast } from "sonner";
import { getLogsPageColors } from "@/lib/theme-tokens";
import { authFetch } from "@/lib/auth";
import { number } from "zod";

const PAGE_SIZE = 12;

type VehicleLog = {
  id: number;
  timestamp: string;
  jenis_kendaraan: string;
  kamera_nama?: string | null;
  confidence: number;
  bbox_x1: number;
  bbox_y1: number;
  bbox_x2: number;
  bbox_y2: number;
  gambar_base64: string;
  created_at: string;
  is_false_positive?: boolean;
  status_muatan?: string | null;
  jenis_kejadian?: string;
  track_id?: number;
};

function parseVehicleResponse(json: any) {
  if (json && typeof json === "object" && "data" in json && Array.isArray(json.data)) return json;
  else if (Array.isArray(json))
    return { data: json, total: json.length, totalPages: Math.ceil(json.length / PAGE_SIZE) };
  return { data: [], total: 0, totalPages: 1 };
}

function getConfidenceTone(confidence: number) {
  if (confidence < 0.4)
    return {
      label: "Rendah",
      className:
        "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-red-200 dark:border-red-900/50",
    };
  if (confidence < 0.7)
    return {
      label: "Sedang",
      className:
        "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400 border-yellow-200 dark:border-yellow-900/50",
    };
  return {
    label: "Tinggi",
    className:
      "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border-green-200 dark:border-green-900/50",
  };
}

function ConfidenceBadge({ confidence }: { confidence: number }) {
  const { label, className } = getConfidenceTone(confidence);
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold font-mono ${className}`}
    >
      {label} · {confidence.toFixed(2)}
    </span>
  );
}

export const Route = createFileRoute("/logs/vehicles")({
  head: () => ({
    meta: [
      { title: "Log Kendaraan · Dashboard Pemantauan" },
      { name: "description", content: "Daftar lengkap log kendaraan yang terdeteksi CCTV." },
    ],
  }),
  component: VehicleLogsPage,
});

function VehicleLogsPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [filterJenis, setFilterJenis] = useState("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [selectedVehicle, setSelectedVehicle] = useState<VehicleLog | null>(null);

  useEffect(() => {
    document.body.style.overflow = selectedVehicle ? "hidden" : "unset";
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [selectedVehicle]);

  const {
    data: response,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["vehicle_log", page, filterJenis, startDate, endDate],
    queryFn: async () => {
      try {
        const params = new URLSearchParams({
          page: String(page),
          limit: String(PAGE_SIZE),
          jenis: filterJenis,
        });
        if (startDate) params.append("start_date", startDate);
        if (endDate) params.append("end_date", endDate);
        const res = await authFetch(`${API_BASE_URL}/api/vehicles/log?${params}`);
        if (!res.ok) return { data: [], total: 0, totalPages: 1 };
        const json = await res.json();
        return parseVehicleResponse(json);
      } catch {
        return { data: [], total: 0, totalPages: 1 };
      }
    },
    staleTime: 0,
    refetchInterval: 3000,
  });

  const paginatedVehicles = response?.data || [];
  const totalPages = response?.totalPages || 1;
  const totalItems = response?.total || 0;

  const mutationToggleFalsePositive = useMutation({
    mutationFn: async ({ id, value }: { id: number; value: boolean }) => {
      const res = await authFetch(`${API_BASE_URL}/api/vehicles/log/${id}/flag`, {
        method: "PATCH",
        headers: { "content-Type": "application.json" },
        body: JSON.stringify({ is_false_positive: value }),
      });
      if (!res.ok) throw new Error("Gagal memperbarui status deteksi");
      return value;
    },
    onSuccess: (value) => {
      queryClient.invalidateQueries({ queryKey: ["vehicle_log"] });
      setSelectedVehicle((prev) => (prev ? { ...prev, is_false_positive: value } : prev));
      toast.success(
        value ? "Ditandai ebagai deteksi salah (false positive)." : "Tanda false positive dihapus.",
      );
    },
    onError: (err: Error) => toast.error(`Gagal: ${err.message}`),
  });

  const handleFilterChange = (value: string) => {
    setFilterJenis(value);
    setPage(1);
  };
  const handleDateChange = () => setPage(1);

  return (
    <main className="flex-1 min-h-screen bg-[#f8fafc] dark:bg-[#0b1120] text-[#0f172a] dark:text-[#e2e8f0] transition-colors duration-300 font-sans">
      <header className="sticky top-0 z-20 border-b bg-white dark:bg-[#0f1a2e] border-[#e2e8f0] dark:border-[#1a2c45] backdrop-blur-xl transition-colors duration-300">
        <div className="mx-auto max-w-[1440px] px-6 py-4">
          {/* BREADCRUMB BARU */}
          <div className="mb-4">
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbLink asChild>
                    <Link
                      to="/dashboard"
                      className="text-muted-foreground hover:text-primary transition-colors text-sm font-mono"
                    >
                      Home
                    </Link>
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbPage className="font-space font-semibold text-lg text-slate-900 dark:text-slate-100">
                    Log Kendaraan
                  </BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </div>

          {/* JUDUL & STATISTIK HALAMAN */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Car className="h-5 w-5 text-[#2563eb] dark:text-[#60a5fa]" />
              <h1 className="text-lg font-semibold tracking-tight font-space transition-colors">
                Log Kendaraan
              </h1>
            </div>
            {totalItems > 0 && (
              <span className="rounded-full bg-[#eff6ff] dark:bg-[#0a111f] px-3 py-1 text-xs font-medium text-[#2563eb] dark:text-[#60a5fa] border border-[#bfdbfe] dark:border-[#1a2c45] font-mono">
                {totalItems} total
              </span>
            )}
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-[1440px] px-6 py-6">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-[#64748b] dark:text-[#94a3b8] font-mono">
            Riwayat lengkap kendaraan yang terdeteksi CCTV.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 rounded-md border bg-white dark:bg-[#1e293b] border-[#e2e8f0] dark:border-[#334155] px-2 py-1.5 shadow-sm transition-colors">
              <Calendar className="h-4 w-4 text-[#64748b] dark:text-[#94a3b8]" />
              <input
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  handleDateChange();
                }}
                className="w-[115px] bg-transparent text-xs outline-none dark:text-[#e2e8f0] text-[#0f172a]"
                placeholder="Dari"
              />
              <span className="text-xs text-[#64748b] dark:text-[#94a3b8]">—</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => {
                  setEndDate(e.target.value);
                  handleDateChange();
                }}
                className="w-[115px] bg-transparent text-xs outline-none dark:text-[#e2e8f0] text-[#0f172a]"
                placeholder="Sampai"
              />
            </div>
            <select
              value={filterJenis}
              onChange={(e) => handleFilterChange(e.target.value)}
              className="h-9 rounded-md border bg-white dark:bg-[#1e293b] border-[#e2e8f0] dark:border-[#334155] px-3 text-sm font-medium text-[#0f172a] dark:text-[#e2e8f0] outline-none transition-colors"
            >
              <option value="all">Semua Jenis</option>
              <option value="truk">Truk</option>
              <option value="mobil">Mobil</option>
              <option value="sepeda motor">Sepeda Motor</option>
            </select>
            {(filterJenis !== "all" || startDate || endDate) && (
              <button
                onClick={() => {
                  setFilterJenis("all");
                  setStartDate("");
                  setEndDate("");
                  setPage(1);
                }}
                className="inline-flex h-9 items-center gap-1.5 rounded-md border bg-white dark:bg-[#1e293b] border-[#e2e8f0] dark:border-[#334155] px-3 text-sm font-medium text-[#64748b] dark:text-[#94a3b8] transition-colors hover:bg-[#f1f5f9] dark:hover:bg-[#0b1120]"
              >
                <RotateCcw className="h-3.5 w-3.5" /> Reset
              </button>
            )}
          </div>
        </div>

        {isLoading && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: PAGE_SIZE }).map((_, i) => (
              <div
                key={i}
                className="animate-pulse overflow-hidden rounded-lg border bg-white dark:bg-[#1e293b] border-[#e2e8f0] dark:border-[#334155]"
              >
                <div className="aspect-[4/3] bg-[#f1f5f9] dark:bg-[#0b1120]" />
                <div className="space-y-2 p-4">
                  <div className="h-3 w-2/3 rounded bg-[#f1f5f9] dark:bg-[#0b1120]" />
                  <div className="h-3 w-1/2 rounded bg-[#f1f5f9] dark:bg-[#0b1120]" />
                  <div className="h-3 w-1/3 rounded bg-[#f1f5f9] dark:bg-[#0b1120]" />
                </div>
              </div>
            ))}
          </div>
        )}

        {isError && (
          <p className="rounded-md border p-6 text-sm bg-red-50 dark:bg-[#450a0a] border-red-200 dark:border-[#7f1d1d] text-red-600 dark:text-[#fca5a5]">
            Gagal memuat data.
          </p>
        )}

        {!isLoading && !isError && paginatedVehicles.length === 0 && (
          <div className="flex w-full flex-col items-center justify-center rounded-lg border border-dashed bg-white dark:bg-[#1e293b] border-[#e2e8f0] dark:border-[#334155] p-16 text-center shadow-sm">
            <Car className="mb-4 h-14 w-14 text-[#94a3b8]" strokeWidth={1.5} />
            <h3 className="text-base font-semibold font-space text-[#0f172a] dark:text-[#e2e8f0]">
              Belum Ada Data Kendaraan
            </h3>
            <p className="mt-1.5 max-w-md text-sm text-[#64748b] dark:text-[#94a3b8] font-mono">
              Sistem deteksi CCTV belum mencatat log kendaraan.
            </p>
          </div>
        )}

        {!isLoading && !isError && paginatedVehicles.length > 0 && (
          <>
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {paginatedVehicles.map((v: VehicleLog) => {
                const isFP = v.is_false_positive === true;
                const isTruk = v.jenis_kendaraan.includes("Truk");
                const isCam1 = v.kamera_nama === "Loading Kiri";
                const hasCargo = v.status_muatan && v.status_muatan.trim() !== "";

                // ✅ LOGIKA BARU: Badge Masuk/Keluar
                let statusKejadianBadge = null;
                if (v.jenis_kejadian === "MASUK") {
                  statusKejadianBadge = (
                    <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-semibold text-green-700 dark:bg-green-900/30 dark:text-green-400 border border-green-200 dark:border-green-900/50">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" /> MASUK
                    </span>
                  );
                } else if (v.jenis_kejadian === "KELUAR") {
                  statusKejadianBadge = (
                    <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700 dark:bg-red-900/30 dark:text-red-400 border border-red-200 dark:border-red-900/50">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-500" /> KELUAR
                    </span>
                  );
                }

                // ✅ LOGIKA MUATAN (Hanya Truk Loading Kiri)
                // ✅ LOGIKA MUATAN - 3 STATUS
                let muatanBadge = null;
                if (isTruk && isCam1) {
                  const status = v.status_muatan || "";

                  // Tentukan warna dan teks berdasarkan status
                  let bgColor =
                    "bg-slate-100 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700";
                  let textColor = "text-[#64748b] dark:text-[#94a3b8]";
                  let displayText = status || "Tidak dapat dipastikan";

                  if (status === "Bermuatan") {
                    bgColor =
                      "bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-900/50";
                    textColor = "text-[#ea580c] dark:text-[#f97316]";
                  } else if (status === "Kosong / bak tertutup") {
                    bgColor =
                      "bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-900/50";
                    textColor = "text-[#2563eb] dark:text-[#38bdf8]";
                  }

                  muatanBadge = (
                    <div
                      className={`flex flex-wrap items-center gap-x-2 gap-y-1 mt-1 px-2 py-0.5 rounded-md border ${bgColor}`}
                    >
                      <span
                        className={`flex items-center gap-1 text-[10px] font-semibold font-mono ${textColor}`}
                      >
                        <Box className="h-3.5 w-3.5" />
                        {displayText}
                      </span>
                    </div>
                  );
                }

                return (
                  <li
                    key={v.id}
                    className={`group overflow-hidden rounded-lg border bg-white dark:bg-[#1e293b] border-[#e2e8f0] dark:border-[#334155] shadow-sm transition-all hover:shadow-md ${isFP ? "border-red-200 dark:border-[#7f1d1d]" : ""}`}
                  >
                    <div
                      className="relative h-48 w-full cursor-pointer overflow-hidden bg-[#f1f5f9] dark:bg-[#0b1120]"
                      onClick={() => setSelectedVehicle(v)}
                    >
                      <img
                        src={`data:image/jpeg;base64,${v.gambar_base64}`}
                        alt={`Kendaraan ${v.jenis_kendaraan}`}
                        loading="lazy"
                        className="h-full w-full object-contain transition-transform duration-300 group-hover:scale-105"
                      />
                      <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 transition-opacity group-hover:opacity-100">
                        <Eye className="h-8 w-8 text-white" />
                      </div>
                      {isFP && (
                        <div className="absolute left-2 top-2 rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-semibold text-white shadow-md">
                          <AlertCircle className="mr-1 inline h-3 w-3" /> FP
                        </div>
                      )}
                    </div>
                    <div className="space-y-2 p-4">
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-sm font-semibold text-[#0f172a] dark:text-[#e2e8f0] font-space capitalize">
                          {v.jenis_kendaraan}
                          {/* 🔥 BADGE MASUK / KELUAR */}
                          {statusKejadianBadge}
                        </span>
                        <ConfidenceBadge confidence={Number(v.confidence)} />
                      </div>

                      {/* Muatan Badge */}
                      {muatanBadge}

                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs text-[#64748b] dark:text-[#94a3b8] font-mono">
                          {formatShortDate(v.timestamp)}
                        </p>
                        <div className="flex items-center gap-1 text-[10px] text-[#64748b] dark:text-[#94a3b8] font-mono">
                          {/* 🔥 TRACK_ID & KAMERA NAMA */}
                          {v.track_id && <span>🆔 {v.track_id}</span>}
                          {v.kamera_nama && (
                            <>
                              <span>•</span>
                              <span>📍 {v.kamera_nama}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
            <Pagination
              page={page}
              totalPages={totalPages}
              total={totalItems}
              pageSize={PAGE_SIZE}
              onChange={setPage}
            />
          </>
        )}
      </section>

      {/* Modal Lightbox - 100% SAMA SEPERTI KODE ASLI ANDA */}
      {selectedVehicle && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          onClick={() => setSelectedVehicle(null)}
        >
          <div
            className="relative flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-lg bg-white dark:bg-[#1e293b] shadow-2xl md:flex-row"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setSelectedVehicle(null)}
              aria-label="Tutup"
              className="absolute right-3 top-3 z-10 rounded-full bg-black/50 p-1.5 text-white transition-colors hover:bg-black/70"
            >
              <X className="h-5 w-5" />
            </button>
            <div className="flex flex-1 items-center justify-center bg-[#f1f5f9] dark:bg-[#0b1120] p-2 md:w-2/3">
              <img
                src={`data:image/jpeg;base64,${selectedVehicle.gambar_base64}`}
                alt={`Kendaraan ${selectedVehicle.jenis_kendaraan}`}
                className="max-h-[70vh] w-full object-contain"
              />
            </div>
            <div className="flex-1 space-y-4 overflow-y-auto p-6 md:w-1/3 bg-white dark:bg-[#1e293b] text-[#0f172a] dark:text-[#e2e8f0]">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#eff6ff] dark:bg-[#1e293b] text-[#2563eb] dark:text-[#38bdf8]">
                    {selectedVehicle.jenis_kendaraan.includes("Truk") ? (
                      <Truck className="h-6 w-6" />
                    ) : (
                      <Car className="h-6 w-6" />
                    )}
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold text-[#0f172a] dark:text-[#e2e8f0] font-space">
                      {selectedVehicle.jenis_kendaraan}
                    </h2>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <ConfidenceBadge confidence={Number(selectedVehicle.confidence)} />
                      {selectedVehicle.is_false_positive && (
                        <span className="inline-flex items-center rounded-full bg-red-100 dark:bg-red-900/30 px-2 py-0.5 text-[10px] font-semibold text-red-700 dark:text-red-400">
                          <AlertCircle className="mr-1 h-3 w-3" /> False Positive
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* LOGIKA MUATAN DI MODAL - SAMA PERSIS */}
                {selectedVehicle.jenis_kendaraan.includes("Truk") && (
                  <div
                    className={`mt-3 flex items-center gap-2 rounded-lg px-3 py-2 border ${selectedVehicle.status_muatan && selectedVehicle.status_muatan.trim() !== "" ? "bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-900/50" : "bg-[#f1f5f9] dark:bg-[#0b1120] border-[#e2e8f0] dark:border-[#334155]"}`}
                  >
                    <Box
                      className={`h-5 w-5 ${selectedVehicle.status_muatan && selectedVehicle.status_muatan.trim() !== "" ? "text-[#ea580c] dark:text-[#f97316]" : "text-[#64748b] dark:text-[#94a3b8]"}`}
                    />
                    <div>
                      <p className="text-xs text-[#64748b] dark:text-[#94a3b8] font-mono uppercase tracking-wider">
                        Muatan Terdeteksi
                      </p>
                      <p
                        className={`text-sm font-semibold font-mono ${selectedVehicle.status_muatan && selectedVehicle.status_muatan.trim() !== "" ? "text-[#ea580c] dark:text-[#f97316]" : "text-[#64748b] dark:text-[#94a3b8]"}`}
                      >
                        {selectedVehicle.status_muatan &&
                        selectedVehicle.status_muatan.trim() !== ""
                          ? selectedVehicle.status_muatan
                          : "Kosong"}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-3 pt-2 border-t border-[#e2e8f0] dark:border-[#334155]">
                <div className="flex items-start gap-3">
                  <Calendar className="h-5 w-5 text-[#64748b] dark:text-[#94a3b8] mt-0.5" />
                  <div>
                    <p className="text-xs text-[#64748b] dark:text-[#94a3b8] font-mono uppercase tracking-wider">
                      Waktu Kejadian
                    </p>
                    <p className="text-sm font-medium">
                      {formatShortDate(selectedVehicle.timestamp)}
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <MapPin className="h-5 w-5 text-[#64748b] dark:text-[#94a3b8] mt-0.5" />
                  <div>
                    <p className="text-xs text-[#64748b] dark:text-[#94a3b8] font-mono uppercase tracking-wider">
                      Lokasi Kamera
                    </p>
                    <p className="text-sm font-medium">
                      {selectedVehicle.kamera_nama || "Tidak tersedia"}
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <BarChart3 className="h-5 w-5 text-[#64748b] dark:text-[#94a3b8] mt-0.5" />
                  <div>
                    <p className="text-xs text-[#64748b] dark:text-[#94a3b8] font-mono uppercase tracking-wider">
                      ID Database
                    </p>
                    <p className="text-sm font-medium font-mono">#{selectedVehicle.id}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Box className="h-5 w-5 text-[#64748b] dark:text-[#94a3b8] mt-0.5" />
                  <div>
                    <p className="text-xs text-[#64748b] dark:text-[#94a3b8] font-mono uppercase tracking-wider">
                      Bounding Box (BBox)
                    </p>
                    <p className="text-sm font-medium font-mono">
                      {(() => {
                        const hasBBox =
                          selectedVehicle.bbox_x1 > 0 ||
                          selectedVehicle.bbox_y1 > 0 ||
                          selectedVehicle.bbox_x2 > 0 ||
                          selectedVehicle.bbox_y2 > 0;
                        return hasBBox
                          ? `(${selectedVehicle.bbox_x1}, ${selectedVehicle.bbox_y1}) → (${selectedVehicle.bbox_x2}, ${selectedVehicle.bbox_y2})`
                          : "Tidak tersedia";
                      })()}
                    </p>
                  </div>
                </div>
              </div>
              <div className="pt-3 border-t border-[#e2e8f0] dark:border-[#334155]">
                <p className="text-xs text-[#64748b] dark:text-[#94a3b8] font-mono flex items-center gap-2">
                  <Clock className="h-3.5 w-3.5" /> Terekam pada{" "}
                  {formatShortDate(selectedVehicle.created_at)}
                </p>
              </div>
              <div className="pt-3 border-t border-[#e2e8f0] dark:border-[#334155]">
                <button
                  onClick={() =>
                    mutationToggleFalsePositive.mutate({
                      id: selectedVehicle.id,
                      value: !selectedVehicle.is_false_positive,
                    })
                  }
                  disabled={mutationToggleFalsePositive.isPending}
                  className={`inline-flex w-full items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-mediun transition-colors ${
                    selectedVehicle.is_false_positive
                      ? "bg-[#f1f5f9] dark:bg-[#0b1120] text-[#64748b] dark:text-[#94a3b8] hover:bg-[#e2e8f0] dark:hover:bg-[#1a2c45]"
                      : "bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 border border-red-200 dark:border-red-900/50"
                  }`}
                ></button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

// Pagination
function Pagination({
  page,
  totalPages,
  total,
  pageSize,
  onChange,
}: {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  onChange: (p: number) => void;
}) {
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  const getPageNumbers = () => {
    const pages: (number | "ellipsis")[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (page > 3) pages.push("ellipsis");
      const start = Math.max(2, page - 1);
      const end = Math.min(totalPages - 1, page + 1);
      for (let i = start; i <= end; i++) pages.push(i);
      if (page < totalPages - 2) pages.push("ellipsis");
      pages.push(totalPages);
    }
    return pages;
  };
  const pageNumbers = getPageNumbers();
  return (
    <div className="mt-8 flex flex-col items-center gap-3">
      <p className="text-xs text-[#64748b] dark:text-[#94a3b8] font-mono">
        Menampilkan {from}–{to} dari {total} data
      </p>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onChange(page - 1)}
          disabled={page === 1}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md border bg-white dark:bg-[#1e293b] border-[#e2e8f0] dark:border-[#334155] text-[#64748b] dark:text-[#94a3b8] transition-colors hover:bg-[#f1f5f9] dark:hover:bg-[#0b1120] disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        {pageNumbers.map((p, idx) =>
          p === "ellipsis" ? (
            <span
              key={`ellipsis-${idx}`}
              className="px-1 text-xs text-[#64748b] dark:text-[#94a3b8]"
            >
              …
            </span>
          ) : (
            <button
              key={p}
              onClick={() => onChange(p)}
              className={`inline-flex h-8 w-8 items-center justify-center rounded-md border text-xs font-medium font-mono transition-colors ${p === page ? "bg-[#2563eb] dark:bg-[#38bdf8] text-white dark:text-[#0b1120] border-[#2563eb] dark:border-[#38bdf8]" : "bg-white dark:bg-[#1e293b] border-[#e2e8f0] dark:border-[#334155] text-[#0f172a] dark:text-[#e2e8f0] hover:bg-[#f1f5f9] dark:hover:bg-[#0b1120]"}`}
            >
              {p}
            </button>
          ),
        )}
        <button
          onClick={() => onChange(page + 1)}
          disabled={page === totalPages}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md border bg-white dark:bg-[#1e293b] border-[#e2e8f0] dark:border-[#334155] text-[#64748b] dark:text-[#94a3b8] transition-colors hover:bg-[#f1f5f9] dark:hover:bg-[#0b1120] disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
