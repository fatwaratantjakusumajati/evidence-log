import {
  QueryClient,
  QueryClientProvider,
  usePrefetchInfiniteQuery,
  useQuery,
} from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  HeadContent,
  Scripts,
  useLocation,
  useNavigate,
  redirect,
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
  Loader2,
  LogOut,
  Menu,
  X,
  SearchX,
  Home,
  Bell,
  RefreshCw,
  LayoutDashboard,
  Car,
  Boxes,
  Camera,
} from "lucide-react"; // NEW: tambah ikon FileSpreadsheet, FileText, Download, dan ikon nav sidebar

import appCss from "../styles.css?url";
// ============================================================
// CATATAN WARNA (dashboard.tsx & __root.tsx):
// Kedua file ini memakai kelas Tailwind arbitrary (dark:bg-[#hex]) langsung,
// BUKAN lewat theme-tokens.ts (itu dipakai oleh Settings & halaman Logs).
// Setelah audit, palet gelap yang dipakai di sini sudah dikonsolidasikan jadi:
//   #13130e  -> latar halaman (page bg)
//   #1a1a14  -> latar kartu/panel utama (card)      -- cocok dg theme-tokens.card
//   #22221a  -> latar hover / kotak ikon / elemen bersarang dalam kartu
//   #1a1a14  -> latar modal & dropdown (dipaksa global lewat .dark .bg-white)
//   #13130e  -> latar area "inset" (viewer foto, kotak kosong)
//   #13130e  -> latar input field                    -- cocok dg theme-tokens.inputBg
//   #2e2e25  -> border utama                          -- cocok dg theme-tokens.border
// Kalau menambah elemen baru, pakai salah satu di atas -- jangan buat shade
// hitam baru, supaya tidak drift lagi seperti sebelumnya (dulu ada 20+ shade
// nyaris-sama tersebar tanpa pola).
// ============================================================
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
import {
  isAuthenticated,
  clearToken,
  getToken,
  authFetch,
  downloadFile,
  isTokenExpired,
  refreshToken,
  getTokenSecondsRemaining,
} from "@/lib/auth";
import { toast } from "sonner";

import companyLogo from "@/assets/aristides-logo.png";

// ============================================================
// NOTIFIKASI LIVE (dari SSE / Postgres LISTEN-NOTIFY)
// ============================================================
type LiveNotification = {
  id: string;
  title: string;
  description: string;
  time: string; // ISO timestamp
  kind: "vehicle" | "alert" | "camera" | "info";
};

