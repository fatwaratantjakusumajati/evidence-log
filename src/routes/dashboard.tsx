import { createFileRoute, Link } from "@tanstack/react-router"; // Hapus useNavigate
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo, useEffect } from "react";
import {
  Area as RechartsArea,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Bar,
  BarChart,
  Pie,
  PieChart,
  Cell,
} from "recharts";
import {
  Car,
  Truck,
  Bike,
  Boxes,
  Clock,
  ChevronRight,
  CameraOff,
  Package,
  Activity,
  ArrowLeft, // <--- Tambahkan import ini!
} from "lucide-react";
import { formatDateTime } from "@/lib/evidence";
import companyLogo from "@/assets/aristides-logo.png";

const PREVIEW_LIMIT = 4;
const TOTAL_CAMERAS = 22;

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

// --- HELPERS ---
const CHART_COLORS = {
  blue: "#3b82f6",
  orange: "#f97316",
  green: "#10b981",
  purple: "#a855f7",
  red: "#ef4444",
  gray: "#6b7280",
};

const REPORT_HOURS = Array.from({ length: 24 }, (_, i) => 
  `${String(i).padStart(2, '0')}:00`
);

function colorForClass(name: string, index: number) {
  const lower = name.toLowerCase();
  if (lower.includes("truk")) return CHART_COLORS.orange;
  if (lower.includes("mobil")) return CHART_COLORS.blue;
  if (lower.includes("motor")) return CHART_COLORS.green;
  return CHART_COLORS.purple;
}

