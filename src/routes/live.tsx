import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { API_BASE_URL } from "@/lib/api-config";
import { useEffect, useState, useRef, useMemo } from "react";
import {
  ArrowLeft,
  Play,
  Pause,
  Car,
  Boxes,
  VideoOff,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { formatDateTime } from "@/lib/evidence";
import Lightbox from "yet-another-react-lightbox";
import "yet-another-react-lightbox/styles.css";
import Zoom from "yet-another-react-lightbox/plugins/zoom";
import { authFetch } from "@/lib/auth";

type LiveEvent = {
  type: "vehicle" | "staging" | "camera";
  id: string;
  event_time: string;
  title: string;
  detail: string;
  image: string | null;
  metadata: string | null;
};

type VehicleIntervalRaw = { hour: string; jenis_kendaraan: string; total: number };

export const Route = createFileRoute("/live")({
  component: LivePage,
});

// --- COMPONENT UTAMA ---
function LivePage() {
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const {
    data: events = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["live_feed"],
    queryFn: async () => {
      const res = await authFetch(`${API_BASE_URL}/api/live/feed`);
      if (!res.ok) throw new Error("Gagal mengambil data");
      return res.json() as Promise<LiveEvent[]>;
    },
    refetchInterval: 5000,
  });

  const { data: vehicleIntervalRaw = [] } = useQuery<VehicleIntervalRaw[]>({
    queryKey: ["vehicle_interval_live"],
    queryFn: async () => {
      const res = await authFetch(`${API_BASE_URL}/api/vehicles/stats/hourly`);
      if (!res.ok) return [];
      return res.json();
    },
    refetchInterval: 10000,
  });

  const { data: detectionData = [] } = useQuery<{ day: string; barang: number }[]>({
    queryKey: ["detection_weekly_live"],
    queryFn: async () => {
      const res = await authFetch(`${API_BASE_URL}/api/alerts/stats/weekly`);
      if (!res.ok) return [];
      return res.json();
    },
    refetchInterval: 10000,
  });

  const { data: cameraStats } = useQuery<{ mati: number }>({
    queryKey: ["camera_status_live"],
    queryFn: async () => {
      const res = await authFetch(`${API_BASE_URL}/api/alerts/stats/camera-status`);
      if (!res.ok) return { mati: 0 };
      return res.json();
    },
    refetchInterval: 10000,
  });

  // KPI Calculation
  const todayBreakdown = useMemo(() => {
    let mobil = 0,
      truk = 0,
      motor = 0;
    vehicleIntervalRaw.forEach((item) => {
      if (item.jenis_kendaraan === "Mobil") mobil += item.total;
      else if (item.jenis_kendaraan === "Truk") truk += item.total;
      else if (item.jenis_kendaraan.includes("Motor")) motor += item.total;
    });
    return { mobil, truk, motor };
  }, [vehicleIntervalRaw]);
  const totalDetections = detectionData.reduce((s, d) => s + Number(d.barang), 0);
  const camerasDown = Number(cameraStats?.mati ?? 0);
  const totalVehicles = vehicleIntervalRaw.reduce((s, r) => s + r.total, 0);

  // --- SSE: Reset slideshow ---
  useEffect(() => {
    const eventSource = new EventSource(`${API_BASE_URL}/api/events`);
    eventSource.onmessage = () => {
      queryClient.invalidateQueries({ queryKey: ["live_feed"] });
      setCurrentIndex(0);
      setIsPlaying(true);
    };
    return () => eventSource.close();
  }, [queryClient]);

  // --- Timer Slideshow ---
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (isPlaying && events.length > 0) {
      timerRef.current = setInterval(() => {
        setIsTransitioning(true);
        setTimeout(() => {
          setCurrentIndex((prev) => (prev + 1) % events.length);
          setIsTransitioning(false);
        }, 500);
      }, 4000);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isPlaying, events]);

  useEffect(() => {
    if (currentIndex >= events.length) setCurrentIndex(0);
  }, [events, currentIndex]);

  // --- Auto Scroll Logic ---
  useEffect(() => {
    if (scrollContainerRef.current && events.length > 0) {
      const container = scrollContainerRef.current;
      const activeItem = container.querySelector(`[data-id="${events[currentIndex].id}"]`);
      if (activeItem) {
        activeItem.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    }
  }, [currentIndex, events]);

  const currentEvent = events[currentIndex];
  const goNext = () => {
    if (events.length > 0) setCurrentIndex((prev) => (prev + 1) % events.length);
  };
  const goPrev = () => {
    if (events.length > 0) setCurrentIndex((prev) => (prev - 1 + events.length) % events.length);
  };

  const getIcon = (type: string) => {
    if (type === "vehicle") return <Car className="h-4 w-4" />;
    if (type === "staging") return <Boxes className="h-4 w-4" />;
    return <VideoOff className="h-4 w-4" />;
  };
  const getLabel = (type: string) => {
    if (type === "vehicle") return "KENDARAAN";
    if (type === "staging") return "STAGING";
    return "KAMERA MATI";
  };
  const getColor = (type: string) => {
    if (type === "vehicle")
      return "bg-blue-100 text-blue-600 dark:bg-[#1e293b] dark:text-[#38bdf8]";
    if (type === "staging")
      return "bg-orange-100 text-orange-600 dark:bg-[#1e293b] dark:text-[#f97316]";
    return "bg-red-100 text-red-600 dark:bg-[#1e293b] dark:text-[#f87171]";
  };

  const TOTAL_CAMERAS = 22;

  return (
    <div className="flex flex-row w-full h-screen bg-white dark:bg-[#0b1120] text-[#0f172a] dark:text-white overflow-hidden transition-colors duration-300">
      {/* ==================== KIRI: GAMBAR (65%) ==================== */}
      <div className="flex-[2] h-full bg-[#f8fafc] dark:bg-[#0b1120] relative flex flex-col p-6">
        <div className="flex items-center gap-3 z-10 flex-shrink-0 mb-4">
          <Link
            to="/dashboard"
            className="bg-white dark:bg-[#1e293b] text-[#64748b] dark:text-[#94a3b8] hover:bg-[#f1f5f9] dark:hover:bg-[#0b1120] p-2 rounded-full border border-[#e2e8f0] dark:border-[#334155] transition shadow-sm"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="text-xl font-bold font-space text-[#0f172a] dark:text-white">
            Live Monitoring
          </h1>
        </div>

        <div className="flex-1 flex items-center justify-center">
          {isLoading ? (
            <div className="flex items-center justify-center">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500 dark:border-[#38bdf8]" />
            </div>
          ) : isError ? (
            <div className="bg-red-50 dark:bg-[#1e293b] p-6 rounded-xl border border-red-200 dark:border-red-900/50 text-red-600 dark:text-red-400 font-mono text-center">
              {error?.message}
            </div>
          ) : events.length === 0 ? (
            <div className="text-center">
              <p className="text-xl font-medium font-space text-[#0f172a] dark:text-white mb-2">
                🎬 Menunggu Aktivitas
              </p>
              <p className="text-[#64748b] dark:text-[#94a3b8] font-mono">
                Belum ada deteksi baru.
              </p>
            </div>
          ) : (
            <div className="relative group max-w-full max-h-full flex items-center justify-center">
              {currentEvent.image ? (
                <img
                  key={currentEvent.id}
                  src={`data:image/jpeg;base64,${currentEvent.image}`}
                  alt={currentEvent.title}
                  className="max-h-[65vh] w-auto max-w-[95%] object-contain rounded-2xl bg-white dark:bg-[#0b1120] shadow-2xl border border-[#e2e8f0] dark:border-[#334155] transition-all duration-700"
                  onClick={() => {
                    setSelectedImage(currentEvent.image);
                    setIsOpen(true);
                  }}
                />
              ) : (
                <div className="flex items-center justify-center">
                  <VideoOff className="h-20 w-20 text-[#cbd5e1] dark:text-[#334155]" />
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ==================== KANAN: PANEL INFO + KONTROL (35%) ==================== */}
      <div className="flex-1 h-full bg-white dark:bg-[#0f172a] border-l border-[#e2e8f0] dark:border-[#1e293b] p-6 flex flex-col gap-3 overflow-hidden transition-colors duration-300">
        {/* KPI STATISTIK */}
        <div className="grid grid-cols-2 gap-2 flex-shrink-0">
          <div className="bg-[#f8fafc] dark:bg-[#1e293b] rounded-xl p-3 border border-[#e2e8f0] dark:border-[#334155] transition-colors duration-300">
            <p className="text-[10px] uppercase tracking-wider text-[#64748b] dark:text-[#94a3b8] font-mono mb-0.5">
              Deteksi Staging
            </p>
            <p className="text-2xl font-bold font-space text-[#0f172a] dark:text-white">
              {totalDetections}
            </p>
          </div>
          <div className="bg-[#f8fafc] dark:bg-[#1e293b] rounded-xl p-3 border border-[#e2e8f0] dark:border-[#334155] transition-colors duration-300">
            <p className="text-[10px] uppercase tracking-wider text-[#64748b] dark:text-[#94a3b8] font-mono mb-0.5">
              Kamera Offline
            </p>
            <p className="text-2xl font-bold font-space text-red-600 dark:text-red-400">
              {camerasDown}
            </p>
          </div>
          <div className="bg-[#f8fafc] dark:bg-[#1e293b] rounded-xl p-3 border border-[#e2e8f0] dark:border-[#334155] transition-colors duration-300">
            <p className="text-[10px] uppercase tracking-wider text-[#64748b] dark:text-[#94a3b8] font-mono mb-0.5">
              Total Kendaraan
            </p>
            <p className="text-2xl font-bold font-space text-[#0f172a] dark:text-white">
              {totalVehicles}
            </p>
          </div>
          <div className="bg-[#f8fafc] dark:bg-[#1e293b] rounded-xl p-3 border border-[#e2e8f0] dark:border-[#334155] transition-colors duration-300 flex flex-col justify-center">
            <p className="text-[10px] uppercase tracking-wider text-[#64748b] dark:text-[#94a3b8] font-mono">
              Mbl / Trk / Mtr
            </p>
            <p className="text-sm font-bold font-space text-[#0f172a] dark:text-white">
              {todayBreakdown.mobil} / {todayBreakdown.truk} / {todayBreakdown.motor}
            </p>
          </div>
        </div>

        {/* DESKRIPSI KEJADIAN SAAT INI */}
        {!isLoading && !isError && events.length > 0 && currentEvent && (
          <div className="w-full bg-white/90 dark:bg-[#1e293b]/90 backdrop-blur-sm rounded-xl p-4 border border-[#e2e8f0] dark:border-[#334155] shadow-lg flex-shrink-0">
            <div className="flex items-center justify-between mb-2">
              <div
                className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold font-mono ${getColor(currentEvent.type)}`}
              >
                {getIcon(currentEvent.type)} {getLabel(currentEvent.type)}
              </div>
              <div className="text-[10px] font-mono text-[#64748b] dark:text-[#94a3b8]">
                {formatDateTime(currentEvent.event_time)}
              </div>
            </div>
            <h2 className="text-xl font-bold font-space text-[#0f172a] dark:text-white mb-1">
              {currentEvent.title}
            </h2>
            <p className="text-sm font-mono text-[#64748b] dark:text-[#94a3b8]">
              {currentEvent.detail}
              {currentEvent.metadata && ` · ${currentEvent.metadata}`}
            </p>
          </div>
        )}

        {/* BOX KEJADIAN TERBARU & TOMBOL NAVIGASI */}
        <div className="bg-[#f8fafc] dark:bg-[#1e293b] rounded-xl p-4 border border-[#e2e8f0] dark:border-[#334155] overflow-hidden flex flex-col transition-colors duration-300">
          <p className="text-xs font-semibold font-space text-[#0f172a] dark:text-white mb-3 flex items-center justify-between flex-shrink-0">
            <span>🕒 Kejadian Terbaru</span>
            <span className="text-[10px] text-[#64748b] dark:text-[#94a3b8] font-mono font-normal">
              {events.length} total
            </span>
          </p>

          <div
            ref={scrollContainerRef}
            className="overflow-y-auto pr-1 space-y-2 max-h-[180px] custom-scrollbar flex-1"
          >
            {events.map((ev, idx) => (
              <div
                key={ev.id}
                data-id={ev.id}
                className={`flex items-center justify-between p-2.5 rounded-lg transition cursor-pointer border ${idx === currentIndex ? "border-blue-500 dark:border-[#38bdf8] bg-blue-50 dark:bg-[#0f172a]" : "border-transparent hover:bg-[#f1f5f9] dark:hover:bg-[#0b1120]"}`}
                onClick={() => {
                  setCurrentIndex(idx);
                  setIsPlaying(false);
                }}
              >
                <div className="flex items-center gap-3 overflow-hidden flex-1">
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${getColor(ev.type)}`}
                  >
                    {getIcon(ev.type)}
                  </div>
                  <div className="flex flex-col w-full">
                    <p className="text-sm font-space text-[#0f172a] dark:text-white">{ev.title}</p>
                    <p className="text-[10px] text-[#64748b] dark:text-[#94a3b8] font-mono whitespace-nowrap">
                      {formatDateTime(ev.event_time)} · {ev.detail}
                      {ev.metadata && ` · ${ev.metadata}`}
                    </p>
                  </div>
                </div>
                <div
                  className={`w-2 h-2 rounded-full flex-shrink-0 ml-2 ${idx === currentIndex ? "bg-blue-500 dark:bg-[#38bdf8] animate-pulse" : "bg-[#cbd5e1] dark:bg-[#334155]"}`}
                />
              </div>
            ))}
          </div>

          {/* TOMBOL NAVIGASI */}
          <div className="flex items-center justify-center gap-4 pt-3 mt-2 border-t border-[#e2e8f0] dark:border-[#334155] flex-shrink-0">
            <button
              onClick={(e) => {
                e.stopPropagation();
                goPrev();
              }}
              className="bg-white dark:bg-[#1e293b] text-[#64748b] dark:text-[#94a3b8] hover:bg-[#f1f5f9] dark:hover:bg-[#0b1120] p-2 rounded-full border border-[#e2e8f0] dark:border-[#334155] shadow-sm transition"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>

            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsPlaying(!isPlaying);
              }}
              className="bg-white dark:bg-[#1e293b] text-[#64748b] dark:text-[#94a3b8] hover:bg-[#f1f5f9] dark:hover:bg-[#0b1120] p-2 rounded-full border border-[#e2e8f0] dark:border-[#334155] shadow-sm transition"
            >
              {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
            </button>

            <button
              onClick={(e) => {
                e.stopPropagation();
                goNext();
              }}
              className="bg-white dark:bg-[#1e293b] text-[#64748b] dark:text-[#94a3b8] hover:bg-[#f1f5f9] dark:hover:bg-[#0b1120] p-2 rounded-full border border-[#e2e8f0] dark:border-[#334155] shadow-sm transition"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* ============================================================ */}
        {/* ✅ IDE PENGISI RUANG KOSONG: Widget Ringkasan Performa */}
        {/* ============================================================ */}
        <div className="bg-[#f8fafc] dark:bg-[#1e293b] rounded-xl p-4 border border-[#e2e8f0] dark:border-[#334155] flex-shrink-0 flex flex-col gap-2 transition-colors duration-300">
          <div className="flex items-center justify-between">
            <p className="text-[10px] uppercase tracking-wider text-[#64748b] dark:text-[#94a3b8] font-mono">
              Status Sistem
            </p>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="h-3 w-3 text-green-600 dark:text-green-400" />
                <span className="text-[10px] font-mono text-[#64748b] dark:text-[#94a3b8]">
                  {TOTAL_CAMERAS - camerasDown} Aktif
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <XCircle className="h-3 w-3 text-red-600 dark:text-red-400" />
                <span className="text-[10px] font-mono text-[#64748b] dark:text-[#94a3b8]">
                  {camerasDown} Offline
                </span>
              </div>
            </div>
          </div>

          <div className="w-full h-1.5 bg-[#e2e8f0] dark:bg-[#334155] rounded-full overflow-hidden">
            <div
              className="h-full bg-green-500 dark:bg-green-400 rounded-full transition-all duration-500"
              style={{ width: `${((TOTAL_CAMERAS - camerasDown) / TOTAL_CAMERAS) * 100}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-[10px] text-[#64748b] dark:text-[#94a3b8] font-mono">
            <span>Kesiapan Sistem</span>
            <span>{Math.round(((TOTAL_CAMERAS - camerasDown) / TOTAL_CAMERAS) * 100)}%</span>
          </div>
        </div>
        {/* ============================================================ */}
      </div>

      {/* Lightbox */}
      {isOpen && selectedImage && (
        <Lightbox
          open={isOpen}
          close={() => setIsOpen(false)}
          slides={[{ src: `data:image/jpeg;base64,${selectedImage}` }]}
          plugins={[Zoom]}
        />
      )}
    </div>
  );
}
