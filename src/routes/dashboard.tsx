import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { API_BASE_URL } from "@/lib/api-config";
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
  Boxes,
  CameraOff,
  Package,
  NotebookText,
  Calendar,
  Box,
  UsersRound,
  User,
  Clock,
} from "lucide-react";
import { formatDateTime } from "@/lib/evidence";
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
const REPORT_HOURS = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, "0")}:00`);

function colorForClass(name: string) {
  const lower = name.toLowerCase();
  if (lower.includes("truk")) return CHART_COLORS.orange;
  if (lower.includes("mobil")) return CHART_COLORS.blue;
  return CHART_COLORS.purple;
}

function pivotVehicleInterval(raw: VehicleIntervalRaw[]) {
  const allExpectedClasses = ["Mobil", "Truk"];
  const byHour = new Map<string, Record<string, number>>();
  REPORT_HOURS.forEach((h) => {
    const row: Record<string, number> = {};
    allExpectedClasses.forEach((c) => {
      row[c] = 0;
    });
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
              className="text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors text-sm font-mono"
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

function Dashboard() {
  const [filterClass, setFilterClass] = useState("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const queryClient = useQueryClient();

  useEffect(() => {
    const eventSource = new EventSource(`${API_BASE_URL}/api/events`);
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

  const { data: vehicles = [] } = useQuery<VehicleLog[]>({
    queryKey: ["vehicle_log", "preview", filterClass],
    queryFn: async () => {
      try {
        let url = `${API_BASE_URL}/api/vehicles/log?limit=20`;
        if (filterClass !== "all") {
          url += `&jenis=${encodeURIComponent(filterClass)}`;
        }
        const res = await fetch(url);
        if (!res.ok) return [];
        const json = await res.json();
        return json.data || (Array.isArray(json) ? json : []);
      } catch {
        return [];
      }
    },
  });
  const { data: stagings = [] } = useQuery<StagingDetection[]>({
    queryKey: ["staging_detections", "preview"],
    queryFn: async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/alerts?class_name=box&limit=4`);
        if (!res.ok) return [];
        const json = await res.json();
        return json.data || (Array.isArray(json) ? json : []);
      } catch {
        return [];
      }
    },
  });
  const { data: offlineCams = [] } = useQuery<CameraOfflineEvent[]>({
    queryKey: ["camera_offline_events", "preview"],
    queryFn: async () => {
      try {
        const res = await fetch(
          `${API_BASE_URL}/api/alerts?class_name=` +
            encodeURIComponent("KAMERA OFFLINE") +
            "&limit=4",
        );
        if (!res.ok) return [];
        const json = await res.json();
        return json.data || (Array.isArray(json) ? json : []);
      } catch {
        return [];
      }
    },
  });
  const { data: vehicleIntervalRaw = [] } = useQuery<VehicleIntervalRaw[]>({
    queryKey: ["vehicle_interval", startDate, endDate],
    queryFn: async () => {
      let url = `${API_BASE_URL}/api/vehicles/stats/hourly`;
      if (startDate && endDate) url += `?start_date=${startDate}&end_date=${endDate}`;
      const res = await fetch(url);
      if (!res.ok) return [];
      return res.json() as Promise<VehicleIntervalRaw[]>;
    },
  });
  const { data: detectionData = [] } = useQuery<{ day: string; barang: number }[]>({
    queryKey: ["detection_weekly", startDate, endDate],
    queryFn: async () => {
      let url = `${API_BASE_URL}/api/alerts/stats/weekly`;
      if (startDate && endDate) url += `?start_date=${startDate}&end_date=${endDate}`;
      const res = await fetch(url);
      if (!res.ok) return [];
      return res.json();
    },
  });
  const { data: cameraStats } = useQuery<{ mati: number }>({
    queryKey: ["camera_status", startDate, endDate],
    queryFn: async () => {
      let url = `${API_BASE_URL}/api/alerts/stats/camera-status`;
      if (startDate && endDate) url += `?start_date=${startDate}&end_date=${endDate}`;
      const res = await fetch(url);
      if (!res.ok) return { mati: 0 };
      return res.json();
    },
  });
  const { data: attendanceStats } = useQuery({
    queryKey: ["attendance_stats_daily"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE_URL}/api/attendance/stats/daily`);
      if (!res.ok)
        return { total_arrival: 0, total_departure: 0, total_break_out: 0, total_break_in: 0 };
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

  const { chartData: vehicleHourly, classes: vehicleClasses } =
    pivotVehicleInterval(vehicleIntervalRaw);
  const detectionChartData = fillWeeklyGaps(detectionData);
  const totalDetections = detectionData.reduce((s, d) => s + Number(d.barang), 0);
  const camerasDown = Number(cameraStats?.mati ?? 0);
  const totalVehicles = vehicleIntervalRaw.reduce((s, r) => s + r.total, 0);
  const filteredVehicles = vehicles;

  return (
    <main className="flex-1 transition-colors duration-300 bg-[#f4f5f7] dark:bg-[#121417] text-slate-900 dark:text-slate-100">
      <div className="mx-auto max-w-[1440px] px-6 pt-6 pb-4 border-b transition-colors duration-300 bg-white dark:bg-[#1a1d24] border-slate-200 dark:border-[#272b33]">
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

      <div className="mx-auto max-w-[1440px] px-6 py-6">
        {/* Filter Date */}
        <div className="mb-8 flex flex-wrap items-center gap-3 p-3 rounded-xl border shadow-sm transition-colors duration-300 bg-white dark:bg-[#1a1d24] border-slate-200 dark:border-[#272b33]">
          <span className="text-xs font-medium font-mono text-slate-500 dark:text-slate-400">
            Periode:
          </span>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 rounded-md border px-2 py-1.5 shadow-sm transition-colors duration-300 bg-slate-50 dark:bg-[#121417] border-slate-200 dark:border-[#272b33]">
              <Calendar className="h-4 w-4 text-slate-400 dark:text-slate-500" />
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-[115px] bg-transparent text-xs outline-none text-slate-900 dark:text-slate-100"
                placeholder="Dari"
              />
              <span className="text-xs text-slate-400 dark:text-slate-500">—</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-[115px] bg-transparent text-xs outline-none text-slate-900 dark:text-slate-100"
                placeholder="Sampai"
              />
            </div>

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
        </div>

        {/* KPI Cards */}
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4 mb-8">
          <KpiCard
            icon={<Package className="h-5 w-5 text-blue-600 dark:text-blue-400" />}
            iconBg="bg-blue-50 dark:bg-[#222630]"
            label="Deteksi Staging"
            value={totalDetections.toLocaleString("id-ID")}
            hint={startDate && endDate ? `${startDate} - ${endDate}` : "7 hari terakhir"}
          />
          <KpiCard
            icon={<CameraOff className="h-5 w-5 text-red-600 dark:text-red-400" />}
            iconBg="bg-red-50 dark:bg-[#222630]"
            label="Kamera Offline"
            value={String(camerasDown)}
            hint={`dari ${TOTAL_CAMERAS} kamera`}
          />
          <KpiCard
            icon={<Car className="h-5 w-5 text-green-600 dark:text-green-400" />}
            iconBg="bg-green-50 dark:bg-[#222630]"
            label="Total Kendaraan"
            value={String(totalVehicles)}
            hint={startDate && endDate ? `${startDate} - ${endDate}` : "Hari ini"}
          />
          <KpiCardBreakdown
            icon={<NotebookText className="h-5 w-5 text-cyan-600 dark:text-cyan-400" />}
            iconBg="bg-cyan-50 dark:bg-[#222630]"
            label="Detail Kendaraan"
            breakdown={todayBreakdown}
            hint={startDate && endDate ? "Periode" : ""}
          />
          <KpiCard
            icon={<UsersRound className="h-5 w-5 text-blue-600 dark:text-blue-400" />}
            iconBg="bg-blue-50 dark:bg-[#222630]"
            label="Hadir Hari Ini"
            value={String(attendanceStats?.total_arrival ?? 0)}
            hint={`Pulang: ${attendanceStats?.total_departure ?? 0}`}
          />
        </div>

        {/* Charts Section */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          <div className="lg:col-span-1 rounded-xl border p-5 shadow-sm transition-colors duration-300 bg-white dark:bg-[#1a1d24] border-slate-200 dark:border-[#272b33]">
            <div className="mb-4">
              <h3 className="text-sm font-semibold flex items-center gap-2 font-space text-slate-900 dark:text-slate-100">
                <span className="inline-block w-1 h-4 rounded-full bg-blue-600 dark:bg-blue-400"></span>{" "}
                Deteksi Barang (Harian)
              </h3>
              <p className="text-xs font-mono mt-1 text-slate-500 dark:text-slate-400">
                Jumlah barang terdeteksi per hari
              </p>
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart
                data={detectionChartData}
                margin={{ top: 10, right: 0, left: 0, bottom: 0 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="currentColor"
                  className="stroke-slate-200 dark:stroke-[#272b33]"
                  vertical={false}
                />
                <XAxis
                  dataKey="day"
                  fontSize={11}
                  fontFamily="'IBM Plex Mono', monospace"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: "currentColor" }}
                  className="text-slate-500 dark:text-slate-400"
                />
                <YAxis
                  fontSize={11}
                  fontFamily="'IBM Plex Mono', monospace"
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={false}
                  tick={{ fill: "currentColor" }}
                  className="text-slate-500 dark:text-slate-400"
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#1a1d24",
                    borderColor: "#272b33",
                    borderRadius: 8,
                    color: "#f8fafc",
                  }}
                  formatter={(v: number) => [`${v} barang`, "Jumlah"]}
                />
                <Bar
                  dataKey="barang"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={40}
                  className="fill-blue-600 dark:fill-blue-500"
                >
                  {detectionChartData.map((e, i) => (
                    <Cell
                      key={i}
                      fill={e.barang > 0 ? undefined : "currentColor"}
                      className={e.barang > 0 ? "" : "text-slate-200 dark:text-[#272b33]"}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="lg:col-span-2 rounded-xl border p-5 shadow-sm transition-colors duration-300 bg-white dark:bg-[#1a1d24] border-slate-200 dark:border-[#272b33]">
            <div className="mb-4">
              <h3 className="text-sm font-semibold flex items-center gap-2 font-space text-slate-900 dark:text-slate-100">
                <span className="inline-block w-1 h-4 rounded-full bg-blue-600 dark:bg-blue-400"></span>{" "}
                Deteksi Kendaraan
              </h3>
              <p className="text-xs font-mono mt-1 text-slate-500 dark:text-slate-400">
                Alokasi waktu tiap jam
              </p>
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={vehicleHourly} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
                <CartesianGrid
                  strokeDasharray="4 4"
                  className="stroke-slate-200 dark:stroke-[#272b33]"
                  vertical={false}
                />
                <XAxis
                  dataKey="hour"
                  fontSize={10}
                  fontFamily="'IBM Plex Mono', monospace"
                  tickLine={false}
                  axisLine={false}
                  ticks={REPORT_HOURS}
                  tick={({ x, y, payload }) => (
                    <g transform={`translate(${x},${y}) rotate(-45)`}>
                      <text
                        x={0}
                        y={0}
                        dy={10}
                        textAnchor="end"
                        className="text-slate-500 dark:text-slate-400 fill-current"
                        fontSize={9}
                        fontFamily="'IBM Plex Mono', monospace"
                      >
                        {payload.value.replace(":00", "")}
                      </text>
                    </g>
                  )}
                />
                <YAxis
                  fontSize={11}
                  fontFamily="'IBM Plex Mono', monospace"
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={false}
                  className="text-slate-500 dark:text-slate-400 fill-current"
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#1a1d24",
                    borderColor: "#272b33",
                    borderRadius: 8,
                    color: "#f8fafc",
                  }}
                  formatter={(v: number, n: string) => [`${v} kendaraan`, n]}
                  labelFormatter={(l) => `Pukul ${l}`}
                />
                <Legend
                  iconType="circle"
                  wrapperStyle={{ fontSize: 11, fontFamily: "'IBM Plex Mono', monospace" }}
                />
                {vehicleClasses.map((cls) => {
                  const fillColor = colorForClass(cls);
                  return (
                    <RechartsArea
                      key={cls}
                      type="monotone"
                      dataKey={cls}
                      name={cls}
                      stackId="a"
                      stroke={fillColor}
                      fill={fillColor}
                      fillOpacity={0.2}
                      strokeWidth={2}
                      dot={{ r: 3, fill: fillColor, strokeWidth: 1 }}
                      activeDot={{ r: 5 }}
                    />
                  );
                })}
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Logs Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <div className="rounded-xl border p-5 shadow-sm transition-colors duration-300 bg-white dark:bg-[#1a1d24] border-slate-200 dark:border-[#272b33]">
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm font-semibold flex items-center gap-2 font-space text-slate-900 dark:text-slate-100">
                <Car className="h-4 w-5 text-slate-500 dark:text-slate-400" /> Log Kendaraan
              </span>
              <Link
                to="/logs/vehicles"
                className="text-xs hover:underline font-mono font-medium text-blue-600 dark:text-blue-400"
              >
                Lihat semua →
              </Link>
            </div>
            {filteredVehicles.length === 0 ? (
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
                    Menampilkan {Math.min(filteredVehicles.length, PREVIEW_LIMIT)} data
                  </p>
                  <select
                    value={filterClass}
                    onChange={(e) => setFilterClass(e.target.value)}
                    className="rounded-md border px-2 py-1 text-xs outline-none font-mono bg-slate-50 dark:bg-[#121417] border-slate-200 dark:border-[#272b33] text-slate-900 dark:text-slate-100"
                  >
                    <option value="all">Semua Jenis</option>
                    <option value="Mobil">Mobil</option>
                    <option value="Truk">Truk</option>
                  </select>
                </div>
                <div className="space-y-3">
                  {filteredVehicles.slice(0, PREVIEW_LIMIT).map((v) => {
                    const isTruk = v.jenis_kendaraan.includes("Truk");
                    const isCam1 = v.kamera_nama === "Loading Kiri";

                    let muatanBadge = null;
                    if (isTruk && isCam1) {
                      const status = v.status_muatan || "";
                      let bgColor =
                        "bg-slate-100 dark:bg-[#222630] border-slate-200 dark:border-[#272b33]";
                      let textColor = "text-slate-600 dark:text-slate-400";
                      let displayText = status || "Tidak dapat dipastikan";

                      if (status === "Bermuatan") {
                        bgColor =
                          "bg-orange-50 dark:bg-orange-950/40 border-orange-200 dark:border-orange-900/50";
                        textColor = "text-orange-600 dark:text-orange-400";
                      } else if (status === "Kosong / bak tertutup") {
                        bgColor =
                          "bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-900/50";
                        textColor = "text-blue-600 dark:text-blue-400";
                      }

                      muatanBadge = (
                        <div
                          className={`flex flex-wrap items-center gap-x-2 gap-y-1 mt-1 px-2 py-0.5 rounded-md border ${bgColor}`}
                        >
                          <span
                            className={`flex items-center gap-1 text-[10px] font-semibold font-mono ${textColor}`}
                          >
                            <Box className="h-3.5 w-3.5" />
                            {displayText}
                          </span>
                        </div>
                      );
                    }

                    let statusKejadianBadge = null;
                    if (v.jenis_kejadian === "MASUK") {
                      statusKejadianBadge = (
                        <span className="ml-2 inline-flex items-center rounded-full border px-2 py-0.5 text-[9px] font-bold tracking-wider font-mono uppercase bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-400 border-blue-200 dark:border-blue-800/50">
                          <span className="w-1.5 h-1.5 rounded-full bg-blue-500 mr-1.5 animate-pulse" />{" "}
                          {v.jenis_kejadian}
                        </span>
                      );
                    } else if (v.jenis_kejadian === "KELUAR") {
                      statusKejadianBadge = (
                        <span className="ml-2 inline-flex items-center rounded-full border px-2 py-0.5 text-[9px] font-bold tracking-wider font-mono uppercase bg-orange-50 text-orange-700 dark:bg-orange-950/50 dark:text-orange-400 border-orange-200 dark:border-orange-800/50">
                          <span className="w-1.5 h-1.5 rounded-full bg-orange-500 mr-1.5" />{" "}
                          {v.jenis_kejadian}
                        </span>
                      );
                    }
                    return (
                      <div
                        key={v.id}
                        className="flex gap-3 border-b pb-3 last:border-0 border-slate-200 dark:border-[#272b33]"
                      >
                        <div className="relative flex-shrink-0">
                          <img
                            src={`data:image/jpeg;base64,${v.gambar_base64}`}
                            className="h-14 w-20 rounded object-cover bg-slate-100 dark:bg-[#222630]"
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-sm font-medium truncate font-space text-slate-900 dark:text-slate-100">
                              {v.jenis_kendaraan}
                              {statusKejadianBadge}
                            </p>
                            <ConfidenceBadge confidence={Number(v.confidence)} />
                          </div>
                          {muatanBadge}
                          <div className="flex flex-wrap items-center gap-x-3 text-[11px] mt-0.5 font-mono text-slate-500 dark:text-slate-400">
                            <span>{formatDateTime(v.timestamp)}</span>
                            {v.track_id && <span>🆔 Track: {v.track_id}</span>}
                            {v.kamera_nama && <span>📍 {v.kamera_nama}</span>}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          <div className="rounded-xl border p-5 shadow-sm transition-colors duration-300 bg-white dark:bg-[#1a1d24] border-slate-200 dark:border-[#272b33]">
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm font-semibold flex items-center gap-2 font-space text-slate-900 dark:text-slate-100">
                <Boxes className="h-4 w-4 text-slate-500 dark:text-slate-400" /> Deteksi Staging
              </span>
              <Link
                to="/logs/staging"
                className="text-xs hover:underline font-mono font-medium text-blue-600 dark:text-blue-400"
              >
                Lihat semua →
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
                    className="flex gap-3 border-b pb-3 last:border-0 border-slate-200 dark:border-[#272b33]"
                  >
                    <div className="relative flex-shrink-0">
                      <img
                        src={`data:image/jpeg;base64,${s.foto_base64}`}
                        className="h-14 w-20 rounded object-cover bg-slate-100 dark:bg-[#222630]"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-medium truncate font-space text-slate-900 dark:text-slate-100">
                          {s.class_name ?? "Box"}
                        </p>
                        <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold font-mono bg-red-100 dark:bg-red-950/40 text-red-600 dark:text-red-400 border-red-200 dark:border-red-900/50">
                          <Clock className="h-3 w-3" />
                          {formatDurationFromSeconds(s.duration)}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 text-[11px] mt-0.5 font-mono text-slate-500 dark:text-slate-400">
                        <span>{formatDateTime(s.created_at)}</span>
                        {s.camera && <span>📍 {s.camera}</span>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Camera Offline Section */}
        <div className="rounded-xl border p-5 shadow-sm transition-colors duration-300 bg-white dark:bg-[#1a1d24] border-slate-200 dark:border-[#272b33]">
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm font-semibold flex items-center gap-2 font-space text-slate-900 dark:text-slate-100">
              <CameraOff className="h-4 w-4 text-red-600 dark:text-red-400" /> Laporan Kamera Mati
            </span>
            <Link
              to="/logs/cameras"
              className="text-xs hover:underline font-mono font-medium text-blue-600 dark:text-blue-400"
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

        {/* Attendance Log Section */}
        <div className="rounded-xl border p-5 shadow-sm transition-colors duration-300 mt-6 bg-white dark:bg-[#1a1d24] border-slate-200 dark:border-[#272b33]">
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm font-semibold flex items-center gap-2 font-space text-slate-900 dark:text-slate-100">
              <User className="h-4 w-5 text-slate-500 dark:text-slate-400" /> Log Kehadiran
            </span>
            <Link
              to="/attendance"
              className="text-xs hover:underline font-mono font-medium text-blue-600 dark:text-blue-400"
            >
              Lihat semua →
            </Link>
          </div>
          {(() => {
            const { data: attendanceLog, isLoading } = useQuery({
              queryKey: ["attendance_log_preview"],
              queryFn: async () => {
                const res = await fetch(`${API_BASE_URL}/api/attendance/log?limit=4`);
                if (!res.ok) return { data: [] };
                return res.json();
              },
            });

            if (isLoading) {
              return (
                <div className="text-center py-10 text-sm font-mono text-slate-500 dark:text-slate-400">
                  Memuat data...
                </div>
              );
            }

            const validEvents = (attendanceLog?.data || [])
              .filter(
                (log: any) =>
                  log.event_type === "ARRIVAL" ||
                  log.event_type === "DEPARTURE" ||
                  log.event_type === "BREAK_OUT" ||
                  log.event_type === "BREAK_IN",
              )
              .slice(0, 4);

            if (validEvents.length === 0) {
              return (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <User className="h-12 w-12 mb-3 text-slate-400" strokeWidth={1.5} />
                  <h4 className="text-base font-semibold font-space text-slate-900 dark:text-slate-100">
                    Belum Ada Data Kehadiran Karyawan
                  </h4>
                  <p className="mt-1 text-sm font-mono text-slate-500 dark:text-slate-400">
                    Sistem menunggu deteksi karyawan.
                  </p>
                </div>
              );
            }

            return (
              <div className="space-y-3">
                {validEvents.map((log: any) => {
                  let badgeColor =
                    "bg-gray-100 text-gray-700 dark:bg-gray-800/30 dark:text-gray-400 border-gray-200 dark:border-gray-700/50";
                  if (log.event_type === "ARRIVAL") {
                    badgeColor =
                      "bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400 border-green-200 dark:border-green-900/50";
                  } else if (log.event_type === "DEPARTURE") {
                    badgeColor =
                      "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400 border-red-200 dark:border-red-900/50";
                  } else if (log.event_type === "BREAK_OUT") {
                    badgeColor =
                      "bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-400 border-orange-200 dark:border-orange-900/50";
                  } else if (log.event_type === "BREAK_IN") {
                    badgeColor =
                      "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400 border-blue-200 dark:border-blue-900/50";
                  }

                  return (
                    <div
                      key={log.id}
                      className="flex gap-3 border-b pb-3 last:border-0 border-slate-200 dark:border-[#272b33]"
                    >
                      <div className="relative flex-shrink-0 flex items-center justify-center h-14 w-20 rounded object-cover bg-slate-100 dark:bg-[#222630]">
                        {log.snapshot_path ? (
                          <img
                            src={`${API_BASE_URL}/${log.snapshot_path?.replace(/\\/g, "/")}`}
                            className="h-14 w-20 rounded object-cover"
                            alt="Karyawan"
                          />
                        ) : (
                          <User className="h-6 w-6 text-slate-400" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-medium truncate font-space text-slate-900 dark:text-slate-100">
                            {log.employee_name || (log.is_visitor ? "Pengunjung" : "Unknown")}
                          </p>
                          <span
                            className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold font-mono ${badgeColor}`}
                          >
                            {log.event_type}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-x-3 text-[11px] mt-0.5 font-mono text-slate-500 dark:text-slate-400">
                          <span>{formatDateTime(log.timestamp)}</span>
                          {log.nik && <span>🆔 {log.nik}</span>}
                          {log.camera_id && <span>📍 {log.camera_id}</span>}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>
      </div>
    </main>
  );
}

