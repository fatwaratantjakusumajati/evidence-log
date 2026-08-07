import { cleanPath, createFileRoute, Link } from "@tanstack/react-router";
import { API_BASE_URL } from "@/lib/api-config";
import { useQuery } from "@tanstack/react-query";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
  Users,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  User,
  Clock,
  AlertCircle,
  Calendar,
  Eye,
  X,
  Search,
} from "lucide-react";
import { useState, useEffect } from "react";
import { formatDateTime, formatShortDate } from "@/lib/evidence";
import { authFetch } from "@/lib/auth";

const PAGE_SIZE = 12;

type AttendanceEvent = {
  id: string;
  timestamp: string;
  event_type: string;
  direction: string;
  employee_name: string | null;
  nik: string | null;
  confidence: number;
  camera_id: string;
  is_visitor: boolean;
  snapshot_path: string | null;
  arrival_time?: string;
  departure_time?: string;
  break_windows?: any;
  late_minutes?: number;
  late_type?: string;
};

function parseResponse(json: any) {
  if (json && typeof json === "object" && "data" in json && Array.isArray(json.data)) return json;
  if (Array.isArray(json))
    return { data: json, total: json.length, totalPages: Math.ceil(json.length / PAGE_SIZE) };
  return { data: [], total: 0, totalPages: 1 };
}

function isLate(event: AttendanceEvent): { late: boolean; minutes: number; label: string } {
  if (!event.arrival_time && !event.break_windows) return { late: false, minutes: 0, label: "" };

  const eventTime = new Date(event.timestamp);

  // Cek keterlambatan masuk
  if (event.event_type === "ARRIVAL" && event.arrival_time) {
    const [h, m] = event.arrival_time.split(":").map(Number);
    const limit = new Date(eventTime);
    limit.setHours(h, m, 0, 0);

    if (eventTime > limit) {
      const diff = Math.round((eventTime.getTime() - limit.getTime()) / 60000);
      return { late: true, minutes: diff, label: `Telat ${diff} menit` };
    }
  }

  // Cek keterlambatan kembali istirahat
  if (event.event_type === "BREAK_IN" && event.break_windows) {
    let bw = event.break_windows;
    if (typeof bw === "string") {
      try {
        bw = JSON.parse(bw);
      } catch {
        bw = [];
      }
    }
    if (Array.isArray(bw)) {
      for (const w of bw) {
        const [h, m] = w.end.split(":").map(Number);
        const limit = new Date(eventTime);
        limit.setHours(h, m, 0, 0);

        const [sh, sm] = w.start.split(":").map(Number);
        const startLimit = new Date(eventTime);
        startLimit.setHours(sh, sm, 0, 0);

        if (eventTime > startLimit && eventTime > limit) {
          const diff = Math.round((eventTime.getTime() - limit.getTime()) / 60000);
          return { late: true, minutes: diff, label: `Telat ${diff} menit` };
        }
      }
    }
  }

  return { late: false, minutes: 0, label: "" };
}

