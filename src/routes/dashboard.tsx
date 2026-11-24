import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { API_BASE_URL } from "@/lib/api-config";
import { useState, useMemo, useEffect } from "react";
import { toast } from "sonner";
import { authFetch } from "@/lib/auth";
import { DateRangeFilter } from "@/components/DateRangeFilter";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  Car,
  Truck,
  Boxes,
  CameraOff,
  Package,
  NotebookText,
  Calendar,
  Box,
  X,
  MapPin,
  Flag,
  BarChart3,
  RotateCcw,
  Loader2,
  History,
  CalendarRange,
  ShipWheel,
  ArrowRight,
  VideoOff,
} from "lucide-react";
import {
  formatDateTime,
  generateAutoDescription,
  classifyMuatanProcess,
  classifyAktivitas, // [AKTIVITAS]
  classifyAktivitasFromEvents, // [AKTIVITAS]
} from "@/lib/evidence";
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
  status_aktivitas?: string | null; // [AKTIVITAS]
  jenis_kejadian?: string;
  track_id?: number;
  vehicle_id?: string | null;
  plat_nomor?: string | null;
  plat_confidence?: number | null;
};
type TrackingEvent = {
  id: number;
  event_time: string;
  event_type: string;
  aruco_id: number;
  zone: string;
  from_zone: string | null;
  to_zone: string | null;
  po_number: string | null;
  pallet_id: number | null;
};
type RecentDocument = {
  id: number;
  jenis_dokumen: string;
  judul: string | null;
  po_number: string | null;
  jumlah_pallet: number | null;
  created_at: string;
};
type TrackingSummary = {
  po_aktif: number;
  po_perlu_acc: number;
  total_pallet: number;
  present: number;
  missing: number;
  unseen: number;
  pending_approval: number;
  moved_today: number;
};
const TRACKING_EVENT_LABEL: Record<string, string> = {
  NEW: "Pertama terbaca",
  MOVED_ZONE: "Pindah zona",
  MOVED_POS: "Bergeser posisi",
  MISSING: "Hilang",
  RETURNED: "Terlihat kembali",
  COMPLETED_OUTBOUND: "Selesai (outbound)",
  APPROVED: "Disetujui selesai",
};
function trackingZoneText(e: TrackingEvent) {
  if (e.event_type === "MOVED_ZONE") return `${e.from_zone ?? "?"} → ${e.to_zone ?? "?"}`;
  return e.zone || e.to_zone || e.from_zone || "-";
}
type CameraOfflineEvent = { id: number; camera: string; class_name: string; created_at: string };
type VehicleIntervalRaw = { hour: string; jenis_kendaraan: string; total: number };

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