function pivotVehicleInterval(raw: VehicleIntervalRaw[]) {
  const allExpectedClasses = ['Mobil', 'Truk', 'Sepeda Motor'];
  const byHour = new Map<string, Record<string, number>>();
  
  REPORT_HOURS.forEach((h) => {
    const row: Record<string, number> = {};
    allExpectedClasses.forEach((c) => { row[c] = 0; });
    byHour.set(h, row);
  });

  raw.forEach((r) => {
    if (byHour.has(r.hour)) {
      byHour.get(r.hour)![r.jenis_kendaraan] = r.total;
    }
  });

  const chartData = REPORT_HOURS.map((hour) => {
    const row: Record<string, number | string> = { hour };
    allExpectedClasses.forEach((c) => {
      row[c] = byHour.get(hour)?.[c] ?? 0;
    });
    return row;
  });
  
  return { chartData, classes: allExpectedClasses };
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

function timeAgo(isoString: string) {
  const diff = Date.now() - new Date(isoString).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "Baru saja";
  if (minutes < 60) return `${minutes} menit lalu`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} jam lalu`;
  const days = Math.floor(hours / 24);
  return `${days} hari lalu`;
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
  const [filterClass, setFilterClass] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const queryClient = useQueryClient();

  // --- SSE LISTENER (REAL-TIME) ---
  useEffect(() => {
    const eventSource = new EventSource('http://localhost:5000/api/events');

    eventSource.onmessage = (event) => {
      try {
        queryClient.invalidateQueries({ queryKey: ["vehicle_log"] });
        queryClient.invalidateQueries({ queryKey: ["staging_detections"] });
        queryClient.invalidateQueries({ queryKey: ["camera_offline_events"] });
        queryClient.invalidateQueries({ queryKey: ["vehicle_interval"] });
        queryClient.invalidateQueries({ queryKey: ["detection_weekly"] });
        queryClient.invalidateQueries({ queryKey: ["camera_status"] });
      } catch (e) { /* Abaikan */ }
    };

    return () => { eventSource.close(); };
  }, [queryClient]);

  const { data: vehicles = [] } = useQuery({
    queryKey: ["vehicle_log", "preview"],
    queryFn: async () => {
      try {
        const res = await fetch('http://localhost:5000/api/vehicles/log?limit=4');
        if (!res.ok) return [];
        const json = await res.json();
        return json.data || (Array.isArray(json) ? json : []);
      } catch { return []; }
    },
  });

  const { data: stagings = [] } = useQuery({
    queryKey: ["staging_detections", "preview"],
    queryFn: async () => {
      try {
        const res = await fetch('http://localhost:5000/api/alerts?class_name=box&limit=4');
        if (!res.ok) return [];
        const json = await res.json();
        return json.data || (Array.isArray(json) ? json : []);
      } catch { return []; }
    },
  });

  const { data: offlineCams = [] } = useQuery({
    queryKey: ["camera_offline_events", "preview"],
    queryFn: async () => {
      try {
        const res = await fetch('http://localhost:5000/api/alerts?class_name=' + encodeURIComponent('KAMERA OFFLINE') + '&limit=4');
        if (!res.ok) return [];
        const json = await res.json();
        return json.data || (Array.isArray(json) ? json : []);
      } catch { return []; }
    },
  });

  const { data: vehicleIntervalRaw = [] } = useQuery({
    queryKey: ["vehicle_interval", startDate, endDate],
    queryFn: async () => {
      let url = 'http://localhost:5000/api/vehicles/stats/hourly';
      if (startDate && endDate) url += `?start_date=${startDate}&end_date=${endDate}`;
      const res = await fetch(url);
      if (!res.ok) return [];
      return res.json() as Promise<VehicleIntervalRaw[]>;
    },
  });

  const { data: detectionData = [] } = useQuery({
    queryKey: ["detection_weekly", startDate, endDate],
    queryFn: async () => {
      let url = 'http://localhost:5000/api/alerts/stats/weekly';
      if (startDate && endDate) url += `?start_date=${startDate}&end_date=${endDate}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('Gagal fetch weekly stats');
      return res.json();
    },
  });

  const { data: cameraStats } = useQuery({
    queryKey: ["camera_status", startDate, endDate],
    queryFn: async () => {
      let url = 'http://localhost:5000/api/alerts/stats/camera-status';
      if (startDate && endDate) url += `?start_date=${startDate}&end_date=${endDate}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('Gagal fetch camera status');
      return res.json();
    },
  });

  const todayBreakdown = useMemo(() => {
    let mobil = 0, truk = 0, motor = 0;
    vehicleIntervalRaw.forEach((item: VehicleIntervalRaw) => {
      if (item.jenis_kendaraan === 'Mobil') mobil += item.total;
      else if (item.jenis_kendaraan === 'Truk') truk += item.total;
      else if (item.jenis_kendaraan.includes('Motor')) motor += item.total;
    });
    return { mobil, truk, motor };
  }, [vehicleIntervalRaw]);

  const { chartData: vehicleHourly, classes: vehicleClasses } = pivotVehicleInterval(vehicleIntervalRaw);
  const detectionChartData = fillWeeklyGaps(detectionData);
  const totalDetections = detectionData.reduce((s: number, d: { barang: number }) => s + Number(d.barang), 0);
  const camerasDown = Number(cameraStats?.mati ?? 0);
  const totalVehicles = vehicleIntervalRaw.reduce((s: number, r: VehicleIntervalRaw) => s + r.total, 0);
  const filteredVehicles = filterClass === 'all' ? (vehicles as VehicleLog[]) : (vehicles as VehicleLog[]).filter(v => v.jenis_kendaraan === filterClass);

  return (
    <main className="min-h-screen bg-slate-50">
      <section className="mx-auto max-w-7xl px-6 py-8">
        {/* ================= HEADER KEMBALI YANG SUDAH DIPERBAIKI ================= */}
        <div className="flex items-center gap-3 mb-6">
          <Link 
            to="/" 
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            aria-label="Kembali ke beranda"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <h1 className="text-lg font-semibold tracking-tight text-foreground">Dashboard Pemantauan</h1>
        </div>

        {/* ================= FILTER TANGGAL GLOBAL ================= */}
        <div className="mb-6 flex flex-wrap items-center gap-4 bg-white p-4 rounded-lg border border-border shadow-sm">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">📅 Periode Laporan:</div>
          <div className="flex items-center gap-2"><span className="text-xs text-muted-foreground">Dari</span><input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="rounded-md border border-border bg-background px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-primary" /></div>
          <div className="flex items-center gap-2"><span className="text-xs text-muted-foreground">s/d</span><input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="rounded-md border border-border bg-background px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-primary" /></div>
          {(startDate || endDate) && (<button onClick={() => { setStartDate(''); setEndDate(''); }} className="rounded-md bg-destructive/10 px-3 py-1.5 text-xs font-medium text-destructive transition-colors hover:bg-destructive/20">Reset Filter</button>)}
        </div>

        {/* ================= KPI CARDS ================= */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard icon={<Package className="h-5 w-5" />} label="Deteksi Staging" value={totalDetections.toLocaleString("id-ID")} hint={startDate && endDate ? `Periode ${startDate} s/d ${endDate}` : '7 hari terakhir'} tone="primary" />
          <KpiCard icon={<CameraOff className="h-5 w-5" />} label="Kamera Offline" value={String(camerasDown)} hint={`dari ${TOTAL_CAMERAS} kamera`} tone="destructive" />
          <KpiCard icon={<Car className="h-5 w-5" />} label="Total Kendaraan" value={String(totalVehicles)} hint={startDate && endDate ? `Periode ${startDate} s/d ${endDate}` : 'hari ini'} tone="success" />
          <KpiCardBreakdown icon={<Activity className="h-5 w-5" />} label="Detail Kendaraan" breakdown={todayBreakdown} hint={startDate && endDate ? `Periode ${startDate} s/d ${endDate}` : ''} tone="info" />
        </div>

        {/* ================= CHART ROW ================= */}
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <div className="rounded-lg border border-border bg-white p-5 shadow-sm transition-all duration-200 hover:shadow-md hover:-translate-y-0.5">
            <div className="mb-3"><h3 className="text-sm font-semibold text-foreground flex items-center gap-2"><span className="inline-block w-1 h-4 bg-blue-500 rounded-full"></span>Deteksi Barang (Harian)</h3><p className="text-xs text-muted-foreground">Jumlah barang terdeteksi per hari dalam rentang tanggal</p></div>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={detectionChartData} margin={{ top: 20, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                <XAxis dataKey="day" stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip contentStyle={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 12 }} formatter={(value: number) => [`${value} barang`, 'Jumlah']} labelFormatter={(label) => `Hari ${label}`} />
                <Bar dataKey="barang" fill="#3b82f6" radius={[4, 4, 0, 0]} maxBarSize={40}>{detectionChartData.map((entry, index) => (<Cell key={`cell-${index}`} fill={entry.barang > 0 ? "#3b82f6" : "#e2e8f0"} />))}</Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="rounded-lg border border-border bg-white p-5 shadow-sm transition-all duration-200 hover:shadow-md hover:-translate-y-0.5">
            <div className="mb-3"><h3 className="text-sm font-semibold text-foreground flex items-center gap-2"><span className="inline-block w-1 h-4 bg-orange-500 rounded-full"></span>Deteksi Kendaraan</h3><p className="text-xs text-muted-foreground">Per 1 jam (00:00–23:00)</p></div>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={vehicleHourly} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                <XAxis dataKey="hour" stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(value: string) => value.replace(':00', '')} ticks={REPORT_HOURS} tick={({ x, y, payload }) => (<g transform={`translate(${x},${y}) rotate(-45)`}><text x={0} y={0} dy={10} textAnchor="end" fill="#94a3b8" fontSize={10}>{payload.value.replace(':00', '')}</text></g>)} />
                <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip contentStyle={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 12 }} formatter={(value: number, name: string) => [`${value} kendaraan`, name]} labelFormatter={(label: string) => `Pukul ${label}`} />
                <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" />
                {vehicleClasses.map((cls, i) => { const fillColor = colorForClass(cls, i); return (<RechartsArea key={cls} type="monotone" dataKey={cls} name={cls} stackId="a" stroke={fillColor} fill={fillColor} fillOpacity={0.3} strokeWidth={2.5} dot={{ r: 3, fill: fillColor, stroke: "#fff", strokeWidth: 1 }} activeDot={{ r: 5 }} />); })}
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* LOGS SECTION */}
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <div className="rounded-lg border border-border bg-white p-5 shadow-sm transition-all duration-200 hover:shadow-md hover:-translate-y-0.5">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-3"><Car className="h-4 w-4 text-primary" /><div><h2 className="text-sm font-semibold text-foreground">Log Kendaraan</h2><p className="text-xs text-muted-foreground">Deteksi kendaraan terbaru dari CCTV</p></div></div>
              <Link to="/logs/vehicles" className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/20">Lihat selengkapnya <ChevronRight className="h-3 w-3" /></Link>
            </div>
            {vehicles.length === 0 ? (<EmptyState text="Belum ada log kendaraan." />) : (
              <>
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">Menampilkan {Math.min(filteredVehicles.length, PREVIEW_LIMIT)} dari {vehicles.length} log</p>
                  <select value={filterClass} onChange={(e) => setFilterClass(e.target.value)} className="rounded-md border border-border bg-background px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-primary"><option value="all">Semua</option><option value="Mobil">Mobil</option><option value="Truk">Truk</option><option value="Sepeda Motor">Motor</option></select>
                </div>
                <div className="space-y-3">{filteredVehicles.slice(0, PREVIEW_LIMIT).map((v) => {
                  const width = v.bbox_x2 - v.bbox_x1; const height = v.bbox_y2 - v.bbox_y1; const area = width * height;
                  const isMotor = v.jenis_kendaraan.includes('Motor'); const isTruk = v.jenis_kendaraan.includes('Truk'); const IconComponent = isMotor ? Bike : isTruk ? Truck : Car;
                  const iconBgClass = isMotor ? 'bg-green-100 text-green-600' : isTruk ? 'bg-orange-100 text-orange-600' : 'bg-blue-100 text-blue-600';
                  return (<div key={v.id} className="flex items-start gap-3 p-3 rounded-lg border border-border/60 hover:border-primary/20 hover:bg-slate-50 transition-colors">
                    <img src={`data:image/jpeg;base64,${v.gambar_base64}`} alt={`Kendaraan ${v.jenis_kendaraan}`} loading="lazy" className="h-16 w-20 rounded object-cover border border-border flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0"><div className={`flex h-5 w-5 items-center justify-center rounded-full ${iconBgClass} flex-shrink-0`}><IconComponent className="h-3 w-3" /></div><span className="text-sm font-semibold text-foreground truncate">{v.jenis_kendaraan}</span></div>
                        <ConfidenceBadge confidence={Number(v.confidence)} />
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs text-muted-foreground"><div className="flex items-center gap-1"><Clock className="h-3 w-3" /><span>{formatDateTime(v.timestamp)}</span></div><span className="text-[10px] text-muted-foreground/60">• {timeAgo(v.timestamp)}</span></div>
                      <div className="mt-1 flex items-center gap-3 text-[10px] text-muted-foreground"><span>📐 {width}×{height}</span><span>|</span><span>Area: {area.toLocaleString()} px²</span></div>
                      <div className="mt-1.5 flex items-center gap-2"><span className="text-[10px] text-muted-foreground">Keyakinan</span><div className="h-1.5 w-24 rounded-full bg-gray-200 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${Math.min(Number(v.confidence) * 100, 100)}%`, backgroundColor: Number(v.confidence) >= 0.7 ? '#22c55e' : Number(v.confidence) >= 0.4 ? '#eab308' : '#ef4444' }} /></div></div>
                    </div>
                  </div>);
                })}</div>
              </>
            )}
          </div>

          <div className="rounded-lg border border-border bg-white p-5 shadow-sm transition-all duration-200 hover:shadow-md hover:-translate-y-0.5">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2"><Boxes className="h-4 w-4 text-primary" /><div><h2 className="text-sm font-semibold text-foreground">Deteksi Barang Staging</h2><p className="text-xs text-muted-foreground">Bukti, waktu laporan & durasi</p></div></div>
              <Link to="/logs/staging" className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/20">Lihat selengkapnya <ChevronRight className="h-3 w-3" /></Link>
            </div>
            {stagings.length === 0 ? (<EmptyState text="Belum ada deteksi barang staging." />) : (<div className="space-y-3">{(stagings as StagingDetection[]).slice(0, PREVIEW_LIMIT).map((s) => (<div key={s.id} className="flex items-start gap-3 p-3 rounded-lg border border-border/60 hover:border-primary/20 hover:bg-slate-50 transition-colors">
              <img src={`data:image/jpeg;base64,${s.foto_base64}`} alt={s.class_name ?? "Bukti"} loading="lazy" className="h-16 w-20 rounded object-cover border border-border flex-shrink-0" />
              <div className="flex-1 min-w-0"><p className="text-sm font-medium text-foreground truncate">{s.class_name ?? "Barang tidak teridentifikasi"}</p><p className="mt-0.5 text-xs text-muted-foreground">Dilaporkan {formatDateTime(s.created_at)}</p><div className="mt-1.5"><span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700"><Clock className="mr-1 h-3 w-3" />{formatDuration(s.first_detected)}</span></div></div>
            </div>))}</div>)}
          </div>
        </div>

        <div className="mt-6 rounded-lg border border-border bg-white p-5 shadow-sm transition-all duration-200 hover:shadow-md hover:-translate-y-0.5">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2"><CameraOff className="h-4 w-4 text-destructive" /><div><h2 className="text-sm font-semibold text-foreground">Laporan Kamera Mati</h2><p className="text-xs text-muted-foreground">Nama kamera & waktu kejadian</p></div></div>
            <Link to="/logs/cameras" className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-3 py-1 text-xs font-medium text-destructive transition-colors hover:bg-destructive/20">Lihat selengkapnya <ChevronRight className="h-3 w-3" /></Link>
          </div>
          {offlineCams.length === 0 ? (<EmptyState text="Tidak ada kamera mati." />) : (<div className="grid grid-cols-1 sm:grid-cols-2 gap-2">{(offlineCams as CameraOfflineEvent[]).slice(0, PREVIEW_LIMIT).map((c) => (<div key={c.id} className="flex items-center justify-between p-3 rounded-lg border border-border/60 hover:border-red-200 hover:bg-red-50 transition-colors">
            <div className="flex items-center gap-3"><div className="flex h-8 w-8 items-center justify-center rounded-full bg-red-100 text-red-500"><CameraOff className="h-4 w-4" /></div><span className="text-sm font-medium text-foreground">{c.camera}</span></div>
            <span className="text-xs text-muted-foreground bg-white px-2 py-1 rounded border border-border/60">{formatDateTime(c.created_at)}</span>
          </div>))}</div>)}
        </div>
      </section>

      <footer className="border-t border-border bg-white py-6 text-center text-xs text-muted-foreground">{TEMPLATE.companyName} · Dashboard Pemantauan</footer>
    </main>
  );
}

