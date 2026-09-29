import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CameraOff, ChevronLeft, ChevronRight, Clock, AlertCircle, RotateCcw } from "lucide-react";
import { API_BASE_URL } from "@/lib/api-config";
import { useState, useEffect } from "react";
import { formatDateTime } from "@/lib/evidence";
import { toast } from "sonner";
import { getLogsPageColors } from "@/lib/theme-tokens";
import { DateRangeFilter } from "@/components/DateRangeFilter";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { authFetch } from "@/lib/auth";

const PAGE_SIZE = 20;

type CameraOfflineEvent = { id: number; camera: string; class_name: string; created_at: string };
type CameraUptimeRow = {
  camera: string;
  current_status: string;
  last_event_at: string;
  offline_count: number;
  total_offline_seconds: number;
  uptime_percent: number;
};

function formatDurationShort(totalSeconds: number): string {
  if (!totalSeconds || totalSeconds <= 0) return "0 mnt";
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const parts: string[] = [];
  if (days > 0) parts.push(`${days} hr`);
  if (hours > 0) parts.push(`${hours} jam`);
  if (days === 0 && minutes > 0) parts.push(`${minutes} mnt`);
  return parts.length > 0 ? parts.join(" ") : "< 1 mnt";
}

function uptimeTone(percent: number) {
  if (percent >= 99) return { text: "#22c55e", bg: "rgba(34, 197, 94, 0.12)" };
  if (percent >= 95) return { text: "#f59e0b", bg: "rgba(245, 158, 11, 0.12)" };
  return { text: "#ef4444", bg: "rgba(239, 68, 68, 0.12)" };
}

function parseAlertResponse(json: any) {
  if (json && typeof json === "object" && "data" in json && Array.isArray(json.data)) return json;
  else if (Array.isArray(json))
    return { data: json, total: json.length, totalPages: Math.ceil(json.length / PAGE_SIZE) };
  return { data: [], total: 0, totalPages: 1 };
}

export const Route = createFileRoute("/logs/cameras")({
  head: () => ({
    meta: [
      { title: "Laporan Kamera Mati · Dashboard Pemantauan" },
      { name: "description", content: "Daftar lengkap kejadian kamera mati." },
    ],
  }),
  component: CamerasPage,
});

