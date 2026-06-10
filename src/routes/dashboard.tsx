import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
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
  ArrowLeft,
  Package,
  CameraOff,
  Truck,
  AlertTriangle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatShortDate, formatDateTime, type EvidenceEntry } from "@/lib/evidence";
import companyLogo from "@/assets/company-logo.png";

const PAGE_SIZE = 6;

const TEMPLATE = {
  companyName: "PT Contoh Sejahtera",
  location: "Jalan Merdeka No. 10, Jakarta Pusat",
};

// Sample data — replace with real backend queries when tables are available.
const detectionData = [
  { day: "Sen", barang: 124 },
  { day: "Sel", barang: 156 },
  { day: "Rab", barang: 142 },
  { day: "Kam: ", barang: 189 },
  { day: "Jum", barang: 173 },
  { day: "Sab", barang: 98 },
  { day: "Min", barang: 64 },
];

const cameraStatus = [
  { name: "Aktif", value: 18, color: "hsl(var(--primary))" },
  { name: "Mati", value: 3, color: "hsl(var(--destructive))" },
  { name: "Maintenance", value: 1, color: "hsl(var(--muted-foreground))" },
];

const vehicleLogs = [
  { hour: "06:00", masuk: 4, keluar: 1 },
  { hour: "09:00", masuk: 12, keluar: 6 },
  { hour: "12:00", masuk: 8, keluar: 9 },
  { hour: "15:00", masuk: 15, keluar: 11 },
  { hour: "18:00", masuk: 6, keluar: 14 },
  { hour: "21:00", masuk: 2, keluar: 5 },
];

