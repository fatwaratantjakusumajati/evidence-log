import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
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
} from "recharts";
import {
  ArrowRight,
  Package,
  CameraOff,
  Truck,
  AlertTriangle,
  Car,
  Boxes,
  Clock,
} from "lucide-react";
import { formatDateTime } from "@/lib/evidence";
import companyLogo from "@/assets/aristides-logo.png";

const PREVIEW_LIMIT = 4;
const TOTAL_CAMERAS = 22;

const TEMPLATE = {
  companyName: "PT Aristides Logistik Indonesia",
  location: "",
};

type VehicleLog = {
  id: number;
  track_id: number;
  plate_number: string;
  vehicle_type: string;
  confidence: number;
  snapshot_path: string;
  entry_time: string;
  status: string;
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
  const { data: vehicles = [] } = useQuery({
    queryKey: ["vehicle_logs", "preview"],
    queryFn: async () => {
      const res = await fetch('http://localhost:5000/api/vehicles/logs');
      if (!res.ok) throw new Error('Gagal fetch vehicle logs');
      return res.json() as Promise<VehicleLog[]>;
    },
  });

  const { data: stagings = [] } = useQuery({
    queryKey: ["staging_detections", "preview"],
    queryFn: async () => {
      const res = await fetch('http://localhost:5000/api/alerts');
      if (!res.ok) throw new Error('Gagal fetch alerts');
      return res.json() as Promise<StagingDetection[]>;
    },
  });

  const { data: offlineCams = [] } = useQuery({
    queryKey: ["camera_offline_events", "preview"],
    queryFn: async () => {
      const res = await fetch('http://localhost:5000/api/alerts?class_name=camera_offline');
      if (!res.ok) throw new Error('Gagal fetch camera offline');
      return res.json() as Promise<CameraOfflineEvent[]>;
    },
  });

  const { data: detectionData = [] } = useQuery({
    queryKey: ["detection_weekly"],
    queryFn: async () => {
      const res = await fetch('http://localhost:5000/api/alerts/stats/weekly');
      if (!res.ok) throw new Error('Gagal fetch weekly stats');
      return res.json();
    },
  });

  const { data: cameraStats } = useQuery({
    queryKey: ["camera_status"],
    queryFn: async () => {
      const res = await fetch('http://localhost:5000/api/alerts/stats/camera-status');
      if (!res.ok) throw new Error('Gagal fetch camera status');
      return res.json();
    },
  });

  const { data: vehicleHourly = [] } = useQuery({
    queryKey: ["vehicle_hourly"],
    queryFn: async () => {
      const res = await fetch('http://localhost:5000/api/vehicles/stats/hourly');
      if (!res.ok) throw new Error('Gagal fetch vehicle hourly');
      return res.json();
    },
  });

  const totalDetections = detectionData.reduce((s: number, d: any) => s + Number(d.barang), 0);
  const camerasDown = Number(cameraStats?.mati ?? 0);
  const totalVehicles = vehicleHourly.reduce((s: number, v: any) => s + Number(v.masuk) + Number(v.keluar), 0);

  const pieData = [
    { name: "Aktif", value: TOTAL_CAMERAS - camerasDown, color: "#16a34a" },
    { name: "Mati", value: camerasDown, color: "#dc2626" },
  ];

  return (
    <main className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 border-b border-border bg-card/95 backdrop-blur-xl">
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
          <div className="hidden sm:flex flex-col items-center">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
              <span className="text-xs font-medium text-green-600">Sistem Online</span>
            </div>
            <div className="text-center ml-4">
              <span className="text-[11px] text-muted-foreground">
                Last Update {new Date().toLocaleTimeString("id-ID")}
              </span>
            </div>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-6 py-8">
        {/* KPI cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            icon={<Package className="h-5 w-5" />}
            label="Deteksi Barang (7 hari)"
            value={totalDetections.toLocaleString("id-ID")}
            hint="7 hari terakhir"
            tone="primary"
          />
          <KpiCard
            icon={<CameraOff className="h-5 w-5" />}
            label="Kamera Mati"
            value={String(camerasDown)}
            hint={`dari ${TOTAL_CAMERAS} kamera`}
            tone="destructive"
          />
          <KpiCard
            icon={<Truck className="h-5 w-5" />}
            label="Lalu Lintas Kendaraan"
            value={String(totalVehicles)}
            hint="hari ini"
            tone="primary"
          />
          <KpiCard
            icon={<AlertTriangle className="h-5 w-5" />}
            label="Insiden Tercatat"
            value={String(offlineCams.length + stagings.length)}
            hint="kamera mati & barang staging"
            tone="muted"
          />
        </div>

        {/* Charts row */}
        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          <ChartCard title="Deteksi Barang Mingguan" subtitle="Jumlah barang terdeteksi per hari">
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={detectionData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="day" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                <Bar dataKey="barang" fill="#3f3f46" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Status Kamera" subtitle="Distribusi kondisi seluruh kamera">
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} paddingAngle={3}>
                  {pieData.map((c) => (
                    <Cell key={c.name} fill={c.color} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Log Kendaraan Hari Ini" subtitle="Masuk vs keluar per jam">
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={vehicleHourly}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="hour" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="masuk" stroke="#16a34a" strokeWidth={4} dot={{ r: 5 }} activeDot={{ r: 7 }} />
                <Line type="monotone" dataKey="keluar" stroke="#dc2626" strokeWidth={4} dot={{ r: 5 }} activeDot={{ r: 7 }} />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>

        {/* Log Kendaraan & Staging */}
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          {/* Log Kendaraan */}
          <div className="rounded-lg border border-border bg-card p-5 shadow-[var(--shadow-soft)]">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Car className="h-4 w-4 text-primary" />
                <div>
                  <h2 className="text-sm font-semibold text-foreground">Log Kendaraan</h2>
                  <p className="text-xs text-muted-foreground">Bukti keluar/masuk terbaru</p>
                </div>
              </div>
              <Link to="/logs/vehicles" className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/20">
                Lihat selengkapnya <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            {vehicles.length === 0 ? (
              <EmptyState text="Belum ada log kendaraan." />
            ) : (
              <>
                {vehicles.length > PREVIEW_LIMIT && (
                  <p className="mb-3 text-xs text-muted-foreground">Menampilkan {PREVIEW_LIMIT} dari {vehicles.length} log</p>
                )}
                <ul className="space-y-3">
                  {(vehicles as VehicleLog[]).slice(0, PREVIEW_LIMIT).map((v) => (
                    <li key={v.id} className="flex items-center gap-3 rounded-md border border-border/60 p-2">
                      <img src={v.snapshot_path} alt={`Bukti kendaraan ${v.plate_number}`} loading="lazy" className="h-16 w-20 shrink-0 rounded object-cover" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between">
                          <span className="rounded bg-muted px-2 py-0.5 font-mono text-sm font-semibold tracking-wider text-foreground">{v.plate_number}</span>
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${v.status === "masuk" ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive"}`}>
                            {v.status}
                          </span>
                        </div>
                        <p className="mt-2 text-xs text-muted-foreground">{formatDateTime(v.entry_time)}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>

          {/* Deteksi Barang Staging */}
          <div className="rounded-lg border border-border bg-card p-5 shadow-[var(--shadow-soft)]">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Boxes className="h-4 w-4 text-primary" />
                <div>
                  <h2 className="text-sm font-semibold text-foreground">Deteksi Barang Staging</h2>
                  <p className="text-xs text-muted-foreground">Bukti, waktu laporan & durasi</p>
                </div>
              </div>
              <Link to="/logs/staging" className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/20">
                Lihat selengkapnya <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            {stagings.length === 0 ? (
              <EmptyState text="Belum ada deteksi barang staging." />
            ) : (
              <>
                {stagings.length > PREVIEW_LIMIT && (
                  <p className="mb-3 text-xs text-muted-foreground">Menampilkan {PREVIEW_LIMIT} dari {stagings.length} deteksi</p>
                )}
                <ul className="space-y-3">
                  {(stagings as StagingDetection[]).slice(0, PREVIEW_LIMIT).map((s) => (
                    <li key={s.id} className="flex items-center gap-3 rounded-md border border-border/60 p-2">
                      <img src={`data:image/jpeg;base64,${s.foto_base64}`} alt={s.class_name ?? "Bukti deteksi barang"} loading="lazy" className="h-16 w-20 shrink-0 rounded object-cover" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">{s.class_name ?? "Barang tidak teridentifikasi"}</p>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">Dilaporkan {formatDateTime(s.created_at)}</p>
                        <div className="mt-2">
                          <span className="inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold bg-red-100 text-red-700">
                            <Clock className="mr-1 h-3 w-3" />
                            {formatDuration(s.first_detected)}
                          </span>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </div>

        {/* Kamera Mati */}
        <div className="mt-6 rounded-lg border border-border bg-card p-5 shadow-[var(--shadow-soft)]">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CameraOff className="h-4 w-4 text-destructive" />
              <div>
                <h2 className="text-sm font-semibold text-foreground">Laporan Kamera Mati</h2>
                <p className="text-xs text-muted-foreground">Nama kamera & waktu kejadian</p>
              </div>
            </div>
            <Link to="/logs/cameras" className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-3 py-1 text-xs font-medium text-destructive transition-colors hover:bg-destructive/20">
              Lihat selengkapnya <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          {offlineCams.length === 0 ? (
            <EmptyState text="Tidak ada kamera mati." />
          ) : (
            <>
              {offlineCams.length > PREVIEW_LIMIT && (
                <p className="mb-3 text-xs text-muted-foreground">Menampilkan {PREVIEW_LIMIT} dari {offlineCams.length} laporan</p>
              )}
              <ul className="divide-y divide-border">
                {(offlineCams as CameraOfflineEvent[]).slice(0, PREVIEW_LIMIT).map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-md bg-destructive/10 text-destructive">
                        <CameraOff className="h-4 w-4" />
                      </div>
                      <p className="text-sm font-medium text-foreground">{c.camera}</p>
                    </div>
                    <span className="text-xs text-muted-foreground">{formatDateTime(c.created_at)}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </section>

      <footer className="border-t border-border bg-card py-6 text-center text-xs text-muted-foreground">
        {TEMPLATE.companyName} · Dashboard Pemantauan
      </footer>
    </main>
  );
}

function KpiCard({ icon, label, value, hint, tone }: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
  tone: "primary" | "destructive" | "muted";
}) {
  const toneClass = tone === "destructive" ? "bg-destructive/10 text-destructive" : tone === "primary" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground";
  return (
    <div className="rounded-lg border border-border bg-card p-5 shadow-[var(--shadow-soft)]">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
        <div className={`flex h-9 w-9 items-center justify-center rounded-md ${toneClass}`}>{icon}</div>
      </div>
      <p className="mt-3 text-3xl font-bold tracking-tight text-foreground">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function ChartCard({ title, subtitle, children }: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-5 shadow-[var(--shadow-soft)]">
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <p className="rounded-md border border-dashed border-border bg-muted/30 p-6 text-center text-xs text-muted-foreground">
      {text}
    </p>
  );
}