type ActivityItem = {
  id: string;
  time: string;
  label: string;
  category: string;
  detail?: string;
  accent: Accent;
  icon: React.ReactNode;
  onSelect: () => void;
};

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
        content: "Dashboard pemantauan tracking PO, kamera, dan kendaraan.",
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
  const navigate = useNavigate();
  const goTracking = () => navigate({ to: "/logs/tracking" });
  const [trackingDetail, setTrackingDetail] = useState<TrackingEvent | null>(null);
  // Popup detail untuk kartu "Tracking PO" (per nomor PO, bukan per kejadian)
  const [trackingPoDetail, setTrackingPoDetail] = useState<string | null>(null);

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

  const { data: vehicles = [], dataUpdatedAt: vehiclesAt } = useQuery<VehicleLog[]>({
    queryKey: ["vehicle_log", "preview", filterClass, startDate, endDate],
    meta: { showErrorToast: true, errorLabel: "Log Kendaraan" },
    refetchInterval: 15000,
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
  const { data: trackingEvents = [], dataUpdatedAt: eventsAt } = useQuery<TrackingEvent[]>({
    queryKey: ["tracking_events", "preview", startDate, endDate],
    meta: { showErrorToast: true, errorLabel: "Tracking PO" },
    refetchInterval: 15000,
    queryFn: async () => {
      const params = new URLSearchParams({ limit: "4" });
      if (startDate) params.append("start_date", startDate);
      if (endDate) params.append("end_date", endDate);
      const res = await authFetch(`${API_BASE_URL}/api/tracking/events?${params}`);
      if (!res.ok) throw new Error(`Server merespons status ${res.status}`);
      const json = await res.json();
      return Array.isArray(json) ? json : json.data || [];
    },
  });
  // Kartu "Tracking PO": SATU baris = SATU PO (ringkasan gabungan semua pallet-nya),
  // bukan daftar kejadian. Sudah terurut dari backend: PO yang perlu ACC dulu,
  // lalu yang kejadiannya paling baru.
  const { data: trackingPos = [], dataUpdatedAt: posAt } = useQuery<QuickPoRow[]>({
    queryKey: ["tracking_pos", "preview"],
    meta: { showErrorToast: true, errorLabel: "Tracking PO" },
    refetchInterval: 15000,
    queryFn: async () => {
      const params = new URLSearchParams({ limit: String(PREVIEW_LIMIT) });
      const res = await authFetch(`${API_BASE_URL}/api/tracking/pos?${params}`);
      if (!res.ok) throw new Error(`Server merespons status ${res.status}`);
      const json = await res.json();
      return json?.data || [];
    },
  });
  const {
    data: trackingSummary,
    isLoading: isTrackingSummaryLoading,
    dataUpdatedAt: summaryAt,
  } = useQuery<TrackingSummary>({
    queryKey: ["tracking_summary"],
    meta: { showErrorToast: true, errorLabel: "Ringkasan Tracking PO" },
    refetchInterval: 15000,
    queryFn: async () => {
      const res = await authFetch(`${API_BASE_URL}/api/tracking/summary`);
      if (!res.ok) throw new Error(`Server merespons status ${res.status}`);
      return res.json();
    },
  });
  const { data: offlineCams = [], dataUpdatedAt: camsAt } = useQuery<CameraOfflineEvent[]>({
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
  const { data: recentDocuments = [] } = useQuery<RecentDocument[]>({
    queryKey: ["documents", "recent_preview"],
    meta: { showErrorToast: true, errorLabel: "Dokumen terbaru" },
    refetchInterval: 15000,
    queryFn: async () => {
      const res = await authFetch(`${API_BASE_URL}/api/documents?limit=${PREVIEW_LIMIT}`);
      if (!res.ok) throw new Error(`Server merespons status ${res.status}`);
      const json = await res.json();
      return json?.data || [];
    },
  });
  const {
    data: vehicleIntervalRaw = [],
    isLoading: isVehicleIntervalLoading,
    dataUpdatedAt: intervalAt,
  } = useQuery<VehicleIntervalRaw[]>({
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
  const {
    data: cameraStats,
    isLoading: isCameraStatsLoading,
    dataUpdatedAt: camStatsAt,
  } = useQuery<{ mati: number }>({
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
    // Aturan yang sama dengan buildHourlyFromStats: mengandung "Truk" = Truk, selain itu Mobil.
    vehicleIntervalRaw.forEach((item) => {
      const n = Number(item.total) || 0;
      if ((item.jenis_kendaraan || "").includes("Truk")) truk += n;
      else mobil += n;
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

  // Feed "Log Terbaru": gabungan 3 sumber (kendaraan, tracking PO, kamera
  // offline), MURNI diurutkan dari yang paling baru -- tidak ada
  // "pemaksaan" supaya tiap kategori kebagian slot. Kalau kebetulan 4
  // aktivitas paling baru semuanya kendaraan, ya ditampilkan begitu apa
  // adanya; kalau tidak ada tracking/kamera yang cukup baru, tidak akan
  // dipaksakan muncul.
  const recentActivity = useMemo(() => {
    // FIX: sebelumnya feed ini memakai EVENT mentah (tiap baris vehicle_log),
    // sedangkan kartu "Log Kendaraan" memakai SIKLUS (Masuk+Keluar digabung per
    // vehicle_id). Akibatnya data tidak sinkron: jenis kendaraan bisa beda
    // (event Keluar terbaca "Mobil" padahal Masuk "Truk"), dan event perantara
    // ikut tampil sebagai baris sendiri. Sekarang feed memakai grup siklus yang
    // sama dengan kartu di bawah, dengan label jenis dari event MASUK.
    const vehicleItems: ActivityItem[] = groupedVehicles.map((g) => {
      const masuk = g.events.find((e) => e.jenis_kejadian === "MASUK") || g.events[0];
      // Urutan kartu memakai waktu catatan masuk ke sistem (created_at),
      // bukan timestamp deteksi yang bisa lebih lama dari waktu pencatatannya.
      const latest = g.events.reduce((newest, event) =>
        new Date(event.created_at || event.timestamp).getTime() >
        new Date(newest.created_at || newest.timestamp).getTime()
          ? event
          : newest,
      );
      const isTruk = (masuk.jenis_kendaraan || "").includes("Truk");
      return {
        id: `vehicle-${g.key}`,
        time: latest.created_at || latest.timestamp,
        label: masuk.jenis_kendaraan || "Kendaraan",
        category: "Kendaraan",
        detail: masuk.plat_nomor || latest.plat_nomor || masuk.kamera_nama || undefined,
        accent: isTruk ? "orange" : "blue",
        icon: isTruk ? <Truck className="h-3.5 w-3.5" /> : <Car className="h-3.5 w-3.5" />,
        onSelect: () =>
          g.events.length >= 2 ? setHistoryVehicleId(g.key) : setSelectedVehicle(g.events[0]),
      };
    });

    const trackingItems: ActivityItem[] = trackingEvents.map((e) => ({
      id: `tracking-${e.id}`,
      time: e.event_time,
      label: TRACKING_EVENT_LABEL[e.event_type] ?? e.event_type,
      category: "Tracking",
      detail: `${e.po_number ?? `Marker ${e.aruco_id}`} · ${trackingZoneText(e)}`,
      accent: e.event_type === "MISSING" ? "rose" : "amber",
      icon: <Package className="h-3.5 w-3.5" />,
      onSelect: () => setTrackingDetail(e),
    }));

    const cameraItems: ActivityItem[] = offlineCams.map((c) => ({
      id: `camera-${c.id}`,
      time: c.created_at,
      label: "Offline",
      category: "Kamera",
      detail: c.camera || undefined,
      accent: "rose",
      icon: <VideoOff className="h-3.5 w-3.5" />,
      onSelect: () => navigate({ to: "/logs/cameras" }),
    }));

    const documentItems: ActivityItem[] = recentDocuments.map((doc) => ({
      id: `document-${doc.id}`,
      time: doc.created_at,
      label: doc.judul || doc.jenis_dokumen || "Dokumen baru",
      category: "Dokumen",
      detail:
        [doc.po_number, doc.jumlah_pallet ? `${doc.jumlah_pallet} pallet` : null]
          .filter(Boolean)
          .join(" · ") || undefined,
      accent: "violet",
      icon: <NotebookText className="h-3.5 w-3.5" />,
      onSelect: () => navigate({ to: "/logs/documents" }),
    }));

    const parseTime = (iso: string | null | undefined) => {
      if (!iso) return 0;
      const t = new Date(iso).getTime();
      return Number.isFinite(t) ? t : 0;
    };

    return [...vehicleItems, ...trackingItems, ...cameraItems, ...documentItems]
      .sort((a, b) => parseTime(b.time) - parseTime(a.time))
      .slice(0, PREVIEW_LIMIT);
  }, [groupedVehicles, trackingEvents, offlineCams, recentDocuments, navigate]);

  const vehicleHourly = useMemo(
    () => buildHourlyFromStats(vehicleIntervalRaw),
    [vehicleIntervalRaw],
  );
  const camerasDown = Number(cameraStats?.mati ?? 0);
  // Waktu terakhir browser berhasil mengambil data dari server (yang terbaru di antara semua query halaman ini)
  const lastUpdatedAt = Math.max(
    vehiclesAt,
    eventsAt,
    posAt,
    summaryAt,
    camsAt,
    intervalAt,
    camStatsAt,
  );
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
              Aktivitas tracking PO, kendaraan, & kamera
            </p>
          </div>
          <LastUpdated at={lastUpdatedAt} />
        </div>
      </div>

      <div className="mx-auto max-w-[1680px] px-6 py-6">
        <div className="relative z-20 mb-8 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-[#2e2e25] dark:bg-[#13130e]">
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
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4 items-start mb-8">
          {/* PO Aktif: ringkasan posisi saat ini dari /api/tracking/summary
              (bukan hitungan per rentang tanggal). */}
          <KpiCard
            icon={
              <div className="relative flex items-center justify-center">
                <Boxes className="h-5 w-5 text-amber-600 dark:text-amber-400 z-10" />
                {(trackingSummary?.pending_approval ?? 0) > 0 && (
                  <span className="animate-pulse absolute inline-flex h-full w-full rounded-full bg-amber-500/20"></span>
                )}
              </div>
            }
            accent="amber"
            label="PO Aktif"
            value={String(trackingSummary?.po_aktif ?? 0)}
            hint={
              trackingSummary
                ? `${trackingSummary.total_pallet} pallet${trackingSummary.pending_approval > 0 ? ` · ${trackingSummary.pending_approval} perlu ACC` : ` · ${trackingSummary.missing} hilang`}`
                : "Memuat…"
            }
            isLoading={isTrackingSummaryLoading}
            onClick={() => goTracking()}
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
              camerasDown === 0
                ? `${TOTAL_CAMERAS}/${TOTAL_CAMERAS} Kamera Beroperasi`
                : `dari ${TOTAL_CAMERAS} total kamera`
            }
            isLoading={isCameraStatsLoading}
            onClick={() => navigate({ to: "/logs/cameras" })}
          />
          {/* Total Kendaraan */}
          <KpiCardBreakdown
            icon={<Car className="h-5 w-5" />}
            accent="blue"
            label="Total Kendaraan"
            breakdown={todayBreakdown}
            hint={startDate || endDate ? "Pada periode terpilih" : "Terekam hari ini"}
            isLoading={isVehicleIntervalLoading}
            onClick={() => navigate({ to: "/logs/vehicles" })}
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
                            e.jenis_kejadian === "SIKLUS_SELESAI" || e.jenis_kejadian === "KELUAR",
                        ) || group.events[group.events.length - 1];
                      const platNomor = masuk.plat_nomor || keluar.plat_nomor;

                      const isTrukGroup = masuk.jenis_kendaraan.includes("Truk");
                      const muatanEventsPrev = group.events
                        .filter((e) => e.status_muatan && e.status_muatan.trim() !== "")
                        .sort(
                          (a, b) =>
                            new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
                        );
                      // [AKTIVITAS] status_aktivitas dari activity_estimator diutamakan; data lama (tanpa status_aktivitas)
                      // tetap memakai klasifikasi lama dari status_muatan.
                      const muatanProcessPrev =
                        (isTrukGroup ? classifyAktivitasFromEvents(group.events) : null) ??
                        (isTrukGroup && muatanEventsPrev.length >= 1
                          ? classifyMuatanProcess(
                              muatanEventsPrev[0].status_muatan,
                              muatanEventsPrev[muatanEventsPrev.length - 1].status_muatan,
                            )
                          : null);

                      return (
                        <div
                          key={group.key}
                          onClick={() => setHistoryVehicleId(group.key)}
                          className="flex gap-3.5 items-center p-3 rounded-xl border border-slate-100 dark:border-[#26261e]/80 bg-slate-50/50 dark:bg-[#13130e]/40 cursor-pointer hover:border-indigo-200 dark:hover:border-indigo-900/50 hover:bg-indigo-50/30 dark:hover:bg-indigo-950/20 transition-all duration-200 shadow-sm"
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
                    // [AKTIVITAS] badge aktivitas menggantikan badge status muatan
                    const aktivitasV = isTruk ? classifyAktivitas(v.status_aktivitas) : null;
                    if (aktivitasV) {
                      const textColor =
                        aktivitasV.tone === "loading"
                          ? "text-orange-600 dark:text-orange-400"
                          : aktivitasV.tone === "unloading"
                            ? "text-emerald-700 dark:text-emerald-400"
                            : "text-slate-500 dark:text-slate-400";
                      muatanBadge = (
                        <span
                          className={`inline-flex items-center gap-1 text-[11px] font-medium mt-0.5 ${textColor}`}
                        >
                          <Box className="h-3 w-3" />
                          {aktivitasV.label}
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
                      v.jenis_kejadian === "SIKLUS_SELESAI" ||
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
                <Boxes className="h-4 w-4 text-slate-500 dark:text-slate-400" /> Tracking PO
              </span>
              <Link
                to="/logs/tracking"
                className="group inline-flex items-center gap-1.5 rounded-lg border border-slate-200/80 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-600 shadow-sm transition-all duration-200 hover:border-indigo-200 hover:bg-indigo-50/50 hover:text-indigo-600 dark:border-[#26261e] dark:bg-[#13130e]/60 dark:text-slate-400 dark:hover:border-indigo-500/30 dark:hover:bg-indigo-500/10 dark:hover:text-indigo-400"
              >
                <span>Lihat semua</span>
                <ArrowRight className="h-3.5 w-3.5 text-slate-400 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-indigo-600 dark:text-slate-500 dark:group-hover:text-indigo-400" />
              </Link>
            </div>
            {trackingPos.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Boxes className="h-12 w-12 mb-3 text-slate-400" strokeWidth={1.5} />
                <h4 className="text-base font-semibold font-space text-slate-700 dark:text-slate-300">
                  Belum Ada PO Aktif
                </h4>
                <p className="mt-1 text-sm font-mono text-slate-500 dark:text-slate-400">
                  PO muncul setelah dokumen dipindai dan marker ditempel
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {trackingPos.slice(0, PREVIEW_LIMIT).map((po) => {
                  const chips = quickPoChips(po);
                  const zones = zoneCountsQuick(po.zones);
                  const urgent = po.pending_approval > 0;
                  const done = po.active_pallet === 0;
                  return (
                    <div
                      key={po.document_id}
                      onClick={() => setTrackingPoDetail(po.po_number)}
                      className="flex gap-3.5 items-center p-3 rounded-xl border border-slate-100 dark:border-[#26261e]/80 bg-slate-50/50 dark:bg-[#13130e]/40 cursor-pointer hover:bg-slate-100/50 dark:hover:bg-[#1a1a14]/40 transition-all duration-200 shadow-sm"
                    >
                      <div
                        className={`flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-lg ${
                          urgent
                            ? "bg-red-500/10 text-red-600 dark:text-red-400"
                            : done
                              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                              : "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                        }`}
                      >
                        <Package className="h-6 w-6" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-medium truncate text-slate-900 dark:text-slate-100">
                            {po.po_number ?? "PO tidak diketahui"}
                          </p>
                          <span className="shrink-0 text-[11px] font-mono text-slate-500 dark:text-slate-400">
                            {po.active_pallet > 0
                              ? `${po.active_pallet} pallet aktif${po.completed_pallet > 0 ? ` · ${po.completed_pallet} selesai` : ""}`
                              : `${po.completed_pallet} pallet selesai`}
                          </span>
                        </div>

                        {chips.length > 0 && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {chips.map((c) => (
                              <span
                                key={c.label}
                                className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold font-mono ${c.cls}`}
                              >
                                {c.label}
                              </span>
                            ))}
                          </div>
                        )}

                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                          {zones.length > 0 ? (
                            zones.map(([z, n]) => (
                              <span key={z} className="inline-flex items-center gap-1">
                                <MapPin className="h-3 w-3" /> {z}
                                {zones.length > 1 || n > 1 ? (
                                  <span className="font-mono text-slate-400 dark:text-slate-500">
                                    ×{n}
                                  </span>
                                ) : null}
                              </span>
                            ))
                          ) : (
                            <span className="inline-flex items-center gap-1">
                              <MapPin className="h-3 w-3" /> {done ? "Selesai" : "Belum ada posisi"}
                            </span>
                          )}
                          {po.zone_moves > 0 && <span>{po.zone_moves}× pindah zona</span>}
                        </div>

                        <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                          {done
                            ? po.completed_at
                              ? `Selesai ${timeAgo(po.completed_at)}`
                              : "Selesai"
                            : po.last_event_time
                              ? `Kejadian terakhir ${timeAgo(po.last_event_time)} · ${formatDateTime(po.last_event_time)}`
                              : "Belum ada kejadian"}
                        </p>
                      </div>
                    </div>
                  );
                })}
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
                  onClick={() => navigate({ to: "/logs/cameras" })}
                  className="flex items-center justify-between p-3 rounded-lg border bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-900/50 cursor-pointer hover:bg-red-100 dark:hover:bg-red-950/40 transition-colors"
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

                {/* [AKTIVITAS] Kotak aktivitas (Loading / Unloading) menggantikan kotak "Muatan Terdeteksi" */}
                {selectedVehicle.jenis_kendaraan.includes("Truk") &&
                  (() => {
                    const akt = classifyAktivitas(selectedVehicle.status_aktivitas);
                    if (!akt) return null;
                    const warna =
                      akt.tone === "loading"
                        ? "bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-900/50"
                        : akt.tone === "unloading"
                          ? "bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-900/50"
                          : "bg-slate-50 dark:bg-[#1a1a14]/40 border-slate-200 dark:border-[#2e2e25]";
                    const teks =
                      akt.tone === "loading"
                        ? "text-[#ea580c] dark:text-[#f97316]"
                        : akt.tone === "unloading"
                          ? "text-[#15803d] dark:text-[#34d399]"
                          : "text-[#64748b] dark:text-[#94a3b8]";
                    return (
                      <div
                        className={`mt-3 flex items-center gap-2 rounded-lg px-3 py-2 border ${warna}`}
                      >
                        <Box className={`h-5 w-5 ${teks}`} />
                        <div>
                          <p className="text-xs text-[#64748b] dark:text-[#94a3b8] font-mono uppercase tracking-wider">
                            Aktivitas Terdeteksi
                          </p>
                          <p className={`text-sm font-semibold font-mono ${teks}`}>{akt.label}</p>
                        </div>
                      </div>
                    );
                  })()}
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

      {trackingDetail && (
        <TrackingPoQuickModal
          poNumber={trackingDetail.po_number}
          event={trackingDetail}
          onClose={() => setTrackingDetail(null)}
        />
      )}

      {trackingPoDetail && (
        <TrackingPoQuickModal
          poNumber={trackingPoDetail}
          onClose={() => setTrackingPoDetail(null)}
        />
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
    onSelect: () => void;
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
                tabIndex={0}
                onClick={item.onSelect}
                onKeyDown={(ev) => {
                  if (ev.key === "Enter") item.onSelect();
                }}
                className="cursor-pointer border-b border-slate-100 dark:border-[#22221a] last:border-0 hover:bg-slate-50 dark:hover:bg-[#22221a]/60 transition-colors"
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
  onClick,
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
  onClick?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const a = ACCENTS[accent];

  return (
    <div
      onClick={() => (onClick ? onClick() : detail && setOpen((o) => !o))}
      className={`group relative overflow-hidden rounded-xl border p-5 bg-white dark:bg-[#1a1a14] border-slate-200 dark:border-[#2e2e25] transition-all duration-300 hover:-translate-y-0.5 ${a.glow} ${
        detail || onClick ? "cursor-pointer" : ""
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
  onClick,
}: {
  icon: React.ReactNode;
  accent?: Accent;
  label: string;
  breakdown: { mobil: number; truk: number };
  hint?: string;
  isLoading?: boolean;
  onClick?: () => void;
}) {
  const a = ACCENTS[accent];
  const total = breakdown.mobil + breakdown.truk;
  const mobilPct = total > 0 ? (breakdown.mobil / total) * 100 : 50;

  return (
    <div
      onClick={onClick}
      className={`group relative overflow-hidden rounded-xl border p-5 bg-white dark:bg-[#1a1a14] border-slate-200 dark:border-[#2e2e25] transition-all duration-300 hover:-translate-y-0.5 ${a.glow} ${
        onClick ? "cursor-pointer" : ""
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

// --- POPUP RINGKAS DETAIL PO (dari kartu Tracking PO & Log Terbaru) ---
// Versi singkat dari PoModal di halaman /logs/tracking: hanya baca data
// (tanpa riwayat, foto, atau tombol ACC) supaya dashboard tetap ringan.

type QuickPoRow = {
  document_id: number;
  po_number: string | null;
  total_pallet: number;
  active_pallet: number;
  completed_pallet: number;
  present: number;
  missing: number;
  unseen: number;
  pending_approval: number;
  zones: string[] | null;
  completed_at: string | null;
  po_created_at: string | null;
  first_seen: string | null;
  last_event_time: string | null;
  zone_moves: number;
  alert_level: number | null;
};
type QuickPalletRow = {
  pallet_id: number;
  pallet_no: number | null;
  aruco_id: number;
  current_zone: string | null;
  last_event_time: string | null;
  state: "PRESENT" | "MISSING" | "UNSEEN" | "COMPLETED";
  approval_status: "PENDING" | "APPROVED" | null;
};

const CHIP_GOOD = "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400";
const CHIP_BAD = "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400";
const CHIP_MUTED = "bg-slate-100 text-slate-600 dark:bg-[#13130e] dark:text-slate-400";

function timeAgo(iso: string | null | undefined) {
  if (!iso) return "-";
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms)) return "-";
  const m = Math.floor(Math.abs(ms) / 60000);
  if (m < 1) return "baru saja";
  if (m < 60) return `${m} mnt lalu`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} jam lalu`;
  return `${Math.floor(h / 24)} hari lalu`;
}

// ["A","A","B"] -> [["A",2],["B",1]]
function zoneCountsQuick(zones: string[] | null) {
  const m = new Map<string, number>();
  for (const z of zones ?? []) m.set(z, (m.get(z) ?? 0) + 1);
  return Array.from(m.entries());
}

function quickPoChips(r: QuickPoRow) {
  const chips: { label: string; cls: string }[] = [];
  if (r.active_pallet === 0) chips.push({ label: "Selesai", cls: CHIP_GOOD });
  if ((r.alert_level ?? 0) > 0)
    chips.push({ label: `Alert level ${r.alert_level}`, cls: CHIP_BAD });
  if (r.pending_approval > 0)
    chips.push({ label: `${r.pending_approval} perlu ACC`, cls: CHIP_BAD });
  const hilangLain = r.missing - r.pending_approval;
  if (hilangLain > 0) chips.push({ label: `${hilangLain} hilang`, cls: CHIP_BAD });
  if (r.present > 0) chips.push({ label: `${r.present} terlihat`, cls: CHIP_GOOD });
  if (r.unseen > 0) chips.push({ label: `${r.unseen} belum terbaca`, cls: CHIP_MUTED });
  return chips;
}

function quickPalletStatus(p: QuickPalletRow) {
  if (p.state === "COMPLETED") return { label: "Selesai", cls: CHIP_GOOD };
  if (p.approval_status === "PENDING") return { label: "Hilang · perlu ACC", cls: CHIP_BAD };
  if (p.state === "PRESENT") return { label: "Terlihat", cls: CHIP_GOOD };
  if (p.state === "MISSING") return { label: "Hilang", cls: CHIP_BAD };
  return { label: "Belum terbaca", cls: CHIP_MUTED };
}

function TrackingPoQuickModal({
  poNumber,
  event,
  onClose,
}: {
  poNumber: string | null;
  event?: TrackingEvent | null; // opsional: hanya ada kalau dibuka dari feed "Log Terbaru"
  onClose: () => void;
}) {
  const po = poNumber;

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") onClose();
    };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  // 1) Cari ringkasan PO dari nomor PO. Daftar /pos secara bawaan tampaknya hanya
  //    PO aktif, jadi kalau tidak ketemu dicoba lagi dengan state=COMPLETED.
  const {
    data: poRow,
    isLoading: poLoading,
    isError: poError,
    dataUpdatedAt: poAt,
  } = useQuery<QuickPoRow | null>({
    queryKey: ["tracking_quick_po", po],
    enabled: !!po,
    refetchInterval: 15000,
    queryFn: async () => {
      // Nomor PO gabungan ditulis "A, B" di feed kejadian tapi "A + B" di kartu PO.
      // Pecah dulu jadi nomor tunggal, cari lewat nomor pertama, lalu cocokkan ke kartu
      // yang memuat salah satu nomor itu.
      const parts = po!
        .split(/\s*[,+]\s*/)
        .map((x) => x.trim())
        .filter(Boolean);
      if (parts.length === 0) return null;
      for (const state of ["", "COMPLETED"]) {
        const params = new URLSearchParams({ search: parts[0], limit: "20" });
        if (state) params.append("state", state);
        const res = await authFetch(`${API_BASE_URL}/api/tracking/pos?${params}`);
        if (!res.ok) throw new Error(`Server merespons status ${res.status}`);
        const json = await res.json();
        const rows: QuickPoRow[] = json?.data || [];
        const found = rows.find((r) => {
          const nomor = (r.po_number ?? "").split(" + ").map((x) => x.trim());
          return r.po_number === po || parts.some((p) => nomor.includes(p));
        });
        if (found) return found;
      }
      return null;
    },
  });

  // 2) Daftar pallet milik PO itu
  const docId = poRow?.document_id;
  const {
    data: palletData,
    isLoading: palletsLoading,
    dataUpdatedAt: palletsAt,
  } = useQuery<{ pallets: QuickPalletRow[] }>({
    queryKey: ["tracking_quick_pallets", docId],
    enabled: !!docId,
    refetchInterval: 15000,
    queryFn: async () => {
      const res = await authFetch(`${API_BASE_URL}/api/tracking/pos/${docId}/pallets`);
      if (!res.ok) throw new Error(`Server merespons status ${res.status}`);
      return res.json();
    },
  });
  const pallets = palletData?.pallets ?? [];

  const stats = poRow
    ? [
        { label: "Total", value: poRow.total_pallet, cls: "" },
        { label: "Terlihat", value: poRow.present, cls: "text-emerald-600 dark:text-emerald-400" },
        {
          label: "Hilang",
          value: poRow.missing,
          cls: poRow.missing > 0 ? "text-red-600 dark:text-red-400" : "",
        },
        { label: "Belum terbaca", value: poRow.unseen, cls: "" },
        { label: "Selesai", value: poRow.completed_pallet, cls: "" },
      ]
    : [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Detail PO ${po ?? ""}`}
        onClick={(e) => e.stopPropagation()}
        className="relative flex max-h-[85vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-900 shadow-2xl dark:border-[#2e2e25] dark:bg-[#1a1a14] dark:text-slate-100"
      >
        <button
          onClick={onClose}
          aria-label="Tutup"
          className="absolute right-3 top-3 rounded-full p-1.5 text-slate-500 transition-colors hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-[#22221a]"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="shrink-0 border-b border-slate-200 p-5 pr-12 dark:border-[#2e2e25]">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-bold font-space">
              {po ?? (event ? `Marker ID ${event.aruco_id}` : "PO tidak diketahui")}
            </h2>
            {poRow &&
              quickPoChips(poRow).map((c) => (
                <span
                  key={c.label}
                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold font-mono ${c.cls}`}
                >
                  {c.label}
                </span>
              ))}
          </div>
          {poRow?.po_created_at && (
            <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
              PO masuk {formatDateTime(poRow.po_created_at)}
              {poRow.first_seen
                ? ` · barang pertama terdeteksi ${timeAgo(poRow.first_seen)}`
                : " · barang belum terdeteksi di warehouse"}
              {poRow.completed_at ? ` · selesai ${timeAgo(poRow.completed_at)}` : ""}
            </p>
          )}

          {/* Kejadian yang barusan diklik (hanya bila dibuka dari feed kejadian) */}
          {event && (
            <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs dark:border-[#2e2e25] dark:bg-[#13130e]">
              <p className="font-semibold text-slate-700 dark:text-slate-200">
                {TRACKING_EVENT_LABEL[event.event_type] ?? event.event_type}
                <span className="font-mono font-normal text-slate-500 dark:text-slate-400">
                  {" · "}Marker {event.aruco_id}
                </span>
              </p>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-3 font-mono text-slate-500 dark:text-slate-400">
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-3 w-3" /> {trackingZoneText(event)}
                </span>
                <span>{formatDateTime(event.event_time)}</span>
              </p>
            </div>
          )}
        </div>

        <div className="overflow-y-auto p-5">
          {!po ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Marker ini belum terhubung ke nomor PO, jadi hanya detail kejadiannya yang tersedia.
            </p>
          ) : poLoading ? (
            <div className="space-y-3">
              <div className="h-14 animate-pulse rounded-lg bg-slate-100 dark:bg-[#22221a]" />
              <div className="h-20 animate-pulse rounded-lg bg-slate-100 dark:bg-[#22221a]" />
            </div>
          ) : poError ? (
            <p className="text-sm text-red-600 dark:text-red-400">Gagal memuat detail PO.</p>
          ) : !poRow ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Detail PO {po} tidak ditemukan. Coba buka halaman Tracking PO.
            </p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                {stats.map((s) => (
                  <div
                    key={s.label}
                    className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 dark:border-[#2e2e25] dark:bg-[#13130e]"
                  >
                    <p className={`text-xl font-semibold font-space leading-none ${s.cls}`}>
                      {s.value}
                    </p>
                    <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      {s.label}
                    </p>
                  </div>
                ))}
              </div>

              <p className="mb-2 mt-5 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Daftar pallet
              </p>
              {palletsLoading ? (
                <div className="h-16 animate-pulse rounded-lg bg-slate-100 dark:bg-[#22221a]" />
              ) : pallets.length === 0 ? (
                <p className="text-sm text-slate-500 dark:text-slate-400">Belum ada pallet.</p>
              ) : (
                <ul className="space-y-2">
                  {pallets.map((p) => {
                    const st = quickPalletStatus(p);
                    const isThis = !!event && p.pallet_id === event.pallet_id;
                    return (
                      <li
                        key={p.pallet_id}
                        className={`rounded-lg border px-3 py-2 ${
                          isThis
                            ? "border-indigo-300 bg-indigo-50/50 dark:border-indigo-500/40 dark:bg-indigo-500/10"
                            : "border-slate-200 dark:border-[#2e2e25]"
                        }`}
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold font-space">
                            Pallet #{p.pallet_no ?? "?"}
                          </span>
                          <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-mono text-slate-500 dark:bg-[#13130e] dark:text-slate-400">
                            Marker {p.aruco_id}
                          </span>
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold font-mono ${st.cls}`}
                          >
                            {st.label}
                          </span>
                        </div>
                        <p className="mt-1 flex flex-wrap items-center gap-x-3 text-[11px] font-mono text-slate-500 dark:text-slate-400">
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="h-3 w-3" /> {p.current_zone ?? "Belum ada posisi"}
                          </span>
                          <span>
                            {p.last_event_time
                              ? `Kejadian terakhir ${timeAgo(p.last_event_time)}`
                              : "Belum terbaca"}
                          </span>
                        </p>
                      </li>
                    );
                  })}
                </ul>
              )}
            </>
          )}
        </div>

        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-slate-200 px-5 py-3 dark:border-[#2e2e25]">
          <div className="min-w-0 space-y-1">
            <LastUpdated at={poRow ? Math.max(poAt, palletsAt) : 0} />
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Riwayat pallet, foto, dan tindakan ACC ada di halaman Tracking PO.
            </p>
          </div>
          <Link
            to="/logs/tracking"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:border-indigo-200 hover:bg-indigo-50/50 hover:text-indigo-600 dark:border-[#26261e] dark:bg-[#13130e]/60 dark:text-slate-300 dark:hover:text-indigo-400"
          >
            Detail lengkap <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    </div>
  );
}

// Penanda "terakhir diperbarui": kapan browser terakhir berhasil mengambil data dari
// server. Titik jadi kuning kalau sudah > 2 menit (mis. tab di background / koneksi putus).
function LastUpdated({ at, compact = false }: { at: number; compact?: boolean }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 30000);
    return () => clearInterval(id);
  }, []);
  if (!at) return null;
  const d = new Date(at);
  const stale = Date.now() - at > 120000;
  const clock = d.toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const rel = timeAgo(d.toISOString());
  return (
    <span
      className="inline-flex items-center gap-1.5 text-[11px] font-mono text-slate-500 dark:text-slate-400"
      title={`Data terakhir diambil dari server: ${d.toLocaleString("id-ID")}${
        stale ? " — sudah lebih dari 2 menit, data mungkin belum terbaru" : ""
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${stale ? "bg-amber-500" : "bg-emerald-500"}`} />
      {compact ? `Dimuat ${rel}` : `Dimuat ${clock} · ${rel}`}
    </span>
  );
}