const recentCameraIssues = [
  { id: "CAM-04", location: "Gudang A - Pintu Belakang", since: "2 jam lalu" },
  { id: "CAM-11", location: "Loading Dock 2", since: "5 jam lalu" },
  { id: "CAM-17", location: "Area Parkir Timur", since: "1 hari lalu" },
];

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
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [limit, setLimit] = useState(PAGE_SIZE);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["entries", { from, to, limit }],
    queryFn: async () => {
      let q = supabase
        .from("evidence_entries")
        .select("*", { count: "exact" })
        .order("occurred_at", { ascending: false })
        .limit(limit);

      if (from) q = q.gte("occurred_at", new Date(from).toISOString());
      if (to) {
        const end = new Date(to);
        end.setHours(23, 59, 59, 999);
        q = q.lte("occurred_at", end.toISOString());
      }

      const { data, error, count } = await q;
      if (error) throw error;
      return { entries: (data ?? []) as EvidenceEntry[], total: count ?? 0 };
    },
  });

  const entries = data?.entries ?? [];
  const total = data?.total ?? 0;
  const hasMore = useMemo(() => entries.length < total, [entries.length, total]);

  const totalDetections = detectionData.reduce((s, d) => s + d.barang, 0);
  const camerasDown = cameraStatus.find((c) => c.name === "Mati")?.value ?? 0;
  const totalVehicles = vehicleLogs.reduce((s, v) => s + v.masuk + v.keluar, 0);

  return (
    <main className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 border-b border-border bg-card/95 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-4">
          <div className="flex items-center gap-3">
            <Link
              to="/"
              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              aria-label="Kembali ke beranda"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <img
              src={companyLogo}
              alt={`Logo ${TEMPLATE.companyName}`}
              width={40}
              height={40}
              className="h-10 w-10 rounded-md border border-border bg-background object-contain p-1"
            />
            <div className="min-w-0">
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                {TEMPLATE.companyName}
              </p>
              <h1 className="truncate text-lg font-semibold tracking-tight text-foreground">
                Dashboard Pemantauan
              </h1>
            </div>
          </div>
          <p className="hidden text-xs text-muted-foreground sm:block">{TEMPLATE.location}</p>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-6 py-8">
        {/* KPI cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            icon={<Package className="h-5 w-5" />}
            label="Deteksi Barang (7 hari)"
            value={totalDetections.toLocaleString("id-ID")}
            hint="+12% dari minggu lalu"
            tone="primary"
          />
          <KpiCard
            icon={<CameraOff className="h-5 w-5" />}
            label="Kamera Mati"
            value={String(camerasDown)}
            hint={`dari ${cameraStatus.reduce((s, c) => s + c.value, 0)} kamera`}
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
            value={String(total)}
            hint="total entri arsip"
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
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Bar dataKey="barang" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Status Kamera" subtitle="Distribusi kondisi seluruh kamera">
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie
                  data={cameraStatus}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={55}
                  outerRadius={85}
                  paddingAngle={3}
                >
                  {cameraStatus.map((c) => (
                    <Cell key={c.name} fill={c.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Log Kendaraan Hari Ini" subtitle="Masuk vs keluar per jam">
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={vehicleLogs}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="hour" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line
                  type="monotone"
                  dataKey="masuk"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
                <Line
                  type="monotone"
                  dataKey="keluar"
                  stroke="hsl(var(--destructive))"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>

        {/* Camera issues table */}
        <div className="mt-6 rounded-lg border border-border bg-card p-5 shadow-[var(--shadow-soft)]">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-foreground">Laporan Kamera Mati</h2>
              <p className="text-xs text-muted-foreground">Perlu perhatian teknisi</p>
            </div>
            <span className="rounded-full bg-destructive/10 px-3 py-1 text-xs font-medium text-destructive">
              {recentCameraIssues.length} insiden
            </span>
          </div>
          <ul className="divide-y divide-border">
            {recentCameraIssues.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-md bg-destructive/10 text-destructive">
                    <CameraOff className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">{c.id}</p>
                    <p className="text-xs text-muted-foreground">{c.location}</p>
                  </div>
                </div>
                <span className="text-xs text-muted-foreground">{c.since}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Evidence archive */}
        <div className="mt-8">
          <div className="mb-4 flex items-end justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Arsip Bukti Kejadian</h2>
              <p className="text-xs text-muted-foreground">Daftar entri terbaru dari lapangan</p>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card p-4 shadow-[var(--shadow-soft)]">
            <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-muted-foreground">Dari tanggal</span>
                <input
                  type="date"
                  value={from}
                  onChange={(e) => {
                    setFrom(e.target.value);
                    setLimit(PAGE_SIZE);
                  }}
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-muted-foreground">Sampai tanggal</span>
                <input
                  type="date"
                  value={to}
                  onChange={(e) => {
                    setTo(e.target.value);
                    setLimit(PAGE_SIZE);
                  }}
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                />
              </label>
              <div className="flex items-end">
                <button
                  type="button"
                  onClick={() => {
                    setFrom("");
                    setTo("");
                    setLimit(PAGE_SIZE);
                  }}
                  className="h-9 rounded-md border border-border bg-background px-3 text-sm font-medium text-foreground transition-colors hover:bg-accent"
                >
                  Reset
                </button>
              </div>
            </div>
          </div>

          <div className="mt-6">
            {isLoading ? (
              <SkeletonGrid />
            ) : isError ? (
              <p className="rounded-md border border-border bg-card p-6 text-sm text-destructive">
                Gagal memuat data.
              </p>
            ) : entries.length === 0 ? (
              <p className="rounded-md border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">
                Tidak ada entri pada rentang tanggal ini.
              </p>
            ) : (
              <>
                <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                  {entries.map((entry) => (
                    <li key={entry.id}>
                      <EntryCard entry={entry} />
                    </li>
                  ))}
                </ul>

                <div className="mt-6 flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
                  <span>
                    Menampilkan {entries.length} dari {total} entri
                  </span>
                  {hasMore && (
                    <button
                      type="button"
                      onClick={() => setLimit((n) => n + PAGE_SIZE)}
                      className="rounded-md border border-border bg-card px-4 py-2 font-medium text-foreground transition-colors hover:bg-accent"
                    >
                      Muat lebih banyak
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </section>

      <footer className="border-t border-border bg-card py-6 text-center text-xs text-muted-foreground">
        {TEMPLATE.companyName} · Dashboard Pemantauan
      </footer>
    </main>
  );
}

function KpiCard({
  icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
  tone: "primary" | "destructive" | "muted";
}) {
  const toneClass =
    tone === "destructive"
      ? "bg-destructive/10 text-destructive"
      : tone === "primary"
        ? "bg-primary/10 text-primary"
        : "bg-muted text-muted-foreground";
  return (
    <div className="rounded-lg border border-border bg-card p-5 shadow-[var(--shadow-soft)]">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        <div className={`flex h-9 w-9 items-center justify-center rounded-md ${toneClass}`}>
          {icon}
        </div>
      </div>
      <p className="mt-3 text-3xl font-bold tracking-tight text-foreground">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function ChartCard({
  title,
  subtitle,
  children,
}: {
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

function EntryCard({ entry }: { entry: EvidenceEntry }) {
  return (
    <Link
      to="/entry/$id"
      params={{ id: String(entry.id) }}
      className="group block overflow-hidden rounded-lg border border-border bg-card shadow-[var(--shadow-soft)] transition-all hover:-translate-y-0.5 hover:border-ring focus:outline-none focus:ring-2 focus:ring-ring"
    >
      <div className="aspect-[4/3] w-full overflow-hidden bg-muted">
        <img
          src={entry.image_url}
          alt={`Bukti kejadian ${formatShortDate(entry.occurred_at)}`}
          loading="lazy"
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
        />
      </div>
      <div className="space-y-1 p-4">
        <p className="text-sm font-medium text-foreground">{formatDateTime(entry.occurred_at)}</p>
        <p className="text-xs text-muted-foreground">Entri #{entry.id}</p>
      </div>
    </Link>
  );
}

function SkeletonGrid() {
  return (
    <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <li key={i} className="overflow-hidden rounded-lg border border-border bg-card">
          <div className="aspect-[4/3] w-full animate-pulse bg-muted" />
          <div className="space-y-2 p-4">
            <div className="h-3 w-2/3 animate-pulse rounded bg-muted" />
            <div className="h-3 w-1/3 animate-pulse rounded bg-muted" />
          </div>
        </li>
      ))}
    </ul>
  );
}
