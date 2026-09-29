import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { API_BASE_URL } from "@/lib/api-config";
import { DateRangeFilter } from "@/components/DateRangeFilter";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
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
  Flag,
  Loader2,
  History,
  ZoomIn,
  ShipWheel,
  Search,
  Ship,
} from "lucide-react";
import { useState, useEffect, useMemo } from "react";
import {
  formatDateTime,
  formatShortDate,
  generateAutoDescription,
  classifyMuatanProcess,
} from "@/lib/evidence";
import { toast } from "sonner";
import { authFetch } from "@/lib/auth";
import { VehicleHistoryModal } from "@/components/VehicleHistoryModal";

const DEFAULT_PAGE_SIZE = 10;
const PAGE_SIZE_OPTIONS = [10, 20, 50];

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
  vehicle_id?: string | null;
  plat_nomor?: string | null;
  plat_confidence?: number | null;
};

function parseVehicleResponse(json: any, pageSize: number) {
  if (json && typeof json === "object" && "data" in json && Array.isArray(json.data)) return json;
  else if (Array.isArray(json))
    return { data: json, total: json.length, totalPages: Math.ceil(json.length / pageSize) };
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
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [isPageSizeOpen, setIsPageSizeOpen] = useState(false);
  const [filterJenis, setFilterJenis] = useState("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [searchPlat, setSearchPlat] = useState("");
  const [isJenisOpen, setIsJenisOpen] = useState(false);

  // Debounce 400ms -- supaya tidak nembak request tiap 1 huruf diketik,
  // nunggu user berhenti ngetik dulu sebentar.
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchPlat(searchInput.trim());
      setPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchInput]);
  const [selectedVehicle, setSelectedVehicle] = useState<VehicleLog | null>(null);
  const [historyVehicleId, setHistoryVehicleId] = useState<string | null>(null);
  const [zoomImage, setZoomImage] = useState<string | null>(null);

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
    queryKey: ["vehicle_log", page, pageSize, filterJenis, startDate, endDate, searchPlat],
    meta: { showErrorToast: true, errorLabel: "Log Kendaraan" },
    queryFn: async () => {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(pageSize),
        jenis: filterJenis,
      });
      if (startDate) params.append("start_date", startDate);
      if (endDate) params.append("end_date", endDate);
      if (searchPlat) params.append("search", searchPlat);
      const res = await authFetch(`${API_BASE_URL}/api/vehicles/log?${params}`);
      if (!res.ok) throw new Error(`Server merespons status ${res.status}`);
      const json = await res.json();
      return parseVehicleResponse(json, pageSize);
    },
    staleTime: 0,
    refetchInterval: 3000,
  });

  const paginatedVehicles = response?.data || [];

  const groupedVehicles = useMemo(() => {
    const groups = new Map<string, VehicleLog[]>();
    const standalone: VehicleLog[] = [];

    for (const v of paginatedVehicles as VehicleLog[]) {
      if (v.vehicle_id) {
        const arr = groups.get(v.vehicle_id) || [];
        arr.push(v);
        groups.set(v.vehicle_id, arr);
      } else {
        standalone.push(v);
      }
    }

    type Group = { key: string; events: VehicleLog[] };
    const result: Group[] = [];
    groups.forEach((events, vehicle_id) => {
      events.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      result.push({ key: vehicle_id, events });
    });
    standalone.forEach((v) => result.push({ key: `single-${v.id}`, events: [v] }));

    result.sort((a, b) => {
      const aLatest = Math.max(...a.events.map((e) => new Date(e.timestamp).getTime()));
      const bLatest = Math.max(...b.events.map((e) => new Date(e.timestamp).getTime()));
      return bLatest - aLatest;
    });

    return result;
  }, [paginatedVehicles]);
  const totalPages = response?.totalPages || 1;
  const totalItems = response?.total || 0;

  const mutationToggleFalsePositive = useMutation({
    mutationFn: async ({ id, value }: { id: number; value: boolean }) => {
      const res = await authFetch(`${API_BASE_URL}/api/vehicles/log/${id}/flag`, {
        method: "PATCH",
        headers: { "content-Type": "application/json" },
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
  const handlePageSizeChange = (value: number) => {
    setPageSize(value);
    setPage(1);
  };
  const handleDateChange = () => setPage(1);

  return (
    <main className="flex-1 min-h-screen bg-[#f8fafc] dark:bg-[#13130e] text-[#0f172a] dark:text-[#e2e8f0] transition-colors duration-300 font-sans">
      <header className="sticky top-0 z-20 border-b bg-white dark:bg-[#13130e] border-[#e2e8f0] dark:border-[#22221a] backdrop-blur-xl transition-colors duration-300">
        <div className="mx-auto max-w-[1680px] px-6 py-4">
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

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Car className="h-5 w-5 text-[#4338ca] dark:text-[#818cf8]" />
              <h1 className="text-lg font-semibold tracking-tight font-space transition-colors">
                Log Kendaraan
              </h1>
            </div>
            {totalItems > 0 && (
              <span className="rounded-full bg-[#eef2ff] dark:bg-[#13130e] px-3 py-1 text-xs font-medium text-[#4338ca] dark:text-[#818cf8] border border-[#c7d2fe] dark:border-[#22221a]">
                {totalItems} total
              </span>
            )}
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-[1680px] px-6 py-6">
        <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          {/* 1. Teks Deskripsi */}
          <p className="shrink-0 font-mono text-sm text-[#64748b] dark:text-[#94a3b8]">
            Riwayat lengkap kendaraan yang terdeteksi CCTV.
          </p>

          {/* 2. Group Tombol Filter (Pakai flex-nowrap agar DIPAKSA sejajar 1 baris) */}
          <div className="flex flex-nowrap items-center gap-2">
            {/* Filter Tanggal */}
            <div className="shrink">
              <DateRangeFilter
                startDate={startDate}
                endDate={endDate}
                onChange={(start, end) => {
                  setStartDate(start);
                  setEndDate(end);
                  handleDateChange();
                }}
              />
            </div>

            {/* Filter Dropdown "Semua Jenis" */}
            <div className="relative w-40 shrink-0 sm:w-48">
              <button
                type="button"
                onClick={() => setIsJenisOpen(!isJenisOpen)}
                className="flex h-11 w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 shadow-sm outline-none transition-all hover:border-indigo-300 hover:bg-indigo-50/30 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 dark:border-[#2e2e25] dark:bg-[#13130e] dark:text-slate-200 dark:hover:bg-indigo-500/10"
              >
                <div className="flex items-center gap-2 truncate">
                  <span className="text-base">
                    {filterJenis === "truk" ? (
                      "🚚"
                    ) : filterJenis === "mobil" ? (
                      "🚗"
                    ) : (
                      <ShipWheel className="h-4 w-4 text-indigo-500" />
                    )}
                  </span>
                  <span className="capitalize truncate">
                    {filterJenis === "all" ? "Semua Jenis" : filterJenis}
                  </span>
                </div>

                <svg
                  className={`h-4 w-4 text-slate-400 transition-transform duration-200 ${
                    isJenisOpen ? "rotate-180" : ""
                  }`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </button>

              {/* Popover / Menu Dropdown */}
              {isJenisOpen && (
                <div className="absolute left-0 right-0 z-50 mt-2 overflow-hidden rounded-2xl border border-slate-200 bg-white p-1.5 shadow-xl shadow-slate-900/10 dark:border-[#2e2e25] dark:bg-[#13130e]">
                  <div className="space-y-1">
                    {[
                      {
                        value: "all",
                        label: "Semua Jenis",
                        icon: <ShipWheel className="h-4 w-4 text-indigo-500" />,
                      },
                      { value: "truk", label: "Truk", icon: "🚚" },
                      { value: "mobil", label: "Mobil", icon: "🚗" },
                    ].map((item) => (
                      <button
                        type="button"
                        key={item.value}
                        onClick={() => {
                          handleFilterChange(item.value);
                          setIsJenisOpen(false);
                        }}
                        className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-xs font-medium transition-all sm:text-sm ${
                          filterJenis === item.value
                            ? "bg-indigo-50 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-400"
                            : "text-slate-700 hover:bg-slate-100/70 dark:text-slate-200 dark:hover:bg-[#1a1a14]/60"
                        }`}
                      >
                        <span className="text-base">{item.icon}</span>
                        <span className="flex-1 truncate">{item.label}</span>
                        {filterJenis === item.value && (
                          <span className="h-1.5 w-1.5 rounded-full bg-indigo-600 dark:bg-indigo-400" />
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Dropdown Jumlah Data per Halaman */}
            <div className="relative w-32 shrink-0 sm:w-36">
              <button
                type="button"
                onClick={() => setIsPageSizeOpen(!isPageSizeOpen)}
                className="flex h-11 w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 shadow-sm outline-none transition-all hover:border-indigo-300 hover:bg-indigo-50/30 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 dark:border-[#2e2e25] dark:bg-[#13130e] dark:text-slate-200 dark:hover:bg-indigo-500/10"
              >
                <span className="truncate">{pageSize} / halaman</span>
                <svg
                  className={`h-4 w-4 text-slate-400 transition-transform duration-200 ${
                    isPageSizeOpen ? "rotate-180" : ""
                  }`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </button>

              {isPageSizeOpen && (
                <div className="absolute left-0 right-0 z-50 mt-2 overflow-hidden rounded-2xl border border-slate-200 bg-white p-1.5 shadow-xl shadow-slate-900/10 dark:border-[#2e2e25] dark:bg-[#13130e]">
                  <div className="space-y-1">
                    {PAGE_SIZE_OPTIONS.map((size) => (
                      <button
                        type="button"
                        key={size}
                        onClick={() => {
                          handlePageSizeChange(size);
                          setIsPageSizeOpen(false);
                        }}
                        className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-xs font-medium transition-all sm:text-sm ${
                          pageSize === size
                            ? "bg-indigo-50 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-400"
                            : "text-slate-700 hover:bg-slate-100/70 dark:text-slate-200 dark:hover:bg-[#1a1a14]/60"
                        }`}
                      >
                        <span className="flex-1 truncate">{size} / halaman</span>
                        {pageSize === size && (
                          <span className="h-1.5 w-1.5 rounded-full bg-indigo-600 dark:bg-indigo-400" />
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Tombol Reset */}
            {(filterJenis !== "all" || startDate || endDate || searchInput) && (
              <button
                type="button"
                onClick={() => {
                  setFilterJenis("all");
                  setStartDate("");
                  setEndDate("");
                  setSearchInput("");
                  setPage(1);
                }}
                className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-xl border border-[#e2e8f0] bg-white px-3 text-sm font-medium text-[#64748b] transition-colors hover:bg-[#f1f5f9] dark:border-[#2e2e25] dark:bg-[#1a1a14] dark:text-[#94a3b8] dark:hover:bg-[#13130e]"
              >
                <RotateCcw className="h-3.5 w-3.5" /> Reset
              </button>
            )}
          </div>
        </div>

        {isLoading && (
          <div className="overflow-hidden rounded-lg border border-[#e2e8f0] dark:border-[#2e2e25] bg-white dark:bg-[#1a1a14] shadow-sm">
            <table className="w-full min-w-[860px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-[#e2e8f0] dark:border-[#2e2e25] bg-[#f8fafc] dark:bg-[#161610] text-left text-[11px] font-semibold uppercase tracking-wide text-[#64748b] dark:text-[#94a3b8]">
                  <th className="px-4 py-3">Jenis Kendaraan</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Plat Nomor</th>
                  <th className="px-4 py-3">Kamera</th>
                  <th className="px-4 py-3">Waktu</th>
                  <th className="px-4 py-3 text-right">Foto</th>
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: pageSize }).map((_, i) => (
                  <tr
                    key={i}
                    className="animate-pulse border-b border-[#e2e8f0] dark:border-[#2e2e25] last:border-0"
                  >
                    <td className="px-4 py-3">
                      <div className="h-3 w-24 rounded bg-[#f1f5f9] dark:bg-[#13130e]" />
                    </td>
                    <td className="px-4 py-3">
                      <div className="h-3 w-16 rounded bg-[#f1f5f9] dark:bg-[#13130e]" />
                    </td>
                    <td className="px-4 py-3">
                      <div className="h-3 w-20 rounded bg-[#f1f5f9] dark:bg-[#13130e]" />
                    </td>
                    <td className="px-4 py-3">
                      <div className="h-3 w-16 rounded bg-[#f1f5f9] dark:bg-[#13130e]" />
                    </td>
                    <td className="px-4 py-3">
                      <div className="h-3 w-24 rounded bg-[#f1f5f9] dark:bg-[#13130e]" />
                    </td>
                    <td className="px-4 py-3">
                      <div className="ml-auto h-14 w-20 rounded bg-[#f1f5f9] dark:bg-[#13130e]" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {isError && (
          <p className="rounded-md border p-6 text-sm bg-red-50 dark:bg-[#450a0a] border-red-200 dark:border-[#7f1d1d] text-red-600 dark:text-[#fca5a5]">
            Gagal memuat data.
          </p>
        )}

        {!isLoading && !isError && groupedVehicles.length === 0 && (
          <div className="flex w-full flex-col items-center justify-center rounded-lg border border-dashed bg-white dark:bg-[#1a1a14] border-[#e2e8f0] dark:border-[#2e2e25] p-16 text-center shadow-sm">
            <Car className="mb-4 h-14 w-14 text-[#94a3b8]" strokeWidth={1.5} />
            <h3 className="text-base font-semibold font-space text-[#0f172a] dark:text-[#e2e8f0]">
              Belum Ada Data Kendaraan
            </h3>
            <p className="mt-1.5 max-w-md text-sm text-[#64748b] dark:text-[#94a3b8] font-mono">
              Sistem deteksi CCTV belum mencatat log kendaraan.
            </p>
          </div>
        )}

        {!isLoading && !isError && groupedVehicles.length > 0 && (
          <>
            <div className="overflow-x-auto rounded-lg border border-[#e2e8f0] dark:border-[#2e2e25] bg-white dark:bg-[#1a1a14] shadow-sm">
              <table className="w-full min-w-[860px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-[#e2e8f0] dark:border-[#2e2e25] bg-[#f8fafc] dark:bg-[#161610] text-left text-[11px] font-semibold uppercase tracking-wide text-[#64748b] dark:text-[#94a3b8]">
                    <th className="px-4 py-3">Jenis Kendaraan</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Plat Nomor</th>
                    <th className="px-4 py-3">Kamera</th>
                    <th className="px-4 py-3">Waktu</th>
                    <th className="px-4 py-3 text-right">Foto</th>
                  </tr>
                </thead>
                <tbody>
                  {groupedVehicles.map((group) => {
                    if (group.events.length >= 2) {
                      const masuk =
                        group.events.find((e) => e.jenis_kejadian === "MASUK") || group.events[0];
                      const keluar =
                        group.events.find(
                          (e) =>
                            e.jenis_kejadian === "SIKLUS_SELESAI" || e.jenis_kejadian === "KELUAR",
                        ) || group.events[group.events.length - 1];

                      const durasiMs =
                        new Date(keluar.timestamp).getTime() - new Date(masuk.timestamp).getTime();
                      const durasiMenit = Math.max(0, Math.round(durasiMs / 60000));
                      const durasiText =
                        durasiMenit >= 60
                          ? `${Math.floor(durasiMenit / 60)}j ${durasiMenit % 60}m`
                          : `${durasiMenit} menit`;

                      const platNomor = masuk.plat_nomor || keluar.plat_nomor;

                      const isTrukGroup = masuk.jenis_kendaraan.includes("Truk");
                      const muatanEvents = group.events
                        .filter((e) => e.status_muatan && e.status_muatan.trim() !== "")
                        .sort(
                          (a, b) =>
                            new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
                        );
                      const muatanProcess =
                        isTrukGroup && muatanEvents.length >= 1
                          ? classifyMuatanProcess(
                              muatanEvents[0].status_muatan,
                              muatanEvents[muatanEvents.length - 1].status_muatan,
                            )
                          : null;

                      return (
                        <tr
                          key={group.key}
                          className="cursor-pointer border-b border-[#e2e8f0] dark:border-[#2e2e25] last:border-0 transition-colors hover:bg-[#f8fafc] dark:hover:bg-[#161610]"
                          onClick={() => setHistoryVehicleId(group.key)}
                        >
                          <td className="px-4 py-3 align-middle">
                            <span className="text-sm font-medium text-[#0f172a] dark:text-[#e2e8f0] capitalize">
                              {masuk.jenis_kendaraan}
                            </span>
                            <div className="mt-1 flex items-center gap-1 text-[11px] text-[#64748b] dark:text-[#94a3b8]">
                              <History className="h-3 w-3" /> Siklus lengkap · {durasiText}
                            </div>
                            {muatanProcess && (
                              <div
                                className={`mt-1 flex items-center gap-1 text-[11px] font-medium ${
                                  muatanProcess.tone === "loading"
                                    ? "text-orange-700 dark:text-orange-400"
                                    : muatanProcess.tone === "unloading"
                                      ? "text-emerald-700 dark:text-emerald-400"
                                      : "text-[#64748b] dark:text-[#94a3b8]"
                                }`}
                              >
                                <Box className="h-3 w-3" /> {muatanProcess.label}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3 align-middle">
                            <div className="space-y-1">
                              <div className="flex items-center gap-1.5 text-xs">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                                <span className="font-medium text-emerald-700 dark:text-emerald-400">
                                  Masuk
                                </span>
                                <span className="text-[#64748b] dark:text-[#94a3b8]">
                                  {formatShortDate(masuk.timestamp)}
                                </span>
                              </div>
                              <div className="flex items-center gap-1.5 text-xs">
                                <span className="w-1.5 h-1.5 rounded-full bg-orange-500 shrink-0" />
                                <span className="font-medium text-orange-700 dark:text-orange-400">
                                  Keluar
                                </span>
                                <span className="text-[#64748b] dark:text-[#94a3b8]">
                                  {formatShortDate(keluar.timestamp)}
                                </span>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 align-middle">
                            {platNomor ? (
                              <span className="text-sm font-medium text-[#0f172a] dark:text-[#e2e8f0]">
                                {platNomor}
                              </span>
                            ) : (
                              <span className="text-sm text-[#94a3b8] dark:text-[#64748b]">–</span>
                            )}
                          </td>
                          <td className="px-4 py-3 align-middle text-sm text-[#64748b] dark:text-[#94a3b8]">
                            {masuk.kamera_nama || "–"}
                          </td>
                          <td className="px-4 py-3 align-middle text-sm text-[#64748b] dark:text-[#94a3b8]">
                            {formatShortDate(masuk.timestamp)}
                          </td>
                          <td className="px-4 py-3 align-middle">
                            <div className="ml-auto flex w-fit gap-1">
                              <div className="group relative h-14 w-20 overflow-hidden rounded border border-[#e2e8f0] dark:border-[#2e2e25] bg-[#f1f5f9] dark:bg-[#13130e]">
                                <img
                                  src={`data:image/jpeg;base64,${masuk.gambar_base64}`}
                                  alt={`Kendaraan ${masuk.jenis_kendaraan} - Masuk`}
                                  loading="lazy"
                                  className="h-full w-full object-cover"
                                />
                                <span className="absolute bottom-0 left-0 right-0 bg-emerald-600/90 px-1 py-0.5 text-center text-[10px] font-bold leading-tight text-white">
                                  MASUK
                                </span>
                              </div>
                              <div className="group relative h-14 w-20 overflow-hidden rounded border border-[#e2e8f0] dark:border-[#2e2e25] bg-[#f1f5f9] dark:bg-[#13130e]">
                                <img
                                  src={`data:image/jpeg;base64,${keluar.gambar_base64}`}
                                  alt={`Kendaraan ${keluar.jenis_kendaraan} - Keluar`}
                                  loading="lazy"
                                  className="h-full w-full object-cover"
                                />
                                <span className="absolute bottom-0 left-0 right-0 bg-orange-600/90 px-1 py-0.5 text-center text-[10px] font-bold leading-tight text-white">
                                  KELUAR
                                </span>
                              </div>
                            </div>
                          </td>
                        </tr>
                      );
                    }

                    const v = group.events[0];
                    const isFP = v.is_false_positive === true;
                    const isTruk = v.jenis_kendaraan.includes("Truk");
                    const isCam1 = v.kamera_nama === "Loading Kiri";
                    const hasCargo = v.status_muatan && v.status_muatan.trim() !== "";

                    let statusKejadianBadge = null;
                    if (v.jenis_kejadian === "MASUK") {
                      statusKejadianBadge = (
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />{" "}
                          Masuk
                        </span>
                      );
                    } else if (
                      v.jenis_kejadian === "SIKLUS_SELESAI" ||
                      v.jenis_kejadian == "KELUAR"
                    ) {
                      statusKejadianBadge = (
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-orange-700 dark:text-orange-400">
                          <span className="w-1.5 h-1.5 rounded-full bg-orange-500 shrink-0" />{" "}
                          Keluar
                        </span>
                      );
                    }

                    let muatanBadge = null;
                    const isCam2 = v.kamera_nama && v.kamera_nama.toLowerCase().includes("depan");
                    const isCam1OrCam3 =
                      v.kamera_nama &&
                      (v.kamera_nama === "Loading Kiri" || v.kamera_nama === "Loading Kanan");

                    if (
                      isTruk &&
                      isCam1OrCam3 &&
                      v.status_muatan &&
                      v.status_muatan.trim() !== ""
                    ) {
                      const status = v.status_muatan;

                      let textColor = "text-[#64748b] dark:text-[#94a3b8]";
                      if (status === "Bermuatan") {
                        textColor = "text-[#ea580c] dark:text-[#f97316]";
                      } else if (status === "Kosong / bak tertutup") {
                        textColor = "text-[#15803d] dark:text-[#34d399]";
                      }

                      muatanBadge = (
                        <span
                          className={`inline-flex items-center gap-1.5 text-xs font-medium ${textColor}`}
                        >
                          <Box className="h-3.5 w-3.5" /> {status}
                        </span>
                      );
                    }

                    return (
                      <tr
                        key={v.id}
                        className={`border-b border-[#e2e8f0] dark:border-[#2e2e25] last:border-0 transition-colors hover:bg-[#f8fafc] dark:hover:bg-[#161610] ${isFP ? "bg-red-50/40 dark:bg-red-900/10" : ""}`}
                      >
                        <td className="px-4 py-3 align-middle">
                          <span className="text-sm font-medium text-[#0f172a] dark:text-[#e2e8f0] capitalize">
                            {v.jenis_kendaraan}
                          </span>
                          {isFP && (
                            <span className="ml-2 text-[11px] font-medium text-red-600 dark:text-red-400">
                              (kemungkinan salah deteksi)
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 align-middle">
                          {statusKejadianBadge || muatanBadge || (
                            <span className="text-sm text-[#94a3b8] dark:text-[#64748b]">–</span>
                          )}
                        </td>
                        <td className="px-4 py-3 align-middle">
                          {v.plat_nomor ? (
                            <span className="text-sm font-medium text-[#0f172a] dark:text-[#e2e8f0]">
                              {v.plat_nomor}
                            </span>
                          ) : (
                            <span className="text-sm text-[#94a3b8] dark:text-[#64748b]">–</span>
                          )}
                        </td>
                        <td className="px-4 py-3 align-middle text-sm text-[#64748b] dark:text-[#94a3b8]">
                          {v.kamera_nama || "–"}
                        </td>
                        <td className="px-4 py-3 align-middle text-sm text-[#64748b] dark:text-[#94a3b8]">
                          {formatShortDate(v.timestamp)}
                        </td>
                        <td className="px-4 py-3 align-middle">
                          <div
                            className="group relative ml-auto h-14 w-20 cursor-pointer overflow-hidden rounded border border-[#e2e8f0] dark:border-[#2e2e25] bg-[#f1f5f9] dark:bg-[#13130e]"
                            onClick={() => setSelectedVehicle(v)}
                          >
                            <img
                              src={`data:image/jpeg;base64,${v.gambar_base64}`}
                              alt={`Kendaraan ${v.jenis_kendaraan}`}
                              loading="lazy"
                              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                            />
                            <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 transition-opacity group-hover:opacity-100">
                              <Eye className="h-4 w-4 text-white" />
                            </div>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Pagination
              page={page}
              totalPages={totalPages}
              total={totalItems}
              pageSize={pageSize}
              onChange={setPage}
            />
          </>
        )}
      </section>

      {/* ========================================================== */}
      {/* MODAL LIGHTBOX */}
      {/* ========================================================== */}
      {selectedVehicle && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          onClick={() => setSelectedVehicle(null)}
        >
          <div
            className="relative flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-lg bg-white dark:bg-[#1a1a14] shadow-2xl md:flex-row"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setSelectedVehicle(null)}
              aria-label="Tutup"
              className="absolute right-3 top-3 z-10 rounded-full bg-black/50 p-1.5 text-white transition-colors hover:bg-black/70"
            >
              <X className="h-5 w-5" />
            </button>
            <div className="viewfinder relative flex flex-1 items-center justify-center bg-[#f1f5f9] dark:bg-[#13130e] p-2 md:w-2/3">
              <span className="vf-tr" />
              <span className="vf-bl" />
              <img
                src={`data:image/jpeg;base64,${selectedVehicle.gambar_base64}`}
                alt={`Kendaraan ${selectedVehicle.jenis_kendaraan}`}
                className="max-h-[70vh] w-full object-contain cursor-zoom-in"
                onClick={() => setZoomImage(selectedVehicle.gambar_base64)}
              />
              {/* Tombol Perbesar */}
              <button
                onClick={() => setZoomImage(selectedVehicle.gambar_base64)}
                className="absolute bottom-4 right-4 z-20 inline-flex items-center gap-2 rounded-full bg-black/70 px-4 py-2 text-sm font-semibold text-white hover:bg-black/90 transition-all shadow-lg"
              >
                <ZoomIn className="h-4 w-4" />
                Perbesar
              </button>
            </div>
            <div className="flex-1 space-y-4 overflow-y-auto p-6 md:w-1/3 bg-white dark:bg-[#1a1a14] text-[#0f172a] dark:text-[#e2e8f0]">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#eef2ff] dark:bg-[#1a1a14] text-[#4338ca] dark:text-[#818cf8]">
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

                {/* LOGIKA MUATAN DI MODAL - HANYA cam1 & cam3 (bukan cam2) */}
                {selectedVehicle.jenis_kendaraan.includes("Truk") &&
                  selectedVehicle.kamera_nama &&
                  (selectedVehicle.kamera_nama === "Loading Kiri" ||
                    selectedVehicle.kamera_nama === "Loading Kanan") &&
                  selectedVehicle.status_muatan &&
                  selectedVehicle.status_muatan.trim() !== "" && (
                    <div className="mt-3 flex items-center gap-2 rounded-lg px-3 py-2 border bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-900/50">
                      <Box className="h-5 w-5 text-[#ea580c] dark:text-[#f97316]" />
                      <div>
                        <p className="text-xs text-[#64748b] dark:text-[#94a3b8] font-mono uppercase tracking-wider">
                          Muatan Terdeteksi
                        </p>
                        <p className="text-sm font-semibold font-mono text-[#ea580c] dark:text-[#f97316]">
                          {selectedVehicle.status_muatan}
                        </p>
                      </div>
                    </div>
                  )}
              </div>

              {/* AUTO-GENERATED PARAGRAPH */}
              <div className="mb-4 text-sm leading-relaxed text-[#334155] dark:text-[#cbd5e1] font-sans border-b border-[#e2e8f0] dark:border-[#2e2e25] pb-4">
                {generateAutoDescription(selectedVehicle)}
              </div>
              <div className="space-y-3 pt-2 border-t border-[#e2e8f0] dark:border-[#2e2e25]">
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
                  <Flag className="h-5 w-5 text-[#64748b] dark:text-[#94a3b8] mt-0.5" />
                  <div>
                    <p className="text-xs text-[#64748b] dark:text-[#94a3b8] font-mono uppercase tracking-wider">
                      Plat Nomor
                    </p>
                    {selectedVehicle.plat_nomor ? (
                      <>
                        <p className="text-sm font-semibold font-mono plate-number">
                          {selectedVehicle.plat_nomor}
                        </p>
                        {selectedVehicle.plat_confidence && (
                          <p className="text-[10px] text-[#64748b] dark:text-[#94a3b8] font-mono mt-0.5">
                            Akurasi: {Math.round(selectedVehicle.plat_confidence * 100)}%
                          </p>
                        )}
                      </>
                    ) : (
                      <p className="text-sm font-medium text-[#64748b] dark:text-[#94a3b8]">
                        Tidak terdeteksi
                      </p>
                    )}
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
              <div className="pt-3 border-t border-[#e2e8f0] dark:border-[#2e2e25] flex flex-col gap-2">
                {selectedVehicle.vehicle_id && (
                  <button
                    onClick={() => setHistoryVehicleId(selectedVehicle.vehicle_id!)}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-medium transition-colors bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-900/50"
                  >
                    <History className="h-4 w-4" />
                    Lihat Riwayat Kendaraan (Masuk–Keluar)
                  </button>
                )}
                <button
                  onClick={() =>
                    mutationToggleFalsePositive.mutate({
                      id: selectedVehicle.id,
                      value: !selectedVehicle.is_false_positive,
                    })
                  }
                  disabled={mutationToggleFalsePositive.isPending}
                  className={`inline-flex w-full items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-medium transition-colors ${
                    selectedVehicle.is_false_positive
                      ? "bg-[#f1f5f9] dark:bg-[#13130e] text-[#64748b] dark:text-[#94a3b8] hover:bg-[#e2e8f0] dark:hover:bg-[#22221a]"
                      : "bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 border border-red-200 dark:border-red-900/50"
                  }`}
                >
                  {mutationToggleFalsePositive.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : selectedVehicle.is_false_positive ? (
                    <RotateCcw className="h-4 w-4" />
                  ) : (
                    <Flag className="h-4 w-4" />
                  )}
                  {selectedVehicle.is_false_positive
                    ? "Batalkan tanda deteksi salah"
                    : "Tandai sebagai deteksi salah"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================== */}
      {/* MODAL ZOOM FULLSCREEN - DILUAR MODAL UTAMA */}
      {/* ========================================================== */}
      {zoomImage && (
        <div
          className="fixed inset-0 z-[100000] flex items-center justify-center bg-black/85 backdrop-blur-sm"
          onClick={() => setZoomImage(null)}
        >
          <button
            onClick={() => setZoomImage(null)}
            aria-label="Tutup gambar"
            className="absolute top-5 right-5 z-10 rounded-full bg-white/10 p-3 text-white hover:bg-white/20 transition-colors"
          >
            <X className="h-6 w-6" />
          </button>
          <img
            src={`data:image/jpeg;base64,${zoomImage}`}
            alt="Zoom Kendaraan"
            className="max-h-[80vh] max-w-[80vw] object-contain p-6"
          />
          <p className="absolute bottom-5 left-1/2 -translate-x-1/2 text-xs text-white/70 font-mono">
            Klik di mana saja untuk menutup
          </p>
        </div>
      )}

      {historyVehicleId && (
        <VehicleHistoryModal
          vehicleId={historyVehicleId}
          onClose={() => setHistoryVehicleId(null)}
        />
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
          className="inline-flex h-8 w-8 items-center justify-center rounded-md border bg-white dark:bg-[#1a1a14] border-[#e2e8f0] dark:border-[#2e2e25] text-[#64748b] dark:text-[#94a3b8] transition-colors hover:bg-[#f1f5f9] dark:hover:bg-[#13130e] disabled:opacity-40 disabled:cursor-not-allowed"
          aria-label="Halaman sebelumnya"
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
              className={`inline-flex h-8 w-8 items-center justify-center rounded-md border text-xs font-medium font-mono transition-colors ${p === page ? "bg-[#4338ca] dark:bg-[#6366f1] text-white dark:text-[#0f172a] border-[#4338ca] dark:border-[#6366f1]" : "bg-white dark:bg-[#1a1a14] border-[#e2e8f0] dark:border-[#2e2e25] text-[#0f172a] dark:text-[#e2e8f0] hover:bg-[#f1f5f9] dark:hover:bg-[#13130e]"}`}
            >
              {p}
            </button>
          ),
        )}
        <button
          onClick={() => onChange(page + 1)}
          disabled={page === totalPages}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md border bg-white dark:bg-[#1a1a14] border-[#e2e8f0] dark:border-[#2e2e25] text-[#64748b] dark:text-[#94a3b8] transition-colors hover:bg-[#f1f5f9] dark:hover:bg-[#13130e] disabled:opacity-40 disabled:cursor-not-allowed"
          aria-label="Halaman berikutnya"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