// --- KPI COMPONENTS ---
function KpiCard({
  icon,
  iconBg,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  iconBg: string;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border p-5 shadow-sm transition-all hover:shadow-md transition-colors duration-300 bg-white dark:bg-[#1a1d24] border-slate-200 dark:border-[#272b33]">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium uppercase tracking-wider font-mono text-slate-500 dark:text-slate-400">
          {label}
        </span>
        <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${iconBg}`}>
          {icon}
        </div>
      </div>
      <p className="text-3xl font-bold tracking-tight font-space text-slate-900 dark:text-slate-100">
        {value}
      </p>
      <p className="mt-1 text-xs font-mono text-slate-500 dark:text-slate-400">{hint}</p>
    </div>
  );
}

function KpiCardBreakdown({
  icon,
  iconBg,
  label,
  breakdown,
  hint,
}: {
  icon: React.ReactNode;
  iconBg: string;
  label: string;
  breakdown: { mobil: number; truk: number };
  hint?: string;
}) {
  return (
    <div className="rounded-xl border p-5 shadow-sm transition-all hover:shadow-md transition-colors duration-300 bg-white dark:bg-[#1a1d24] border-slate-200 dark:border-[#272b33]">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium uppercase tracking-wider font-mono text-slate-500 dark:text-slate-400">
          {label}
        </span>
        <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${iconBg}`}>
          {icon}
        </div>
      </div>
      <div className="mt-3 flex items-center justify-around text-center">
        <div>
          <p className="text-xl font-bold font-space text-slate-900 dark:text-slate-100">
            {breakdown.mobil}
          </p>
          <p className="text-xs flex items-center justify-center gap-1 font-mono text-slate-500 dark:text-slate-400">
            <Car className="h-3 w-3 text-blue-600 dark:text-blue-400" /> Mobil
          </p>
        </div>
        <div>
          <p className="text-xl font-bold font-space text-slate-900 dark:text-slate-100">
            {breakdown.truk}
          </p>
          <p className="text-xs flex items-center justify-center gap-1 font-mono text-slate-500 dark:text-slate-400">
            <Truck className="h-3 w-3 text-orange-600 dark:text-orange-400" /> Truk
          </p>
        </div>
      </div>
      <p className="mt-2 text-center text-xs font-mono text-slate-500 dark:text-slate-400">
        {hint}
      </p>
    </div>
  );
}