function CamerasPage() {
  const [page, setPage] = useState(1);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // === DETEKSI DARK MODE ===
  const [isDarkMode, setIsDarkMode] = useState(false);
  useEffect(() => {
    const checkDarkMode = () => {
      const isDark = document.documentElement.classList.contains("dark");
      setIsDarkMode(isDark);
    };
    checkDarkMode();
    const observer = new MutationObserver(checkDarkMode);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  // === THEME PALETTE (Deep Navy + Border #1e293b + Aksen Indigo #6366f1) ===
  const t = getLogsPageColors(isDarkMode);

  const {
    data: response,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["camera_offline_events", page, startDate, endDate],
    meta: { showErrorToast: true, errorLabel: "Laporan Kamera Mati" },
    queryFn: async () => {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(PAGE_SIZE),
        class_name: "KAMERA OFFLINE",
      });
      if (startDate) params.append("start_date", startDate);
      if (endDate) params.append("end_date", endDate);
      const res = await authFetch(`${API_BASE_URL}/api/alerts?${params}`);
      if (!res.ok) throw new Error(`Server merespons status ${res.status}`);
      const json = await res.json();
      return parseAlertResponse(json);
    },
  });

  // FITUR BARU: ringkasan uptime per kamera -- status sekarang, jumlah &
  // total durasi offline, dan perkiraan persentase uptime dalam periode ini.
  const { data: uptimeResponse, isLoading: isUptimeLoading } = useQuery<{
    data: CameraUptimeRow[];
    period_seconds: number;
  }>({
    queryKey: ["camera_uptime", startDate, endDate],
    meta: { showErrorToast: true, errorLabel: "Uptime Kamera" },
    queryFn: async () => {
      const params = new URLSearchParams();
      if (startDate) params.append("start_date", startDate);
      if (endDate) params.append("end_date", endDate);
      const res = await authFetch(`${API_BASE_URL}/api/alerts/stats/camera-uptime?${params}`);
      if (!res.ok) throw new Error(`Server merespons status ${res.status}`);
      return res.json();
    },
  });
  const uptimeRows = uptimeResponse?.data || [];

  const paginated = response?.data || [];
  const totalPages = response?.totalPages || 1;
  const totalItems = response?.total || 0;
  const uniqueCameras = new Set(paginated.map((c: CameraOfflineEvent) => c.camera)).size;
  const handleDateChange = () => setPage(1);

  return (
    <main
      className="flex-1 min-h-screen transition-colors duration-300"
      style={{ backgroundColor: t.bg, color: t.textMain }}
    >
      {/* === HEADER DENGAN BREADCRUMB === */}
      <header
        className="sticky top-0 z-20 border-b transition-colors duration-300 backdrop-blur-xl"
        style={{ backgroundColor: t.card, borderColor: t.border }}
      >
        <div className="mx-auto max-w-[1680px] px-6 py-4">
          {/* BREADCRUMB BARU */}
          <div className="mb-4">
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbLink asChild>
                    <Link
                      to="/dashboard"
                      className="text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 transition-colors text-sm"
                    >
                      Home
                    </Link>
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbPage className="font-space font-semibold text-lg text-slate-900 dark:text-slate-100">
                    Laporan Kamera Mati
                  </BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </div>

          {/* JUDUL & STATISTIK HALAMAN */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CameraOff
                className="h-5 w-5 transition-colors duration-300"
                style={{ color: t.dangerText }}
              />
              <h1
                className="text-lg font-semibold tracking-tight font-space transition-colors duration-300"
                style={{ color: t.textMain }}
              >
                Laporan Kamera Mati
              </h1>
            </div>
            {totalItems > 0 && (
              <div className="flex items-center gap-2">
                <span
                  className="rounded-full px-3 py-1 text-xs font-medium transition-colors duration-300"
                  style={{ backgroundColor: t.dangerBg, color: t.dangerText }}
                >
                  {totalItems} total
                </span>
                <span
                  className="rounded-full px-3 py-1 text-xs font-medium transition-colors duration-300"
                  style={{
                    backgroundColor: t.card,
                    color: t.textMuted,
                    border: `1px solid ${t.border}`,
                  }}
                >
                  {uniqueCameras} kamera unik
                </span>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* === BODY CONTENT === */}
      <section className="mx-auto max-w-[1680px] px-6 py-6">
        {/* Filter Bar */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 transition-colors duration-300">
          <p className="text-sm transition-colors duration-300" style={{ color: t.textMuted }}>
            Riwayat lengkap kejadian kamera mati beserta waktunya.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <DateRangeFilter
              startDate={startDate}
              endDate={endDate}
              colors={t}
              onChange={(start, end) => {
                setStartDate(start);
                setEndDate(end);
                handleDateChange();
              }}
            />

            {(startDate || endDate) && (
              <button
                onClick={() => {
                  setStartDate("");
                  setEndDate("");
                  setPage(1);
                }}
                className="inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm font-medium transition-colors duration-300 hover:opacity-80"
                style={{ backgroundColor: t.card, borderColor: t.border, color: t.textMuted }}
              >
                <RotateCcw className="h-3.5 w-3.5" /> Reset
              </button>
            )}
          </div>
        </div>

        {/* === RINGKASAN UPTIME PER KAMERA (FITUR BARU) === */}
        <div
          className="mb-6 overflow-hidden rounded-lg border transition-colors duration-300"
          style={{ borderColor: t.border, backgroundColor: t.card }}
        >
          <div className="border-b px-5 py-3" style={{ borderColor: t.border }}>
            <h3 className="text-sm font-semibold font-space" style={{ color: t.textMain }}>
              Uptime per Kamera
            </h3>
            <p className="text-xs mt-0.5" style={{ color: t.textMuted }}>
              {startDate && endDate ? `Periode ${startDate} s/d ${endDate}` : "7 hari terakhir"}
            </p>
          </div>
          {isUptimeLoading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="h-10 animate-pulse rounded"
                  style={{ backgroundColor: t.bg }}
                />
              ))}
            </div>
          ) : uptimeRows.length === 0 ? (
            <p className="p-5 text-sm" style={{ color: t.textMuted }}>
              Belum ada data kamera pada periode ini.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b" style={{ borderColor: t.border }}>
                    <th
                      className="px-5 py-2 text-xs font-medium uppercase tracking-wider"
                      style={{ color: t.textMuted }}
                    >
                      Kamera
                    </th>
                    <th
                      className="px-5 py-2 text-xs font-medium uppercase tracking-wider"
                      style={{ color: t.textMuted }}
                    >
                      Status
                    </th>
                    <th
                      className="px-5 py-2 text-xs font-medium uppercase tracking-wider"
                      style={{ color: t.textMuted }}
                    >
                      Kejadian Offline
                    </th>
                    <th
                      className="px-5 py-2 text-xs font-medium uppercase tracking-wider"
                      style={{ color: t.textMuted }}
                    >
                      Total Durasi Offline
                    </th>
                    <th
                      className="px-5 py-2 text-xs font-medium uppercase tracking-wider"
                      style={{ color: t.textMuted }}
                    >
                      Uptime
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {uptimeRows.map((row) => {
                    const tone = uptimeTone(row.uptime_percent);
                    const isOnline = row.current_status === "KAMERA ONLINE";
                    return (
                      <tr
                        key={row.camera}
                        className="border-b last:border-b-0"
                        style={{ borderColor: t.border }}
                      >
                        <td className="px-5 py-3 font-medium" style={{ color: t.textMain }}>
                          {row.camera}
                        </td>
                        <td className="px-5 py-3">
                          <span
                            className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium"
                            style={{
                              color: isOnline ? "#22c55e" : "#ef4444",
                              backgroundColor: isOnline
                                ? "rgba(34, 197, 94, 0.12)"
                                : "rgba(239, 68, 68, 0.12)",
                            }}
                          >
                            <span
                              className="h-1.5 w-1.5 rounded-full"
                              style={{ backgroundColor: isOnline ? "#22c55e" : "#ef4444" }}
                            />
                            {isOnline ? "Online" : "Offline"}
                          </span>
                        </td>
                        <td className="px-5 py-3 font-mono" style={{ color: t.textMain }}>
                          {row.offline_count}x
                        </td>
                        <td className="px-5 py-3 font-mono" style={{ color: t.textMain }}>
                          {formatDurationShort(row.total_offline_seconds)}
                        </td>
                        <td className="px-5 py-3">
                          <span
                            className="inline-block rounded px-2 py-0.5 text-xs font-mono font-semibold"
                            style={{ color: tone.text, backgroundColor: tone.bg }}
                          >
                            {row.uptime_percent}%
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Loading State */}
        {isLoading ? (
          <div
            className="space-y-2 rounded-lg border transition-colors duration-300"
            style={{ borderColor: t.border, backgroundColor: t.card }}
          >
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex animate-pulse items-center gap-4 px-5 py-4">
                <div
                  className="h-5 w-8 rounded transition-colors duration-300"
                  style={{ backgroundColor: t.bg }}
                />
                <div
                  className="h-10 w-10 rounded-md transition-colors duration-300"
                  style={{ backgroundColor: t.bg }}
                />
                <div
                  className="h-4 w-32 rounded transition-colors duration-300"
                  style={{ backgroundColor: t.bg }}
                />
                <div
                  className="ml-auto h-4 w-36 rounded transition-colors duration-300"
                  style={{ backgroundColor: t.bg }}
                />
              </div>
            ))}
          </div>
        ) : isError ? (
          <div
            className="rounded-lg border p-6 text-center text-sm transition-colors duration-300"
            style={{
              borderColor: isDarkMode ? "#7f1d1d" : "#fecaca",
              backgroundColor: t.dangerLightBg,
              color: t.dangerText,
            }}
          >
            <AlertCircle className="mx-auto mb-2 h-6 w-6" /> Gagal memuat data.
          </div>
        ) : paginated.length === 0 ? (
          /* === EMPTY STATE YANG RAPI === */
          <div
            className="flex flex-col items-center justify-center rounded-lg border border-dashed p-16 text-center transition-colors duration-300"
            style={{ borderColor: t.border, backgroundColor: t.card }}
          >
            <CameraOff
              className="h-14 w-14 mb-4 transition-colors duration-300"
              style={{ color: t.textMuted }}
              strokeWidth={1.5}
            />
            <h4
              className="text-base font-semibold font-space transition-colors duration-300"
              style={{ color: t.textMain }}
            >
              Tidak Ada Laporan Kamera Mati
            </h4>
            <p
              className="mt-1 text-sm transition-colors duration-300"
              style={{ color: t.textMuted }}
            >
              Semua kamera dalam kondisi aktif dan terpantau.
            </p>
          </div>
        ) : (
          <>
            {/* Data Table */}
            <div
              className="rounded-lg border transition-colors duration-300 shadow-sm"
              style={{ borderColor: t.border, backgroundColor: t.card }}
            >
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px]">
                  <thead
                    className="transition-colors duration-300"
                    style={{ backgroundColor: t.bg }}
                  >
                    <tr>
                      <th
                        className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider transition-colors duration-300"
                        style={{ color: t.textMuted }}
                      >
                        No.
                      </th>
                      <th
                        className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider transition-colors duration-300"
                        style={{ color: t.textMuted }}
                      >
                        Kamera
                      </th>
                      <th
                        className="px-5 py-3 text-right text-xs font-medium uppercase tracking-wider transition-colors duration-300"
                        style={{ color: t.textMuted }}
                      >
                        Waktu Kejadian
                      </th>
                    </tr>
                  </thead>
                  <tbody
                    className="divide-y transition-colors duration-300"
                    style={{ borderColor: t.border }}
                  >
                    {paginated.map((c: CameraOfflineEvent, index: number) => {
                      const globalIndex = (page - 1) * PAGE_SIZE + index + 1;
                      return (
                        <tr
                          key={c.id}
                          className="transition-colors duration-200"
                          style={{ backgroundColor: t.card }}
                        >
                          <td
                            className="px-5 py-4 text-sm transition-colors duration-300"
                            style={{ color: t.textMuted }}
                          >
                            {globalIndex}
                          </td>
                          <td className="px-5 py-4">
                            <div className="flex items-center gap-3">
                              <div
                                className="flex h-9 w-9 items-center justify-center rounded-md transition-colors duration-300"
                                style={{ backgroundColor: t.dangerBg, color: t.dangerText }}
                              >
                                <CameraOff className="h-4 w-4" />
                              </div>
                              <span
                                className="text-sm font-medium font-space transition-colors duration-300"
                                style={{ color: t.textMain }}
                              >
                                {c.camera}
                              </span>
                              <span
                                className="rounded-full px-2 py-0.5 text-[10px] font-semibold transition-colors duration-300"
                                style={{ backgroundColor: t.dangerBg, color: t.dangerText }}
                              >
                                OFFLINE
                              </span>
                            </div>
                          </td>
                          <td className="px-5 py-4 text-right">
                            <div
                              className="flex items-center justify-end gap-1.5 text-xs font-mono transition-colors duration-300"
                              style={{ color: t.textMuted }}
                            >
                              <Clock className="h-3 w-3" />
                              <span>{formatDateTime(c.created_at)}</span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Pagination */}
            <Pagination
              page={page}
              totalPages={totalPages}
              total={totalItems}
              pageSize={PAGE_SIZE}
              onChange={setPage}
              theme={t}
            />
          </>
        )}
      </section>
    </main>
  );
}

// === PAGINATION COMPONENT (Dengan Theme Sync) ===
function Pagination({
  page,
  totalPages,
  total,
  pageSize,
  onChange,
  theme,
}: {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  onChange: (p: number) => void;
  theme: any;
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
      <p className="text-xs transition-colors duration-300" style={{ color: theme.textMuted }}>
        Menampilkan {from}–{to} dari {total} data
      </p>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onChange(page - 1)}
          disabled={page === 1}
          aria-label="Halaman sebelumnya"
          className="inline-flex h-8 w-8 items-center justify-center rounded-md border transition-colors duration-300 hover:opacity-80 disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ borderColor: theme.border, backgroundColor: theme.card, color: theme.textMuted }}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        {pageNumbers.map((p, idx) =>
          p === "ellipsis" ? (
            <span
              key={`ellipsis-${idx}`}
              className="px-1 text-xs transition-colors duration-300"
              style={{ color: theme.textMuted }}
            >
              …
            </span>
          ) : (
            <button
              key={p}
              onClick={() => onChange(p)}
              className={`inline-flex h-8 w-8 items-center justify-center rounded-md border text-xs font-medium transition-colors duration-300`}
              style={
                p === page
                  ? {
                      backgroundColor: theme.primary,
                      borderColor: theme.primary,
                      color: theme.bg === "#13130e" ? "#13130e" : "#ffffff",
                    }
                  : {
                      backgroundColor: theme.card,
                      borderColor: theme.border,
                      color: theme.textMain,
                    }
              }
            >
              {p}
            </button>
          ),
        )}

        <button
          onClick={() => onChange(page + 1)}
          disabled={page === totalPages}
          aria-label="Halaman berikutnya"
          className="inline-flex h-8 w-8 items-center justify-center rounded-md border transition-colors duration-300 hover:opacity-80 disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ borderColor: theme.border, backgroundColor: theme.card, color: theme.textMuted }}
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