// Payload dari backend bentuknya longgar (tergantung channel), jadi kita
// baca secara defensif supaya tidak crash kalau ada field yang tidak ada.
function buildNotificationFromPayload(channel: string, payload: any): LiveNotification {
  const now = new Date().toISOString();
  const id = `${channel}-${payload?.id ?? Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  if (channel === "vehicle_log_event") {
    const jenis = payload?.jenis_kendaraan || "Kendaraan";
    const kamera = payload?.kamera_nama ? ` di ${payload.kamera_nama}` : "";
    const plat = payload?.plat_nomor ? ` (${payload.plat_nomor})` : "";
    return {
      id,
      title: `${jenis} terdeteksi`,
      description: `${jenis}${plat} terdeteksi${kamera}.`,
      time: payload?.timestamp || now,
      kind: "vehicle",
    };
  }

  if (channel === "alert_log_event") {
    const className = payload?.class_name || "";
    const kamera = payload?.camera ? ` — ${payload.camera}` : "";
    if (className.toUpperCase().includes("OFFLINE")) {
      return {
        id,
        title: "Kamera offline",
        description: `Kamera${kamera} terpantau offline.`,
        time: payload?.timestamp || now,
        kind: "camera",
      };
    }
    if (className.toUpperCase().includes("ONLINE")) {
      return {
        id,
        title: "Kamera kembali online",
        description: `Kamera${kamera} sudah normal kembali.`,
        time: payload?.timestamp || now,
        kind: "camera",
      };
    }
    return {
      id,
      title: "Deteksi staging baru",
      description: `Barang terdeteksi mengendap${kamera}.`,
      time: payload?.timestamp || now,
      kind: "alert",
    };
  }

  return {
    id,
    title: "Update baru",
    description: "Ada pembaruan data pada sistem.",
    time: now,
    kind: "info",
  };
}

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-50 ox-4 text-center dark:bg-slate-950">
      <div className="rounded-full bg-slate-100 p-4 dark:bg-[#1a1a14]">
        <SearchX className="h-8 w-8 text-slate-400" />
      </div>
      <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">
        Halaman Tidak Ditemukan
      </h1>
      <p className="max-w-sm text-sm text-slate-500 dark:text-slate-400">
        Halaman yang Anda cari tidak ada, sudah dipindah, atau ada kesalahan dalam penulisan URL.
      </p>
      <a
        href="/dashboard"
        className="mt-2 inline-flex items-center gap-2 rounded-md bg-[#4338ca] px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#3730a3]"
      >
        <Home className="h-4 w-4" /> Kembali ke Dashboard
      </a>
    </div>
  );
}
function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="mt-2 flex items-center gap-3">
      <button
        onClick={reset}
        className="inline-flex items-center gap-2 rounded-md bg-[#4338ca] px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#3730a3]"
      >
        <RefreshCw className="h-4 w-4" /> Coba Lagi
      </button>
      <a
        href="/dashboard"
        className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-5 py-2.5 text sm font-medium text-slate-700 transition-colors hover:bg-slate-100 dark:border-[#2e2e25] dark:text-slate-200 dark:hover:bg-[#1a1a14]"
      >
        <Home className="h-4 w-4" /> Dashboard
      </a>
    </div>
  );
}

interface MyRouterContext {
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<MyRouterContext>()({
  beforeLoad: async ({ location }) => {
    const publicPaths = ["/", "/login"];
    const isPublic = publicPaths.includes(location.pathname);

    // Jika bukan halaman public dan tidak ada token → redirect ke login
    if (!isPublic && !getToken()) {
      throw redirect({
        to: "/login",
        search: { redirect: location.href },
      });
    }
  },
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
      { rel: "manifest", href: "/favicon_io/site.webmanifest", crossOrigin: "use-credentials" },
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
  background-color: #13130e;
  color: #cbd5e1;
}
.dark h1, .dark h2, .dark h3, .dark h4, .dark h5, .dark h6 {
  color: #e2e8f0;
}
.dark .bg-white, .dark .bg-[#ffffff] {
  background-color: #1a1a14 !important;
}
.dark .border-[#e2e8f0], .dark .border-slate-200 {
  border-color: #2e2e25 !important;
}
.dark .text-[#64748b] {
  color: #94a3b8 !important;
}
.dark button.bg-emerald-700 { background-color: #4338ca !important; }
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
    if (segment === "documents") return "Dokumen";
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
                      className="text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 transition-colors text-sm"
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
  const navigate = useNavigate();
  const { theme, setTheme, resolvedTheme } = useTheme();

  const [sseStatus, setSseStatus] = useState<"online" | "offline" | "connecting">("connecting");
  // PERBAIKAN: sebelumnya status login cuma dicek sekali saat root component
  // mount, jadi login (SPA-navigate, bukan reload halaman) tidak pernah
  // memicu koneksi SSE baru. State ini di-sync ulang tiap kali route
  // berubah (lihat useEffect di bawah), tapi NILAI-nya cuma berubah kalau
  // status login beneran berubah (login/logout) — supaya efek SSE di bawah
  // tidak connect-ulang di setiap perpindahan halaman biasa.
  const [authState, setAuthState] = useState(() => isAuthenticated());
  useEffect(() => {
    setAuthState(isAuthenticated());
  }, [location.pathname]);
  const [reportDropdownOpen, setReportDropdownOpen] = useState(false);
  const reportDropdownRef = useRef<HTMLDivElement>(null);
  const [notifications, setNotifications] = useState<LiveNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

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

  // SSE status + notifikasi live
  //
  // PERBAIKAN: sebelumnya effect ini hanya dependency [queryClient], jadi
  // status login cuma dicek SEKALI saat RootComponent pertama kali mount.
  // Karena login() cuma SPA-navigate (bukan reload halaman penuh), user yang
  // baru saja login tidak pernah dapat koneksi SSE sampai mereka manual
  // refresh — makanya notifikasi/"CONNECTING..." kadang nyala kadang tidak.
  // Sekarang effect ini juga jalan ulang tiap kali route berubah, supaya
  // transisi login -> /dashboard memicu koneksi SSE yang baru.
  useEffect(() => {
    if (!authState) {
      setSseStatus("offline");
      return;
    }
    setSseStatus("connecting");
    const token = getToken();
    const eventSource = new EventSource(
      `${API_BASE_URL}/api/events?token=${encodeURIComponent(getToken() ?? "")}`,
    );
    eventSource.onopen = () => setSseStatus("online");
    eventSource.onerror = () => setSseStatus("offline");
    eventSource.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data);
        const { channel, data: payload } = parsed;
        if (!channel) return;

        const notif = buildNotificationFromPayload(channel, payload);
        setNotifications((prev) => [notif, ...prev].slice(0, 30));
        setUnreadCount((prev) => prev + 1);

        if (notif.kind === "camera") {
          toast.warning(notif.title, { description: notif.description });
        } else {
          toast(notif.title, { description: notif.description });
        }

        // Perbarui data di semua halaman yang sedang aktif (dashboard, log
        // kendaraan, staging, kamera) supaya tidak perlu refresh manual.
        queryClient.invalidateQueries();
      } catch {
        // Bukan JSON valid (misalnya heartbeat comment) — abaikan saja.
      }
    };
    return () => {
      eventSource.close();
      setSseStatus("offline");
    };
  }, [queryClient, authState]);

  // 1. Perpanjang sesi otomatis (silent refresh) selama user BENAR-BENAR aktif,
  // dan biarkan token expired sungguhan kalau user diam total selama 30 menit.
  // PERBAIKAN: sebelumnya effect ini refresh terus tiap 10 detik tanpa peduli
  // user aktif atau tidak -- efeknya sesi jadi "abadi" walau dashboard cuma
  // dibiarkan terbuka tanpa disentuh berhari-hari (resiko keamanan). Sekarang
  // refresh cuma dilakukan kalau ada interaksi user (klik/ketik/scroll/gerak
  // mouse) dalam 30 menit terakhir. Begitu user idle lebih dari itu, token
  // dibiarkan kadaluwarsa dan modal "sesi berakhir" otomatis muncul.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!isAuthenticated()) return;
    if (location.pathname === "/login") return;

    const IDLE_LIMIT_MS = 30 * 60 * 1000; // 30 menit tanpa interaksi = idle
    const REFRESH_THRESHOLD_SECONDS = 5 * 60;

    let lastActivity = Date.now();
    const markActive = () => {
      lastActivity = Date.now();
    };
    const activityEvents = ["mousemove", "mousedown", "keydown", "scroll", "touchstart", "click"];
    activityEvents.forEach((evt) => window.addEventListener(evt, markActive, { passive: true }));

    const checkAndRefresh = async () => {
      if (isTokenExpired()) {
        setShowSessionExpiredModal(true);
        return;
      }

      const isIdle = Date.now() - lastActivity >= IDLE_LIMIT_MS;
      if (isIdle) return; // user diam total -> biarkan token kadaluwarsa secara alami

      const remaining = getTokenSecondsRemaining();
      if (remaining !== null && remaining <= REFRESH_THRESHOLD_SECONDS) {
        const ok = await refreshToken();
        if (!ok) {
          clearToken();
          setShowSessionExpiredModal(true);
        }
      }
    };

    const interval = setInterval(checkAndRefresh, 10000);

    // PENTING: browser menahan/memperlambat setInterval di tab yang sedang
    // tidak fokus/tersembunyi (background tab throttling) untuk hemat resource
    // -- jadi kalau tab dibiarkan di background selama 30 menit lalu dibuka
    // lagi, interval 10 detik di atas bisa telat jauh mendeteksi token yang
    // sudah kadaluwarsa. Untuk itu, cek ulang SEKETIKA begitu tab kembali
    // terlihat/difokuskan, tidak menunggu interval berikutnya.
    const handleVisibilityOrFocus = () => {
      if (document.visibilityState === "visible") {
        checkAndRefresh();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityOrFocus);
    window.addEventListener("focus", handleVisibilityOrFocus);

    return () => {
      clearInterval(interval);
      activityEvents.forEach((evt) => window.removeEventListener(evt, markActive));
      document.removeEventListener("visibilitychange", handleVisibilityOrFocus);
      window.removeEventListener("focus", handleVisibilityOrFocus);
    };
  }, [location.pathname]);

  // 2. Handle error dari authFetch
  useEffect(() => {
    const handleAuthError = (e: ErrorEvent) => {
      if (e.message === "Token expired") {
        clearToken();
        setShowSessionExpiredModal(true);
      }
    };
    window.addEventListener("error", handleAuthError);
    return () => window.removeEventListener("error", handleAuthError);
  }, []);

  const showGlobalHeader = location.pathname !== "/" && location.pathname !== "/login";

  // Buka modal dengan tipe laporan
  const openDateModal = (type: "daily" | "weekly" | "monthly") => {
    setReportType(type);
    setDateModalOpen(true);
    setReportDropdownOpen(false);
  };

  // Download laporan (DIMODIFIKASI untuk mendukung format)
  const [isDownloading, setIsDownloading] = useState(false);

  const handleDownload = async () => {
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

    try {
      await downloadFile(url, `laporan_${reportType}.${exportFormat}`);
    } catch (err) {
      toast.error("Gagal mengunduh laporan.");
    } finally {
      setIsDownloading(false);
      setDateModalOpen(false);
    }
  };
  // NEW: Handler untuk download Full Report dengan format
  const handleFullReportDownload = async (format: "xlsx" | "pdf") => {
    setIsDownloading(true);
    setReportDropdownOpen(false);

    const token = getToken();
    const url = `${API_BASE_URL}/api/export/full-report?format=${format}`;

    try {
      const response = await downloadFile(url, `laporan_lengkap.${format}`);
    } catch (err) {
      toast.error("Gagal mengunduh laporan");
      console.error(err);
    } finally {
      setIsDownloading(false);
    }
  };

  const [showSessionExpiredModal, setShowSessionExpiredModal] = useState(false);
  return (
    <QueryClientProvider client={queryClient}>
      <div className="min-h-screen flex flex-col lg:flex-row transition-colors">
        {/* SIDEBAR (dulu topnav horizontal, sekarang jadi sidebar kiri persisten di layar besar,
            dan drawer overlay di layar kecil) */}
        <SidebarNav
          location={location}
          theme={theme}
          setTheme={setTheme}
          resolvedTheme={resolvedTheme}
          sseStatus={sseStatus}
          reportDropdownOpen={reportDropdownOpen}
          setReportDropdownOpen={setReportDropdownOpen}
          reportDropdownRef={reportDropdownRef}
          openDateModal={openDateModal}
          isDownloading={isDownloading}
          handleFullReportDownload={handleFullReportDownload} // NEW
          notifications={notifications}
          unreadCount={unreadCount}
          onOpenNotifications={() => setUnreadCount(0)}
        />

        <main className="flex-1 min-h-0 lg:h-screen lg:overflow-y-auto">
          <Outlet />
        </main>

        <Toaster richColors position="top-right" />

        {/* MODAL PILIH TANGGAL/BULAN + FORMAT (DIMODIFIKASI) */}
        {dateModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="bg-white dark:bg-[#1a1a14] rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
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
                    className="w-full rounded-md border border-slate-300 dark:border-[#3d3d32] bg-white dark:bg-[#13130e] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4338ca]"
                    // type="date"
                    // value={selectedDate}
                    // onChange={(e) => setSelectedDate(e.target.value)}
                    // className="h-11 w-11 rounded-xl border border-slate-200 bg-white px-4 tet-sm font-medium text-slate-700 shadow-sm outline-none transition-all duration-200 hover:border-indigo-300 focus:border-indigo-700 focus:ring-4 focus:ring-indigo-500/10 dark:border-[#3d3d32] dak:bg-[#0f172a] dark:text-slate-200"
                  />
                )}
                {reportType === "weekly" && (
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className="w-full rounded-md border border-slate-300 dark:border-[#3d3d32] bg-white dark:bg-[#13130e] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4338ca]"
                  />
                )}
                {reportType === "monthly" && (
                  <input
                    type="month"
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(e.target.value)}
                    className="w-full rounded-md border border-slate-300 dark:border-[#3d3d32] bg-white dark:bg-[#13130e] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4338ca]"
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
                    aria-pressed={exportFormat === "xlsx"}
                    aria-label="Pilih format Excel"
                    className={`flex items-center justify-center gap-2 p-3 rounded-lg border-2 transition-all ${
                      exportFormat === "xlsx"
                        ? "border-[#4338ca] bg-[#eef2ff] dark:bg-[#312e81]/40 text-[#4338ca] dark:text-[#818cf8]"
                        : "border-slate-200 dark:border-[#3d3d32] hover:border-slate-300 dark:hover:border-[#4a4a3e] text-slate-600 dark:text-slate-400"
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
                    aria-pressed={exportFormat === "pdf"}
                    aria-label="Pilih format PDF"
                    className={`flex items-center justify-center gap-2 p-3 rounded-lg border-2 transition-all ${
                      exportFormat === "pdf"
                        ? "border-[#4338ca] bg-[#eef2ff] dark:bg-[#312e81]/40 text-[#4338ca] dark:text-[#818cf8]"
                        : "border-slate-200 dark:border-[#3d3d32] hover:border-slate-300 dark:hover:border-[#4a4a3e] text-slate-600 dark:text-slate-400"
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
                  className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#22221a] rounded-md transition-colors"
                >
                  Batal
                </button>
                <button
                  onClick={handleDownload}
                  disabled={isDownloading}
                  className="px-4 py-2 text-sm font-medium bg-[#4338ca] text-white hover:bg-[#3730a3] rounded-md transition-colors disabled:opacity-50 flex items-center gap-2"
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
        {/* MODAL SESSION EXPIRED */}
        {showSessionExpiredModal && (
          <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/60 backdrop-blur-md">
            <div className="bg-white dark:bg-[#1a1a14] rounded-xl shadow-2xl p-6 max-w-sm w-full mx-4 animate-in fade-in zoom-in duration-200">
              <div className="flex flex-col items-center text-center">
                <div className="mb-4 rounded-full bg-red-100 dark:bg-red-900/30 p-3">
                  <LogOut className="h-8 w-8 text-red-600 dark:text-red-400" />
                </div>
                <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-2">
                  Sesi Berakhir
                </h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
                  Sesi login Anda telah berakhir. Silakan login kembali untuk melanjutkan.
                </p>
                <button
                  onClick={() => {
                    setShowSessionExpiredModal(false);
                    window.location.href = "/login";
                  }}
                  className="w-full rounded-lg bg-[#4338ca] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#3730a3] transition-colors"
                >
                  OK
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
function SidebarNav({
  location,
  theme,
  setTheme,
  resolvedTheme,
  sseStatus,
  reportDropdownOpen,
  setReportDropdownOpen,
  reportDropdownRef,
  openDateModal,
  isDownloading,
  handleFullReportDownload, // NEW
  notifications,
  unreadCount,
  onOpenNotifications,
}: {
  location: any;
  theme: any;
  setTheme: any;
  resolvedTheme: "dark" | "light";
  sseStatus: any;
  reportDropdownOpen: any;
  setReportDropdownOpen: any;
  reportDropdownRef: any;
  openDateModal: any;
  isDownloading: any;
  handleFullReportDownload: any; // NEW
  notifications: LiveNotification[];
  unreadCount: number;
  onOpenNotifications: () => void;
}) {
  // Sidebar hanya muncul jika BUKAN di halaman login dan BUKAN di halaman home
  const showGlobalHeader = location.pathname !== "/" && location.pathname !== "/login";
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    function handleClickOutsideNotif(event: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(event.target as Node)) {
        setNotifOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutsideNotif);
    return () => document.removeEventListener("mousedown", handleClickOutsideNotif);
  }, []);

  const handleLogout = () => {
    clearToken();
    navigate({ to: "/" });
  };

  // Tutup drawer mobile otomatis tiap kali pindah halaman
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  if (!showGlobalHeader) return null;

  const navItems = [
    { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { to: "/logs/vehicles", label: "Kendaraan", icon: Car },
    { to: "/logs/staging", label: "Staging", icon: Boxes },
    { to: "/logs/cameras", label: "Kamera", icon: Camera },
    { to: "/logs/documents", label: "Dokumen", icon: FileText },
  ];

  const reportMenu = (
    <div className="absolute bottom-full left-0 mb-2 w-56 rounded-md shadow-lg bg-white dark:bg-[#1a1a14] border border-slate-200 dark:border-[#2e2e25] py-1 z-50">
      <div className="px-3 py-2 text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
        Laporan Lengkap
      </div>
      <button
        onClick={() => handleFullReportDownload("xlsx")}
        className="flex items-center gap-2 w-full text-left px-4 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#22221a]"
      >
        <FileSpreadsheet className="h-4 w-4 text-green-600" />
        Download Excel (.xlsx)
      </button>
      <button
        onClick={() => handleFullReportDownload("pdf")}
        className="flex items-center gap-2 w-full text-left px-4 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#22221a]"
      >
        <FileText className="h-4 w-4 text-red-600" />
        Download PDF (.pdf)
      </button>

      <div className="border-t border-slate-200 dark:border-[#2e2e25] my-1"></div>

      <div className="px-3 py-2 text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
        Laporan Berkala
      </div>
      <button
        onClick={() => openDateModal("daily")}
        className="flex items-center gap-2 w-full text-left px-4 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#22221a]"
      >
        <Calendar className="h-4 w-4 text-indigo-600" />
        Harian
      </button>
      <button
        onClick={() => openDateModal("weekly")}
        className="flex items-center gap-2 w-full text-left px-4 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#22221a]"
      >
        <Calendar className="h-4 w-4 text-indigo-600" />
        Mingguan
      </button>
      <button
        onClick={() => openDateModal("monthly")}
        className="flex items-center gap-2 w-full text-left px-4 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#22221a]"
      >
        <Calendar className="h-4 w-4 text-indigo-600" />
        Bulanan
      </button>
    </div>
  );

  const notifPanel = (
    <div className="absolute bottom-full left-0 mb-2 w-80 max-h-96 overflow-y-auto rounded-lg border border-[#e2e8f0] dark:border-[#2e2e25] bg-white dark:bg-[#1a1a14] shadow-xl z-50">
      <div className="sticky top-0 flex items-center justify-between border-b border-[#e2e8f0] dark:border-[#2e2e25] bg-white dark:bg-[#1a1a14] px-4 py-2.5">
        <span className="text-xs font-semibold uppercase tracking-wide dark:text-slate-200">
          Notifikasi
        </span>
        <span className="text-[10px] text-[#64748b] dark:text-[#94a3b8]">
          {notifications.length} terbaru
        </span>
      </div>
      {notifications.length === 0 ? (
        <div className="px-4 py-8 text-center text-xs text-[#64748b] dark:text-[#94a3b8]">
          Belum ada notifikasi baru. Notifikasi akan muncul otomatis di sini begitu ada aktivitas
          baru terdeteksi.
        </div>
      ) : (
        <ul className="divide-y divide-[#e2e8f0] dark:divide-[#2e2e25]">
          {notifications.map((n) => (
            <li key={n.id} className="px-4 py-3 hover:bg-[#f1f5f9] dark:hover:bg-[#22221a]">
              <div className="flex items-start gap-2.5">
                <span
                  className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${
                    n.kind === "camera"
                      ? "bg-orange-500"
                      : n.kind === "vehicle"
                        ? "bg-[#4f46e5]"
                        : "bg-slate-400"
                  }`}
                />
                <div className="min-w-0">
                  <p className="text-xs font-semibold dark:text-slate-100">{n.title}</p>
                  <p className="text-[11px] text-[#64748b] dark:text-[#94a3b8] mt-0.5">
                    {n.description}
                  </p>
                  <p className="text-[10px] font-mono text-[#94a3b8] dark:text-[#8a97ab] mt-1">
                    {new Date(n.time).toLocaleTimeString("id-ID", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  const sidebarBody = (
    <div className="flex h-full flex-col dark:bg-[#13130e] bg-white">
      {/* Logo & nama perusahaan */}
      <Link
        to="/"
        className="flex items-center gap-3 border-b dark:border-[#22221a] border-[#e2e8f0] px-4 py-4 hover:opacity-80 transition-opacity shrink-0"
      >
        <div className="p-1.5 rounded-lg bg-white border border-slate-200 dark:border-[#2e2e25] shadow-sm flex-shrink-0">
          <img
            src={companyLogo}
            alt="Logo Perusahaan"
            className="h-9 w-auto object-contain block"
          />
        </div>
        <div className="leading-tight min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 truncate">
            PT Aristides Logistik Indonesia
          </p>
          <p className="text-base font-bold tracking-tight text-[#4338ca] dark:text-[#818cf8] font-space transition-colors duration-300 truncate">
            Warehouse Intelligence
          </p>
        </div>
      </Link>

      {/* Nav vertikal */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {navItems.map((item) => {
          const isActive = location.pathname === item.to;
          const Icon = item.icon;
          return (
            <Link
              key={item.to}
              to={item.to}
              className={`flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium tracking-wide transition-colors ${
                isActive
                  ? "bg-indigo-50 text-indigo-800 dark:bg-indigo-500/15 dark:text-[#818cf8]"
                  : "text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-[#22221a] hover:text-slate-800 dark:hover:text-slate-200"
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Bagian bawah: Pengaturan, Report, status LIVE, notifikasi, tema, logout */}
      <div className="border-t dark:border-[#22221a] border-[#e2e8f0] px-3 py-3 space-y-2 shrink-0">
        <Link
          to="/settings"
          className="flex items-center gap-2 rounded-md dark:bg-[#22221a]/50 bg-[#eef2ff] px-3 py-2 text-xs font-medium dark:text-slate-300 text-[#4338ca] hover:dark:bg-[#22221a] hover:bg-[#e0e7ff] transition-all border dark:border-[#3730a3] border-transparent"
        >
          <Settings className="h-3.5 w-3.5" /> Pengaturan
        </Link>

        {/* DROPDOWN REPORT */}
        <div className="relative" ref={reportDropdownRef}>
          <button
            onClick={() => setReportDropdownOpen(!reportDropdownOpen)}
            className="w-full flex items-center gap-2 rounded-md dark:bg-[#22221a]/50 bg-[#eef2ff] px-3 py-2 text-xs font-medium dark:text-slate-300 text-[#4338ca] hover:dark:bg-[#22221a] hover:bg-[#e0e7ff] transition-all border dark:border-[#3730a3] border-transparent"
          >
            <Folder className="h-3.5 w-3.5" /> Report
            <ChevronDown
              className={`h-3.5 w-3.5 ml-auto transition-transform ${reportDropdownOpen ? "rotate-180" : ""}`}
            />
          </button>
          {reportDropdownOpen && reportMenu}
        </div>

        {/* Status live/offline SSE */}
        <div className="flex items-center gap-2 px-1 py-1">
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

        {/* Notifikasi, tema, logout */}
        <div className="flex items-center justify-between gap-1 pt-2 border-t dark:border-[#22221a] border-[#e2e8f0]">
          <div className="relative" ref={notifRef}>
            <button
              onClick={() => {
                setNotifOpen((v) => !v);
                if (!notifOpen) onOpenNotifications();
              }}
              className="relative p-1.5 dark:text-slate-400 text-[#64748b] hover:dark:bg-[#22221a] hover:bg-[#f1f5f9] rounded-md transition-colors"
              aria-label="Notifikasi"
            >
              <Bell className="h-4 w-4" />
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </button>
            {notifOpen && notifPanel}
          </div>

          <button
            onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
            className="p-1.5 dark:text-slate-400 text-[#64748b] hover:dark:bg-[#22221a] hover:bg-[#f1f5f9] rounded-md transition-colors"
            aria-label={resolvedTheme === "dark" ? "Ganti ke mode terang" : "Ganti ke mode gelap"}
          >
            {resolvedTheme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>

          <button
            onClick={handleLogout}
            title="Keluar"
            aria-label="Keluar dari akun"
            className="p-1.5 dark:text-slate-400 text-[#64748b] hover:text-red-600 dark:hover:text-red-400 hover:dark:bg-red-950/30 hover:bg-red-50 rounded-md transition-colors"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Top bar mobile - cuma tampil di layar kecil, buat trigger drawer sidebar */}
      <div className="lg:hidden sticky top-0 z-40 flex items-center justify-between dark:bg-[#13130e] bg-white/95 backdrop-blur-xl border-b dark:border-[#22221a] border-[#e2e8f0] px-4 py-3 shrink-0">
        <Link to="/" className="flex items-center gap-2">
          <img src={companyLogo} alt="Logo Perusahaan" className="h-8 w-auto object-contain" />
          <span className="text-sm font-bold text-[#4338ca] dark:text-[#818cf8] font-space">
            Warehouse Intelligence
          </span>
        </Link>
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="p-2 rounded-md dark:text-slate-300 text-slate-600 hover:dark:bg-[#22221a] hover:bg-[#f1f5f9] transition-colors"
          aria-label={mobileMenuOpen ? "Tutup menu" : "Buka menu"}
          aria-expanded={mobileMenuOpen}
        >
          {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {/* Drawer overlay - mobile */}
      {mobileMenuOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="w-64 max-w-[80vw] shadow-xl">{sidebarBody}</div>
          <div
            className="flex-1 bg-black/50 backdrop-blur-sm"
            onClick={() => setMobileMenuOpen(false)}
            aria-hidden
          />
        </div>
      )}

      {/* Sidebar persisten - desktop */}
      <aside className="hidden lg:flex lg:w-64 lg:flex-shrink-0 lg:h-screen lg:sticky lg:top-0 border-r dark:border-[#22221a] border-[#e2e8f0]">
        {sidebarBody}
      </aside>
    </>
  );
}