function parseAndFormatDateTime(dateString: string | null | undefined): string {
  if (!dateString) return "-";
  let isoString = dateString.trim().replace(" ", "T");
  if (!isoString.endsWith("Z") && !isoString.includes("+")) {
    isoString += "Z";
  }

  const date = new Date(isoString);
  if (isNaN(date.getTime())) return "-";

  return date.toLocaleString("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

export const Route = createFileRoute("/attendance")({
  component: AttendancePage,
});

function getImageUrl(path: string | null): string {
  if (!path) {
    return "";
  }

  let cleanPath = path.replace(/\\/g, "/");

  if (cleanPath.startsWith("/")) {
    cleanPath = cleanPath.substring(1);
  }

  let baseUrl = API_BASE_URL;
  if (baseUrl.endsWith("/")) {
    baseUrl = baseUrl.substring(0, baseUrl.length - 1);
  }

  return `${baseUrl}/${cleanPath}`;
}

function AttendancePage() {
  const [page, setPage] = useState(1);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [showLateOnly, setShowLateOnly] = useState(false);
  const [selectedLog, setSelectedLog] = useState<AttendanceEvent | null>(null);

  useEffect(() => {
    document.body.style.overflow = selectedLog ? "hidden" : "unset";
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [selectedLog]);

  // --- Cari berdasarkan nama/ID karyawan(dashboard) ---
  const [searchInput, setSearchInput] = useState("");
  const [search, SetSearch] = useState("");
  useEffect(() => {
    const timeout = setTimeout(() => {
      SetSearch(searchInput.trim());
      setPage(1);
    }, 400);
    return () => clearTimeout(timeout);
  }, [searchInput]);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["attendance_log", page, startDate, endDate, search],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
      if (startDate) params.append("start_date", startDate);
      if (endDate) params.append("end_date", endDate);
      if (search) params.append("search", search);
      const res = await authFetch(`${API_BASE_URL}/api/attendance/log?${params}`);
      if (!res.ok) return { data: [], total: 0, totalPages: 1 };
      const json = await res.json();
      return parseResponse(json);
    },
  });

  const paginated = data?.data || [];
  const totalPages = data?.totalPages || 1;
  const totalItems = data?.total || 0;

  // Filter hanya yang terlambat
  const filteredData = showLateOnly
    ? paginated.filter((log: AttendanceEvent) => isLate(log).late)
    : paginated;

  // Hitung total keterlambatan
  const totalLate = paginated
    .filter((log: AttendanceEvent) => log.event_type !== "MANUAL_REVIEW_EVENT")
    .filter((log: AttendanceEvent) => (showLateOnly ? isLate(log).late : true)).length;

  return (
    <main className="flex-1 min-h-screen bg-[#f8fafc] dark:bg-[#0a111f] text-[#0f172a] dark:text-[#cbd5e1] transition-colors duration-300 font-sans">
      <header className="sticky top-0 z-20 border-b bg-white dark:bg-[#0f1a2e] border-[#e2e8f0] dark:border-[#1a2c45] backdrop-blur-xl">
        <div className="mx-auto max-w-[1440px] px-6 py-4">
          <div className="mb-4">
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbLink asChild>
                    <Link
                      to="/dashboard"
                      className="text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 font-mono text-sm"
                    >
                      Home
                    </Link>
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbPage className="font-space font-semibold text-lg text-slate-900 dark:text-slate-100">
                    Log Kehadiran
                  </BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-[#2563eb] dark:text-[#60a5fa]" />
              <h1 className="text-lg font-semibold tracking-tight font-space">Log Kehadiran AI</h1>
            </div>
            <div className="flex items-center gap-2">
              {totalLate > 0 && (
                <span className="rounded-full bg-red-100 dark:bg-red-900/30 px-3 py-1 text-xs font-medium text-red-700 dark:text-red-400 border border-red-200 dark:border-red-900/50 font-mono">
                  <AlertCircle className="h-3 w-3 inline mr-1" />
                  {totalLate} terlambat
                </span>
              )}
              {totalItems > 0 && (
                <span className="rounded-full bg-[#eff6ff] dark:bg-[#0a111f] px-3 py-1 text-xs font-medium text-[#2563eb] dark:text-[#60a5fa] border border-[#bfdbfe] dark:border-[#1a2c45] font-mono">
                  {totalItems} total
                </span>
              )}
            </div>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-[1440px] px-6 py-6">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-[#64748b] dark:text-[#94a3b8] font-mono">
            Riwayat kehadiran karyawan yang terdeteksi AI.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {/* Cari nama atau ID*/}
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 2-3.5 -translate-y-1/2 text-[#64748b] dark:text-[#94a3b8]" />
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Cari nama/ID karyawan..."
                className="h-9 w-48 rounded-md border bg-white dark:bg-[#1e293b] border-[#e2e8f0] dark:border-[#334155] pl-8 pr-3 text-xs outline-none dark:text-[#e2e8f0] text-[#0f172a] font-mono shadow-sm focus:ring-1 cpcus:ring-[#2563eb]"
              />
              {searchInput && (
                <button
                  onClick={() => setSearchInput("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-[#64748b] dark:text-[#94a3b8] hover:text-red-500"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            {/* Filter terlambat */}
            <button
              onClick={() => setShowLateOnly(!showLateOnly)}
              className={`inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-xs font-medium font-mono transition-all ${
                showLateOnly
                  ? "bg-red-100 dark:bg-red-900/30 border-red-300 dark:border-red-800 text-red-700 dark:text-red-400"
                  : "bg-white dark:bg-[#1e293b] border-[#e2e8f0] dark:border-[#334155] text-[#64748b] dark:text-[#94a3b8]"
              }`}
            >
              <AlertCircle className="h-3.5 w-3.5" />
              {showLateOnly ? "Semua Data" : "Terlambat Saja"}
            </button>

            {/* Date filter */}
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 rounded-md border bg-white dark:bg-[#1e293b] border-[#e2e8f0] dark:border-[#334155] px-2 py-1.5 shadow-sm transition-colors duration-300">
                <Calendar className="h-4 w-4 text-[#64748b] dark:text-[#94a3b8]" />
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => {
                    setStartDate(e.target.value);
                    setPage(1);
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
                    setPage(1);
                  }}
                  className="w-[115px] bg-transparent text-xs outline-none dark:text-[#e2e8f0] text-[#0f172a]"
                  placeholder="Sampai"
                />
              </div>

              {(startDate || endDate || searchInput) && (
                <button
                  onClick={() => {
                    setStartDate("");
                    setEndDate("");
                    setSearchInput("");
                    setPage(1);
                  }}
                  aria-label="Hapus pencarian"
                  className="inline-flex h-9 items-center gap-1.5 rounded-md border bg-white dark:bg-[#1e293b] border-[#e2e8f0] dark:border-[#334155] px-3 text-sm font-medium text-[#64748b] dark:text-[#94a3b8] hover:bg-[#f1f5f9] dark:hover:bg-[#0b1120]"
                >
                  <RotateCcw className="h-3.5 w-3.5" /> Reset
                </button>
              )}
            </div>
          </div>
        </div>

        {isLoading && (
          <div className="text-center py-10 text-[#64748b] font-mono">Memuat data...</div>
        )}
        {isError && (
          <div className="rounded-md border p-6 text-sm bg-red-50 dark:bg-[#450a0a] border-red-200 dark:border-[#7f1d1d] text-red-600 dark:text-[#fca5a5]">
            Gagal memuat data.
          </div>
        )}
        {!isLoading && !isError && filteredData.length === 0 && (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed bg-white dark:bg-[#1e293b] border-[#e2e8f0] dark:border-[#334155] p-16 text-center shadow-sm">
            {showLateOnly ? (
              <>
                <Clock className="mb-4 h-14 w-14 text-green-500" strokeWidth={1.5} />
                <h3 className="text-base font-semibold font-space text-[#0f172a] dark:text-[#e2e8f0]">
                  Tidak Ada Keterlambatan
                </h3>
                <p className="mt-1.5 max-w-md text-sm text-[#64748b] dark:text-[#94a3b8] font-mono">
                  Semua karyawan hadir tepat waktu.
                </p>
              </>
            ) : (
              <>
                <Users className="mb-4 h-14 w-14 text-[#94a3b8]" strokeWidth={1.5} />
                <h3 className="text-base font-semibold font-space text-[#0f172a] dark:text-[#e2e8f0]">
                  Belum Ada Data Kehadiran
                </h3>
                <p className="mt-1.5 max-w-md text-sm text-[#64748b] dark:text-[#94a3b8] font-mono">
                  Sistem AI belum mencatat log kehadiran.
                </p>
              </>
            )}
          </div>
        )}

        {!isLoading && !isError && filteredData.length > 0 && (
          <>
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filteredData.map((log: AttendanceEvent) => {
                const lateInfo = isLate(log);

                let badge =
                  "bg-gray-100 text-gray-700 dark:bg-gray-800/30 dark:text-gray-400 border-gray-200 dark:border-gray-700/50";
                if (log.event_type === "ARRIVAL")
                  badge =
                    "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border-green-200 dark:border-green-800/50";
                else if (log.event_type === "DEPARTURE")
                  badge =
                    "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-red-200 dark:border-red-800/50";
                else if (log.event_type === "BREAK_OUT")
                  badge =
                    "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 border-orange-200 dark:border-orange-800/50";
                else if (log.event_type === "BREAK_IN")
                  badge =
                    "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border-blue-200 dark:border-blue-800/50";

                return (
                  <li
                    key={log.id}
                    className="group overflow-hidden rounded-lg border bg-white dark:bg-[#1e293b] border-[#e2e8f0] dark:border-[#334155] shadow-sm hover:shadow-md"
                  >
                    {/* Klik Foto Card untuk Membuka Modal */}
                    <div
                      className="relative h-48 w-full bg-[#f1f5f9] dark:bg-[#0b1120] flex items-center justify-center overflow-hidden cursor-pointer group/image"
                      onClick={() => setSelectedLog(log)}
                    >
                      {log.snapshot_path ? (
                        <img
                          src={
                            log.snapshot_path
                              ? `${API_BASE_URL}/${log.snapshot_path.replace(/\\/g, "/")}`
                              : ""
                          }
                          alt="Karyawan"
                          className="h-full w-full object-cover group-hover/image:scale-105 transition-transform duration-300"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = "none";
                          }}
                        />
                      ) : (
                        <User className="h-16 w-16 text-[#94a3b8]" />
                      )}

                      {/* Overlay Ikon Mata Hover */}
                      <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 transition-opacity duration-300 group-hover/image:opacity-100">
                        <Eye className="h-8 w-8 text-white" />
                      </div>

                      {/* Badge TERLAMBAT */}
                      {lateInfo.late && (
                        <div className="absolute top-2 left-2 z-10 rounded-full bg-red-600 px-2.5 py-0.5 text-[10px] font-bold text-white shadow-md flex items-center gap-1">
                          <AlertCircle className="h-3 w-3" />
                          {lateInfo.label}
                        </div>
                      )}
                    </div>

                    <div className="space-y-2 p-4">
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-sm font-semibold font-space text-[#0f172a] dark:text-[#e2e8f0]">
                          {log.employee_name || (log.is_visitor ? "Pengunjung" : "Unknown")}
                        </span>
                        <div className="flex items-center gap-1">
                          {lateInfo.late && (
                            <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold font-mono bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-red-200 dark:border-red-900/50">
                              TERLAMBAT
                            </span>
                          )}
                          <span
                            className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-semibold font-mono ${badge}`}
                          >
                            {log.event_type}
                          </span>
                        </div>
                      </div>

                      {/* Info keterlambatan */}
                      {lateInfo.late && (
                        <div className="flex items-center gap-1 text-[10px] text-red-600 dark:text-red-400 font-mono">
                          <Clock className="h-3 w-3" />
                          Jadwal: {log.event_type === "ARRIVAL" ? log.arrival_time : "istirahat"} |
                          Terlambat: {lateInfo.minutes} menit
                        </div>
                      )}

                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs text-[#64748b] dark:text-[#94a3b8] font-mono">
                          {parseAndFormatDateTime(log.timestamp)}
                        </p>
                        <div className="flex items-center gap-1 text-[10px] text-[#64748b] dark:text-[#94a3b8] font-mono">
                          {log.nik && <span>🆔 {log.nik}</span>}
                          {log.camera_id && <span>📍 {log.camera_id}</span>}
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>

            {/* Pagination */}
            <div className="mt-8 flex flex-col items-center gap-3">
              <p className="text-xs text-[#64748b] dark:text-[#94a3b8] font-mono">
                Menampilkan {filteredData.length} data
                {showLateOnly && ` (difilter terlambat)`}
              </p>
              {!showLateOnly && (
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setPage(page - 1)}
                    disabled={page === 1}
                    className="h-8 w-8 rounded-md border bg-white dark:bg-[#1e293b] border-[#e2e8f0] dark:border-[#334155] text-[#64748b] dark:text-[#94a3b8] hover:bg-[#f1f5f9] dark:hover:bg-[#0b1120] disabled:opacity-40"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => i + 1).map((p) => (
                    <button
                      key={p}
                      onClick={() => setPage(p)}
                      className={`h-8 w-8 rounded-md border text-xs font-mono ${p === page ? "bg-[#2563eb] dark:bg-[#38bdf8] text-white border-[#2563eb] dark:border-[#38bdf8]" : "bg-white dark:bg-[#1e293b] border-[#e2e8f0] dark:border-[#334155] text-[#0f172a] dark:text-[#e2e8f0]"}`}
                    >
                      {p}
                    </button>
                  ))}
                  <button
                    onClick={() => setPage(page + 1)}
                    disabled={page === totalPages}
                    className="h-8 w-8 rounded-md border bg-white dark:bg-[#1e293b] border-[#e2e8f0] dark:border-[#334155] text-[#64748b] dark:text-[#94a3b8] hover:bg-[#f1f5f9] dark:hover:bg-[#0b1120] disabled:opacity-40"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </section>

      {/* Modal Lightbox Kehadiran */}
      {selectedLog && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          onClick={() => setSelectedLog(null)}
        >
          <div
            className="relative flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-lg bg-white dark:bg-[#1e293b] shadow-2xl md:flex-row"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setSelectedLog(null)}
              aria-label="Tutup"
              className="absolute right-3 top-3 z-10 rounded-full bg-black/50 p-1.5 text-white transition-colors hover:bg-black/70"
            >
              <X className="h-5 w-5" />
            </button>
            <div className="flex flex-1 items-center justify-center bg-[#f1f5f9] dark:bg-[#0b1120] p-2 md:w-1/2">
              {selectedLog.snapshot_path ? (
                <img
                  src={
                    selectedLog.snapshot_path
                      ? `${API_BASE_URL}/${selectedLog.snapshot_path.replace(/\\/g, "/")}`
                      : ""
                  }
                  alt="Karyawan"
                  className="max-h-[70vh] w-full object-contain"
                />
              ) : (
                <User className="h-32 w-32 text-[#94a3b8]" />
              )}
            </div>
            <div className="flex-1 space-y-4 overflow-y-auto p-6 md:w-1/2 bg-white dark:bg-[#1e293b] text-[#0f172a] dark:text-[#e2e8f0]">
              <div>
                <h2 className="text-2xl font-bold font-space">
                  {selectedLog.employee_name || (selectedLog.is_visitor ? "Pengunjung" : "Unknown")}
                </h2>
                <div className="mt-2 flex gap-2">
                  <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold font-mono bg-gray-100 text-gray-700 dark:bg-gray-800/30 dark:text-gray-400">
                    {selectedLog.event_type}
                  </span>
                </div>
              </div>

              <div className="space-y-3 pt-4 border-t border-[#e2e8f0] dark:border-[#334155]">
                <div className="flex flex-col">
                  <span className="text-xs text-[#64748b] dark:text-[#94a3b8] font-mono uppercase tracking-wider">
                    Waktu Terdeteksi
                  </span>
                  <span className="text-sm font-medium">
                    {parseAndFormatDateTime(selectedLog.timestamp)}
                  </span>
                </div>
                <div className="flex flex-col">
                  <span className="text-xs text-[#64748b] dark:text-[#94a3b8] font-mono uppercase tracking-wider">
                    Kamera (Lokasi)
                  </span>
                  <span className="text-sm font-medium">{selectedLog.camera_id}</span>
                </div>
                {selectedLog.nik && (
                  <div className="flex flex-col">
                    <span className="text-xs text-[#64748b] dark:text-[#94a3b8] font-mono uppercase tracking-wider">
                      NIK / ID
                    </span>
                    <span className="text-sm font-medium font-mono">{selectedLog.nik}</span>
                  </div>
                )}
                <div className="flex flex-col">
                  <span className="text-xs text-[#64748b] dark:text-[#94a3b8] font-mono uppercase tracking-wider">
                    Akurasi Wajah
                  </span>
                  <span className="text-sm font-medium font-mono">
                    {(selectedLog.confidence * 100).toFixed(0)}%
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
