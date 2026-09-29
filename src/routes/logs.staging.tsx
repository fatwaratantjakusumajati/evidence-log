import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Boxes,
  Clock,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  Camera,
  X,
  MapPin,
  Database,
  Calendar,
  Eye,
} from "lucide-react";
import { useState, useEffect } from "react";
import { API_BASE_URL } from "@/lib/api-config";
import { formatDateTime } from "@/lib/evidence";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { toast } from "sonner";
import { getLogsPageColors } from "@/lib/theme-tokens";
import { authFetch } from "@/lib/auth";
import { DateRangeFilter } from "@/components/DateRangeFilter";

const PAGE_SIZE = 12;

type StagingDetection = {
  id: number;
  camera: string;
  class_name: string | null;
  duration: number;
  timestamp: string;
  foto_base64: string;
  file_name: string;
  alert_level: string;
  created_at: string;
  alert_sent_1: boolean;
  alert_sent_2: boolean;
  alert_sent_3: boolean;
  first_detected: string;
  // Cuma terisi (bukan null) kalau alert_level masih STAGING/WARNING
  // dan belum kena alert_sent_2 -- lihat komentar di alerts.js.
  predicted_risk: number | null;
};

function riskBadgeStyle(risk: number | null, t: any) {
  if (risk === null) return { backgroundColor: t.card, color: t.textMuted, label: "—" };
  const pct = Math.round(risk * 100);
  if (risk >= 0.6) return { backgroundColor: t.dangerBg, color: t.dangerText, label: `${pct}%` };
  if (risk >= 0.3)
    return { backgroundColor: "rgba(245,158,11,0.15)", color: "#d97706", label: `${pct}%` };
  return { backgroundColor: "rgba(16,185,129,0.15)", color: "#059669", label: `${pct}%` };
}

function parseAlertResponse(json: any) {
  if (json && typeof json === "object" && "data" in json && Array.isArray(json.data)) return json;
  else if (Array.isArray(json))
    return { data: json, total: json.length, totalPages: Math.ceil(json.length / PAGE_SIZE) };
  return { data: [], total: 0, totalPages: 1 };
}

function formatDurationFromSeconds(totalSeconds: number | string) {
  const detik = typeof totalSeconds === "string" ? parseInt(totalSeconds, 10) : totalSeconds;
  const days = Math.floor(detik / 86400);
  const hours = Math.floor((detik % 86400) / 3600);
  const minutes = Math.floor((detik % 3600) / 60);
  if (days > 0) return `${days} hari ${hours} jam`;
  if (hours > 0) return `${hours} jam ${minutes} menit`;
  return `${minutes} menit`;
}

export const Route = createFileRoute("/logs/staging")({
  head: () => ({
    meta: [
      { title: "Deteksi Barang Staging · Dashboard Pemantauan" },
      { name: "description", content: "Daftar lengkap deteksi barang di area staging." },
    ],
  }),
  component: StagingPage,
});

