import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  Pie,
  PieChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Legend,
  Area,
  ComposedChart,
} from "recharts";
import {
  ArrowRight,
  Package,
  CameraOff,
  AlertTriangle,
  Car,
  Boxes,
  Clock,
  Bell,
  ChevronRight,
  Circle,
} from "lucide-react";
import { formatDateTime } from "@/lib/evidence";
import companyLogo from "@/assets/aristides-logo.png";

const PREVIEW_LIMIT = 4;
const TOTAL_CAMERAS = 22;
const REFRESH_MS = 30000;

const TEMPLATE = {
  companyName: "PT Aristides Logistik Indonesia",
  location: "",
};

// --- TYPES ---
type VehicleLog = {
  id: number;
  timestamp: string;
  jenis_kendaraan: string;
  rgb_r: number;
  rgb_g: number;
  rgb_b: number;
  confidence: number;
  bbox_x1: number;
  bbox_y1: number;
  bbox_x2: number;
  bbox_y2: number;
  gambar_base64: string;
  created_at: string;
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

type CameraOfflineEvent = {
  id: number;
  camera: string;
  class_name: string;
  created_at: string;
};

type VehicleIntervalRaw = {
  hour: string;
  jenis_kendaraan: string;
  total: number;
};

type NotificationItem = {
  id: number;
  created_at: string;
  title?: string;
  message?: string;
  class_name?: string;
};

// --- HELPERS ---
const REPORT_HOURS = ["05:00", "08:00", "11:00", "14:00", "17:00"];
const CHART_COLORS = {
  blue: "#3b82f6",
  orange: "#f97316",
  green: "#10b981",
  purple: "#a855f7",
  red: "#ef4444",
  gray: "#6b7280",
};

function colorForClass(name: string, index: number) {
  const lower = name.toLowerCase();
  if (lower.includes("truk")) return CHART_COLORS.orange;
  if (lower.includes("mobil")) return CHART_COLORS.blue;
  if (lower.includes("motor")) return CHART_COLORS.green;
  return [CHART_COLORS.purple, CHART_COLORS.red, CHART_COLORS.gray][index % 3];
}

function pivotVehicleInterval(raw: VehicleIntervalRaw[]) {
  const classes = Array.from(new Set(raw.map((r) => r.jenis_kendaraan))).sort();
  const byHour = new Map<string, Record<string, number>>();
  REPORT_HOURS.forEach((h) => byHour.set(h, {}));
  raw.forEach((r) => {
    if (!byHour.has(r.hour)) byHour.set(r.hour, {});
    byHour.get(r.hour)![r.jenis_kendaraan] = r.total;
  });
  const chartData = REPORT_HOURS.map((hour) => {
    const row: Record<string, number | string> = { hour };
    classes.forEach((c) => {
      row[c] = byHour.get(hour)?.[c] ?? 0;
    });
    return row;
  });
  return { chartData, classes };
}

const DAY_ABBR = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
function getLast7DayLabels() {
  const labels: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    labels.push(DAY_ABBR[d.getDay()]);
  }
  return labels;
}

