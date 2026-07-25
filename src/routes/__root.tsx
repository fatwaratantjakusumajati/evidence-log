import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  HeadContent,
  Scripts,
  useLocation,
} from "@tanstack/react-router";
import { useEffect, type ReactNode, useState, useRef } from "react";
import {
  Moon,
  Sun,
  Settings,
  Folder,
  TvMinimalPlay,
  Calendar,
  User,
  ChevronDown,
  FileSpreadsheet,
  FileText,
  Download,
} from "lucide-react"; // NEW: tambah ikon FileSpreadsheet, FileText, Download

import appCss from "../styles.css?url";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { ThemeProvider, useTheme } from "@/lib/theme-provider";
import { API_BASE_URL } from "@/lib/api-config";
import { Toaster } from "@/components/ui/sonner";

import companyLogo from "@/assets/aristides-logo.png";

function NotFoundComponent() {
  return null;
}
function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  return null;
}

interface MyRouterContext {
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<MyRouterContext>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Arsip Bukti Kejadian" },
      {
        name: "description",
        content: "Daftar entri bukti kejadian — sederhana, minimalis, mudah ditelusuri.",
      },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600&family=Space+Grotesk:wght@500;600;700&display=swap",
      },
      { rel: "icon", type: "image/x-icon", href: "/favicon_io/favicon.ico" },
      { rel: "icon", type: "image/png", sizes: "16x16", href: "/favicon_io/favicon-16x16.png" },
      { rel: "icon", type: "image/png", sizes: "32x32", href: "/favicon_io/favicon-32x32.png" },
      { rel: "apple-touch-icon", sizes: "180x180", href: "/favicon_io/apple-touch-icon.png" },
      { rel: "manifest", href: "/favicon_io/site.webmanifest" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="id">
      <head>
        <HeadContent />
        <style>{`
body {
  font-family: 'IBM Plex Sans', sans-serif;
  background-color: #f8fafc;
  color: #1e293b;
  margin: 0;
  padding: 0;
  transition: background-color 0.3s ease, color 0.3s ease;
}
h1, h2, h3, h4, h5, h6 {
  font-family: 'Space Grotesk', sans-serif;
  color: #0f172a;
}
code, pre, .mono, .timestamp, .data-value, .plate-number {
  font-family: 'IBM Plex Mono', monospace;
  letter-spacing: -0.02em;
}
.dark body {
  background-color: #0f172a;
  color: #cbd5e1;
}
.dark h1, .dark h2, .dark h3, .dark h4, .dark h5, .dark h6 {
  color: #e2e8f0;
}
.dark .bg-white, .dark .bg-[#ffffff] {
  background-color: #1e293b !important;
}
.dark .border-[#e2e8f0], .dark .border-slate-200 {
  border-color: #334155 !important;
}
.dark .text-[#64748b] {
  color: #94a3b8 !important;
}
.dark button.bg-blue-600 { background-color: #2563eb !important; }
.dark button.bg-red-600 { background-color: #dc2626 !important; }
.dark button.bg-green-600 { background-color: #16a34a !important; }
        `}</style>
      </head>
      <body>
        <ThemeProvider defaultTheme="system" storageKey="vite-ui-theme">
          {children}
          <Scripts />
        </ThemeProvider>
      </body>
    </html>
  );
}

