import { createFileRoute, Link } from "@tanstack/react-router";
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
} from "lucide-react";
import { formatDateTime } from "@/lib/evidence";

const PREVIEW_LIMIT = 4;
const TOTAL_CAMERAS = 22;

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
  if (confidence < 0.4) return { label: "Rendah", className: "bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800" };
  if (confidence < 0.7) return { label: "Sedang", className: "bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-800" };
  return { label: "Tinggi", className: "bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800" };
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

function Dashboard() {
  const [filterClass, setFilterClass] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const queryClient = useQueryClient();

  // --- SSE LISTENER (REAL-TIME) ---
  useEffect(() => {
    const eventSource = new EventSource('http://localhost:5000/api/events');
    eventSource.onmessage = () => {
      queryClient.invalidateQueries({ queryKey: ["vehicle_log", "preview"] });
      queryClient.invalidateQueries({ queryKey: ["staging_detections", "preview"] });
      queryClient.invalidateQueries({ queryKey: ["camera_offline_events", "preview"] });
      queryClient.invalidateQueries({ queryKey: ["vehicle_interval", startDate, endDate] });
      queryClient.invalidateQueries({ queryKey: ["detection_weekly", startDate, endDate] });
      queryClient.invalidateQueries({ queryKey: ["camera_status", startDate, endDate] });
    };
    return () => eventSource.close();
  }, [queryClient, startDate, endDate]);

  // --- QUERIES ---
  const { data: vehicles = [] } = useQuery<VehicleLog[]>({
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

  const { data: stagings = [] } = useQuery<StagingDetection[]>({
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

  const { data: offlineCams = [] } = useQuery<CameraOfflineEvent[]>({
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

  const { data: vehicleIntervalRaw = [] } = useQuery<VehicleIntervalRaw[]>({
    queryKey: ["vehicle_interval", startDate, endDate],
    queryFn: async () => {
      let url = 'http://localhost:5000/api/vehicles/stats/hourly';
      if (startDate && endDate) url += `?start_date=${startDate}&end_date=${endDate}`;
      const res = await fetch(url);
      if (!res.ok) return [];
      return res.json() as Promise<VehicleIntervalRaw[]>;
    },
  });

  const { data: detectionData = [] } = useQuery<{ day: string; barang: number }[]>({
    queryKey: ["detection_weekly", startDate, endDate],
    queryFn: async () => {
      let url = 'http://localhost:5000/api/alerts/stats/weekly';
      if (startDate && endDate) url += `?start_date=${startDate}&end_date=${endDate}`;
      const res = await fetch(url);
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { data: cameraStats } = useQuery<{ mati: number }>({
    queryKey: ["camera_status", startDate, endDate],
    queryFn: async () => {
      let url = 'http://localhost:5000/api/alerts/stats/camera-status';
      if (startDate && endDate) url += `?start_date=${startDate}&end_date=${endDate}`;
      const res = await fetch(url);
      if (!res.ok) return { mati: 0 };
      return res.json();
    },
  });

  const todayBreakdown = useMemo(() => {
    let mobil = 0, truk = 0, motor = 0;
    vehicleIntervalRaw.forEach((item) => {
      if (item.jenis_kendaraan === 'Mobil') mobil += item.total;
      else if (item.jenis_kendaraan === 'Truk') truk += item.total;
      else if (item.jenis_kendaraan.includes('Motor')) motor += item.total;
    });
    return { mobil, truk, motor };
  }, [vehicleIntervalRaw]);

  const { chartData: vehicleHourly, classes: vehicleClasses } = pivotVehicleInterval(vehicleIntervalRaw);
  const detectionChartData = fillWeeklyGaps(detectionData);
  const totalDetections = detectionData.reduce((s, d) => s + Number(d.barang), 0);
  const camerasDown = Number(cameraStats?.mati ?? 0);
  const totalVehicles = vehicleIntervalRaw.reduce((s, r) => s + r.total, 0);
  const filteredVehicles = filterClass === 'all' ? (vehicles as VehicleLog[]) : (vehicles as VehicleLog[]).filter(v => v.jenis_kendaraan === filterClass);

  return (
    <main className="min-h-screen bg-slate-50 dark:bg-zinc-950 flex flex-col">
      <section className="mx-auto max-w-7xl w-full px-6 py-6">
        
        {/* HEADER DASHBOARD - TANPA TOMBOL BACK, LEBIH BERSIH */}
        <div className="flex flex-col gap-1 mb-6 pt-2">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Dashboard Pemantauan</h1>
          <p className="text-sm text-muted-foreground">Aktivitas staging, kendaraan, & kamera</p>
        </div>

        {/* FILTER TANGGAL YANG RAMPING */}
        <div className="mb-6 flex flex-wrap items-center gap-2 bg-white dark:bg-zinc-900 p-2 rounded-xl border border-border/60 dark:border-zinc-800 shadow-sm">
          <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">Periode:</span>
          <div className="flex items-center gap-1">
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="h-8 rounded-lg border border-border/60 dark:border-zinc-800 bg-background px-2 text-xs outline-none focus:ring-1 focus:ring-primary" />
            <span className="text-muted-foreground text-[10px]">—</span>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="h-8 rounded-lg border border-border/60 dark:border-zinc-800 bg-background px-2 text-xs outline-none focus:ring-1 focus:ring-primary" />
          </div>
          {(startDate || endDate) && (
            <button onClick={() => { setStartDate(''); setEndDate(''); }} className="h-7 rounded-full bg-destructive/10 px-2.5 text-[10px] font-medium text-destructive hover:bg-destructive/20 transition-colors">
              Reset
            </button>
          )}
        </div>

        {/* KPI CARDS */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard icon={<Package className="h-5 w-5" />} label="Deteksi Staging" value={totalDetections.toLocaleString("id-ID")} hint={startDate && endDate ? `${startDate} - ${endDate}` : '7 hari'} tone="primary" />
          <KpiCard icon={<CameraOff className="h-5 w-5" />} label="Kamera Offline" value={String(camerasDown)} hint={`dari ${TOTAL_CAMERAS}`} tone="destructive" />
          <KpiCard icon={<Car className="h-5 w-5" />} label="Total Kendaraan" value={String(totalVehicles)} hint={startDate && endDate ? `${startDate} - ${endDate}` : 'Hari ini'} tone="success" />
          <KpiCardBreakdown icon={<Activity className="h-5 w-5" />} label="Detail Kendaraan" breakdown={todayBreakdown} hint={startDate && endDate ? 'Periode' : ''} tone="info" />
        </div>

        {/* CHART ROW */}
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-border/60 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 shadow-sm hover:shadow-md transition-all">
            <div className="mb-3">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <span className="inline-block w-1 h-4 bg-blue-500 rounded-full"></span>
                Deteksi Barang (Harian)
              </h3>
              <p className="text-xs text-muted-foreground">Jumlah barang terdeteksi per hari</p>
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={detectionChartData} margin={{ top: 20, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="day" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8 }} formatter={(v: number) => [`${v} barang`, 'Jumlah']} />
                <Bar dataKey="barang" fill="#3b82f6" radius={[4, 4, 0, 0]} maxBarSize={40}>{detectionChartData.map((e, i) => (<Cell key={i} fill={e.barang > 0 ? "#3b82f6" : "hsl(var(--muted))"} />))}</Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="rounded-xl border border-border/60 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 shadow-sm hover:shadow-md transition-all">
            <div className="mb-3">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <span className="inline-block w-1 h-4 bg-orange-500 rounded-full"></span>
                Deteksi Kendaraan
              </h3>
              <p className="text-xs text-muted-foreground">Per 1 jam (00:00–23:00), per jenis</p>
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={vehicleHourly} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="hour" stroke="hsl(var(--muted-foreground))" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(v) => v.replace(':00', '')} ticks={REPORT_HOURS} tick={({ x, y, payload }) => (<g transform={`translate(${x},${y}) rotate(-45)`}><text x={0} y={0} dy={10} textAnchor="end" fill="hsl(var(--muted-foreground))" fontSize={10}>{payload.value.replace(':00', '')}</text></g>)} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8 }} formatter={(v: number, n: string) => [`${v} kendaraan`, n]} labelFormatter={(l) => `Pukul ${l}`} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
                {vehicleClasses.map((cls, i) => {
                  const fillColor = colorForClass(cls, i);
                  return (<RechartsArea key={cls} type="monotone" dataKey={cls} name={cls} stackId="a" stroke={fillColor} fill={fillColor} fillOpacity={0.3} strokeWidth={2.5} dot={{ r: 3, fill: fillColor, stroke: "#fff", strokeWidth: 1 }} activeDot={{ r: 5 }} />);
                })}
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* LOGS SECTION - DENGAN SEMUA FITUR DETAIL LENGKAP */}
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-border/60 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 shadow-sm hover:shadow-md transition-all">
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm font-semibold text-foreground flex items-center gap-2"><Car className="h-4 w-4" /> Log Kendaraan</span>
              <Link to="/logs/vehicles" className="text-xs text-primary hover:underline">Lihat semua →</Link>
            </div>
            {vehicles.length === 0 ? (<div className="text-center py-8 text-sm text-muted-foreground">Belum ada log kendaraan.</div>) : (
              <>
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">Menampilkan {Math.min(filteredVehicles.length, PREVIEW_LIMIT)}</p>
                  <select value={filterClass} onChange={(e) => setFilterClass(e.target.value)} className="rounded-md border border-border/60 dark:border-zinc-800 bg-background dark:bg-zinc-900 px-2 py-1 text-xs outline-none"><option value="all">Semua</option><option value="Mobil">Mobil</option><option value="Truk">Truk</option><option value="Sepeda Motor">Motor</option></select>
                </div>
                <div className="space-y-3">
                  {filteredVehicles.slice(0, PREVIEW_LIMIT).map((v) => {
                    const width = v.bbox_x2 - v.bbox_x1;
                    const height = v.bbox_y2 - v.bbox_y1;
                    const area = width * height;
                    const isMotor = v.jenis_kendaraan.includes('Motor');
                    const isTruk = v.jenis_kendaraan.includes('Truk');
                    const IconComponent = isMotor ? Bike : isTruk ? Truck : Car;
                    const iconBgClass = isMotor ? 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400' : isTruk ? 'bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400' : 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400';

                    return (
                      <div key={v.id} className="flex gap-3 border-b border-border/40 dark:border-zinc-800 pb-3 last:border-0">
                        <div className="relative flex-shrink-0">
                          <img src={`data:image/jpeg;base64,${v.gambar_base64}`} className="h-14 w-20 rounded object-cover bg-muted" />
                          <div className={`absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full ${iconBgClass} border-2 border-white dark:border-zinc-800`}>
                            <IconComponent className="h-3 w-3" />
                          </div>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-sm font-medium text-foreground truncate">{v.jenis_kendaraan}</p>
                            <ConfidenceBadge confidence={Number(v.confidence)} />
                          </div>
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-muted-foreground mt-0.5">
                            <span>{formatDateTime(v.timestamp)}</span>
                            <span>•</span>
                            <span>{timeAgo(v.timestamp)}</span>
                            <span>•</span>
                            <span>📐 {width}×{height} ({area.toLocaleString()} px²)</span>
                          </div>
                          <div className="mt-1 h-1.5 w-full max-w-[150px] rounded-full bg-gray-200 dark:bg-zinc-700 overflow-hidden">
                            <div className="h-full rounded-full" style={{ width: `${Math.min(Number(v.confidence) * 100, 100)}%`, backgroundColor: Number(v.confidence) >= 0.7 ? '#22c55e' : Number(v.confidence) >= 0.4 ? '#eab308' : '#ef4444' }} />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          {/* STAGING */}
          <div className="rounded-xl border border-border/60 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 shadow-sm hover:shadow-md transition-all">
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm font-semibold text-foreground flex items-center gap-2"><Boxes className="h-4 w-4" /> Deteksi Staging</span>
              <Link to="/logs/staging" className="text-xs text-primary hover:underline">Lihat semua →</Link>
            </div>
            {stagings.length === 0 ? (<div className="text-center py-8 text-sm text-muted-foreground">Belum ada staging terdeteksi.</div>) : (
              <div className="space-y-3">
                {stagings.slice(0, PREVIEW_LIMIT).map((s) => (
                  <div key={s.id} className="flex gap-3 border-b border-border/40 dark:border-zinc-800 pb-3 last:border-0">
                    <img src={`data:image/jpeg;base64,${s.foto_base64}`} className="h-14 w-20 rounded object-cover bg-muted" />
                    <div>
                      <p className="text-sm font-medium">{s.class_name ?? 'Box'}</p>
                      <p className="text-xs text-muted-foreground">{formatDateTime(s.created_at)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* KAMERA MATI */}
        <div className="mt-6 rounded-xl border border-border/60 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 shadow-sm hover:shadow-md transition-all">
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm font-semibold text-foreground flex items-center gap-2"><CameraOff className="h-4 w-4" /> Laporan Kamera Mati</span>
            <Link to="/logs/cameras" className="text-xs text-primary hover:underline">Lihat semua →</Link>
          </div>
          {offlineCams.length === 0 ? (<div className="text-center py-8 text-sm text-muted-foreground">Tidak ada kamera mati.</div>) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {offlineCams.slice(0, PREVIEW_LIMIT).map((c) => (
                <div key={c.id} className="flex items-center justify-between p-3 rounded-lg border border-border/60 dark:border-zinc-800 hover:border-red-200 dark:hover:border-red-900/50 transition-colors">
                  <span className="text-sm font-medium">{c.camera}</span>
                  <span className="text-xs text-muted-foreground">{formatDateTime(c.created_at)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
      <footer className="border-t border-border dark:border-zinc-800 bg-white dark:bg-zinc-950 py-4 text-center text-xs text-muted-foreground">PT Aristides Logistik Indonesia · Dashboard Pemantauan</footer>
    </main>
  );
}

// --- COMPONENTS ---
function KpiCard({ icon, label, value, hint, tone = "primary" }: { icon: React.ReactNode; label: string; value: string; hint?: string; tone?: "primary" | "destructive" | "success" | "warning" | "info"; }) {
  const toneMap = { 
    primary: "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400", 
    destructive: "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400", 
    success: "bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400", 
    warning: "bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400", 
    info: "bg-cyan-100 text-cyan-600 dark:bg-cyan-900/30 dark:text-cyan-400" 
  };
  const toneClass = toneMap[tone] || toneMap.primary;
  return (<div className="rounded-xl border border-border/60 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 shadow-sm transition-all hover:shadow-md"><div className="flex items-center justify-between mb-2"><span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</span><div className={`flex h-9 w-9 items-center justify-center rounded-lg ${toneClass}`}>{icon}</div></div><p className="text-3xl font-bold tracking-tight text-foreground">{value}</p><p className="mt-1 text-xs text-muted-foreground">{hint}</p></div>);
}

function KpiCardBreakdown({ icon, label, breakdown, hint, tone = "primary" }: { icon: React.ReactNode; label: string; breakdown: { mobil: number; truk: number; motor: number }; hint?: string; tone?: "primary" | "destructive" | "success" | "warning" | "info"; }) {
  const toneMap = { 
    primary: "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400", 
    info: "bg-cyan-100 text-cyan-600 dark:bg-cyan-900/30 dark:text-cyan-400", 
    destructive: "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400", 
    success: "bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400", 
    warning: "bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400"
  };
  const toneClass = toneMap[tone] || toneMap.primary;
  return (<div className="rounded-xl border border-border/60 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 shadow-sm transition-all hover:shadow-md"><div className="flex items-center justify-between mb-2"><span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</span><div className={`flex h-9 w-9 items-center justify-center rounded-lg ${toneClass}`}>{icon}</div></div><div className="mt-3 flex items-center justify-around text-center"><div><p className="text-xl font-bold text-foreground">{breakdown.mobil}</p><p className="text-xs text-muted-foreground flex items-center justify-center gap-1"><Car className="h-3 w-3" /> Mobil</p></div><div><p className="text-xl font-bold text-foreground">{breakdown.truk}</p><p className="text-xs text-muted-foreground flex items-center justify-center gap-1"><Truck className="h-3 w-3" /> Truk</p></div><div><p className="text-xl font-bold text-foreground">{breakdown.motor}</p><p className="text-xs text-muted-foreground flex items-center justify-center gap-1"><Bike className="h-3 w-3" /> Motor</p></div></div><p className="mt-2 text-center text-xs text-muted-foreground">{hint}</p></div>);
}