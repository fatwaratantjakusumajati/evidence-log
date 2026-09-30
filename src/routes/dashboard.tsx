import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { subDays, startOfMonth, endOfMonth, subMonths } from "date-fns";
import { API_BASE_URL } from "@/lib/api-config";
import { useState, useMemo, useEffect } from "react";
import { toast } from "sonner";
import { authFetch } from "@/lib/auth";
import { EscalationRiskCard } from "@/components/EscalationRiskCard";
import { DateRangeFilter } from "@/components/DateRangeFilter";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Car,
  Truck,
  Boxes,
  CameraOff,
  Package,
  NotebookText,
  Calendar,
  Box,
  Clock,
  X,
  MapPin,
  Flag,
  BarChart3,
  RotateCcw,
  Loader2,
  History,
  Calendar as CalendarIcon,
  CalendarRange,
  ShipWheel,
  ArrowRight,
  TrendingUp,
  VideoOff,
} from "lucide-react";
import { formatDateTime, generateAutoDescription, classifyMuatanProcess } from "@/lib/evidence";
import { VehicleHistoryModal } from "@/components/VehicleHistoryModal";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

const PREVIEW_LIMIT = 4;
const TOTAL_CAMERAS = 22;

type VehicleLog = {
  id: number;
  timestamp: string;
  jenis_kendaraan: string;
  kamera_nama?: string;
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
type CameraOfflineEvent = { id: number; camera: string; class_name: string; created_at: string };
type VehicleIntervalRaw = { hour: string; jenis_kendaraan: string; total: number };

const CHART_COLORS = {
  blue: "#3b82f6",
  orange: "#f97316",
  purple: "#a855f7",
  red: "#ef4444",
  gray: "#6b7280",
};

// PERBAIKAN: sebelumnya chart dipecah per JAM (24 titik), padahal deteksi
// kendaraan nyatanya cuma tercatat tiap ± 2-3 jam -- membuat chart didominasi
// garis datar di nol. Sekarang dikelompokkan jadi bucket 3 jam (8 titik),
// setiap bucket menjumlahkan aktivitas nyata dalam rentang itu.
const BUCKET_SIZE_HOURS = 3;
const REPORT_BUCKETS = Array.from({ length: 24 / BUCKET_SIZE_HOURS }, (_, i) => {
  const startH = i * BUCKET_SIZE_HOURS;
  const endH = startH + BUCKET_SIZE_HOURS;
  return `${String(startH).padStart(2, "0")}-${String(endH).padStart(2, "0")}`;
});

function colorForClass(name: string) {
  const lower = name.toLowerCase();
  if (lower.includes("truk")) return CHART_COLORS.orange;
  if (lower.includes("mobil")) return CHART_COLORS.blue;
  return CHART_COLORS.purple;
}

type HourlyBin = {
  hour: number;
  label: string; // "01:00", "02:00", ...
  Mobil: number;
  Truk: number;
};

// Parsing jam yang tahan banting: menerima "5", "05", timestamp penuh
// ("2026-09-23T05:00:00"), atau string yang mengandung "HH:mm" di
// dalamnya -- karena field `hour` dari /api/vehicles/stats/hourly bisa
// jadi bukan angka polos.
function extractHour(hourValue: string): number {
  const trimmed = (hourValue ?? "").trim();
  if (/^\d{1,2}$/.test(trimmed)) {
    return parseInt(trimmed, 10);
  }
  const asDate = new Date(trimmed);
  if (!isNaN(asDate.getTime())) {
    return asDate.getHours();
  }
  const match = trimmed.match(/(\d{1,2}):\d{2}/);
  if (match) {
    return parseInt(match[1], 10);
  }
  return NaN;
}

function buildHourlyFromStats(raw: VehicleIntervalRaw[]): HourlyBin[] {
  const bins: HourlyBin[] = Array.from({ length: 24 }, (_, h) => ({
    hour: h,
    label: `${String(h).padStart(2, "0")}:00`,
    Mobil: 0,
    Truk: 0,
  }));

  raw.forEach((item) => {
    const h = extractHour(item.hour);
    if (isNaN(h) || h < 0 || h > 23) return;
    const cls = (item.jenis_kendaraan || "").includes("Truk") ? "Truk" : "Mobil";
    // FIX: sebelumnya baris ini hilang, jadi total dari API tidak pernah
    // benar-benar dijumlahkan ke bin manapun -- itu sebabnya chart selalu
    // menampilkan nol di semua titik walau datanya ada di response.
    bins[h][cls] += Number(item.total) || 0;
  });

  return [...bins.slice(1), bins[0]];
}

function getConfidenceTone(confidence: number) {
  if (confidence < 0.4)
    return {
      label: "Rendah",
      className:
        "bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-900/50",
    };
  if (confidence < 0.7)
    return {
      label: "Sedang",
      className:
        "bg-yellow-100 dark:bg-yellow-950/40 text-yellow-700 dark:text-yellow-400 border border-yellow-200 dark:border-yellow-900/50",
    };
  return {
    label: "Tinggi",
    className:
      "bg-green-100 dark:bg-green-950/40 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-900/50",
  };
}

function ConfidenceBadge({ confidence }: { confidence: number }) {
  const { label, className } = getConfidenceTone(confidence);
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold font-mono ${className}`}
    >
      {label} · {confidence.toFixed(2)}
    </span>
  );
}

// Format waktu buat feed "Log Terbaru": kalau tanggalnya hari ini, tampilkan
// "Hari ini" saja di bawah jamnya -- daripada ngulang tanggal penuh yang
// identik di 4 baris berturut-turut (bikin kolomnya keliatan monoton).
function formatRecentTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const isToday =
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear();
  const time = d.toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const dateLabel = isToday
    ? "Hari ini"
    : d.toLocaleDateString("id-ID", { day: "numeric", month: "short" });
  return { time, dateLabel };
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

function fillWeeklyGaps(raw: { day: string; barang: number }[]) {
  const DAY_ABBR = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
  const getLast7DayLabels = () => {
    const labels: string[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      labels.push(DAY_ABBR[d.getDay()]);
    }
    return labels;
  };
  const byDay = new Map(raw.map((r) => [r.day, Number(r.barang)]));
  return getLast7DayLabels().map((day) => ({ day, barang: byDay.get(day) ?? 0 }));
}

function BreadcrumbNavInside() {
  return (
    <Breadcrumb className="mb-4">
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink asChild>
            <Link
              to="/dashboard"
              className="text-slate-500 dark:text-slate-400 hover:text-indigo-700 dark:hover:text-indigo-500 transition-colors text-sm"
            >
              Home
            </Link>
          </BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem>
          <BreadcrumbPage className="font-space font-semibold text-lg text-slate-900 dark:text-slate-100">
            Dashboard
          </BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  );
}

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard · Control Room" },
      {
        name: "description",
        content: "Dashboard pemantauan deteksi barang, kamera, dan kendaraan.",
      },
    ],
  }),
  component: Dashboard,
});

export const formatShortDate = (dateString: string) => {
  return new Date(dateString).toLocaleString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

function Dashboard() {
  // --- STATE UNTUK MODAL LIGHTBOX ---
  const [selectedVehicle, setSelectedVehicle] = useState<VehicleLog | null>(null);
  const [historyVehicleId, setHistoryVehicleId] = useState<string | null>(null);

  // Mencegah scroll halaman saat modal terbuka
  useEffect(() => {
    document.body.style.overflow = selectedVehicle ? "hidden" : "unset";
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [selectedVehicle]);

  const [filterClass, setFilterClass] = useState("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const queryClient = useQueryClient();

  const [selectedStaging, setSelectedStaging] = useState<StagingDetection | null>(null);
  const [isStagingModalOpen, setIsStagingModalOpen] = useState(false);

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
        value
          ? "Ditandai sebagai deteksi salah (false positive)."
          : "Tanda false positive dihapus.",
      );
    },
    onError: (err: Error) => toast.error(`Gagal: ${err.message}`),
  });

  // Catatan: dashboard TIDAK perlu membuka koneksi SSE sendiri. __root.tsx
  // sudah membuka satu koneksi global dan memanggil queryClient.invalidateQueries()
  // tanpa argumen di setiap event masuk, yang otomatis meng-invalidate SEMUA
  // query aktif di seluruh app -- termasuk semua query di halaman ini. Membuka
  // EventSource kedua di sini dulu menyebabkan dua koneksi SSE berjalan
  // bersamaan ke endpoint yang sama, memboroskan slot koneksi browser (yang
  // dibatasi per origin) dan berkontribusi ke masalah reconnect yang lambat/flaky.

  const { data: vehicles = [] } = useQuery<VehicleLog[]>({
    queryKey: ["vehicle_log", "preview", filterClass, startDate, endDate],
    meta: { showErrorToast: true, errorLabel: "Log Kendaraan" },
    queryFn: async () => {
      const params = new URLSearchParams({ limit: "40" });
      if (filterClass !== "all") params.append("jenis", filterClass);
      if (startDate) params.append("start_date", startDate);
      if (endDate) params.append("end_date", endDate);
      const res = await authFetch(`${API_BASE_URL}/api/vehicles/log?${params}`);
      if (!res.ok) throw new Error(`Server merespons status ${res.status}`);
      const json = await res.json();
      return json.data || (Array.isArray(json) ? json : []);
    },
  });
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const { data: stagings = [] } = useQuery<StagingDetection[]>({
    queryKey: ["staging_detections", "preview", startDate, endDate],
    meta: { showErrorToast: true, errorLabel: "Deteksi Barang" },
    queryFn: async () => {
      const params = new URLSearchParams({ class_name: "box", limit: "4" });
      if (startDate) params.append("start_date", startDate);
      if (endDate) params.append("end_date", endDate);
      const res = await authFetch(`${API_BASE_URL}/api/alerts?${params}`);
      if (!res.ok) throw new Error(`Server merespons status ${res.status}`);
      const json = await res.json();
      return json.data || (Array.isArray(json) ? json : []);
    },
  });
  const { data: offlineCams = [] } = useQuery<CameraOfflineEvent[]>({
    queryKey: ["camera_offline_events", "preview", startDate, endDate],
    meta: { showErrorToast: true, errorLabel: "Status Kamera" },
    queryFn: async () => {
      const params = new URLSearchParams({ class_name: "KAMERA OFFLINE", limit: "4" });
      if (startDate) params.append("start_date", startDate);
      if (endDate) params.append("end_date", endDate);
      const res = await authFetch(`${API_BASE_URL}/api/alerts?${params}`);
      if (!res.ok) throw new Error(`Server merespons status ${res.status}`);
      const json = await res.json();
      return json.data || (Array.isArray(json) ? json : []);
    },
  });
  const { data: vehicleIntervalRaw = [], isLoading: isVehicleIntervalLoading } = useQuery<
    VehicleIntervalRaw[]
  >({
    queryKey: ["vehicle_interval", startDate, endDate],
    meta: { showErrorToast: true, errorLabel: "Statistik Kendaraan" },
    queryFn: async () => {
      const params = new URLSearchParams();
      if (startDate) params.append("start_date", startDate);
      if (endDate) params.append("end_date", endDate);
      const qs = params.toString();
      const url = `${API_BASE_URL}/api/vehicles/stats/hourly${qs ? `?${qs}` : ""}`;
      const res = await authFetch(url);
      if (!res.ok) throw new Error(`Server merespons status ${res.status}`);
      return res.json() as Promise<VehicleIntervalRaw[]>;
    },
  });
  const { data: detectionData = [], isLoading: isDetectionLoading } = useQuery<
    { day: string; barang: number }[]
  >({
    queryKey: ["detection_weekly", startDate, endDate],
    meta: { showErrorToast: true, errorLabel: "Statistik Deteksi" },
    queryFn: async () => {
      const params = new URLSearchParams();
      if (startDate) params.append("start_date", startDate);
      if (endDate) params.append("end_date", endDate);
      const qs = params.toString();
      const url = `${API_BASE_URL}/api/alerts/stats/weekly${qs ? `?${qs}` : ""}`;
      const res = await authFetch(url);
      if (!res.ok) throw new Error(`Server merespons status ${res.status}`);
      return res.json();
    },
  });
  const { data: cameraStats, isLoading: isCameraStatsLoading } = useQuery<{ mati: number }>({
    queryKey: ["camera_status", startDate, endDate],
    // PENTING: sebelumnya kegagalan fetch di sini mengembalikan { mati: 0 },
    // yang berarti "0 kamera mati" ditampilkan ke dashboard walau requestnya
    // sebenarnya gagal total -- bisa menutupi kejadian kamera offline yang
    // sungguhan. Sekarang kegagalan benar-benar dilempar sebagai error.
    meta: { showErrorToast: true, errorLabel: "Status Kamera" },
    queryFn: async () => {
      const params = new URLSearchParams();
      if (startDate) params.append("start_date", startDate);
      if (endDate) params.append("end_date", endDate);
      const qs = params.toString();
      const url = `${API_BASE_URL}/api/alerts/stats/camera-status${qs ? `?${qs}` : ""}`;
      const res = await authFetch(url);
      if (!res.ok) throw new Error(`Server merespons status ${res.status}`);
      return res.json();
    },
  });

  const todayBreakdown = useMemo(() => {
    let mobil = 0,
      truk = 0;
    vehicleIntervalRaw.forEach((item) => {
      if (item.jenis_kendaraan === "Mobil") mobil += item.total;
      else if (item.jenis_kendaraan === "Truk") truk += item.total;
    });
    return { mobil, truk };
  }, [vehicleIntervalRaw]);

  const filteredVehicles = vehicles;

  // ✅ Gabungkan Masuk & Keluar dari kendaraan yang sama (vehicle_id sama)
  // jadi satu "grup siklus" — sama seperti di halaman Kendaraan.
  const groupedVehicles = useMemo(() => {
    const groups = new Map<string, VehicleLog[]>();
    const standalone: VehicleLog[] = [];

    for (const v of filteredVehicles as VehicleLog[]) {
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
  }, [filteredVehicles]);

  // Feed "Log Terbaru": gabungan 3 sumber (kendaraan, staging, kamera
  // offline), MURNI diurutkan dari yang paling baru -- tidak ada
  // "pemaksaan" supaya tiap kategori kebagian slot. Kalau kebetulan 4
  // aktivitas paling baru semuanya kendaraan, ya ditampilkan begitu apa
  // adanya; kalau tidak ada staging/kamera yang cukup baru, tidak akan
  // dipaksakan muncul.
  const recentActivity = useMemo(() => {
    type ActivityItem = {
      id: string;
      time: string;
      label: string;
      category: string;
      detail?: string;
      accent: Accent;
      icon: React.ReactNode;
    };

    // FIX: sebelumnya feed ini memakai EVENT mentah (tiap baris vehicle_log),
    // sedangkan kartu "Log Kendaraan" memakai SIKLUS (Masuk+Keluar digabung per
    // vehicle_id). Akibatnya data tidak sinkron: jenis kendaraan bisa beda
    // (event Keluar terbaca "Mobil" padahal Masuk "Truk"), dan event perantara
    // ikut tampil sebagai baris sendiri. Sekarang feed memakai grup siklus yang
    // sama dengan kartu di bawah, dengan label jenis dari event MASUK.
    const vehicleItems: ActivityItem[] = groupedVehicles.map((g) => {
      const masuk = g.events.find((e) => e.jenis_kejadian === "MASUK") || g.events[0];
      const latest = g.events[g.events.length - 1]; // events sudah urut ASC
      const isTruk = (masuk.jenis_kendaraan || "").includes("Truk");
      return {
        id: `vehicle-${g.key}`,
        time: latest.timestamp,
        label: masuk.jenis_kendaraan || "Kendaraan",
        category: "Kendaraan",
        detail: masuk.plat_nomor || latest.plat_nomor || masuk.kamera_nama || undefined,
        accent: isTruk ? "orange" : "blue",
        icon: isTruk ? <Truck className="h-3.5 w-3.5" /> : <Car className="h-3.5 w-3.5" />,
      };
    });

    const stagingItems: ActivityItem[] = stagings.map((s) => ({
      id: `staging-${s.id}`,
      time: s.created_at,
      label: "Box",
      category: "Staging",
      detail: s.camera || undefined,
      accent: "amber",
      icon: <Package className="h-3.5 w-3.5" />,
    }));

    const cameraItems: ActivityItem[] = offlineCams.map((c) => ({
      id: `camera-${c.id}`,
      time: c.created_at,
      label: "Offline",
      category: "Kamera",
      detail: c.camera || undefined,
      accent: "rose",
      icon: <VideoOff className="h-3.5 w-3.5" />,
    }));

    return [...vehicleItems, ...stagingItems, ...cameraItems]
      .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
      .slice(0, PREVIEW_LIMIT);
  }, [groupedVehicles, stagings, offlineCams]);

  const vehicleHourly = useMemo(
    () => buildHourlyFromStats(vehicleIntervalRaw),
    [vehicleIntervalRaw],
  );
  const totalDetections = detectionData.reduce((s, d) => s + Number(d.barang), 0);
  const camerasDown = Number(cameraStats?.mati ?? 0);
  const totalVehicles = vehicleIntervalRaw.reduce((s, r) => s + r.total, 0);

  return (
    <main className="flex-1 transition-colors duration-300 bg-[#f2f5f2] dark:bg-[#13130e] text-slate-900 dark:text-slate-100">
      <div className="mx-auto max-w-[1680px] px-6 pt-6 pb-4 border-b transition-colors duration-300 bg-white dark:bg-[#1a1a14] border-slate-200 dark:border-[#2e2e25]">
        <BreadcrumbNavInside />
        <div className="flex items-center justify-between mt-2">
          <div>
            <h1 className="text-3xl font-bold tracking-tight font-space text-slate-900 dark:text-slate-100">
              Dashboard Pemantauan
            </h1>
            <p className="text-sm font-mono mt-1 text-slate-500 dark:text-slate-400">
              Aktivitas staging, kendaraan, & kamera
            </p>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[1680px] px-6 py-6">
        {/* Filter Date */}
        {/* <div className="mb-8 flex flex-wrap items-center gap-3 p-3 rounded-xl border shadow-sm transition-colors duration-300 bg-white dark:bg-[#1a1a14] border-slate-200 dark:border-[#2e2e25]">
          <span className="text-xs font-medium font-mono text-slate-500 dark:text-slate-400">
            Periode:
          </span>
          <div className="flex items-center gap-2">
            <DateRangeFilter
              startDate={startDate}
              endDate={endDate}
              onChange={(start, end) => {
                setStartDate(start);
                setEndDate(end);
              }}
            />

            {(startDate || endDate) && (
              <button
                onClick={() => {
                  setStartDate("");
                  setEndDate("");
                }}
                className="h-7 rounded-full px-3 text-[10px] font-medium transition-colors hover:opacity-80 bg-red-100 dark:bg-red-950/60 text-red-600 dark:text-red-400"
              >
                Reset Filter
              </button>
            )}
          </div>
        </div> */}
        <div className="realtive z-20 mb-8 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-[#2e2e25] dark:bg-[#13130e]">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400">
                <CalendarRange className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                  Periode Data
                </h3>
                <p className="text-[11px] text-slate-400 dark:text-slate-500">
                  Tentukan rentang waktu data yang ingin ditampilkan
                </p>
              </div>
            </div>
          </div>

          <DateRangeFilter
            startDate={startDate}
            endDate={endDate}
            onChange={(start, end) => {
              setStartDate(start);
              setEndDate(end);
            }}
          />
        </div>
        {/* KPI Cards */}
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4 mb-8">
          {/* Deteksi Staging: total alert class_name='box' dari alert_log,
              dalam rentang tanggal terpilih (default 7 hari terakhir) —
              sumbernya sama dengan chart "Deteksi Kendaraan" (stats/weekly),
              BUKAN dari daftar preview stagings (yang cuma barang diam >= 3 hari). */}
          <KpiCard
            icon={
              <div className="relative flex items-center justify-center">
                <Clock className="h-5 w-5 text-amber-600 dark:text-amber-400 z-10" />
                {totalDetections > 0 && (
                  <span className="animate-pulse absolute inline-flex h-full w-full rounded-full bg-amber-500/20"></span>
                )}
              </div>
            }
            accent="amber"
            label="Deteksi Staging"
            value={String(totalDetections)}
            hint={
              startDate || endDate
                ? "Alert box · rentang tanggal terpilih"
                : "Alert box · 7 hari terakhir"
            }
            trend={startDate || endDate ? undefined : "7 hari"}
            sparklineData={
              detectionData.length > 1 ? detectionData.map((d) => Number(d.barang)) : undefined
            }
            isLoading={isDetectionLoading}
          />
          <KpiCard
            icon={
              camerasDown === 0 ? (
                <span className="relative flex h-3 w-3">
                  <span className="animate-pulse absolute inline-flex h-full w-full rounded-full bg-emerald-500/20"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                </span>
              ) : (
                <CameraOff className="h-5 w-5 text-red-600 dark:text-red-400" />
              )
            }
            accent={camerasDown === 0 ? "emerald" : "rose"}
            label="Status Kamera"
            value={camerasDown === 0 ? "100% Online" : `${camerasDown} Offline`}
            hint={
              camerasDown === 0 ? `22/22 Kamera Beroperasi` : `dari ${TOTAL_CAMERAS} total kamera`
            }
            isLoading={isCameraStatsLoading}
          />
          {/* Total Kendaraan */}
          <KpiCardBreakdown
            icon={<Car className="h-5 w-5" />}
            accent="blue"
            label="Total Kendaraan"
            breakdown={todayBreakdown}
            hint="Terekam hari ini"
            isLoading={isVehicleIntervalLoading}
          />
          {/* Log Terbaru: feed kecil, bukan angka — biar tetap informatif
              tanpa harus mendefinisikan ulang arti "pelanggaran" */}
          <RecentActivityCard items={recentActivity} />
        </div>

        {/* Charts Section */}
        <div className="grid grid-cols-1 gap-6 mb-8">
          <div className="rounded-xl border p-5 shadow-sm transition-colors duration-300 bg-white dark:bg-[#1a1a14] border-slate-200 dark:border-[#2e2e25]">
            {/* Header + legend pill */}
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold flex items-center gap-2 font-space text-slate-900 dark:text-slate-100">
                  <span className="inline-block w-1 h-4 rounded-full bg-indigo-700 dark:bg-indigo-500" />
                  Deteksi Kendaraan
                </h3>
                <p className="text-xs font-mono mt-1 text-slate-500 dark:text-slate-400">
                  Distribusi kendaraan masuk per jam (agregat dari rentang terpilih)
                </p>
              </div>
              <div className="flex items-center gap-5 rounded-full border border-slate-200 bg-slate-50/50 px-3.5 py-1.5 dark:border-[#2e2e25] dark:bg-[#13130e]">
                <span className="flex items-center gap-1.5 text-[11px] font-mono font-medium text-slate-600 dark:text-slate-300">
                  <span className="h-2.5 w-2.5 rounded-full bg-blue-500" />
                  Mobil
                </span>
                <span className="flex items-center gap-1.5 text-[11px] font-mono font-medium text-slate-600 dark:text-slate-300">
                  <span className="h-2.5 w-2.5 rounded-full bg-orange-500" />
                  Truk
                </span>
              </div>
            </div>

            {/* FIX: sebelumnya pakai AreaChart dengan 2 Area yang sama-sama
                punya fill. Kalau nilai Truk & Mobil sama-sama muncul di jam
                yang sama, Area yang digambar belakangan (Truk) menimpa
                habis Area yang digambar duluan (Mobil) di rentang y yang
                overlap -- garis birunya jadi kelihatan hilang total padahal
                datanya ada. BarChart dengan bar berdampingan (bukan
                ditumpuk) tidak punya masalah saling menutupi ini sama
                sekali, apa pun perbandingan nilainya. */}
            <ResponsiveContainer width="100%" height={340}>
              <BarChart data={vehicleHourly} margin={{ top: 8, right: 16, left: -8, bottom: 8 }}>
                <CartesianGrid
                  strokeDasharray="4 6"
                  vertical={false}
                  stroke="#cbd5e1"
                  strokeOpacity={0.35}
                  className="dark:stroke-[#2e2e25]"
                />

                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  dy={8}
                  interval={2}
                  tick={{
                    fontSize: 11,
                    fontFamily: "'IBM Plex Mono', monospace",
                    fill: "#94a3b8",
                  }}
                />

                <YAxis
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={false}
                  width={32}
                  tick={{
                    fontSize: 11,
                    fontFamily: "'IBM Plex Mono', monospace",
                    fill: "#94a3b8",
                  }}
                />

                <Tooltip
                  cursor={{
                    stroke: "#6366f1",
                    strokeWidth: 1,
                    strokeDasharray: "4 4",
                    strokeOpacity: 0.6,
                  }}
                  content={({ active, payload }) => {
                    if (!active || !payload || !payload.length) return null;
                    const d = payload[0].payload as HourlyBin;
                    const total = d.Mobil + d.Truk;
                    return (
                      <div className="rounded-xl border border-[#2e2e25] bg-[#1a1a14]/95 px-4 py-3 shadow-2xl backdrop-blur-sm">
                        <p className="mb-2 text-[10px] font-mono font-semibold uppercase tracking-wider text-slate-400">
                          Pukul {d.label}
                        </p>
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between gap-6">
                            <span className="flex items-center gap-2 text-xs text-slate-300">
                              <span className="h-2 w-2 rounded-full bg-blue-500" />
                              Mobil
                            </span>
                            <span className="text-sm font-bold font-mono tabular-nums text-white">
                              {d.Mobil}
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-6">
                            <span className="flex items-center gap-2 text-xs text-slate-300">
                              <span className="h-2 w-2 rounded-full bg-orange-500" />
                              Truk
                            </span>
                            <span className="text-sm font-bold font-mono tabular-nums text-white">
                              {d.Truk}
                            </span>
                          </div>
                          <div className="mt-1.5 flex items-center justify-between gap-6 border-t border-[#2e2e25] pt-1.5">
                            <span className="text-[11px] font-mono uppercase tracking-wider text-slate-400">
                              Total
                            </span>
                            <span className="text-sm font-bold font-mono tabular-nums text-indigo-400">
                              {total}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  }}
                />

                <Bar
                  dataKey="Mobil"
                  name="Mobil"
                  fill="#3b82f6"
                  radius={[3, 3, 0, 0]}
                  maxBarSize={14}
                />
                <Bar
                  dataKey="Truk"
                  name="Truk"
                  fill="#f97316"
                  radius={[3, 3, 0, 0]}
                  maxBarSize={14}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Logs Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <div className="rounded-xl border p-5 shadow-sm transition-colors duration-300 bg-white dark:bg-[#1a1a14] border-slate-200 dark:border-[#2e2e25]">
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm font-semibold flex items-center gap-2 font-space text-slate-900 dark:text-slate-100">
                <Car className="h-4 w-5 text-slate-500 dark:text-slate-400" /> Log Kendaraan
              </span>
              <Link
                to="/logs/vehicles"
                className="group inline-flex items-center gap-1.5 rounded-lg border border-slate-200/80 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-600 shadow-sm transition-all duration-200 hover:border-indigo-200 hover:bg-indigo-50/50 hover:text-indigo-600 dark:border-[#26261e] dark:bg-[#13130e]/60 dark:text-slate-400 dark:hover:border-indigo-500/30 dark:hover:bg-indigo-500/10 dark:hover:text-indigo-400"
              >
                <span>Lihat semua</span>
                <ArrowRight className="h-3.5 w-3.5 text-slate-400 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-indigo-600 dark:text-slate-500 dark:group-hover:text-indigo-400" />
              </Link>
            </div>
            {groupedVehicles.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Car className="h-12 w-12 mb-3 text-slate-400" strokeWidth={1.5} />
                <h4 className="text-base font-semibold font-space text-slate-700 dark:text-slate-300">
                  Belum Ada Kendaraan
                </h4>
                <p className="mt-1 text-sm font-mono text-slate-500 dark:text-slate-400">
                  Belum ada log kendaraan yang tercatat
                </p>
              </div>
            ) : (
              <>
                <div className="mb-4 flex items-center justify-between">
                  <p className="text-xs font-mono text-slate-500 dark:text-slate-400">
                    Menampilkan {Math.min(groupedVehicles.length, PREVIEW_LIMIT)} data
                  </p>
                  {/* Container Dropdown Kustom */}
                  <div className="relative inline-block text-left">
                    {/* Tombol Utama */}
                    <button
                      type="button"
                      onClick={() => setIsFilterOpen(!isFilterOpen)}
                      className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium font-mono text-slate-700 shadow-sm transition-all hover:bg-slate-100 dark:border-[#2e2e25] dark:bg-[#13130e] dark:text-slate-200 dark:hover:bg-[#1a1a14]"
                    >
                      <span>
                        {filterClass === "Truk" ? (
                          "🚚"
                        ) : filterClass === "Mobil" ? (
                          "🚗"
                        ) : (
                          <ShipWheel className="h-4 w-4 text-indigo-500" />
                        )}
                      </span>
                      <span className="capitalize truncate">
                        {filterClass === "all" ? "Semua Jenis" : filterClass}
                      </span>
                      <svg
                        className={`h-3.5 w-3.5 text-slate-400 transition-transform duration-200 ${
                          isFilterOpen ? "rotate-180" : ""
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

                    {/* Menu Dropdown yang Muncul saat Di-klik */}
                    {isFilterOpen && (
                      <div className="absolute right-0 z-50 mt-1.5 w-36 overflow-hidden rounded-xl border border-slate-200 bg-white p-1 shadow-lg dark:border-[#26261e] dark:bg-[#13130e]">
                        {[
                          {
                            value: "all",
                            label: "Semua Jenis",
                            icon: <ShipWheel className="w-4 h-4 text-indigo-500" />,
                          },
                          { value: "Mobil", label: "Mobil", icon: "🚗" },
                          { value: "Truk", label: "Truk", icon: "🚚" },
                        ].map((item) => (
                          <button
                            key={item.value}
                            type="button"
                            onClick={() => {
                              setFilterClass(item.value);
                              setIsFilterOpen(false);
                            }}
                            className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs font-mono transition-colors ${
                              filterClass === item.value
                                ? "bg-indigo-50 font-semibold text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-400"
                                : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-[#1a1a14]"
                            }`}
                          >
                            <span>{item.icon}</span>
                            <span className="flex-1 text-left">{item.label}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <div className="space-y-3">
                  {groupedVehicles.slice(0, PREVIEW_LIMIT).map((group) => {
                    // ✅ BARIS SIKLUS GABUNGAN (Masuk + Keluar kendaraan yang sama)
                    if (group.events.length >= 2) {
                      const masuk =
                        group.events.find((e) => e.jenis_kejadian === "MASUK") || group.events[0];
                      const keluar =
                        group.events.find(
                          (e) =>
                            e.jenis_kejadian === "SIKLUS_KEJADIAN" || e.jenis_kejadian === "KELUAR",
                        ) || group.events[group.events.length - 1];
                      const platNomor = masuk.plat_nomor || keluar.plat_nomor;

                      const isTrukGroup = masuk.jenis_kendaraan.includes("Truk");
                      const muatanEventsPrev = group.events
                        .filter((e) => e.status_muatan && e.status_muatan.trim() !== "")
                        .sort(
                          (a, b) =>
                            new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
                        );
                      const muatanProcessPrev =
                        isTrukGroup && muatanEventsPrev.length >= 1
                          ? classifyMuatanProcess(
                              muatanEventsPrev[0].status_muatan,
                              muatanEventsPrev[muatanEventsPrev.length - 1].status_muatan,
                            )
                          : null;

                      return (
                        <div
                          key={group.key}
                          onClick={() => setHistoryVehicleId(group.key)}
                          className="flex gap-3.5 items-center p-3 rounded-xl order border-slate-100 dark:border-[#26261e]/80 bg-slate-50/50 dark:bg-[#13130e]/40 cursor-pointer hover:border-indigo-200 dark:hover:border-indigo-900/50 hover:bg-indigo-50/30 dark:hover-indigo-950/20 transition-all duration-200 shadow-sm"
                        >
                          <div className="flex flex-shrink-0 gap-1">
                            <div className="viewfinder relative rounded overflow-hidden">
                              <span className="vf-tr" />
                              <span className="vf-bl" />
                              <img
                                src={`data:image/jpeg;base64,${masuk.gambar_base64}`}
                                className="h-14 w-14 rounded object-cover bg-slate-100 dark:bg-[#22221a]"
                              />
                              <span className="absolute bottom-0 left-0 right-0 bg-emerald-600/90 text-center text-[10px] font-bold text-white leading-tight">
                                MASUK
                              </span>
                            </div>
                            <div className="viewfinder relative rounded overflow-hidden">
                              <span className="vf-tr" />
                              <span className="vf-bl" />
                              <img
                                src={`data:image/jpeg;base64,${keluar.gambar_base64}`}
                                className="h-14 w-14 rounded object-cover bg-slate-100 dark:bg-[#22221a]"
                              />
                              <span className="absolute bottom-0 left-0 right-0 bg-orange-600/90 text-center text-[10px] font-bold text-white leading-tight">
                                KELUAR
                              </span>
                            </div>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <p className="text-sm font-medium truncate text-slate-900 dark:text-slate-100">
                                {masuk.jenis_kendaraan}
                              </p>
                              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 dark:text-slate-400 shrink-0">
                                <History className="h-3 w-3" /> Siklus lengkap
                              </span>
                            </div>

                            {platNomor && (
                              <p className="mt-0.5 text-xs font-medium text-slate-700 dark:text-slate-300">
                                {platNomor}
                              </p>
                            )}

                            {muatanProcessPrev && (
                              <p
                                className={`mt-0.5 flex items-center gap-1 text-[11px] font-medium ${
                                  muatanProcessPrev.tone === "loading"
                                    ? "text-orange-700 dark:text-orange-400"
                                    : muatanProcessPrev.tone === "unloading"
                                      ? "text-emerald-700 dark:text-emerald-400"
                                      : "text-slate-500 dark:text-slate-400"
                                }`}
                              >
                                <Box className="h-3 w-3" /> {muatanProcessPrev.label}
                              </p>
                            )}

                            <div className="flex flex-wrap items-center gap-x-3 text-[11px] mt-1 text-slate-500 dark:text-slate-400">
                              <span className="inline-flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                {formatDateTime(masuk.timestamp)}
                              </span>
                              <span className="inline-flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-orange-500" />
                                {formatDateTime(keluar.timestamp)}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    }

                    // ✅ BARIS TUNGGAL (belum ada pasangan Masuk/Keluar)
                    const v = group.events[0];
                    const isTruk = v.jenis_kendaraan.includes("Truk");
                    const isCam1 = v.kamera_nama === "Loading Kiri";

                    let muatanBadge = null;
                    if (isTruk && isCam1) {
                      const status = v.status_muatan || "";
                      let textColor = "text-slate-500 dark:text-slate-400";
                      let displayText = status || "Tidak dapat dipastikan";

                      if (status === "Bermuatan") {
                        textColor = "text-orange-600 dark:text-orange-400";
                      } else if (status === "Kosong / bak tertutup") {
                        textColor = "text-emerald-700 dark:text-emerald-400";
                      }

                      muatanBadge = (
                        <span
                          className={`inline-flex items-center gap-1 text-[11px] font-medium mt-0.5 ${textColor}`}
                        >
                          <Box className="h-3 w-3" />
                          {displayText}
                        </span>
                      );
                    }

                    let statusKejadianBadge = null;
                    if (v.jenis_kejadian === "MASUK") {
                      statusKejadianBadge = (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-400 shrink-0">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Masuk
                        </span>
                      );
                    } else if (
                      v.jenis_kejadian === "SIKLUS_KEJADIAN" ||
                      v.jenis_kejadian === "KELUAR"
                    ) {
                      statusKejadianBadge = (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-orange-700 dark:text-orange-400 shrink-0">
                          <span className="w-1.5 h-1.5 rounded-full bg-orange-500" /> Keluar
                        </span>
                      );
                    }
                    return (
                      <div
                        key={v.id}
                        onClick={() => setSelectedVehicle(v)}
                        className="flex gap-3 border-b pb-3 last:border-0 border-slate-200 dark:border-[#2e2e25] cursor-pointer hover:bg-slate-50 dark:hover:bg-[#22221a] rounded-md p-1 transition-colors"
                      >
                        <div className="viewfinder relative flex-shrink-0 rounded overflow-hidden">
                          <span className="vf-tr" />
                          <span className="vf-bl" />
                          <img
                            src={`data:image/jpeg;base64,${v.gambar_base64}`}
                            className="h-14 w-20 rounded object-cover bg-slate-100 dark:bg-[#22221a]"
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-sm font-medium truncate text-slate-900 dark:text-slate-100">
                              {v.jenis_kendaraan}
                            </p>
                            {statusKejadianBadge}
                          </div>

                          {muatanBadge}

                          {v.kamera_nama &&
                            v.kamera_nama.toLowerCase().includes("depan") &&
                            v.plat_nomor && (
                              <p className="mt-0.5 text-xs font-medium text-slate-700 dark:text-slate-300">
                                {v.plat_nomor}
                              </p>
                            )}

                          <div className="flex flex-wrap items-center gap-x-3 text-[11px] mt-1 text-slate-500 dark:text-slate-400">
                            <span>{formatDateTime(v.timestamp)}</span>
                            {v.kamera_nama && (
                              <span className="inline-flex items-center gap-1">
                                <MapPin className="h-3 w-3" /> {v.kamera_nama}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          <div className="rounded-xl border p-5 shadow-sm transition-colors duration-300 bg-white dark:bg-[#1a1a14] border-slate-200 dark:border-[#2e2e25]">
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm font-semibold flex items-center gap-2 font-space text-slate-900 dark:text-slate-100">
                <Boxes className="h-4 w-4 text-slate-500 dark:text-slate-400" /> Deteksi Staging
              </span>
              <Link
                to="/logs/staging"
                className="group inline-flex items-center gap-1.5 rounded-lg border border-slate-200/80 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-600 shadow-sm transition-all duration-200 hover:border-indigo-200 hover:bg-indigo-50/50 hover:text-indigo-600 dark:border-[#26261e] dark:bg-[#13130e]/60 dark:text-slate-400 dark:hover:border-indigo-500/30 dark:hover:bg-indigo-500/10 dark:hover:text-indigo-400"
              >
                <span>Lihat semua</span>
                <ArrowRight className="h-3.5 w-3.5 text-slate-400 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-indigo-600 dark:text-slate-500 dark:group-hover:text-indigo-400" />
              </Link>
            </div>
            {stagings.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Boxes className="h-12 w-12 mb-3 text-slate-400" strokeWidth={1.5} />
                <h4 className="text-base font-semibold font-space text-slate-700 dark:text-slate-300">
                  Belum Ada Staging
                </h4>
                <p className="mt-1 text-sm font-mono text-slate-500 dark:text-slate-400">
                  Belum ada barang staging yang terdeteksi
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {stagings.slice(0, PREVIEW_LIMIT).map((s) => (
                  <div
                    key={s.id}
                    className="flex gap-3.5 items-center p-3 rounded-xl border border-slate-100 dark:border-[#26261e]/80 bg-slate-50/50 dark:bg-[#13130e]/40 hover:bg-slate-100/50 dark:hover:bg-[#1a1a14]/40 transition-all duration-200 shadow-sm"
                  >
                    <div className="viewfinder relative flex-shrink-0 rounded overflow-hidden">
                      <span className="vf-tr" />
                      <span className="vf-bl" />
                      <img
                        src={`data:image/jpeg;base64,${s.foto_base64}`}
                        className="h-14 w-20 rounded object-cover bg-slate-100 dark:bg-[#22221a]"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-medium truncate text-slate-900 dark:text-slate-100">
                          {s.class_name ?? "Box"}
                        </p>
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-red-600 dark:text-red-400 shrink-0">
                          <Clock className="h-3 w-3" />
                          {formatDurationFromSeconds(s.duration)}
                        </span>
                      </div>
                      {s.camera && (
                        <p className="mt-0.5 flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400">
                          <MapPin className="h-3 w-3" /> {s.camera}
                        </p>
                      )}
                      <div className="flex flex-wrap items-center gap-x-3 text-[11px] mt-0.5 text-slate-500 dark:text-slate-400">
                        <span>
                          Mulai: {s.first_detected ? formatDateTime(s.first_detected) : "-"}
                        </span>
                        <span>Alert: {formatDateTime(s.timestamp)}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Camera Offline Section */}
        <div className="rounded-xl border p-5 shadow-sm transition-colors duration-300 bg-white dark:bg-[#1a1a14] border-slate-200 dark:border-[#2e2e25]">
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm font-semibold flex items-center gap-2 font-space text-slate-900 dark:text-slate-100">
              <CameraOff className="h-4 w-4 text-red-600 dark:text-red-400" /> Laporan Kamera Mati
            </span>
            <Link
              to="/logs/cameras"
              className="text-xs hover:underline font-medium text-indigo-700 dark:text-indigo-500"
            >
              Lihat semua →
            </Link>
          </div>
          {offlineCams.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <CameraOff className="h-12 w-12 mb-3 text-slate-400" strokeWidth={1.5} />
              <h4 className="text-base font-semibold font-space text-slate-900 dark:text-slate-100">
                Semua Kamera Online
              </h4>
              <p className="mt-1 text-sm font-mono text-slate-500 dark:text-slate-400">
                Tidak ada laporan kamera mati saat ini.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {offlineCams.slice(0, PREVIEW_LIMIT).map((c) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between p-3 rounded-lg border bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-900/50"
                >
                  <span className="text-sm font-medium font-mono text-red-700 dark:text-red-400">
                    {c.camera}
                  </span>
                  <span className="text-xs font-mono text-slate-500 dark:text-slate-400">
                    {formatDateTime(c.created_at)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ========================================================== */}
      {/* MODAL LIGHTBOX - SUDAH DIPERBAIKI (Letaknya di dalam return) */}
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
              className="absolute right-3 top-3 z-10 rounded-full bg-black/50 p-1.5 text-white transition-colors hover:bg-black/70"
            >
              <X className="h-5 w-5" />
            </button>
            <div className="viewfinder relative flex flex-1 items-center justify-center bg-[#f1f5f9] dark:bg-[#13130e] p-2 md:w-2/3">
              <span className="vf-tr" />
              <span className="vf-bl" />
              <span className="absolute left-3 top-3 z-10 inline-flex items-center gap-1.5 rounded-full bg-black/50 px-2.5 py-1 text-[10px] font-mono font-semibold uppercase tracking-wider text-white">
                <span className="h-1.5 w-1.5 rounded-full bg-[#f87171] animate-pulse" /> Rekaman
              </span>
              <img
                src={`data:image/jpeg;base64,${selectedVehicle.gambar_base64}`}
                alt={`Kendaraan ${selectedVehicle.jenis_kendaraan}`}
                className="max-h-[70vh] w-full object-contain"
              />
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
                    </div>
                  </div>
                </div>

                {/* LOGIKA MUATAN DI MODAL */}
                {selectedVehicle.jenis_kendaraan.includes("Truk") && (
                  <div
                    className={`mt-3 flex items-center gap-2 rounded-lg px-3 py-2 border ${selectedVehicle.status_muatan && selectedVehicle.status_muatan.trim() !== "" ? "bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-900/50" : "bg-[#f1f5f9] dark:bg-[#13130e] border-[#e2e8f0] dark:border-[#2e2e25]"}`}
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

              {/* AUTO-GENERATED PARAGRAPH — sama seperti di halaman Kendaraan */}
              <div className="text-sm leading-relaxed text-[#334155] dark:text-[#cbd5e1] font-sans border-b border-[#e2e8f0] dark:border-[#2e2e25] pb-4">
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
                {selectedVehicle.plat_nomor && (
                  <div className="flex items-start gap-3">
                    <Flag className="h-5 w-5 text-[#64748b] dark:text-[#94a3b8] mt-0.5" />
                    <div>
                      <p className="text-xs text-[#64748b] dark:text-[#94a3b8] font-mono uppercase tracking-wider">
                        Plat Nomor
                      </p>
                      <p className="text-sm font-semibold font-mono plate-number">
                        {selectedVehicle.plat_nomor}
                      </p>
                    </div>
                  </div>
                )}
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
                    className="inline-flex w-full items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-medium transition-colors bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-500 hover:bg-indigo-100 dark:hover:bg-indigo-900/30 border border-indigo-200 dark:border-indigo-900/50"
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
                      ? "bg-[#f1f5f9] dark:bg-[#13130e] text-[#64748b] dark:text-[#94a3b8] hover:bg-[#e2e8f0] dark:hover:bg-[#1a1a14]"
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

      {historyVehicleId && (
        <VehicleHistoryModal
          vehicleId={historyVehicleId}
          onClose={() => setHistoryVehicleId(null)}
        />
      )}
    </main>
  );
}

function RecentActivityCard({
  items,
}: {
  items: {
    id: string;
    time: string;
    label: string;
    category: string;
    detail?: string;
    accent: Accent;
    icon: React.ReactNode;
  }[];
}) {
  return (
    <div
      className={`group relative overflow-hidden rounded-xl border p-5 bg-white dark:bg-[#1a1a14] border-slate-200 dark:border-[#2e2e25] transition-all duration-300 hover:-translate-y-0.5 ${ACCENTS.violet.glow}`}
    >
      <span
        className={`absolute inset-y-0 left-0 w-[3px] ${ACCENTS.violet.bar} opacity-60 group-hover:opacity-100 transition-opacity duration-300`}
      />

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`h-1.5 w-1.5 rounded-full ${ACCENTS.violet.dot} animate-pulse`} />
          <span className="text-[11px] font-medium uppercase tracking-wider font-mono text-slate-500 dark:text-slate-400">
            Log Terbaru
          </span>
        </div>
        <div
          className={`flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 dark:border-[#2e2e25] ${ACCENTS.violet.text} transition-transform duration-300 group-hover:scale-110`}
        >
          <NotebookText className="h-4 w-4" />
        </div>
      </div>

      {items.length === 0 ? (
        <p className="mt-4 py-3 text-xs font-mono text-slate-400 dark:text-slate-500">
          Belum ada aktivitas
        </p>
      ) : (
        <table className="mt-3 w-full table-fixed border-collapse text-left">
          <thead>
            <tr className="border-b border-slate-200 dark:border-[#2e2e25]">
              <th className="w-[34%] pb-1.5 pr-2 text-[10px] font-semibold uppercase tracking-wider font-mono text-slate-400 dark:text-slate-500">
                Waktu
              </th>
              <th className="pb-1.5 pr-2 text-[10px] font-semibold uppercase tracking-wider font-mono text-slate-400 dark:text-slate-500">
                Aktivitas
              </th>
              <th className="w-[26%] pb-1.5 text-right text-[10px] font-semibold uppercase tracking-wider font-mono text-slate-400 dark:text-slate-500">
                Sumber
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr
                key={item.id}
                className="border-b border-slate-100 dark:border-[#22221a] last:border-0"
              >
                <td className="py-1.5 pr-2 align-top">
                  <div className="flex items-center gap-2">
                    <span
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-current/10 ${ACCENTS[item.accent].text}`}
                    >
                      {item.icon}
                    </span>
                    <div className="leading-tight">
                      <p className="text-[11px] font-semibold font-mono tabular-nums text-slate-700 dark:text-slate-300">
                        {formatRecentTime(item.time).time}
                      </p>
                      <p className="text-[10px] font-mono text-slate-400 dark:text-slate-500">
                        {formatRecentTime(item.time).dateLabel}
                      </p>
                    </div>
                  </div>
                </td>
                <td className="py-1.5 pr-2 align-top">
                  <p className="truncate text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                    {item.label}
                  </p>
                  <p className="truncate text-[10px] font-mono text-slate-400 dark:text-slate-500">
                    {item.detail || "—"}
                  </p>
                </td>
                <td className="py-1.5 text-right align-top">
                  <span
                    className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-mono font-medium bg-current/10 ${ACCENTS[item.accent].text}`}
                  >
                    {item.category}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// --- KPI COMPONENTS ---

// Satu warna semantik per kategori, dipakai konsisten untuk garis aksen,
// badge ikon, glow saat hover, dan sparkline — bukan sekadar dekorasi.
const ACCENTS = {
  blue: {
    text: "text-blue-600 dark:text-blue-400",
    bar: "bg-blue-500",
    dot: "bg-blue-500",
    glow: "hover:shadow-[0_16px_36px_-16px_rgba(59,130,246,0.45)]",
    stroke: "#3b82f6",
  },
  amber: {
    text: "text-amber-600 dark:text-amber-400",
    bar: "bg-amber-500",
    dot: "bg-amber-500",
    glow: "hover:shadow-[0_16px_36px_-16px_rgba(245,158,11,0.45)]",
    stroke: "#f59e0b",
  },
  emerald: {
    text: "text-emerald-600 dark:text-emerald-400",
    bar: "bg-emerald-500",
    dot: "bg-emerald-500",
    glow: "hover:shadow-[0_16px_36px_-16px_rgba(16,185,129,0.45)]",
    stroke: "#10b981",
  },
  rose: {
    text: "text-rose-600 dark:text-rose-400",
    bar: "bg-rose-500",
    dot: "bg-rose-500",
    glow: "hover:shadow-[0_16px_36px_-16px_rgba(244,63,94,0.45)]",
    stroke: "#f43f5e",
  },
  violet: {
    text: "text-violet-600 dark:text-violet-400",
    bar: "bg-violet-500",
    dot: "bg-violet-500",
    glow: "hover:shadow-[0_16px_36px_-16px_rgba(139,92,246,0.45)]",
    stroke: "#8b5cf6",
  },
  orange: {
    text: "text-orange-600 dark:text-orange-400",
    bar: "bg-orange-500",
    dot: "bg-orange-500",
    glow: "hover:shadow-[0_16px_36px_-16px_rgba(249,115,22,0.45)]",
    stroke: "#f97316",
  },
} as const;

type Accent = keyof typeof ACCENTS;

function KpiSparkline({ data, color }: { data: number[]; color: string }) {
  if (!data || data.length < 2) return null;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const points = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * 100;
      const y = 22 - ((v - min) / range) * 22;
      return `${x},${y}`;
    })
    .join(" ");
  return (
    <svg viewBox="0 0 100 22" preserveAspectRatio="none" className="h-5 w-full">
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={0.75}
      />
    </svg>
  );
}

function KpiCard({
  icon,
  accent = "blue",
  label,
  value,
  hint,
  trend,
  sparklineData,
  detail,
  isLoading,
}: {
  icon: React.ReactNode;
  accent?: Accent;
  label: string;
  value: string;
  hint?: string;
  trend?: string;
  sparklineData?: number[];
  detail?: React.ReactNode;
  isLoading?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const a = ACCENTS[accent];

  return (
    <div
      onClick={() => detail && setOpen((o) => !o)}
      className={`group relative overflow-hidden rounded-xl border p-5 bg-white dark:bg-[#1a1a14] border-slate-200 dark:border-[#2e2e25] transition-all duration-300 hover:-translate-y-0.5 ${a.glow} ${
        detail ? "cursor-pointer" : ""
      }`}
    >
      <span
        className={`absolute inset-y-0 left-0 w-[3px] ${a.bar} opacity-60 group-hover:opacity-100 transition-opacity duration-300`}
      />

      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <span className={`h-1.5 w-1.5 rounded-full ${a.dot}`} />
          <span className="text-[11px] font-medium uppercase tracking-wider font-mono text-slate-500 dark:text-slate-400">
            {label}
          </span>
        </div>
        <div
          className={`flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 dark:border-[#2e2e25] ${a.text} transition-transform duration-300 group-hover:scale-110`}
        >
          {icon}
        </div>
      </div>

      <div className="mt-3 flex items-end justify-between gap-2">
        {isLoading ? (
          <div className="h-8 w-16 animate-pulse rounded bg-slate-200 dark:bg-[#22221a]" />
        ) : (
          <p className="text-3xl font-bold tracking-tight font-space tabular-nums text-slate-900 dark:text-slate-100">
            {value}
          </p>
        )}
        {trend && !isLoading && (
          <span className={`mb-1 text-[11px] font-mono font-medium ${a.text}`}>{trend}</span>
        )}
      </div>

      {sparklineData && !isLoading && (
        <div className="mt-2">
          <KpiSparkline data={sparklineData} color={a.stroke} />
        </div>
      )}

      <p className="mt-1 text-xs font-mono text-slate-500 dark:text-slate-400">{hint}</p>

      {detail && (
        <div
          className={`grid transition-all duration-300 ease-out ${
            open
              ? "grid-rows-[1fr] opacity-100 mt-3 pt-3 border-t border-slate-200 dark:border-[#2e2e25]"
              : "grid-rows-[0fr] opacity-0"
          }`}
        >
          <div className="overflow-hidden">{detail}</div>
        </div>
      )}
    </div>
  );
}

function KpiCardBreakdown({
  icon,
  accent = "blue",
  label,
  breakdown,
  hint,
  isLoading,
}: {
  icon: React.ReactNode;
  accent?: Accent;
  label: string;
  breakdown: { mobil: number; truk: number };
  hint?: string;
  isLoading?: boolean;
}) {
  const a = ACCENTS[accent];
  const total = breakdown.mobil + breakdown.truk;
  const mobilPct = total > 0 ? (breakdown.mobil / total) * 100 : 50;

  return (
    <div
      className={`group relative overflow-hidden rounded-xl border p-5 bg-white dark:bg-[#1a1a14] border-slate-200 dark:border-[#2e2e25] transition-all duration-300 hover:-translate-y-0.5 ${a.glow}`}
    >
      <span
        className={`absolute inset-y-0 left-0 w-[3px] ${a.bar} opacity-60 group-hover:opacity-100 transition-opacity duration-300`}
      />

      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <span className={`h-1.5 w-1.5 rounded-full ${a.dot}`} />
          <span className="text-[11px] font-medium uppercase tracking-wider font-mono text-slate-500 dark:text-slate-400">
            {label}
          </span>
        </div>
        <div
          className={`flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 dark:border-[#2e2e25] ${a.text} transition-transform duration-300 group-hover:scale-110`}
        >
          {icon}
        </div>
      </div>

      {isLoading ? (
        <div className="mt-4 flex items-center gap-3">
          <div className="h-6 w-10 animate-pulse rounded bg-slate-200 dark:bg-[#22221a]" />
          <div className="h-6 w-10 animate-pulse rounded bg-slate-200 dark:bg-[#22221a]" />
        </div>
      ) : (
        <>
          <div className="mt-3 flex items-baseline gap-5">
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-bold font-space tabular-nums text-slate-900 dark:text-slate-100">
                {breakdown.mobil}
              </span>
              <span className="flex items-center gap-1 text-xs font-mono text-slate-500 dark:text-slate-400">
                <Car className="h-3 w-3 text-blue-500" /> Mobil
              </span>
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-bold font-space tabular-nums text-slate-900 dark:text-slate-100">
                {breakdown.truk}
              </span>
              <span className="flex items-center gap-1 text-xs font-mono text-slate-500 dark:text-slate-400">
                <Truck className="h-3 w-3 text-orange-500" /> Truk
              </span>
            </div>
          </div>

          <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-[#13130e]">
            <div
              className="h-full bg-blue-500 transition-all duration-500"
              style={{ width: `${mobilPct}%` }}
            />
          </div>
        </>
      )}

      <p className="mt-2 text-xs font-mono text-slate-500 dark:text-slate-400">{hint}</p>
    </div>
  );
}