// --- BREADCRUMB (Tidak Berubah) ---
function BreadcrumbNav() {
  const location = useLocation();
  const pathSegments = location.pathname.split("/").filter((seg) => seg !== "");

  const getLabel = (segment: string) => {
    if (segment === "dashboard") return "Dashboard";
    if (segment === "vehicles") return "Kendaraan";
    if (segment === "cameras") return "Kamera";
    if (segment === "staging") return "Staging";
    if (segment === "settings") return "Pengaturan";
    if (segment === "live") return "Live Feed";
    if (!isNaN(Number(segment))) return "Detail";
    return segment.charAt(0).toUpperCase() + segment.slice(1);
  };

  const breadcrumbItems: { label: string; path: string }[] = [];
  if (location.pathname !== "/") {
    breadcrumbItems.push({ label: "Dashboard", path: "/dashboard" });
  } else {
    breadcrumbItems.push({ label: "Home", path: "/" });
  }

  if (pathSegments.length > 0) {
    if (pathSegments[0] === "dashboard") {
      // Sudah ditambahkan
    } else if (pathSegments[0] === "logs") {
      if (pathSegments.length >= 2) {
        const lastSegment = pathSegments[pathSegments.length - 1];
        breadcrumbItems.push({ label: getLabel(lastSegment), path: "/" + pathSegments.join("/") });
      } else {
        breadcrumbItems.push({ label: "Logs", path: "/logs" });
      }
    } else {
      pathSegments.forEach((seg, index) => {
        const url = "/" + pathSegments.slice(0, index + 1).join("/");
        breadcrumbItems.push({ label: getLabel(seg), path: url });
      });
    }
  }

  return (
    <Breadcrumb>
      <BreadcrumbList>
        {breadcrumbItems.map((item, index) => {
          const isLast = index === breadcrumbItems.length - 1;
          return (
            <div key={item.path} className="flex items-center">
              {index > 0 && <BreadcrumbSeparator />}
              <BreadcrumbItem>
                {isLast ? (
                  <BreadcrumbPage className="font-space font-semibold text-lg text-slate-800 dark:text-slate-100">
                    {item.label}
                  </BreadcrumbPage>
                ) : (
                  <BreadcrumbLink asChild>
                    <Link
                      to={item.path}
                      className="text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 transition-colors font-mono text-sm"
                    >
                      {item.label}
                    </Link>
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
            </div>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}

// --- ROOT COMPONENT (DIMODIFIKASI) ---
function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const location = useLocation();
  const { theme, setTheme } = useTheme();

  const [sseStatus, setSseStatus] = useState<"online" | "offline" | "connecting">("connecting");
  const [reportDropdownOpen, setReportDropdownOpen] = useState(false);
  const reportDropdownRef = useRef<HTMLDivElement>(null);

  // State untuk modal tanggal
  const [dateModalOpen, setDateModalOpen] = useState(false);
  const [reportType, setReportType] = useState<"daily" | "weekly" | "monthly">("daily");
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedMonth, setSelectedMonth] = useState("");

  // NEW: State untuk format file
  const [exportFormat, setExportFormat] = useState<"xlsx" | "pdf">("xlsx");

  useEffect(() => {
    const today = new Date();
    setSelectedDate(today.toISOString().split("T")[0]);
    setSelectedMonth(today.toISOString().substring(0, 7));
  }, []);

  // Tutup dropdown saat klik di luar
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (reportDropdownRef.current && !reportDropdownRef.current.contains(event.target as Node)) {
        setReportDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // SSE status
  useEffect(() => {
    const eventSource = new EventSource(`${API_BASE_URL}/api/events`);
    eventSource.onopen = () => setSseStatus("online");
    eventSource.onerror = () => setSseStatus("offline");
    return () => {
      eventSource.close();
      setSseStatus("offline");
    };
  }, []);

  const showGlobalHeader = location.pathname !== "/";

  // Buka modal dengan tipe laporan
  const openDateModal = (type: "daily" | "weekly" | "monthly") => {
    setReportType(type);
    setDateModalOpen(true);
    setReportDropdownOpen(false);
  };

  // Download laporan (DIMODIFIKASI untuk mendukung format)
  const [isDownloading, setIsDownloading] = useState(false);

  const handleDownload = () => {
    let baseUrl = "";

    // Tentukan base URL berdasarkan tipe laporan
    if (reportType === "daily") {
      baseUrl = `${API_BASE_URL}/api/export/daily?date=${selectedDate}`;
    } else if (reportType === "weekly") {
      baseUrl = `${API_BASE_URL}/api/export/weekly?date=${selectedDate}`;
    } else if (reportType === "monthly") {
      baseUrl = `${API_BASE_URL}/api/export/monthly?month=${selectedMonth}`;
    }

    // NEW: Tambahkan parameter format
    const url = `${baseUrl}&format=${exportFormat}`;

    setIsDownloading(true);

    const link = document.createElement("a");
    link.href = url;
    link.download = "";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setTimeout(() => {
      setIsDownloading(false);
      setDateModalOpen(false);
    }, 2000);
  };

  // NEW: Handler untuk download Full Report dengan format
  const handleFullReportDownload = (format: "xlsx" | "pdf") => {
    setIsDownloading(true);
    setReportDropdownOpen(false);

    const url = `${API_BASE_URL}/api/export/full-report?format=${format}`;

    const link = document.createElement("a");
    link.href = url;
    link.download = "";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setTimeout(() => setIsDownloading(false), 2000);
  };

  return (
    <QueryClientProvider client={queryClient}>
      <div className="min-h-screen flex flex-col transition-colors">
        {/* KOMPONEN HEADER DENGAN PROPS YANG DIPERBARUI */}
        <HeaderWithNotification
          location={location}
          theme={theme}
          setTheme={setTheme}
          sseStatus={sseStatus}
          reportDropdownOpen={reportDropdownOpen}
          setReportDropdownOpen={setReportDropdownOpen}
          reportDropdownRef={reportDropdownRef}
          openDateModal={openDateModal}
          isDownloading={isDownloading}
          handleFullReportDownload={handleFullReportDownload} // NEW
        />

        <main className="flex-1 min-h-0 overflow-hidden">
          <Outlet />
        </main>

        <Toaster richColors position="top-right" />

        {/* MODAL PILIH TANGGAL/BULAN + FORMAT (DIMODIFIKASI) */}
        {dateModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="bg-white dark:bg-[#1e293b] rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
              <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-4">
                {reportType === "daily" && "Laporan Harian"}
                {reportType === "weekly" && "Laporan Mingguan"}
                {reportType === "monthly" && "Laporan Bulanan"}
              </h3>

              {/* Date/Month Input */}
              <div className="mb-4">
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">
                  {reportType === "monthly" ? "Pilih Bulan" : "Pilih Tanggal"}
                </label>
                {reportType === "daily" && (
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-[#0f172a] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2563eb]"
                  />
                )}
                {reportType === "weekly" && (
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-[#0f172a] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2563eb]"
                  />
                )}
                {reportType === "monthly" && (
                  <input
                    type="month"
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(e.target.value)}
                    className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-[#0f172a] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2563eb]"
                  />
                )}
              </div>

              {/* NEW: Format Selection */}
              <div className="mb-6">
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">
                  Format File
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => setExportFormat("xlsx")}
                    className={`flex items-center justify-center gap-2 p-3 rounded-lg border-2 transition-all ${
                      exportFormat === "xlsx"
                        ? "border-[#2563eb] bg-[#eff6ff] dark:bg-[#1e3a5f] text-[#2563eb] dark:text-[#60a5fa]"
                        : "border-slate-200 dark:border-slate-600 hover:border-slate-300 dark:hover:border-slate-500 text-slate-600 dark:text-slate-400"
                    }`}
                  >
                    <FileSpreadsheet className="h-5 w-5" />
                    <div className="text-left">
                      <div className="text-xs font-semibold">Excel</div>
                      <div className="text-[10px] opacity-70">.xlsx</div>
                    </div>
                  </button>
                  <button
                    onClick={() => setExportFormat("pdf")}
                    className={`flex items-center justify-center gap-2 p-3 rounded-lg border-2 transition-all ${
                      exportFormat === "pdf"
                        ? "border-[#2563eb] bg-[#eff6ff] dark:bg-[#1e3a5f] text-[#2563eb] dark:text-[#60a5fa]"
                        : "border-slate-200 dark:border-slate-600 hover:border-slate-300 dark:hover:border-slate-500 text-slate-600 dark:text-slate-400"
                    }`}
                  >
                    <FileText className="h-5 w-5" />
                    <div className="text-left">
                      <div className="text-xs font-semibold">PDF</div>
                      <div className="text-[10px] opacity-70">.pdf</div>
                    </div>
                  </button>
                </div>
              </div>

              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setDateModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#2a3a5a] rounded-md transition-colors"
                >
                  Batal
                </button>
                <button
                  onClick={handleDownload}
                  disabled={isDownloading}
                  className="px-4 py-2 text-sm font-medium bg-[#2563eb] text-white hover:bg-[#1d4ed8] rounded-md transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  {isDownloading ? (
                    <>
                      <span className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                      Mendownload...
                    </>
                  ) : (
                    <>
                      <Download className="h-4 w-4" />
                      Download {exportFormat === "xlsx" ? "Excel" : "PDF"}
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </QueryClientProvider>
  );
}

// ============================================================
// KOMPONEN HEADER (DIMODIFIKASI)
// ============================================================
function HeaderWithNotification({
  location,
  theme,
  setTheme,
  sseStatus,
  reportDropdownOpen,
  setReportDropdownOpen,
  reportDropdownRef,
  openDateModal,
  isDownloading,
  handleFullReportDownload, // NEW
}: {
  location: any;
  theme: any;
  setTheme: any;
  sseStatus: any;
  reportDropdownOpen: any;
  setReportDropdownOpen: any;
  reportDropdownRef: any;
  openDateModal: any;
  isDownloading: any;
  handleFullReportDownload: any; // NEW
}) {
  const showGlobalHeader = location.pathname !== "/";

  const { data: reviewData } = useQuery({
    queryKey: ["manual-review-pending"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE_URL}/api/attendance/manual-review-pending`);
      if (!res.ok) return [];
      const json = await res.json();

      // 🔥 PERBAIKAN: Jika responsnya [{"success":true}], anggap kosong
      if (Array.isArray(json) && json.length === 1 && json[0]?.success === true) {
        return [];
      }

      return Array.isArray(json) ? json : json.data || [];
    },
    refetchInterval: 5000,
  });

  const reviewCount = reviewData?.length || 0;

  if (!showGlobalHeader) return null;

  return (
    <header className="sticky top-0 z-50 dark:bg-[#0f1a2e] bg-white/95 backdrop-blur-xl border-b dark:border-[#1a2c45] border-[#e2e8f0] shadow-sm flex-shrink-0 px-0">
      <div className="mx-auto max-w-[1440px] px-6 py-4 flex flex-col gap-3">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="flex items-center gap-4">
            <Link
              to="/"
              className="hover:opacity-80 transition-opacity shrink-0 flex items-center gap-3"
            >
              <div className="p-1.5 rounded-lg bg-white border border-slate-200 dark:border-slate-700 shadow-sm flex-shrink-0">
                <img
                  src={companyLogo}
                  alt="Logo Perusahaan"
                  className="h-10 w-auto object-contain block"
                />
              </div>
              <div className="leading-tight hidden sm:block">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 font-mono">
                  PT Aristides Logistik Indonesia
                </p>
                <p className="text-lg font-bold tracking-tight text-[#2563eb] dark:text-[#60a5fa] font-space transition-colors duration-300">
                  Warehouse Intelligence
                </p>
              </div>
            </Link>
          </div>

          <div className="flex flex-wrap items-center gap-2 lg:justify-end">
            <Link
              to="/settings"
              className="h-8 rounded-md dark:bg-[#1a2c45]/50 bg-[#eff6ff] px-3 text-xs font-medium dark:text-slate-300 text-[#2563eb] hover:dark:bg-[#1a2c45] hover:bg-[#dbeafe] transition-all flex items-center gap-1 font-mono border dark:border-[#2a4a6a] border-transparent"
            >
              <Settings className="h-3.5 w-3.5" /> Pengaturan
            </Link>
            <Link
              to="/live"
              className="h-8 rounded-md dark:bg-[#1a2c45]/50 bg-[#eff6ff] px-3 text-xs font-medium dark:text-slate-300 text-[#2563eb] hover:dark:bg-[#1a2c45] hover:bg-[#dbeafe] transition-all flex items-center gap-1 font-mono border dark:border-[#2a4a6a] border-transparent"
            >
              <TvMinimalPlay className="h-3.5 w-3.5" /> Live Feed
            </Link>

            {/* TOMBOL ATTENDANCE REVIEW DENGAN NOTIFIKASI */}
            <Link
              to="/attendance_review"
              className="h-8 rounded-md dark:bg-[#1a2c45]/50 bg-[#eff6ff] px-3 text-xs font-medium dark:text-slate-300 text-[#2563eb] hover:dark:bg-[#1a2c45] hover:bg-[#dbeafe] transition-all flex items-center gap-1 font-mono border dark:border-[#2a4a6a] border-transparent"
            >
              <div className="relative">
                <User className="h-3.5 w-3.5" />
                {reviewCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-red-500 text-[8px] font-bold text-white shadow-[0_0_8px_rgba(239,68,68,0.6)] animate-pulse">
                    {reviewCount > 9 ? "9+" : reviewCount}
                  </span>
                )}
              </div>
              Attendance
            </Link>

            {/* DROPDOWN REPORT (DIMODIFIKASI) */}
            <div className="relative ml-2" ref={reportDropdownRef}>
              <button
                onClick={() => setReportDropdownOpen(!reportDropdownOpen)}
                className="h-8 rounded-md dark:bg-[#1a2c45]/50 bg-[#eff6ff] px-3 text-xs font-medium dark:text-slate-300 text-[#2563eb] hover:dark:bg-[#1a2c45] hover:bg-[#dbeafe] transition-all flex items-center gap-1 font-mono border dark:border-[#2a4a6a] border-transparent"
              >
                <Folder className="h-3.5 w-3.5" /> Report
                <ChevronDown
                  className={`h-3.5 w-3.5 transition-transform ${reportDropdownOpen ? "rotate-180" : ""}`}
                />
              </button>

              {reportDropdownOpen && (
                <div className="absolute right-0 mt-2 w-56 rounded-md shadow-lg bg-white dark:bg-[#1e293b] border border-slate-200 dark:border-[#334155] py-1 z-50">
                  {/* NEW: Full Report dengan sub-options */}
                  <div className="px-3 py-2 text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                    Laporan Lengkap
                  </div>
                  <button
                    onClick={() => handleFullReportDownload("xlsx")}
                    className="flex items-center gap-2 w-full text-left px-4 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#2a3a5a]"
                  >
                    <FileSpreadsheet className="h-4 w-4 text-green-600" />
                    Download Excel (.xlsx)
                  </button>
                  <button
                    onClick={() => handleFullReportDownload("pdf")}
                    className="flex items-center gap-2 w-full text-left px-4 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#2a3a5a]"
                  >
                    <FileText className="h-4 w-4 text-red-600" />
                    Download PDF (.pdf)
                  </button>

                  <div className="border-t border-slate-200 dark:border-slate-700 my-1"></div>

                  {/* Laporan dengan tanggal */}
                  <div className="px-3 py-2 text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                    Laporan Berkala
                  </div>
                  <button
                    onClick={() => openDateModal("daily")}
                    className="flex items-center gap-2 w-full text-left px-4 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#2a3a5a]"
                  >
                    <Calendar className="h-4 w-4 text-blue-600" />
                    Harian
                  </button>
                  <button
                    onClick={() => openDateModal("weekly")}
                    className="flex items-center gap-2 w-full text-left px-4 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#2a3a5a]"
                  >
                    <Calendar className="h-4 w-4 text-purple-600" />
                    Mingguan
                  </button>
                  <button
                    onClick={() => openDateModal("monthly")}
                    className="flex items-center gap-2 w-full text-left px-4 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#2a3a5a]"
                  >
                    <Calendar className="h-4 w-4 text-orange-600" />
                    Bulanan
                  </button>
                </div>
              )}
            </div>

            {/* SSE Status (Tidak Berubah) */}
            <div className="hidden sm:flex items-center gap-2 ml-2 border-l pl-3 dark:border-[#1a2c45] border-[#e2e8f0]">
              <div
                className={`h-2.5 w-2.5 rounded-full ${
                  sseStatus === "online"
                    ? "dark:bg-[#22c55e] bg-[#22c55e] animate-pulse dark:shadow-[0_0_10px_rgba(34,197,94,0.4)] shadow-[0_0_10px_rgba(34,197,94,0.4)]"
                    : sseStatus === "offline"
                      ? "dark:bg-[#ef4444] bg-[#ef4444] dark:shadow-[0_0_10px_rgba(239,68,68,0.4)] shadow-[0_0_10px_rgba(239,68,68,0.4)]"
                      : "border-2 dark:border-slate-400 border-slate-600 border-t-transparent animate-spin"
                }`}
              />
              <span
                className={`text-xs font-mono font-medium ${
                  sseStatus === "online"
                    ? "dark:text-[#22c55e] text-[#22c55e]"
                    : sseStatus === "offline"
                      ? "dark:text-[#ef4444] text-[#ef4444]"
                      : "dark:text-slate-400 text-[#64748b]"
                }`}
              >
                {sseStatus === "online"
                  ? "LIVE"
                  : sseStatus === "offline"
                    ? "OFFLINE"
                    : "CONNECTING..."}
              </span>
            </div>

            {/* Theme Toggle (Tidak Berubah) */}
            <button
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              className="p-1.5 dark:text-slate-400 text-[#64748b] hover:dark:bg-[#1a2c45] hover:bg-[#f1f5f9] rounded-md transition-colors"
            >
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