// ================= KOMPONEN KPI =================
function KpiCard({ icon, label, value, hint, tone = "primary" }: { icon: React.ReactNode; label: string; value: string; hint?: string; tone?: "primary" | "destructive" | "success" | "warning" | "info"; }) {
  const toneMap = { primary: "bg-blue-500/10 text-blue-600", destructive: "bg-red-500/10 text-red-600", success: "bg-green-500/10 text-green-600", warning: "bg-orange-500/10 text-orange-600", info: "bg-cyan-500/10 text-cyan-600" };
  const toneClass = toneMap[tone] || toneMap.primary;
  return (<div className="rounded-lg border border-border bg-white p-5 shadow-sm transition-all duration-200 hover:shadow-md hover:-translate-y-0.5">
      <div className="flex items-center justify-between"><p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</p><div className={`flex h-9 w-9 items-center justify-center rounded-md ${toneClass}`}>{icon}</div></div>
      <p className="mt-3 text-3xl font-bold tracking-tight text-foreground">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>);
}

function KpiCardBreakdown({ icon, label, breakdown, hint, tone = "primary" }: { icon: React.ReactNode; label: string; breakdown: { mobil: number; truk: number; motor: number }; hint?: string; tone?: "primary" | "destructive" | "success" | "warning" | "info"; }) {
  const toneMap = { primary: "bg-blue-500/10 text-blue-600", destructive: "bg-red-500/10 text-red-600", success: "bg-green-500/10 text-green-600", warning: "bg-orange-500/10 text-orange-600", info: "bg-cyan-500/10 text-cyan-600" };
  const toneClass = toneMap[tone] || toneMap.primary;
  return (<div className="rounded-lg border border-border bg-white p-5 shadow-sm transition-all duration-200 hover:shadow-md hover:-translate-y-0.5">
      <div className="flex items-center justify-between"><p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</p><div className={`flex h-9 w-9 items-center justify-center rounded-md ${toneClass}`}>{icon}</div></div>
      <div className="mt-3 flex items-center justify-around px-1 text-center">
        <div className="flex flex-col items-center flex-1"><span className="text-3xl font-bold tracking-tight text-foreground">{breakdown.mobil}</span><div className="flex items-center gap-1 mt-0.5 text-xs text-muted-foreground"><Car className="h-3 w-3 text-blue-600" /> <span>Mobil</span></div></div>
        <div className="flex flex-col items-center flex-1"><span className="text-3xl font-bold tracking-tight text-foreground">{breakdown.truk}</span><div className="flex items-center gap-1 mt-0.5 text-xs text-muted-foreground"><Truck className="h-3 w-3 text-orange-600" /> <span>Truk</span></div></div>
        <div className="flex flex-col items-center flex-1"><span className="text-3xl font-bold tracking-tight text-foreground">{breakdown.motor}</span><div className="flex items-center gap-1 mt-0.5 text-xs text-muted-foreground"><Bike className="h-3 w-3 text-green-600" /> <span>Motor</span></div></div>
      </div>
      {hint && <p className="mt-1 text-[10px] text-center text-muted-foreground">{hint}</p>}
    </div>);
}

function EmptyState({ text, icon }: { text: string; icon?: React.ReactNode }) {
  return (<div className="flex flex-col items-center gap-2 rounded-md border border-dashed border-border bg-muted/30 p-8 text-center">{icon && <div className="text-muted-foreground/50">{icon}</div>}<p className="text-xs text-muted-foreground">{text}</p></div>);
}