function fillWeeklyGaps(raw: { day: string; barang: number }[]) {
  const byDay = new Map(raw.map((r) => [r.day, Number(r.barang)]));
  return getLast7DayLabels().map((day) => ({ day, barang: byDay.get(day) ?? 0 }));
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

function getConfidenceTone(confidence: number) {
  if (confidence < 0.4) return { label: "Rendah", className: "bg-red-100 text-red-700 border-red-200" };
  if (confidence < 0.7) return { label: "Sedang", className: "bg-yellow-100 text-yellow-700 border-yellow-200" };
  return { label: "Tinggi", className: "bg-green-100 text-green-700 border-green-200" };
}

function ConfidenceBadge({ confidence }: { confidence: number }) {
  const { label, className } = getConfidenceTone(confidence);
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${className}`}>
      {label} · {confidence.toFixed(2)}
    </span>
  );
}

// --- ROUTE ---
export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard · Arsip Bukti Kejadian" },
      { name: "description", content: "Dashboard pemantauan deteksi barang, kamera, dan kendaraan." },
    ],
  }),
  component: Dashboard,
});

// --- MAIN COMPONENT ---
function Dashboard() {
  const [showNotifications, setShowNotifications] = useState(false);

  const { data: vehicles = [], dataUpdatedAt: vehiclesUpdatedAt } = useQuery({
    queryKey: ["vehicle_log", "preview"],
    queryFn: async () => {
      const res = await fetch('http://localhost:5000/api/vehicles/log');
      if (!res.ok) throw new Error('Gagal fetch vehicle logs');
      return res.json() as Promise<VehicleLog[]>;
    },
    refetchInterval: REFRESH_MS,
  });

  const { data: stagings = [], dataUpdatedAt: stagingsUpdatedAt } = useQuery({
    queryKey: ["staging_detections", "preview"],
    queryFn: async () => {
      const res = await fetch('http://localhost:5000/api/alerts?class_name=box');
      if (!res.ok) throw new Error('Gagal fetch alerts');
      return res.json() as Promise<StagingDetection[]>;
    },
    refetchInterval: REFRESH_MS,
  });

  const { data: offlineCams = [], dataUpdatedAt: offlineCamsUpdatedAt } = useQuery({
    queryKey: ["camera_offline_events", "preview"],
    queryFn: async () => {
      const res = await fetch('http://localhost:5000/api/alerts?class_name=' + encodeURIComponent('KAMERA OFFLINE'));
      if (!res.ok) throw new Error('Gagal fetch camera offline');
      return res.json() as Promise<CameraOfflineEvent[]>;
    },
    refetchInterval: REFRESH_MS,
  });

  const { data: detectionData = [], dataUpdatedAt: detectionUpdatedAt } = useQuery({
    queryKey: ["detection_weekly"],
    queryFn: async () => {
      const res = await fetch('http://localhost:5000/api/alerts/stats/weekly');
      if (!res.ok) throw new Error('Gagal fetch weekly stats');
      return res.json();
    },
    refetchInterval: REFRESH_MS,
  });

  const { data: cameraStats, dataUpdatedAt: cameraStatsUpdatedAt } = useQuery({
    queryKey: ["camera_status"],
    queryFn: async () => {
      const res = await fetch('http://localhost:5000/api/alerts/stats/camera-status');
      if (!res.ok) throw new Error('Gagal fetch camera status');
      return res.json();
    },
    refetchInterval: REFRESH_MS,
  });

  const { data: vehicleIntervalRaw = [], dataUpdatedAt: vehicleIntervalUpdatedAt } = useQuery({
    queryKey: ["vehicle_interval"],
    queryFn: async () => {
      const res = await fetch('http://localhost:5000/api/vehicles/stats/hourly');
      if (!res.ok) throw new Error('Gagal fetch vehicle interval');
      return res.json() as Promise<VehicleIntervalRaw[]>;
    },
    refetchInterval: REFRESH_MS,
  });

  const { data: notifications = [] } = useQuery({
    queryKey: ["notifications"],
    queryFn: async () => {
      const res = await fetch('http://localhost:5000/api/notifications');
      if (!res.ok) throw new Error('Gagal fetch notifications');
      return res.json() as Promise<NotificationItem[]>;
    },
    refetchInterval: REFRESH_MS,
  });

  const { chartData: vehicleHourly, classes: vehicleClasses } = pivotVehicleInterval(vehicleIntervalRaw);
  const detectionChartData = fillWeeklyGaps(detectionData);

  const lastFetchedAt = Math.max(
    vehiclesUpdatedAt,
    stagingsUpdatedAt,
    offlineCamsUpdatedAt,
    detectionUpdatedAt,
    cameraStatsUpdatedAt,
    vehicleIntervalUpdatedAt
  );
  const lastUpdateLabel = lastFetchedAt > 0 ? new Date(lastFetchedAt).toLocaleTimeString("id-ID") : "--.--.--";

  const totalDetections = detectionData.reduce((s: number, d: any) => s + Number(d.barang), 0);
  const camerasDown = Number(cameraStats?.mati ?? 0);
  const totalVehicles = vehicleIntervalRaw.reduce((s, r) => s + r.total, 0);

  const pieData = [
    { name: "Aktif", value: TOTAL_CAMERAS - camerasDown, color: CHART_COLORS.green },
    { name: "Mati", value: camerasDown, color: CHART_COLORS.red },
  ];

  return (
    <main className="min-h-screen bg-slate-50">
      {/* Header - same */}
      <header className="sticky top-0 z-20 border-b border-border bg-white/95 backdrop-blur-xl shadow-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-3">
          <div className="flex items-center gap-3">
            <Link
              to="/"
              className="transition-transform duration-200 hover:scale-105"
              aria-label="Kembali ke beranda"
            >
              <img
                src={companyLogo}
                alt={`Logo ${TEMPLATE.companyName}`}
                width={48}
                height={48}
                className="h-12 w-12 rounded-lg border border-border bg-background object-contain p-1"
              />
            </Link>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">
                {TEMPLATE.companyName}
              </p>
              <h1 className="truncate text-lg font-bold tracking-tight text-foreground">
                Warehouse Monitoring Dashboard
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden sm:flex flex-col items-center">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                <span className="text-xs font-medium text-green-600">Sistem Online</span>
              </div>
              <div className="text-center ml-4">
                <span className="text-[11px] text-muted-foreground">
                  Data terakhir di-fetch {lastUpdateLabel}
                </span>
              </div>
            </div>

            <div className="relative">
              <button
                onClick={() => setShowNotifications((v) => !v)}
                className="relative inline-flex h-9 w-9 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                aria-label="Notifikasi"
              >
                <Bell className="h-4 w-4" />
                {notifications.length > 0 && (
                  <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">
                    {notifications.length > 9 ? "9+" : notifications.length}
                  </span>
                )}
              </button>

              {showNotifications && (
                <div className="absolute right-0 z-30 mt-2 w-80 origin-top-right rounded-lg border border-border bg-card p-2 shadow-lg transition-all duration-200 scale-100 opacity-100">
                  <p className="px-2 py-1 text-xs font-semibold text-foreground">Notifikasi Terbaru</p>
                  {notifications.length === 0 ? (
                    <p className="px-2 py-4 text-center text-xs text-muted-foreground">Tidak ada notifikasi.</p>
                  ) : (
                    <ul className="max-h-72 divide-y divide-border overflow-y-auto">
                      {notifications.slice(0, 8).map((n) => (
                        <li key={n.id} className="px-2 py-2 text-xs">
                          <p className="font-medium text-foreground">
                            {n.title ?? n.message ?? n.class_name ?? "Notifikasi"}
                          </p>
                          <p className="mt-0.5 text-muted-foreground">{formatDateTime(n.created_at)}</p>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-6 py-8">
        {/* KPI cards - tidak banyak berubah, hanya background */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            icon={<Package className="h-5 w-5" />}
            label="Deteksi Staging (7 hari)"
            value={totalDetections.toLocaleString("id-ID")}
            hint="7 hari terakhir"
            tone="primary"
          />
          <KpiCard
            icon={<CameraOff className="h-5 w-5" />}
            label="Kamera Offline"
            value={String(camerasDown)}
            hint={`dari ${TOTAL_CAMERAS} kamera`}
            tone="destructive"
          />
          <KpiCard
            icon={<Car className="h-5 w-5" />}
            label="Aktivitas Kendaraan"
            value={String(totalVehicles)}
            hint="hari ini"
            tone="success"
          />
          <div className="rounded-lg border border-border bg-white p-5 shadow-sm transition-all duration-200 hover:shadow-md hover:-translate-y-0.5">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Insiden Tercatat</p>
              <div className="flex h-9 w-9 items-center justify-center rounded-md bg-muted text-muted-foreground">
                <AlertTriangle className="h-5 w-5" />
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Link to="/logs/cameras" className="-m-1 rounded-md p-1 transition-colors hover:bg-destructive/10">
                <p className="text-2xl font-bold tracking-tight text-destructive">{offlineCams.length}</p>
                <p className="text-[11px] text-muted-foreground">Kamera mati</p>
              </Link>
              <Link to="/logs/staging" className="-m-1 rounded-md p-1 transition-colors hover:bg-primary/10">
                <p className="text-2xl font-bold tracking-tight text-primary">{stagings.length}</p>
                <p className="text-[11px] text-muted-foreground">Barang staging</p>
              </Link>
            </div>
          </div>
        </div>

        {/* Charts row - DESIGN BARU */}
        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          {/* Chart 1: Deteksi Barang Mingguan - dengan warna solid dan label */}
          <div className="rounded-lg border border-border bg-white p-5 shadow-sm transition-all duration-200 hover:shadow-md hover:-translate-y-0.5">
            <div className="mb-3">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <span className="inline-block w-1 h-4 bg-blue-500 rounded-full"></span>
                Deteksi Barang Mingguan
              </h3>
              <p className="text-xs text-muted-foreground">Jumlah barang terdeteksi per hari</p>
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={detectionChartData} margin={{ top: 20, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                <XAxis dataKey="day" stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 12 }}
                  formatter={(value: number) => [`${value} barang`, 'Jumlah']}
                  labelFormatter={(label) => `Hari ${label}`}
                />
                <Bar dataKey="barang" fill="#3b82f6" radius={[4, 4, 0, 0]} maxBarSize={40}>
                  {detectionChartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.barang > 0 ? "#3b82f6" : "#e2e8f0"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div className="mt-1 text-center text-[10px] text-muted-foreground">
              Total: {detectionChartData.reduce((acc, d) => acc + d.barang, 0)} barang
            </div>
          </div>

          {/* Chart 2: Status Kamera - dengan label persentase di tengah */}
          <div className="rounded-lg border border-border bg-white p-5 shadow-sm transition-all duration-200 hover:shadow-md hover:-translate-y-0.5">
            <div className="mb-3">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <span className="inline-block w-1 h-4 bg-green-500 rounded-full"></span>
                Status Kamera
              </h3>
              <p className="text-xs text-muted-foreground">Distribusi kondisi seluruh kamera</p>
            </div>
            <div className="relative flex justify-center">
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={pieData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={60}
                    outerRadius={85}
                    paddingAngle={2}
                  >
                    {pieData.map((c) => (
                      <Cell key={c.name} fill={c.color} stroke="#fff" strokeWidth={2} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 12 }}
                    formatter={(value: number, name: string) => [`${value} kamera`, name]}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex items-center justify-center flex-col pointer-events-none">
                <span className="text-3xl font-bold text-slate-700">{TOTAL_CAMERAS - camerasDown}/{TOTAL_CAMERAS}</span>
                <span className="text-xs text-muted-foreground">Aktif</span>
              </div>
            </div>
            <div className="mt-1 flex justify-center gap-4 text-xs">
              <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full bg-green-500"></span> Aktif: {TOTAL_CAMERAS - camerasDown}</span>
              <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full bg-red-500"></span> Mati: {camerasDown}</span>
            </div>
          </div>

          {/* Chart 3: Deteksi Kendaraan Hari Ini - area chart dengan gradien */}
          <div className="rounded-lg border border-border bg-white p-5 shadow-sm transition-all duration-200 hover:shadow-md hover:-translate-y-0.5">
            <div className="mb-3">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <span className="inline-block w-1 h-4 bg-orange-500 rounded-full"></span>
                Deteksi Kendaraan Hari Ini
              </h3>
              <p className="text-xs text-muted-foreground">Per 3 jam, 05:00–17:00, per jenis kendaraan</p>
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={vehicleHourly} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                <XAxis dataKey="hour" stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis
                  stroke="#94a3b8"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={false}
                  domain={[0, (max: number) => Math.max(4, Math.ceil(max * 1.2))]}
                />
                <Tooltip
                  contentStyle={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 12 }}
                  formatter={(value: number) => [`${value} kendaraan`, '']}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" />
                {vehicleClasses.map((cls, i) => {
                  const stroke = colorForClass(cls, i);
                  return (
                    <Line
                      key={cls}
                      type="monotone"
                      dataKey={cls}
                      name={cls}
                      stroke={stroke}
                      strokeWidth={2.5}
                      dot={{ r: 4, fill: stroke, stroke: "#fff", strokeWidth: 1 }}
                      activeDot={{ r: 6 }}
                    />
                  );
                })}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Log Kendaraan & Staging - DIPERBAIKI agar tidak nyrimpet */}
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          {/* Log Kendaraan - dengan desain card yang rapi */}
          <div className="rounded-lg border border-border bg-white p-5 shadow-sm transition-all duration-200 hover:shadow-md hover:-translate-y-0.5">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Car className="h-4 w-4 text-primary" />
                <div>
                  <h2 className="text-sm font-semibold text-foreground">Log Kendaraan</h2>
                  <p className="text-xs text-muted-foreground">Deteksi kendaraan terbaru dari CCTV</p>
                </div>
              </div>
              <Link to="/logs/vehicles" className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/20">
                Lihat selengkapnya <ChevronRight className="h-3 w-3" />
              </Link>
            </div>
            {vehicles.length === 0 ? (
              <EmptyState text="Belum ada log kendaraan." />
            ) : (
              <>
                {vehicles.length > PREVIEW_LIMIT && (
                  <p className="mb-3 text-xs text-muted-foreground">Menampilkan {PREVIEW_LIMIT} dari {vehicles.length} log</p>
                )}
                <div className="space-y-3">
                  {(vehicles as VehicleLog[]).slice(0, PREVIEW_LIMIT).map((v) => (
                    <div key={v.id} className="flex items-start gap-3 p-3 rounded-lg border border-border/60 hover:border-primary/20 hover:bg-slate-50 transition-colors">
                      <img
                        src={`data:image/jpeg;base64,${v.gambar_base64}`}
                        alt={`Kendaraan ${v.jenis_kendaraan}`}
                        loading="lazy"
                        className="h-16 w-20 rounded object-cover border border-border flex-shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-semibold text-foreground truncate">
                            {v.jenis_kendaraan}
                          </span>
                          <ConfidenceBadge confidence={Number(v.confidence)} />
                        </div>
                        <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          <span>{formatDateTime(v.timestamp)}</span>
                        </div>
                        <div className="mt-1.5 flex items-center gap-2">
                          <span className="text-[10px] text-muted-foreground">Keyakinan</span>
                          <div className="h-1.5 w-24 rounded-full bg-gray-200 overflow-hidden">
                            <div
                              className="h-full rounded-full"
                              style={{
                                width: `${Math.min(Number(v.confidence) * 100, 100)}%`,
                                backgroundColor: Number(v.confidence) >= 0.7 ? '#22c55e' : Number(v.confidence) >= 0.4 ? '#eab308' : '#ef4444'
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Deteksi Barang Staging - diperbaiki layout */}
          <div className="rounded-lg border border-border bg-white p-5 shadow-sm transition-all duration-200 hover:shadow-md hover:-translate-y-0.5">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Boxes className="h-4 w-4 text-primary" />
                <div>
                  <h2 className="text-sm font-semibold text-foreground">Deteksi Barang Staging</h2>
                  <p className="text-xs text-muted-foreground">Bukti, waktu laporan & durasi</p>
                </div>
              </div>
              <Link to="/logs/staging" className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/20">
                Lihat selengkapnya <ChevronRight className="h-3 w-3" />
              </Link>
            </div>
            {stagings.length === 0 ? (
              <EmptyState text="Belum ada deteksi barang staging." />
            ) : (
              <>
                {stagings.length > PREVIEW_LIMIT && (
                  <p className="mb-3 text-xs text-muted-foreground">Menampilkan {PREVIEW_LIMIT} dari {stagings.length} deteksi</p>
                )}
                <div className="space-y-3">
                  {(stagings as StagingDetection[]).slice(0, PREVIEW_LIMIT).map((s) => (
                    <div key={s.id} className="flex items-start gap-3 p-3 rounded-lg border border-border/60 hover:border-primary/20 hover:bg-slate-50 transition-colors">
                      <img
                        src={`data:image/jpeg;base64,${s.foto_base64}`}
                        alt={s.class_name ?? "Bukti deteksi barang"}
                        loading="lazy"
                        className="h-16 w-20 rounded object-cover border border-border flex-shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{s.class_name ?? "Barang tidak teridentifikasi"}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">Dilaporkan {formatDateTime(s.created_at)}</p>
                        <div className="mt-1.5">
                          <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
                            <Clock className="mr-1 h-3 w-3" />
                            {formatDuration(s.first_detected)}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Kamera Mati - dengan desain yang lebih informatif */}
        <div className="mt-6 rounded-lg border border-border bg-white p-5 shadow-sm transition-all duration-200 hover:shadow-md hover:-translate-y-0.5">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CameraOff className="h-4 w-4 text-destructive" />
              <div>
                <h2 className="text-sm font-semibold text-foreground">Laporan Kamera Mati</h2>
                <p className="text-xs text-muted-foreground">Nama kamera & waktu kejadian</p>
              </div>
            </div>
            <Link to="/logs/cameras" className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-3 py-1 text-xs font-medium text-destructive transition-colors hover:bg-destructive/20">
              Lihat selengkapnya <ChevronRight className="h-3 w-3" />
            </Link>
          </div>
          {offlineCams.length === 0 ? (
            <EmptyState text="Tidak ada kamera mati." />
          ) : (
            <>
              {offlineCams.length > PREVIEW_LIMIT && (
                <p className="mb-3 text-xs text-muted-foreground">Menampilkan {PREVIEW_LIMIT} dari {offlineCams.length} laporan</p>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {(offlineCams as CameraOfflineEvent[]).slice(0, PREVIEW_LIMIT).map((c) => (
                  <div key={c.id} className="flex items-center justify-between p-3 rounded-lg border border-border/60 hover:border-red-200 hover:bg-red-50 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-red-100 text-red-500">
                        <CameraOff className="h-4 w-4" />
                      </div>
                      <span className="text-sm font-medium text-foreground">{c.camera}</span>
                    </div>
                    <span className="text-xs text-muted-foreground bg-white px-2 py-1 rounded border border-border/60">{formatDateTime(c.created_at)}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </section>

      <footer className="border-t border-border bg-white py-6 text-center text-xs text-muted-foreground">
        {TEMPLATE.companyName} · Dashboard Pemantauan
      </footer>
    </main>
  );
}

// --- KOMPONEN PENDUKUNG ---
function KpiCard({
  icon,
  label,
  value,
  hint,
  tone = "primary"
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
  tone?: "primary" | "destructive" | "success" | "warning";
}) {
  const toneMap = {
    primary: "bg-blue-500/10 text-blue-600",
    destructive: "bg-red-500/10 text-red-600",
    success: "bg-green-500/10 text-green-600",
    warning: "bg-orange-500/10 text-orange-600",
  };
  const toneClass = toneMap[tone] || toneMap.primary;
  return (
    <div className="rounded-lg border border-border bg-white p-5 shadow-sm transition-all duration-200 hover:shadow-md hover:-translate-y-0.5">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
        <div className={`flex h-9 w-9 items-center justify-center rounded-md ${toneClass}`}>{icon}</div>
      </div>
      <p className="mt-3 text-3xl font-bold tracking-tight text-foreground">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function EmptyState({ text, icon }: { text: string; icon?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-md border border-dashed border-border bg-muted/30 p-8 text-center">
      {icon && <div className="text-muted-foreground/50">{icon}</div>}
      <p className="text-xs text-muted-foreground">{text}</p>
    </div>
  );
}