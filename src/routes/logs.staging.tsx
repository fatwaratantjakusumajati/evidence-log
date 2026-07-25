import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Boxes, Clock, ChevronLeft, ChevronRight, RotateCcw, Camera } from "lucide-react";
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
};

function parseAlertResponse(json: any) {
  if (json && typeof json === "object" && "data" in json && Array.isArray(json.data)) return json;
  else if (Array.isArray(json))
    return { data: json, total: json.length, totalPages: Math.ceil(json.length / PAGE_SIZE) };
  return { data: [], total: 0, totalPages: 1 };
}

function formatDuration(fromIso: string, toIso?: string | null) {
  const start = new Date(fromIso).getTime();
  const end = toIso ? new Date(toIso).getTime() : Date.now();
  const diff = Math.max(0, end - start);
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return `${minutes} menit`;
  const hours = Math.floor(minutes / 60);
  const remMin = minutes % 60;
  if (hours < 24) return remMin ? `${hours} jam ${remMin} menit` : `${hours} jam`;
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  return remHours ? `${days} hari ${remHours} jam` : `${days} hari`;
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

  // === THEME PALETTE (Deep Navy + Border #1a2c45 + Aksen Biru Langit #60a5fa) ===
  const t = getLogsPageColors(isDarkMode);

  const {
    data: response,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["staging_detections", page, startDate, endDate],
    queryFn: async () => {
      try {
        const params = new URLSearchParams({
          page: String(page),
          limit: String(PAGE_SIZE),
          class_name: "box",
        });
        if (startDate) params.append("start_date", startDate);
        if (endDate) params.append("end_date", endDate);
        const res = await fetch(`${API_BASE_URL}/api/alerts?${params}`);
        if (!res.ok) return { data: [], total: 0, totalPages: 1 };
        const json = await res.json();
        return parseAlertResponse(json);
      } catch {
        return { data: [], total: 0, totalPages: 1 };
      }
    },
  });

  const paginated = response?.data || [];
  const totalPages = response?.totalPages || 1;
  const totalItems = response?.total || 0;
  const handleDateChange = () => setPage(1);

  return (
    <main
      className="flex-1 transition-colors duration-300"
      style={{ backgroundColor: t.bg, color: t.textMain }}
    >
      {/* === HEADER DENGAN BREADCRUMB === */}
      <header
        className="sticky top-0 z-20 border-b transition-colors duration-300 backdrop-blur-xl"
        style={{ backgroundColor: t.card, borderColor: t.border }}
      >
        <div className="mx-auto max-w-[1440px] px-6 py-4">
          {/* BREADCRUMB */}
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

          {/* JUDUL & STATISTIK HALAMAN */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Boxes
                className="h-5 w-5 transition-colors duration-300"
                style={{ color: t.primary }}
              />
              <h1
                className="text-lg font-semibold tracking-tight font-space transition-colors duration-300"
                style={{ color: t.textMain }}
              >
                Deteksi Barang Staging
              </h1>
            </div>
            {totalItems > 0 && (
              <span
                className="rounded-full px-3 py-1 text-xs font-medium font-mono transition-colors duration-300"
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

      {/* === BODY CONTENT === */}
      <section className="mx-auto max-w-[1440px] px-6 py-6">
        {/* Filter Bar */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 transition-colors duration-300">
          <p
            className="text-sm font-mono transition-colors duration-300"
            style={{ color: t.textMuted }}
          >
            Riwayat lengkap deteksi barang di staging...
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <div
              className="flex items-center gap-1 rounded-md border px-2 py-1 shadow-sm transition-colors duration-300"
              style={{ backgroundColor: t.card, borderColor: t.border }}
            >
              <span
                className="text-[10px] font-mono transition-colors duration-300"
                style={{ color: t.textMuted }}
              >
                Dari
              </span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  handleDateChange();
                }}
                className="bg-transparent text-sm outline-none w-28 font-mono transition-colors duration-300"
                style={{ color: t.textMain }}
              />
              <span
                className="text-[10px] font-mono transition-colors duration-300"
                style={{ color: t.textMuted }}
              >
                s/d
              </span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => {
                  setEndDate(e.target.value);
                  handleDateChange();
                }}
                className="bg-transparent text-sm outline-none w-28 font-mono transition-colors duration-300"
                style={{ color: t.textMain }}
              />
            </div>

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

            <a
              href={`${API_BASE_URL}/api/alerts/export-pdf?class_name=box&start_date=${startDate}&end_date=${endDate}`}
              download="laporan_staging.pdf"
              className="inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-sm font-medium font-mono transition-colors duration-300 hover:opacity-90"
              style={{ backgroundColor: t.primary, color: isDarkMode ? "#0b1120" : "#ffffff" }}
              onClick={(e) => {
                if (totalItems === 0) {
                  e.preventDefault();
                  toast.warning("Tidak ada data staging untuk diekspor.");
                }
              }}
            >
              📄 Ekspor PDF
            </a>
          </div>
        </div>

        {/* Loading State */}
        {isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: PAGE_SIZE }).map((_, i) => (
              <div
                key={i}
                className="animate-pulse overflow-hidden rounded-lg border transition-colors duration-300"
                style={{ borderColor: t.border, backgroundColor: t.card }}
              >
                <div
                  className="aspect-[4/3] transition-colors duration-300"
                  style={{ backgroundColor: t.bg }}
                />
                <div className="space-y-2 p-4">
                  <div
                    className="h-4 w-2/3 rounded transition-colors duration-300"
                    style={{ backgroundColor: t.bg }}
                  />
                  <div
                    className="h-3 w-1/2 rounded transition-colors duration-300"
                    style={{ backgroundColor: t.bg }}
                  />
                  <div
                    className="h-6 w-20 rounded-full transition-colors duration-300"
                    style={{ backgroundColor: t.bg }}
                  />
                </div>
              </div>
            ))}
          </div>
        ) : isError ? (
          <div
            className="rounded-lg border p-6 text-center text-sm transition-colors duration-300"
            style={{
              borderColor: isDarkMode ? "#7f1d1d" : "#fecaca",
              backgroundColor: isDarkMode ? "#450a0a" : "#fef2f2",
              color: t.dangerText,
            }}
          >
            Gagal memuat data.
          </div>
        ) : paginated.length === 0 ? (
          // === EMPTY STATE YANG RAPI ===
          <div
            className="flex flex-col items-center justify-center rounded-lg border border-dashed p-16 text-center transition-colors duration-300"
            style={{ borderColor: t.border, backgroundColor: t.card }}
          >
            <Boxes
              className="h-14 w-14 mb-4 transition-colors duration-300"
              style={{ color: t.textMuted }}
              strokeWidth={1.5}
            />
            <h4
              className="text-base font-semibold font-space transition-colors duration-300"
              style={{ color: t.textMain }}
            >
              Belum Ada Barang Staging
            </h4>
            <p
              className="mt-1 text-sm font-mono transition-colors duration-300"
              style={{ color: t.textMuted }}
            >
              Data staging akan muncul saat sistem mendeteksi barang di area gudang.
            </p>
          </div>
        ) : (
          <>
            {/* Data Grid */}
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {paginated.map((s: StagingDetection) => (
                <li
                  key={s.id}
                  className="group overflow-hidden rounded-lg border transition-all duration-200 hover:shadow-md hover:-translate-y-1"
                  style={{
                    borderColor: t.border,
                    backgroundColor: t.card,
                    boxShadow: isDarkMode
                      ? "0 4px 6px -1px rgba(0,0,0,0.5)"
                      : "0 1px 3px 0 rgb(0 0 0 / 0.1)",
                  }}
                >
                  <div
                    className="relative aspect-[4/3] w-full overflow-hidden"
                    style={{ backgroundColor: t.bg }}
                  >
                    <img
                      src={`data:image/jpeg;base64,${s.foto_base64}`}
                      alt={s.class_name ?? "Bukti"}
                      loading="lazy"
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                    {s.alert_level && (
                      <div className="absolute left-2 top-2 rounded-md bg-black/60 px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm font-mono">
                        {s.alert_level}
                      </div>
                    )}
                  </div>

                  <div className="space-y-2 p-4">
                    <p
                      className="text-sm font-semibold font-space transition-colors duration-300"
                      style={{ color: t.textMain }}
                    >
                      {s.class_name ?? "Barang tidak teridentifikasi"}
                    </p>

                    {/* Menambahkan Badge Kamera seperti di halaman kendaraan */}
                    {s.camera && (
                      <div
                        className="flex items-center gap-1 text-[10px] font-mono transition-colors duration-300"
                        style={{ color: t.textMuted }}
                      >
                        <Camera className="h-3 w-3" /> {s.camera}
                      </div>
                    )}

                    <p
                      className="text-xs font-mono transition-colors duration-300"
                      style={{ color: t.textMuted }}
                    >
                      {formatDateTime(s.created_at)}
                    </p>

                    <span
                      className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold font-mono transition-colors duration-300"
                      style={{ backgroundColor: t.dangerBg, color: t.dangerText }}
                    >
                      <Clock className="h-3.5 w-3.5" /> {formatDurationFromSeconds(s.duration)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>

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

// === PAGINATION COMPONENT ===
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
      <p
        className="text-xs font-mono transition-colors duration-300"
        style={{ color: theme.textMuted }}
      >
        Menampilkan {from}–{to} dari {total} data
      </p>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onChange(page - 1)}
          disabled={page === 1}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md border transition-colors duration-300 hover:opacity-80 disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ borderColor: theme.border, backgroundColor: theme.card, color: theme.textMuted }}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        {pageNumbers.map((p, idx) =>
          p === "ellipsis" ? (
            <span
              key={`ellipsis-${idx}`}
              className="px-1 text-xs font-mono transition-colors duration-300"
              style={{ color: theme.textMuted }}
            >
              …
            </span>
          ) : (
            <button
              key={p}
              onClick={() => onChange(p)}
              className={`inline-flex h-8 w-8 items-center justify-center rounded-md border text-xs font-medium font-mono transition-colors duration-300`}
              style={
                p === page
                  ? {
                      backgroundColor: theme.primary,
                      borderColor: theme.primary,
                      color: theme.bg === "#0a111f" ? "#0b1120" : "#ffffff",
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
          className="inline-flex h-8 w-8 items-center justify-center rounded-md border transition-colors duration-300 hover:opacity-80 disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ borderColor: theme.border, backgroundColor: theme.card, color: theme.textMuted }}
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