function StagingPage() {
  const [page, setPage] = useState(1);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // --- PERBAIKAN MODAL: State untuk popup detail ---
  const [selectedStaging, setSelectedStaging] = useState<StagingDetection | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

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

  const t = getLogsPageColors(isDarkMode);

  const {
    data: response,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["staging_detections", page, startDate, endDate],
    meta: { showErrorToast: true, errorLabel: "Riwayat Staging" },
    queryFn: async () => {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(PAGE_SIZE),
        class_name: "box",
      });
      if (startDate) params.append("start_date", startDate);
      if (endDate) params.append("end_date", endDate);
      const res = await authFetch(`${API_BASE_URL}/api/alerts?${params}`);
      if (!res.ok) throw new Error(`Server merespons status ${res.status}`);
      const json = await res.json();
      return parseAlertResponse(json);
    },
  });

  const paginated = response?.data || [];
  const totalPages = response?.totalPages || 1;
  const totalItems = response?.total || 0;
  const handleDateChange = () => setPage(1);

  // --- PERBAIKAN MODAL: Fungsi buka dan tutup ---
  const openDetailModal = (staging: StagingDetection) => {
    setSelectedStaging(staging);
    setIsModalOpen(true);
  };
  const closeDetailModal = () => {
    setIsModalOpen(false);
    setSelectedStaging(null);
  };

  return (
    <main
      className="flex-1 transition-colors duration-300"
      style={{ backgroundColor: t.bg, color: t.textMain }}
    >
      <header
        className="sticky top-0 z-20 border-b transition-colors duration-300 backdrop-blur-xl"
        style={{ backgroundColor: t.card, borderColor: t.border }}
      >
        {/* ... HEADER SAMA SEPERTI SEBELUMNYA ... */}
        <div className="mx-auto max-w-[1680px] px-6 py-4">
          <div className="mb-4">
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbLink asChild>
                    <Link
                      to="/dashboard"
                      className="text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 transition-colors font-mono text-sm"
                    >
                      Home
                    </Link>
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbPage className="font-space font-semibold text-lg text-slate-900 dark:text-slate-100">
                    Deteksi Barang Staging
                  </BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Boxes className="h-5 w-5" style={{ color: t.primary }} />
              <h1
                className="text-lg font-semibold tracking-tight font-space"
                style={{ color: t.textMain }}
              >
                Deteksi Barang Staging
              </h1>
            </div>
            {totalItems > 0 && (
              <span
                className="rounded-full px-3 py-1 text-xs font-medium font-mono"
                style={{
                  backgroundColor: t.card,
                  color: t.primary,
                  border: `1px solid ${t.border}`,
                }}
              >
                {totalItems} total
              </span>
            )}
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-[1680px] px-6 py-6">
        {/* ... FILTER BAR SAMA ... */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 transition-colors duration-300">
          <p className="text-sm font-mono" style={{ color: t.textMuted }}>
            Riwayat lengkap deteksi barang di staging...
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
                className="inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm font-medium hover:opacity-80"
                style={{ backgroundColor: t.card, borderColor: t.border, color: t.textMuted }}
              >
                <RotateCcw className="h-3.5 w-3.5" /> Reset
              </button>
            )}
          </div>
        </div>

        {isLoading ? (
          <div
            className="overflow-hidden rounded-lg border"
            style={{ borderColor: t.border, backgroundColor: t.card }}
          >
            <table className="w-full min-w-[780px] border-collapse text-sm">
              <thead>
                <tr
                  className="border-b text-left text-[11px] font-semibold uppercase tracking-wide"
                  style={{ borderColor: t.border, color: t.textMuted }}
                >
                  <th className="px-4 py-3">Barang</th>
                  <th className="px-4 py-3">Kamera</th>
                  <th className="px-4 py-3">Mulai Terdeteksi</th>
                  <th className="px-4 py-3">Alert Terakhir</th>
                  <th className="px-4 py-3">Durasi</th>
                  <th className="px-4 py-3">Risiko Eskalasi</th>
                  <th className="px-4 py-3 text-right">Foto</th>
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: PAGE_SIZE }).map((_, i) => (
                  <tr
                    key={i}
                    className="animate-pulse border-b last:border-0"
                    style={{ borderColor: t.border }}
                  >
                    <td className="px-4 py-3">
                      <div className="h-3 w-28 rounded" style={{ backgroundColor: t.bg }} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="h-3 w-16 rounded" style={{ backgroundColor: t.bg }} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="h-3 w-24 rounded" style={{ backgroundColor: t.bg }} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="h-3 w-24 rounded" style={{ backgroundColor: t.bg }} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="h-3 w-16 rounded" style={{ backgroundColor: t.bg }} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="h-3 w-12 rounded" style={{ backgroundColor: t.bg }} />
                    </td>
                    <td className="px-4 py-3">
                      <div
                        className="ml-auto h-14 w-20 rounded"
                        style={{ backgroundColor: t.bg }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : isError ? (
          <div
            className="rounded-lg border p-6 text-center text-sm"
            style={{
              borderColor: isDarkMode ? "#7f1d1d" : "#fecaca",
              backgroundColor: isDarkMode ? "#450a0a" : "#fef2f2",
              color: t.dangerText,
            }}
          >
            Gagal memuat data.
          </div>
        ) : paginated.length === 0 ? (
          <div
            className="flex flex-col items-center justify-center rounded-lg border border-dashed p-16 text-center"
            style={{ borderColor: t.border, backgroundColor: t.card }}
          >
            <Boxes className="h-14 w-14 mb-4" style={{ color: t.textMuted }} strokeWidth={1.5} />
            <h4 className="text-base font-semibold font-space" style={{ color: t.textMain }}>
              Belum Ada Barang Staging
            </h4>
            <p className="mt-1 text-sm font-mono" style={{ color: t.textMuted }}>
              Data staging akan muncul saat sistem mendeteksi barang di area gudang.
            </p>
          </div>
        ) : (
          <>
            <div
              className="overflow-x-auto rounded-lg border"
              style={{ borderColor: t.border, backgroundColor: t.card }}
            >
              <table className="w-full min-w-[780px] border-collapse text-sm">
                <thead>
                  <tr
                    className="border-b text-left text-[11px] font-semibold uppercase tracking-wide"
                    style={{ borderColor: t.border, color: t.textMuted }}
                  >
                    <th className="px-4 py-3">Barang</th>
                    <th className="px-4 py-3">Kamera</th>
                    <th className="px-4 py-3">Mulai Terdeteksi</th>
                    <th className="px-4 py-3">Alert Terakhir</th>
                    <th className="px-4 py-3">Durasi</th>
                    <th className="px-4 py-3">Risiko Eskalasi</th>
                    <th className="px-4 py-3 text-right">Foto</th>
                  </tr>
                </thead>
                <tbody>
                  {paginated.map((s: StagingDetection) => (
                    <tr
                      key={s.id}
                      onClick={() => openDetailModal(s)}
                      className="group cursor-pointer border-b transition-colors last:border-0"
                      style={{ borderColor: t.border }}
                    >
                      <td className="px-4 py-3 align-top">
                        <p
                          className="text-sm font-semibold font-space"
                          style={{ color: t.textMain }}
                        >
                          {s.class_name ?? "Barang tidak teridentifikasi"}
                        </p>
                        {s.alert_level && (
                          <span className="mt-1 inline-block rounded-md bg-black/60 px-2 py-0.5 text-[10px] font-medium text-white font-mono">
                            {s.alert_level}
                          </span>
                        )}
                      </td>
                      <td
                        className="px-4 py-3 align-top text-[11px] font-mono"
                        style={{ color: t.textMuted }}
                      >
                        {s.camera ? (
                          <span className="flex items-center gap-1">
                            <Camera className="h-3 w-3" /> {s.camera}
                          </span>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td
                        className="px-4 py-3 align-top text-[11px] font-mono"
                        style={{ color: t.textMuted }}
                      >
                        {s.first_detected ? formatDateTime(s.first_detected) : "-"}
                      </td>
                      <td
                        className="px-4 py-3 align-top text-[11px] font-mono"
                        style={{ color: t.textMuted }}
                      >
                        {formatDateTime(s.timestamp)}
                      </td>
                      <td className="px-4 py-3 align-top">
                        <span
                          className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold font-mono"
                          style={{ backgroundColor: t.dangerBg, color: t.dangerText }}
                        >
                          <Clock className="h-3.5 w-3.5" /> {formatDurationFromSeconds(s.duration)}
                        </span>
                      </td>
                      <td className="px-4 py-3 align-top">
                        {(() => {
                          const risk = riskBadgeStyle(s.predicted_risk, t);
                          return (
                            <span
                              className="inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold font-mono"
                              style={{ backgroundColor: risk.backgroundColor, color: risk.color }}
                              title={
                                s.predicted_risk === null
                                  ? "Belum cukup data historis, atau item sudah selesai"
                                  : "Estimasi probabilitas item ini bakal mencapai eskalasi 5 hari"
                              }
                            >
                              {risk.label}
                            </span>
                          );
                        })()}
                      </td>
                      <td className="px-4 py-3 align-top">
                        <div
                          className="relative ml-auto h-14 w-20 overflow-hidden rounded border"
                          style={{ borderColor: t.border, backgroundColor: t.bg }}
                        >
                          <img
                            src={`data:image/jpeg;base64,${s.foto_base64}`}
                            alt={s.class_name ?? "Bukti"}
                            loading="lazy"
                            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                          />
                          <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 transition-opacity group-hover:opacity-100">
                            <Eye className="h-4 w-4 text-white" />
                          </div>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

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

      {/* --- PERBAIKAN MODAL: Render Modal Detail --- */}
      {isModalOpen && selectedStaging && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div
            className="relative w-full max-w-4xl overflow-hidden rounded-xl shadow-2xl flex flex-col md:flex-row"
            style={{ backgroundColor: t.card, color: t.textMain, border: `1px solid ${t.border}` }}
          >
            {/* Tombol Close */}
            <button
              onClick={closeDetailModal}
              className="absolute right-4 top-4 z-10 rounded-full p-2 hover:bg-black/20 transition-colors"
              style={{ color: t.textMuted }}
            >
              <X className="h-5 w-5" />
            </button>

            {/* Gambar Detail (Kiri) */}
            <div className="viewfinder relatife w-full md:w-1/2 bg-black/10 flex items-center justify-center p-4 md:p-0">
              <span className="vf-tr" />
              <span className="vf-bl" />
              <img
                src={`data:image/jpeg;base64,${selectedStaging.foto_base64}`}
                alt="Staging Detail"
                className="h-full w-full object-contain max-h-[60vh] md:max-h-[70vh]"
              />
            </div>

            {/* Info Detail (Kanan) */}
            <div className="w-full md:w-1/2 p-6 space-y-4 overflow-y-auto max-h-[70vh]">
              <h2 className="text-xl font-bold font-space" style={{ color: t.textMain }}>
                {selectedStaging.class_name ?? "Barang Staging"}
              </h2>

              <div className="flex items-center gap-2 mt-1">
                <span
                  className="rounded-full px-2.5 py-0.5 text-xs font-mono"
                  style={{ backgroundColor: t.dangerBg, color: t.dangerText }}
                >
                  {formatDurationFromSeconds(selectedStaging.duration)}
                </span>
                {selectedStaging.alert_level && (
                  <span className="rounded-full px-2.5 py-0.5 text-xs font-mono bg-yellow-500/20 text-yellow-500 border border-yellow-500/20">
                    {selectedStaging.alert_level}
                  </span>
                )}
              </div>

              <div className="space-y-3 pt-2 border-t" style={{ borderColor: t.border }}>
                <div
                  className="flex items-start gap-3 text-sm font-mono"
                  style={{ color: t.textMuted }}
                >
                  <Calendar className="h-4 w-4 mt-0.5 shrink-0" />
                  <div>
                    <div className="font-semibold" style={{ color: t.textMain }}>
                      Waktu Terdeteksi
                    </div>
                    <div>
                      {formatDateTime(selectedStaging.first_detected || selectedStaging.created_at)}
                    </div>
                  </div>
                </div>
                <div
                  className="flex items-start gap-3 text-sm font-mono"
                  style={{ color: t.textMuted }}
                >
                  <Clock className="h-4 w-4 mt-0.5 shrink-0" />
                  <div>
                    <div className="font-semibold" style={{ color: t.textMain }}>
                      Alert Terakhir
                    </div>
                    <div>{formatDateTime(selectedStaging.timestamp)}</div>
                  </div>
                </div>
                <div
                  className="flex items-start gap-3 text-sm font-mono"
                  style={{ color: t.textMuted }}
                >
                  <Camera className="h-4 w-4 mt-0.5 shrink-0" />
                  <div>
                    <div className="font-semibold" style={{ color: t.textMain }}>
                      Kamera
                    </div>
                    <div>{selectedStaging.camera}</div>
                  </div>
                </div>
                <div
                  className="flex items-start gap-3 text-sm font-mono"
                  style={{ color: t.textMuted }}
                >
                  <Database className="h-4 w-4 mt-0.5 shrink-0" />
                  <div>
                    <div className="font-semibold" style={{ color: t.textMain }}>
                      ID Database
                    </div>
                    <div>#{selectedStaging.id}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

// === PAGINATION COMPONENT (SAMA) ===
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
      <p className="text-xs font-mono" style={{ color: theme.textMuted }}>
        Menampilkan {from}–{to} dari {total} data
      </p>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onChange(page - 1)}
          disabled={page === 1}
          aria-label="Halaman sebelumnya"
          className="inline-flex h-8 w-8 items-center justify-center rounded-md border hover:opacity-80 disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ borderColor: theme.border, backgroundColor: theme.card, color: theme.textMuted }}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        {pageNumbers.map((p, idx) =>
          p === "ellipsis" ? (
            <span
              key={`ellipsis-${idx}`}
              className="px-1 text-xs font-mono"
              style={{ color: theme.textMuted }}
            >
              …
            </span>
          ) : (
            <button
              key={p}
              onClick={() => onChange(p)}
              className={`inline-flex h-8 w-8 items-center justify-center rounded-md border text-xs font-medium font-mono`}
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
          className="inline-flex h-8 w-8 items-center justify-center rounded-md border hover:opacity-80 disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ borderColor: theme.border, backgroundColor: theme.card, color: theme.textMuted }}
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
