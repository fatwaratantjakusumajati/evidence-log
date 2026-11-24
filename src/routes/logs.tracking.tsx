import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Boxes,
  Clock,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  Camera,
  X,
  MapPin,
  Search,
  AlertTriangle,
  Eye,
  EyeOff,
  ArrowRightLeft,
  CheckCircle2,
  Info,
  ChevronDown,
  Timer,
  LogOut,
  Package,
  Truck,
  Layers,
  type LucideIcon,
} from "lucide-react";
import { useState, useEffect, Fragment } from "react";
import { API_BASE_URL } from "@/lib/api-config";
import { formatDateTime } from "@/lib/evidence";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { getLogsPageColors, type LogsPageColors } from "@/lib/theme-tokens";
import { authFetch } from "@/lib/auth";

const PAGE_SIZE = 12;
type TrackingColors = LogsPageColors & { stageOff: string };

type PalletState = "PRESENT" | "MISSING" | "UNSEEN" | "STORED" | "COMPLETED";

type PalletRow = {
  pallet_id: number;
  milik_sendiri?: boolean; // false = pallet dibuat PO lain, PO ini ikut menumpang
  po_lain?: string[] | null; // PO lain yang ada di pallet yang sama
  po_semua?: string[] | null; // semua PO yang ada di pallet ini
  pallet_no: number | null;
  aruco_id: number;
  document_id: number;
  po_number: string | null;
  last_event: string | null;
  last_event_time: string | null;
  current_zone: string | null;
  first_seen: string | null;
  last_moved: string | null;
  state: PalletState;
  approval_status: "PENDING" | "APPROVED" | null;
  completion_type: "OUTBOUND_AUTO" | "MANUAL_APPROVED" | null;
  released_at: string | null;
  missing_since: string | null;
  approved_by: string | null;
  stored_at?: string | null;
  stored_by?: string | null;
  stored_note?: string | null;
  exit_at?: string | null;
  exit_note?: string | null;
  approved_at: string | null;
  alert_level: number | null;
  alert_at: string | null;
  zone_since: string | null;
  zone_moves: number | null;
  po_created_at: string | null;
};

type PoRow = {
  document_id: number;
  po_number: string | null;
  jumlah_pallet: number | null;
  total_pallet: number;
  active_pallet: number;
  completed_pallet: number;
  present: number;
  missing: number;
  unseen: number;
  stored?: number;
  pending_approval: number;
  zones: string[] | null;
  last_event_time: string | null;
  last_moved: string | null;
  completed_at: string | null;
  shipped_at?: string | null; // jam terakhir marker hilang = barang keluar
  manual_pallet?: number; // jumlah pallet yang diselesaikan lewat ACC manual
  document_ids?: number[]; // semua PO dalam kartu ini (PO yang berbagi pallet jadi satu kartu)
  jumlah_po?: number;
  aruco_ids?: number[]; // ID marker semua pallet dalam kartu ini
  po_created_at: string | null;
  first_seen: string | null;
  zone_moves: number;
  alert_level: number | null;
};

type PalletEvent = {
  id: number;
  event_time: string;
  event_type: string;
  aruco_id: number;
  zone: string;
  from_zone: string | null;
  to_zone: string | null;
  detail: string | null;
  message: string | null;
  has_image: boolean;
};

type RecentEvent = {
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

type Summary = {
  po_aktif: number;
  po_perlu_acc: number;
  total_pallet: number;
  present: number;
  missing: number;
  unseen: number;
  pending_approval: number;
  moved_today: number;
  completed_today?: number;
};

const STATE_LABEL: Record<PalletState, string> = {
  PRESENT: "Terlihat",
  MISSING: "Hilang",
  UNSEEN: "Belum terbaca",
  STORED: "Di inventaris",
  COMPLETED: "Selesai",
};

const EVENT_LABEL: Record<string, string> = {
  NEW: "Pertama kali terbaca",
  MOVED_ZONE: "Pindah zona",
  MOVED_POS: "Bergeser posisi",
  MISSING: "Hilang dari zona",
  RETURNED: "Terlihat kembali",
  COMPLETED_OUTBOUND: "Selesai otomatis (keluar lewat outbound)",
  APPROVED: "Dikonfirmasi sudah keluar",
  STORED: "Dikonfirmasi masuk inventaris",
  MISSING_ALERT: "Alert: belum dikonfirmasi",
  CHECKED_PRESENT: "Dikonfirmasi masih ada",
};

function stateStyle(state: PalletState, t: TrackingColors) {
  if (state === "PRESENT") return { backgroundColor: "rgba(16,185,129,0.15)", color: "#059669" };
  if (state === "MISSING") return { backgroundColor: t.dangerBg, color: t.dangerText };
  if (state === "STORED") return { backgroundColor: "rgba(99,102,241,0.12)", color: t.primary };
  return { backgroundColor: t.bg, color: t.textMuted };
}

// Label + warna status satu baris pallet (memperhitungkan "perlu ACC" dan "selesai")
function statusOf(r: PalletRow, t: TrackingColors) {
  if (r.state === "COMPLETED") {
    return {
      label:
        r.completion_type === "MANUAL_APPROVED"
          ? "Keluar (konfirmasi manual)"
          : "Keluar (outbound)",
      style: { backgroundColor: t.bg, color: "#059669", border: `1px solid ${t.border}` },
    };
  }
  if (r.approval_status === "PENDING") {
    return { label: "Hilang · perlu konfirmasi", style: stateStyle("MISSING", t) };
  }
  return { label: STATE_LABEL[r.state], style: stateStyle(r.state, t) };
}

// Ringkasan status satu PO (gabungan status semua pallet-nya)
// Waktu "selesai" yang ditampilkan = saat barang keluar (marker hilang), bukan saat sistem mengonfirmasi (+masa tunggu).
const poDoneAt = (r: PoRow) => r.shipped_at ?? r.completed_at;
const poIsManual = (r: PoRow) => (r.manual_pallet ?? 0) > 0;

function poStatusChips(r: PoRow, t: TrackingColors) {
  const chips: {
    label: string;
    style: { backgroundColor: string; color: string; border?: string };
  }[] = [];
  const good = { backgroundColor: "rgba(16,185,129,0.15)", color: "#059669" };
  const bad = { backgroundColor: t.dangerBg, color: t.dangerText };
  const muted = { backgroundColor: t.bg, color: t.textMuted };
  if (r.active_pallet === 0) chips.push({ label: "Selesai", style: good });
  if ((r.alert_level ?? 0) > 0) chips.push({ label: `Alert level ${r.alert_level}`, style: bad });
  if (r.pending_approval > 0)
    chips.push({ label: `${r.pending_approval} perlu konfirmasi`, style: bad });
  const hilangLain = r.missing - r.pending_approval;
  if (hilangLain > 0) chips.push({ label: `${hilangLain} hilang`, style: bad });
  if (r.present > 0) chips.push({ label: `${r.present} terlihat`, style: good });
  if ((r.stored ?? 0) > 0)
    chips.push({
      label: `${r.stored} di inventaris`,
      style: { backgroundColor: "rgba(99,102,241,0.12)", color: t.primary },
    });
  if (r.unseen > 0) chips.push({ label: `${r.unseen} belum terbaca`, style: muted });
  return chips;
}

function eventZoneText(e: PalletEvent) {
  if (e.event_type === "MOVED_ZONE") return `${e.from_zone ?? "?"} → ${e.to_zone ?? "?"}`;
  return e.zone || e.to_zone || e.from_zone || "-";
}

// ---- Helper waktu: "5 mnt lalu", "2 jam 10 mnt", "3 hari 4 jam" ----
function durasiText(ms: number) {
  const m = Math.floor(Math.abs(ms) / 60000);
  if (m < 1) return "<1 mnt";
  if (m < 60) return `${m} mnt`;
  const h = Math.floor(m / 60);
  if (h < 24) return m % 60 ? `${h} jam ${m % 60} mnt` : `${h} jam`;
  const d = Math.floor(h / 24);
  return h % 24 ? `${d} hari ${h % 24} jam` : `${d} hari`;
}

function ago(iso: string | null | undefined) {
  if (!iso) return "-";
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms)) return "-";
  if (ms < 60000) return "baru saja";
  return `${durasiText(ms)} lalu`;
}

function durasiAntara(newer: string, older: string) {
  const ms = new Date(newer).getTime() - new Date(older).getTime();
  return Number.isFinite(ms) && ms >= 0 ? durasiText(ms) : null;
}

// ["A","A","B"] -> [["A",2],["B",1]]
function zoneCounts(zones: string[] | null) {
  const m = new Map<string, number>();
  for (const z of zones ?? []) m.set(z, (m.get(z) ?? 0) + 1);
  return Array.from(m.entries());
}

// Lama pallet berada di zona sebelumnya (dihitung dari kejadian sebelum ini)
function stayText(events: PalletEvent[], e: PalletEvent) {
  if (e.event_type !== "MOVED_ZONE") return null;
  const older = events[events.indexOf(e) + 1];
  if (!older || ["MISSING", "MISSING_ALERT"].includes(older.event_type)) return null;
  const d = durasiAntara(e.event_time, older.event_time);
  return d ? `Sebelumnya di ${e.from_zone ?? "zona asal"} sekitar ${d}` : null;
}

// Untuk kejadian "terlihat kembali": berapa lama sempat tidak terlihat (tertutup/hilang)
function gapText(events: PalletEvent[], e: PalletEvent) {
  if (e.event_type !== "RETURNED") return null;
  const older = events.slice(events.indexOf(e) + 1).find((x) => x.event_type === "MISSING");
  if (!older) return null;
  const d = durasiAntara(e.event_time, older.event_time);
  return d ? `Sempat tidak terlihat ${d} (sejak ${formatDateTime(older.event_time)})` : null;
}

const BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

// Teks bebas dari skrip pemantau (kolom detail) dirapikan: tanggal mentah "2026-10-28 15:33:03"
// jadi "28 Okt 2026, 15.33", dan koordinat piksel "(909,643)" dibuang.
function cleanDetail(text: string | null | undefined) {
  if (!text) return "";
  return text
    .replace(/\s*\(\s*\d+\s*,\s*\d+\s*\)/g, "")
    .replace(
      /(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::\d{2})?/g,
      (_m, y, mo, d, h, mi) => `${Number(d)} ${BULAN[Number(mo) - 1] ?? mo} ${y}, ${h}.${mi}`,
    )
    .replace(/^terakhir terlihat/, "Terakhir terlihat")
    .trim();
}

// Nama zona dari kamera dirapikan: typo "outbund" dibetulkan, tiap kata diawali huruf besar.
const prettyZone = (z: string | null | undefined) =>
  (z ?? "").replace(/outbund/gi, "outbound").replace(/\b\p{L}/gu, (c) => c.toUpperCase());

// Tanggal + jam tanpa detik: "28 Okt 2026, 16.18"
const fmtNoSec = (iso: string | null | undefined) => {
  const d = iso ? new Date(iso) : null;
  if (!d || !Number.isFinite(d.getTime())) return "-";
  const tgl = d.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
  const jam = d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
  return `${tgl}, ${jam}`;
};

function dayLabel(iso: string) {
  const d = new Date(iso);
  return Number.isFinite(d.getTime())
    ? d.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })
    : "";
}

function clockLabel(iso: string) {
  const d = new Date(iso);
  return Number.isFinite(d.getTime())
    ? d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })
    : "";
}

// Catatan penjelas di bawah kejadian "hilang", supaya jelas artinya tanpa membuka dokumentasi.
function eventNote(events: PalletEvent[], e: PalletEvent) {
  if (e.event_type !== "MISSING") return null;
  const index = events.indexOf(e);
  const nextEvent = index > 0 ? events[index - 1] : null;
  const completedFromThisZone =
    nextEvent?.event_type === "COMPLETED_OUTBOUND" && nextEvent.zone === e.zone;
  if (completedFromThisZone) {
    return "Hilang dari zona outbound: langsung dicatat keluar dari pemantauan.";
  }
  return events[0] === e
    ? "Perlu konfirmasi petugas: masih ada, disimpan di gudang, atau sudah keluar."
    : null;
}

async function getJson(path: string) {
  const res = await authFetch(`${API_BASE_URL}${path}`);
  if (!res.ok) throw new Error(`Server merespons status ${res.status}`);
  return res.json();
}

export const Route = createFileRoute("/logs/tracking")({
  head: () => ({
    meta: [
      { title: "Tracking PO · Dashboard Pemantauan" },
      {
        name: "description",
        content: "Posisi dan riwayat perpindahan pallet per nomor PO berdasarkan marker ArUco.",
      },
    ],
  }),
  component: TrackingPage,
});

function TrackingPage() {
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [stateFilter, setStateFilter] = useState<
    "" | "PENDING" | "MISSING" | "UNSEEN" | "COMPLETED"
  >("");
  const [selected, setSelected] = useState<PoRow | null>(null);
  const [zoneFilter, setZoneFilter] = useState("");

  const [isDarkMode, setIsDarkMode] = useState(false);
  useEffect(() => {
    const checkDarkMode = () => setIsDarkMode(document.documentElement.classList.contains("dark"));
    checkDarkMode();
    const observer = new MutationObserver(checkDarkMode);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);
  const baseColors = getLogsPageColors(isDarkMode);
  // Mode gelap: teks redup dinaikkan supaya terbaca, garis tahapan yang belum tercapai dibedakan.
  const t = {
    ...baseColors,
    textMuted: isDarkMode ? "#a9b4c6" : baseColors.textMuted,
    stageOff: isDarkMode ? "#4b5a70" : "#cbd5e1",
  };

  // Debounce pencarian supaya tidak menembak API tiap ketukan
  useEffect(() => {
    const id = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 400);
    return () => clearTimeout(id);
  }, [searchInput]);

  // Tutup jendela detail dengan tombol Escape
  useEffect(() => {
    if (!selected) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setSelected(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected]);

  // Data di-refresh real-time oleh SSE di __root.tsx; polling 15 detik jadi cadangan.
  const {
    data: response,
    isLoading,
    isError,
    dataUpdatedAt,
  } = useQuery({
    queryKey: ["tracking_pos", page, search, stateFilter, zoneFilter],
    meta: { showErrorToast: true, errorLabel: "Tracking PO" },
    refetchInterval: 15000,
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
      if (search) params.append("search", search);
      if (stateFilter) params.append("state", stateFilter);
      if (zoneFilter) params.append("zone", zoneFilter);
      return getJson(`/api/tracking/pos?${params}`);
    },
  });

  const { data: summary, dataUpdatedAt: summaryAt } = useQuery<Summary>({
    queryKey: ["tracking_summary"],
    refetchInterval: 15000,
    queryFn: () => getJson("/api/tracking/summary"),
  });

  const rows: PoRow[] = response?.data || [];
  const totalPages = response?.totalPages || 1;
  const totalItems = response?.total || 0;
  const totalPo = response?.total_po ?? totalItems; // jumlah PO (satu kartu bisa berisi beberapa PO)
  const hasFilter = !!(searchInput || stateFilter || zoneFilter);
  const showingCompleted = stateFilter === "COMPLETED";

  const dangerBorder = isDarkMode ? "#7f1d1d" : "#fecaca";
  const dangerBg = isDarkMode ? "#450a0a" : "#fef2f2";
  const cards: {
    label: string;
    value?: number;
    danger?: boolean;
    hint?: string;
    icon: LucideIcon;
    tone: string;
    filter?: "PENDING" | "MISSING" | "UNSEEN";
  }[] = [
    {
      label: "PO aktif",
      value: summary?.po_aktif,
      hint: summary ? `${summary.total_pallet} pallet` : undefined,
      icon: Boxes,
      tone: "#6366f1",
    },
    { label: "Terlihat sekarang", value: summary?.present, icon: Eye, tone: "#14b8a6" },
    {
      label: "Perlu konfirmasi",
      value: summary?.pending_approval,
      danger: true,
      hint: summary && summary.po_perlu_acc > 0 ? `${summary.po_perlu_acc} PO` : undefined,
      icon: AlertTriangle,
      tone: "#f59e0b",
      filter: "PENDING",
    },
    {
      label: "Dipindah hari ini",
      value: summary?.moved_today,
      icon: ArrowRightLeft,
      tone: "#8b5cf6",
    },
  ];

  const fieldStyle = {
    backgroundColor: t.card,
    borderColor: t.border,
    color: t.textMain,
  };

  return (
    <main
      className="flex-1 transition-colors duration-300"
      style={{ backgroundColor: t.bg, color: t.textMain }}
    >
      <header
        className="sticky top-0 z-20 border-b transition-colors duration-300 backdrop-blur-xl"
        style={{ backgroundColor: t.card, borderColor: t.border }}
      >
        <div className="mx-auto max-w-[1680px] px-6 py-4">
          <div className="mb-4">
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbLink asChild>
                    <Link
                      to="/dashboard"
                      className="text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 transition-colors font-mono text-sm"
                    >
                      Home
                    </Link>
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbPage className="font-space font-semibold text-lg text-slate-900 dark:text-slate-100">
                    Tracking PO
                  </BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Boxes className="h-5 w-5" style={{ color: t.primary }} />
              <h1
                className="text-lg font-semibold tracking-tight font-space"
                style={{ color: t.textMain }}
              >
                Pantau posisi pallet per PO
              </h1>
            </div>
            <div className="flex items-center gap-3">
              <LastUpdated at={Math.max(dataUpdatedAt, summaryAt)} t={t} />
              {totalItems > 0 && (
                <span
                  className="rounded-full px-3 py-1 text-xs font-medium font-mono"
                  style={{
                    backgroundColor: t.card,
                    color: t.primary,
                    border: `1px solid ${t.border}`,
                  }}
                >
                  {totalPo} PO
                </span>
              )}
            </div>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-[1680px] px-6 py-6">
        {(summary?.pending_approval ?? 0) > 0 && (
          <div
            className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3"
            style={{ borderColor: dangerBorder, backgroundColor: dangerBg }}
          >
            <div className="flex items-center gap-2.5">
              <AlertTriangle className="h-5 w-5 shrink-0" style={{ color: t.dangerText }} />
              <p className="text-sm font-semibold" style={{ color: t.dangerText }}>
                {summary?.pending_approval} pallet menunggu konfirmasi
                <span className="font-normal"> · {summary?.po_perlu_acc} PO</span>
              </p>
            </div>
            <button
              onClick={() => {
                setStateFilter("PENDING");
                setPage(1);
              }}
              className="inline-flex h-8 items-center rounded-md px-3 text-xs font-semibold text-white hover:opacity-90"
              style={{ backgroundColor: t.dangerText }}
            >
              Lihat antrean
            </button>
          </div>
        )}

        <div className="mb-5 grid grid-cols-2 gap-3 xl:grid-cols-4">
          {cards.map((c) => {
            const Icon = c.icon;
            const active = !!c.filter && stateFilter === c.filter;
            const alertNow = !!c.danger && (c.value ?? 0) > 0;
            const zero = (c.value ?? 0) === 0 && !alertNow;
            const iconColor = alertNow ? "#ef4444" : c.tone;
            return (
              <button
                key={c.label}
                disabled={!c.filter}
                onClick={() => {
                  if (!c.filter) return;
                  setStateFilter(active ? "" : c.filter);
                  setPage(1);
                }}
                className="rounded-xl border p-4 text-left transition-all enabled:cursor-pointer enabled:hover:shadow-md"
                style={{
                  borderColor: alertNow ? dangerBorder : active ? t.primary : t.border,
                  backgroundColor: alertNow ? dangerBg : t.card,
                  boxShadow: active ? `0 0 0 1px ${t.primary}` : undefined,
                }}
              >
                <div className="flex items-center justify-between gap-2">
                  <p
                    className="text-[11px] font-semibold uppercase tracking-wide"
                    style={{ color: t.textMuted }}
                  >
                    {c.label}
                  </p>
                  <span
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                    style={{ backgroundColor: `${iconColor}22` }}
                  >
                    <Icon className="h-4 w-4" style={{ color: iconColor }} />
                  </span>
                </div>
                <p
                  className="mt-2 text-3xl font-semibold font-space leading-none"
                  style={{ color: alertNow ? t.dangerText : zero ? t.textMuted : t.textMain }}
                >
                  {c.value ?? "–"}
                </p>
                <p
                  className="mt-1.5 min-h-[16px] text-[11px] font-mono"
                  style={{ color: t.textMuted }}
                >
                  {c.hint ?? ""}
                </p>
              </button>
            );
          })}
        </div>

        <details className="mb-5 text-xs" style={{ color: t.textMuted }}>
          <summary className="inline-flex cursor-pointer select-none items-center gap-1.5 font-medium">
            <Info className="h-3.5 w-3.5" /> Arti status dan cara membaca halaman ini
          </summary>
          <ul
            className="mt-2 space-y-1 pl-5 font-mono leading-relaxed"
            style={{ listStyle: "disc" }}
          >
            <li>
              <b>Terlihat</b>: marker terbaca kamera.
            </li>
            <li>
              <b>Hilang</b>: marker tidak terbaca lagi di zona terakhirnya.
            </li>
            <li>
              <b>Perlu konfirmasi</b>: hilang bukan dari zona outbound. Pilih <b>Inventaris</b>{" "}
              (barang disimpan, tetap dipantau) atau <b>Sudah keluar</b>. Kalau marker terlihat
              lagi, otomatis batal.
            </li>
            <li>
              <b>Di inventaris</b>: dikonfirmasi disimpan di gudang. Tetap dipantau; begitu marker
              terlihat lagi, statusnya kembali normal.
            </li>
            <li>
              <b>Belum terbaca</b>: marker belum pernah ditangkap kamera (barang mungkin belum
              datang).
            </li>
            <li>
              Kamera hanya mengirim kejadian saat ada perubahan, jadi waktu yang tampil adalah waktu{" "}
              <b>perubahan terakhir</b>, bukan waktu terakhir dilihat.
            </li>
          </ul>
        </details>

        <details
          className="group mb-5 rounded-xl border"
          style={{ borderColor: t.border, backgroundColor: t.card }}
        >
          <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 px-4 py-3">
            <span
              className="flex items-center gap-2 text-sm font-semibold"
              style={{ color: t.textMain }}
            >
              <MapPin className="h-4 w-4" style={{ color: t.primary }} />
              Zona & aktivitas terbaru
            </span>
            <span className="flex items-center gap-2 text-xs" style={{ color: t.textMuted }}>
              Lihat ringkasan
              <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
            </span>
          </summary>
          <div
            className="grid gap-4 border-t p-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]"
            style={{ borderColor: t.border }}
          >
            <ZonePanel
              t={t}
              activeZone={zoneFilter}
              onPick={(z) => {
                setZoneFilter(z === zoneFilter ? "" : z);
                setPage(1);
              }}
            />
            <RecentActivity t={t} />
          </div>
        </details>

        <div
          className="mb-4 inline-flex rounded-lg border p-1"
          style={{ borderColor: t.border, backgroundColor: t.card }}
        >
          {(
            [
              { key: "", label: "PO Aktif" },
              { key: "COMPLETED", label: "Riwayat Selesai" },
            ] as const
          ).map((tab) => {
            const active = tab.key === "COMPLETED" ? showingCompleted : !showingCompleted;
            return (
              <button
                key={tab.key}
                onClick={() => {
                  setStateFilter(tab.key);
                  setPage(1);
                }}
                className="rounded-md px-4 py-1.5 text-sm font-medium transition-colors"
                style={{
                  backgroundColor: active ? t.primary : "transparent",
                  color: active ? "#fff" : t.textMuted,
                }}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold font-space" style={{ color: t.textMain }}>
              {showingCompleted ? "Riwayat PO selesai" : "Daftar PO aktif"}
              <span className="ml-2 text-sm font-normal" style={{ color: t.textMuted }}>
                {totalPo} PO
              </span>
            </h2>
            <p className="mt-0.5 text-xs" style={{ color: t.textMuted }}>
              {showingCompleted
                ? "Semua PO yang pallet-nya sudah selesai, diurutkan dari yang terbaru."
                : "PO yang sedang aktif di warehouse beserta posisi pallet-nya."}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {zoneFilter && (
              <button
                onClick={() => {
                  setZoneFilter("");
                  setPage(1);
                }}
                className="inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-xs font-semibold text-white hover:opacity-90"
                style={{ backgroundColor: t.primary }}
                title="Hapus filter zona"
              >
                <MapPin className="h-3.5 w-3.5" /> Zona: {zoneFilter} <X className="h-3.5 w-3.5" />
              </button>
            )}
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2"
                style={{ color: t.textMuted }}
              />
              <input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Cari No. PO"
                aria-label="Cari No. PO"
                className="h-9 w-56 rounded-md border pl-8 pr-3 text-sm font-mono"
                style={fieldStyle}
              />
            </div>
            {!showingCompleted && (
              <div className="relative">
                <select
                  value={stateFilter}
                  onChange={(e) => {
                    setStateFilter(
                      e.target.value as "" | "PENDING" | "MISSING" | "UNSEEN" | "COMPLETED",
                    );
                    setPage(1);
                  }}
                  aria-label="Filter PO"
                  className="h-9 appearance-none rounded-md border pl-3 pr-9 text-sm font-mono"
                  style={fieldStyle}
                >
                  <option value="">Semua PO aktif</option>
                  <option value="PENDING">Perlu konfirmasi</option>
                  <option value="MISSING">Ada pallet hilang</option>
                  <option value="UNSEEN">Ada pallet belum terbaca</option>
                </select>
                <ChevronDown
                  className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2"
                  style={{ color: t.textMuted }}
                />
              </div>
            )}
            {hasFilter && (
              <button
                onClick={() => {
                  setSearchInput("");
                  setStateFilter("");
                  setZoneFilter("");
                  setPage(1);
                }}
                className="inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm font-medium hover:opacity-80"
                style={{ backgroundColor: t.card, borderColor: t.border, color: t.textMuted }}
              >
                <RotateCcw className="h-3.5 w-3.5" /> Reset
              </button>
            )}
          </div>
        </div>

        {isLoading ? (
          <div
            className="overflow-hidden rounded-lg border"
            style={{ borderColor: t.border, backgroundColor: t.card }}
          >
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="animate-pulse border-b px-4 py-4 last:border-0"
                style={{ borderColor: t.border }}
              >
                <div className="h-3 w-48 rounded" style={{ backgroundColor: t.bg }} />
              </div>
            ))}
          </div>
        ) : isError ? (
          <div
            className="rounded-lg border p-6 text-center text-sm"
            style={{
              borderColor: isDarkMode ? "#7f1d1d" : "#fecaca",
              backgroundColor: isDarkMode ? "#450a0a" : "#fef2f2",
              color: t.dangerText,
            }}
          >
            Gagal memuat data.
          </div>
        ) : rows.length === 0 ? (
          <div
            className="flex flex-col items-center justify-center rounded-lg border border-dashed p-16 text-center"
            style={{ borderColor: t.border, backgroundColor: t.card }}
          >
            <Boxes className="h-14 w-14 mb-4" style={{ color: t.textMuted }} strokeWidth={1.5} />
            <h4 className="text-base font-semibold font-space" style={{ color: t.textMain }}>
              {showingCompleted && !searchInput
                ? "Belum Ada PO Selesai"
                : hasFilter
                  ? "Tidak Ada PO yang Cocok"
                  : "Belum Ada PO Aktif"}
            </h4>
            <p className="mt-1 text-sm font-mono" style={{ color: t.textMuted }}>
              {showingCompleted && !searchInput
                ? "PO yang sudah selesai akan tercatat di sini."
                : hasFilter
                  ? "Coba ubah kata kunci atau filter."
                  : "PO muncul setelah dokumen PO dipindai dan marker ArUco ditempel."}
            </p>
          </div>
        ) : (
          <>
            <div className="space-y-3">
              {rows.map((r) => (
                <PoCard key={r.document_id} r={r} t={t} onOpen={() => setSelected(r)} />
              ))}
            </div>
            {totalPages > 1 && (
              <Pagination
                page={page}
                totalPages={totalPages}
                total={totalItems}
                pageSize={PAGE_SIZE}
                onChange={setPage}
                theme={t}
              />
            )}
          </>
        )}
      </section>

      {selected && (
        <PoModal
          po={rows.find((r) => r.document_id === selected.document_id) ?? selected}
          t={t}
          onClose={() => setSelected(null)}
        />
      )}
    </main>
  );
}

function eventColor(type: string, t: TrackingColors) {
  if (["MISSING", "MISSING_ALERT"].includes(type)) return t.dangerText;
  if (["RETURNED", "COMPLETED_OUTBOUND", "APPROVED", "CHECKED_PRESENT"].includes(type))
    return "#059669";
  return t.primary;
}

// Jendela detail satu PO: ringkasan, tahapan, daftar pallet + tindakan + riwayat tiap pallet
function PoModal({ po, t, onClose }: { po: PoRow; t: TrackingColors; onClose: () => void }) {
  const [openHistory, setOpenHistory] = useState<number | null>(null);
  const [action, setAction] = useState<{ id: number; type: "store" | "exit" | "present" } | null>(
    null,
  );
  const [note, setNote] = useState("");
  const qc = useQueryClient();

  const { data, isLoading, isError, dataUpdatedAt } = useQuery<{
    po_number: string | null;
    jumlah_pallet: number | null;
    pallets: PalletRow[];
  }>({
    queryKey: ["tracking_po_pallets", po.document_id],
    refetchInterval: 15000,
    queryFn: () => getJson(`/api/tracking/pos/${po.document_id}/pallets`),
  });

  const pallets = data?.pallets ?? [];
  const pending = pallets.filter((p) => p.approval_status === "PENDING");
  const field = { backgroundColor: t.card, borderColor: t.border, color: t.textMain };
  const refresh = () => {
    for (const key of [
      "tracking_pos",
      "tracking_po_pallets",
      "tracking_summary",
      "tracking_events",
      "tracking_open_alerts",
      "tracking_zones",
    ]) {
      qc.invalidateQueries({ queryKey: [key] });
    }
  };

  const act = useMutation({
    mutationFn: async ({
      ids,
      kind,
      note,
    }: {
      ids: number[];
      kind: "store" | "exit" | "present";
      note: string;
    }) => {
      for (const id of ids) {
        const res = await authFetch(`${API_BASE_URL}/api/tracking/pallets/${id}/${kind}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ note }),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.error || `Server merespons status ${res.status}`);
        }
      }
    },
    onSuccess: (_d, v) => {
      refresh();
      setAction(null);
      setNote("");
      toast.success(
        v.kind === "store"
          ? "Pallet dicatat masuk inventaris"
          : v.kind === "present"
            ? "Pallet dikonfirmasi masih ada"
            : "Pallet dicatat sudah keluar",
      );
    },
    onError: (e: Error) => {
      refresh();
      toast.error(e.message);
    },
  });

  const isDone = po.active_pallet === 0 && po.total_pallet > 0;

  // PO selesai: ringkasan proses (bukan hitungan pallet yang semuanya pasti "selesai").
  const completionKinds = new Set(pallets.map((p) => p.completion_type).filter(Boolean));
  const manual = poIsManual(po) || completionKinds.has("MANUAL_APPROVED");
  const approvers = Array.from(new Set(pallets.map((p) => p.approved_by).filter(Boolean)));
  // Keterangan akhir: terakhir terlihat di outbound -> pasti terkirim (otomatis). Zona lain -> hasil konfirmasi manual.
  const howDoneSub =
    completionKinds.size > 1
      ? "Otomatis & manual"
      : manual
        ? `Manual${approvers.length ? ` · ${approvers.join(", ")}` : ""}`
        : "Otomatis (outbound)";
  const lastZones = Array.from(new Set(pallets.map((p) => p.current_zone).filter(Boolean)));
  const exitTime =
    poDoneAt(po) ??
    pallets
      .map((p) => p.missing_since)
      .filter(Boolean)
      .sort()
      .pop() ??
    null;
  const inWarehouse =
    po.first_seen && exitTime
      ? durasiText(new Date(exitTime).getTime() - new Date(po.first_seen).getTime())
      : "-";

  const stats: {
    label: string;
    value: string | number;
    color: string;
    icon: LucideIcon;
    tone: string;
    small?: boolean;
    sub?: string;
  }[] = isDone
    ? [
        {
          label: "Keluar pada",
          value: fmtNoSec(exitTime),
          color: t.textMain,
          icon: LogOut,
          tone: "#f59e0b",
          small: true,
        },
        {
          label: "Lama di gudang",
          value: inWarehouse,
          color: t.textMain,
          icon: Timer,
          tone: "#8b5cf6",
          small: true,
        },
        {
          label: "Terakhir terlihat di",
          value: lastZones.length ? lastZones.map(prettyZone).join(", ") : "-",
          color: t.textMain,
          icon: MapPin,
          tone: "#0ea5e9",
          small: true,
        },
        {
          label: "Keterangan",
          value: howDoneSub,
          color: "#059669",
          icon: Truck,
          tone: "#10b981",
          small: true,
        },
        {
          label: "Pallet",
          value: `${po.completed_pallet} selesai`,
          color: t.primary,
          icon: Package,
          tone: "#6366f1",
          small: true,
        },
      ]
    : [
        { label: "Total", value: po.total_pallet, color: t.textMain, icon: Boxes, tone: "#6366f1" },
        { label: "Terlihat", value: po.present, color: "#059669", icon: Eye, tone: "#14b8a6" },
        {
          label: "Hilang",
          value: po.missing,
          color: po.missing > 0 ? t.dangerText : t.textMain,
          icon: AlertTriangle,
          tone: "#ef4444",
        },
        {
          label: "Belum terbaca",
          value: po.unseen,
          color: t.textMain,
          icon: EyeOff,
          tone: "#0ea5e9",
        },
        {
          label: "Di inventaris",
          value: po.stored ?? 0,
          color: t.primary,
          icon: Package,
          tone: "#8b5cf6",
        },
        {
          label: "Selesai",
          value: po.completed_pallet,
          color: t.textMain,
          icon: CheckCircle2,
          tone: "#10b981",
        },
      ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Detail PO ${po.po_number ?? ""}`}
        onClick={(e) => e.stopPropagation()}
        className="relative flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl shadow-2xl"
        style={{ backgroundColor: t.card, color: t.textMain, border: `1px solid ${t.border}` }}
      >
        <button
          onClick={onClose}
          aria-label="Tutup"
          className="absolute right-4 top-4 rounded-full p-2 transition-colors hover:bg-black/20"
          style={{ color: t.textMuted }}
        >
          <X className="h-5 w-5" />
        </button>

        <div className="shrink-0 border-b p-6 pr-14" style={{ borderColor: t.border }}>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-bold font-space">{po.po_number ?? "PO tidak diketahui"}</h2>
            {poStatusChips(po, t).map((c) => (
              <span
                key={c.label}
                className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold font-mono"
                style={c.style}
              >
                {c.label}
              </span>
            ))}
          </div>
          {po.po_created_at && (
            <p className="mt-1.5 text-[12px] leading-relaxed" style={{ color: t.textMuted }}>
              PO masuk {fmtNoSec(po.po_created_at)}
              {" · "}
              {po.active_pallet > 0
                ? po.first_seen
                  ? `barang pertama terdeteksi ${formatDateTime(po.first_seen)}, sudah ${durasiText(Date.now() - new Date(po.first_seen).getTime())} di warehouse`
                  : "barang belum terdeteksi di warehouse"
                : poDoneAt(po)
                  ? `barang keluar ${ago(poDoneAt(po))}`
                  : ""}
            </p>
          )}
          {!isDone && (
            <div className="mt-2">
              <LastUpdated at={dataUpdatedAt} t={t} />
            </div>
          )}
          <div
            className={`mt-4 grid grid-cols-2 gap-2 ${isDone ? "sm:grid-cols-5" : "sm:grid-cols-6"}`}
          >
            {stats.map((s) => {
              const Icon = s.icon;
              return (
                <div key={s.label} className="flex min-w-0 flex-col">
                  <div className="mb-1.5 flex items-center gap-1.5 px-0.5">
                    <span
                      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md"
                      style={{ backgroundColor: `${s.tone}22` }}
                    >
                      <Icon className="h-3 w-3" style={{ color: s.tone }} />
                    </span>
                    <p
                      className="truncate text-[10px] font-semibold uppercase tracking-wide"
                      style={{ color: t.textMuted }}
                    >
                      {s.label}
                    </p>
                  </div>
                  <div
                    className="flex-1 rounded-lg border px-3 py-2"
                    style={{
                      borderColor: t.border,
                      backgroundColor: t.bg,
                      borderTopWidth: 2,
                      borderTopColor: s.tone,
                    }}
                  >
                    <p
                      className={`${s.small ? "text-[13px] leading-snug" : "text-xl leading-none"} font-semibold font-space`}
                      style={{ color: s.color }}
                    >
                      {s.value}
                    </p>
                    {s.sub && (
                      <p className="mt-0.5 text-[11px] leading-snug" style={{ color: t.textMuted }}>
                        {s.sub}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-5">
            <StageBar r={po} t={t} />
          </div>
        </div>

        {pending.length > 0 && (
          <div
            className="shrink-0 border-b px-6 py-4"
            style={{ borderColor: t.border, backgroundColor: t.dangerBg }}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex min-w-0 flex-1 items-start gap-2.5">
                <AlertTriangle
                  className="mt-0.5 h-5 w-5 shrink-0"
                  style={{ color: t.dangerText }}
                />
                <div className="min-w-0">
                  <p className="text-sm font-semibold" style={{ color: t.dangerText }}>
                    {pending.length} pallet hilang dari zona selain outbound
                  </p>
                  <p className="mt-1 text-[12px] leading-relaxed" style={{ color: t.textMain }}>
                    Pilih konfirmasi di tiap pallet: <b>Inventaris</b> jika barang disimpan di
                    gudang (tetap dipantau), atau <b>Sudah keluar</b> jika barang keluar tanpa lewat
                    outbound. Kalau belum yakin, biarkan saja: begitu marker terlihat kamera lagi,
                    permintaan ini batal otomatis.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="overflow-y-auto p-6">
          {(po.document_ids?.length ? po.document_ids : [po.document_id]).map((docId) => (
            <PoContents
              key={docId}
              documentId={docId}
              t={t}
              defaultOpen={po.active_pallet === 0 && (po.document_ids?.length ?? 1) === 1}
              showNumber={(po.document_ids?.length ?? 1) > 1}
            />
          ))}
          <p
            className="mb-3 text-[11px] font-semibold uppercase tracking-wide"
            style={{ color: t.textMuted }}
          >
            Daftar pallet · klik pallet untuk melihat riwayat
          </p>
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 2 }).map((_, i) => (
                <div
                  key={i}
                  className="h-20 animate-pulse rounded-xl"
                  style={{ backgroundColor: t.bg }}
                />
              ))}
            </div>
          ) : isError ? (
            <p className="text-sm" style={{ color: t.dangerText }}>
              Gagal memuat pallet.
            </p>
          ) : (
            <ul className="space-y-3">
              {pallets.map((p, i) => {
                const st = statusOf(p, t);
                const isPending = p.approval_status === "PENDING";
                const isStored = p.state === "STORED";
                const isOpen = openHistory === p.pallet_id;
                const accent =
                  p.state === "PRESENT"
                    ? "#059669"
                    : p.state === "MISSING"
                      ? t.dangerText
                      : p.state === "COMPLETED" || p.state === "STORED"
                        ? t.primary
                        : "#94a3b8";
                const toggle = () => setOpenHistory(isOpen ? null : p.pallet_id);
                const acting = action?.id === p.pallet_id ? action.type : null;
                return (
                  <li
                    key={p.pallet_id}
                    className="overflow-hidden rounded-xl border"
                    style={{ borderColor: t.border, backgroundColor: t.card }}
                  >
                    <div className="flex">
                      <span className="w-1 shrink-0" style={{ backgroundColor: accent }} />
                      <div className="min-w-0 flex-1 p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div
                            role="button"
                            tabIndex={0}
                            onClick={toggle}
                            onKeyDown={(e) => e.key === "Enter" && toggle()}
                            className="min-w-0 flex-1 cursor-pointer"
                          >
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-base font-semibold font-space">
                                {(po.jumlah_po ?? 1) > 1
                                  ? `Pallet #${i + 1}`
                                  : `Pallet #${p.pallet_no ?? "?"}`}
                              </p>
                              <span
                                className="rounded-md px-1.5 py-0.5 text-[10px] font-mono"
                                style={{ backgroundColor: t.bg, color: t.textMuted }}
                              >
                                Marker {p.aruco_id}
                              </span>
                              <span
                                className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold font-mono"
                                style={st.style}
                              >
                                {st.label}
                              </span>
                            </div>
                            {(p.po_semua?.length ?? 0) > 1 && (
                              <p
                                className="mt-1 text-[12px] font-semibold"
                                style={{ color: t.primary }}
                              >
                                Berisi PO {p.po_semua!.join(", ")}
                              </p>
                            )}
                            <p
                              className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px]"
                              style={{ color: t.textMuted }}
                            >
                              <span className="flex items-center gap-1">
                                <MapPin className="h-3 w-3" />{" "}
                                {p.current_zone ?? "Belum ada posisi"}
                              </span>
                              <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {p.state === "COMPLETED" && (p.exit_at ?? p.missing_since)
                                  ? `Keluar ${ago((p.exit_at ?? p.missing_since) as string)} · ${formatDateTime((p.exit_at ?? p.missing_since) as string)}`
                                  : p.last_event_time
                                    ? `Kejadian terakhir ${ago(p.last_event_time)} · ${formatDateTime(p.last_event_time)}`
                                    : "Belum terbaca"}
                              </span>
                            </p>
                            {isStored && (
                              <p className="mt-1 text-[12px]" style={{ color: t.primary }}>
                                Di inventaris sejak {p.stored_at ? ago(p.stored_at) : "-"}
                                {p.stored_by ? ` · oleh ${p.stored_by}` : ""}
                                {p.stored_note ? ` · ${p.stored_note}` : ""}
                              </p>
                            )}
                            {p.state === "COMPLETED" && (
                              <p className="mt-1 text-[12px]" style={{ color: t.textMuted }}>
                                {p.completion_type === "MANUAL_APPROVED"
                                  ? `Dikonfirmasi manual${p.approved_by ? ` oleh ${p.approved_by}` : ""}${p.exit_note ? ` · ${p.exit_note}` : ""}${
                                      (p.approved_at ?? p.released_at)
                                        ? ` · ${formatDateTime((p.approved_at ?? p.released_at) as string)}`
                                        : ""
                                    }`
                                  : `Dinyatakan selesai otomatis${p.released_at ? ` · ${formatDateTime(p.released_at)}` : ""} (tidak terlihat lagi di outbound)`}
                              </p>
                            )}
                            <PalletInfo p={p} t={t} />
                          </div>
                          <div className="flex shrink-0 flex-wrap items-center gap-2">
                            {(isPending || isStored) && (
                              <>
                                {isPending && (
                                  <button
                                    onClick={() => {
                                      setAction({ id: p.pallet_id, type: "present" });
                                      setNote("");
                                    }}
                                    className="inline-flex h-8 items-center rounded-md border px-3 text-xs font-semibold hover:opacity-80"
                                    style={{ borderColor: "#059669", color: "#059669" }}
                                  >
                                    Masih ada
                                  </button>
                                )}
                                {isPending && (
                                  <button
                                    onClick={() => {
                                      setAction({ id: p.pallet_id, type: "store" });
                                      setNote("");
                                    }}
                                    className="inline-flex h-8 items-center rounded-md border px-3 text-xs font-semibold hover:opacity-80"
                                    style={{ borderColor: t.border, color: t.textMain }}
                                  >
                                    Inventaris
                                  </button>
                                )}
                                <button
                                  onClick={() => {
                                    setAction({ id: p.pallet_id, type: "exit" });
                                    setNote("");
                                  }}
                                  className="inline-flex h-8 items-center rounded-md px-3 text-xs font-semibold text-white hover:opacity-90"
                                  style={{ backgroundColor: t.primary }}
                                >
                                  Sudah keluar
                                </button>
                              </>
                            )}
                            <button
                              onClick={toggle}
                              className="inline-flex h-8 items-center gap-1 rounded-md border px-3 text-xs font-medium hover:opacity-80"
                              style={{ borderColor: t.border, color: t.textMain }}
                            >
                              Riwayat
                              <ChevronDown
                                className={`h-3.5 w-3.5 transition-transform ${isOpen ? "rotate-180" : ""}`}
                              />
                            </button>
                          </div>
                        </div>

                        {acting && (
                          <div
                            className="mt-3 rounded-lg border p-3"
                            style={{ borderColor: t.border, backgroundColor: t.bg }}
                          >
                            <p className="text-xs font-semibold">
                              {acting === "store"
                                ? "Konfirmasi: barang disimpan di inventaris"
                                : acting === "present"
                                  ? "Konfirmasi: barang ternyata masih ada"
                                  : "Konfirmasi: barang sudah keluar"}
                            </p>
                            <p className="mt-1 text-[12px]" style={{ color: t.textMuted }}>
                              {acting === "store"
                                ? "Pallet tetap aktif dan tetap dipantau. Alert berhenti. Kalau marker terbaca lagi, status inventaris otomatis hilang."
                                : acting === "present"
                                  ? "Alert dibatalkan dan pallet kembali normal (tetap dipantau). Gunakan ini kalau alarm ternyata palsu, misalnya barang tertutup atau salah deteksi."
                                  : isStored
                                    ? "Pallet dianggap selesai dan tidak dipantau lagi. Jam keluar dicatat sesuai waktu konfirmasi ini."
                                    : "Pallet dianggap selesai dan tidak dipantau lagi. Jam keluar dicatat sesuai jam marker terakhir hilang."}
                            </p>
                            <input
                              value={note}
                              onChange={(e) => setNote(e.target.value)}
                              placeholder={
                                acting === "store"
                                  ? "Catatan (opsional), misalnya lokasi rak"
                                  : acting === "present"
                                    ? "Catatan (opsional), misalnya alasan alarm palsu"
                                    : "Catatan (opsional), misalnya dibawa ke mana"
                              }
                              className="mt-2 h-9 w-full rounded-md border px-3 text-sm"
                              style={field}
                            />
                            <div className="mt-2 flex gap-2">
                              <button
                                onClick={() =>
                                  act.mutate({
                                    ids: [p.pallet_id],
                                    kind: acting,
                                    note: note.trim(),
                                  })
                                }
                                disabled={act.isPending}
                                className="inline-flex h-8 items-center rounded-md px-3 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-60"
                                style={{ backgroundColor: t.primary }}
                              >
                                {act.isPending ? "Menyimpan…" : "Simpan konfirmasi"}
                              </button>
                              <button
                                onClick={() => setAction(null)}
                                className="inline-flex h-8 items-center rounded-md border px-3 text-xs font-medium hover:opacity-80"
                                style={{ borderColor: t.border, color: t.textMain }}
                              >
                                Batal
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                    {isOpen && <PalletHistory palletId={p.pallet_id} t={t} />}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

type ZoneStat = { zone: string; total: number; present: number; missing: number; po_count: number };

// Kotak zona: berapa pallet ada di tiap zona sekarang. Klik untuk menyaring daftar PO.
function ZonePanel({
  t,
  activeZone,
  onPick,
}: {
  t: TrackingColors;
  activeZone: string;
  onPick: (z: string) => void;
}) {
  const { data: zones = [], isLoading } = useQuery<ZoneStat[]>({
    queryKey: ["tracking_zones"],
    refetchInterval: 15000,
    queryFn: () => getJson("/api/tracking/zones"),
  });
  const totalPallet = zones.reduce((s, z) => s + z.total, 0);
  return (
    <div
      className="rounded-xl border p-4"
      style={{ borderColor: t.border, backgroundColor: t.card }}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-sm font-semibold font-space" style={{ color: t.textMain }}>
          Posisi pallet per zona
        </p>
        <span className="text-[11px] font-mono" style={{ color: t.textMuted }}>
          {totalPallet} pallet terdeteksi
        </span>
      </div>
      {isLoading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-20 animate-pulse rounded-lg"
              style={{ backgroundColor: t.bg }}
            />
          ))}
        </div>
      ) : zones.length === 0 ? (
        <p className="py-6 text-center text-xs font-mono" style={{ color: t.textMuted }}>
          Belum ada pallet yang terdeteksi di zona mana pun.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
          {zones.map((z) => {
            const active = activeZone === z.zone;
            return (
              <button
                key={z.zone}
                onClick={() => onPick(z.zone)}
                className="rounded-lg border p-3 text-left transition-all hover:shadow-md"
                style={{
                  borderColor: z.missing > 0 ? t.dangerText : active ? t.primary : t.border,
                  backgroundColor: active ? `${t.primary}14` : t.bg,
                  boxShadow: active ? `0 0 0 1px ${t.primary}` : undefined,
                }}
                title={`Tampilkan PO yang punya pallet di ${z.zone}`}
              >
                <p
                  className="flex items-center gap-1 truncate text-[11px] font-semibold uppercase tracking-wide"
                  style={{ color: t.textMuted }}
                >
                  <MapPin className="h-3 w-3 shrink-0" /> {z.zone}
                </p>
                <p
                  className="mt-1 text-2xl font-semibold font-space leading-none"
                  style={{ color: t.textMain }}
                >
                  {z.total}
                  <span
                    className="ml-1 text-[11px] font-normal font-mono"
                    style={{ color: t.textMuted }}
                  >
                    pallet
                  </span>
                </p>
                <p
                  className="mt-1 text-[11px] font-mono"
                  style={{ color: z.missing > 0 ? t.dangerText : t.textMuted }}
                >
                  {z.missing > 0 ? `${z.missing} hilang · ` : ""}
                  {z.po_count} PO
                </p>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Tahap terakhir menyesuaikan status PO (terkirim, dikonfirmasi manual, di inventaris, perlu konfirmasi, dst.)
type LastStage = { label: string; sub: string; reached: boolean; tone?: "danger" | "info" };

function finalStage(r: PoRow): LastStage {
  const done = r.active_pallet === 0;
  const stored = r.stored ?? 0;
  const manual = r.manual_pallet ?? 0;
  if (done) {
    const when = poDoneAt(r) ? ago(poDoneAt(r)) : "";
    if (manual > 0 && manual >= r.completed_pallet)
      return { label: "Terkirim (manual)", sub: when, reached: true };
    if (manual > 0)
      return {
        label: "Terkirim",
        sub: when ? `${when} · sebagian manual` : "sebagian manual",
        reached: true,
      };
    return { label: "Terkirim", sub: when, reached: true };
  }
  if (r.pending_approval > 0) {
    return {
      label: "Perlu konfirmasi",
      sub: `${r.pending_approval} pallet hilang`,
      reached: false,
      tone: "danger",
    };
  }
  if (stored > 0 && stored === r.active_pallet) {
    return { label: "Di inventaris", sub: `${stored} pallet`, reached: true, tone: "info" };
  }
  if (r.missing > 0)
    return { label: "Menunggu selesai", sub: "hilang dari outbound", reached: false };
  return { label: "Selesai", sub: stored > 0 ? `${stored} di inventaris` : "", reached: false };
}

// Tahapan PO: PO masuk -> barang terdeteksi -> berpindah zona -> status akhir
function poStages(r: PoRow) {
  const done = r.active_pallet === 0;
  const last = finalStage(r);
  const flags = [true, !!r.first_seen || done, r.zone_moves > 0 || done, last.reached];
  let current = 0;
  flags.forEach((f, i) => {
    if (f) current = i;
  });
  const subs = [
    r.po_created_at ? ago(r.po_created_at) : "",
    r.first_seen ? ago(r.first_seen) : "menunggu barang",
    r.zone_moves > 0 ? `${r.zone_moves}× pindah` : done ? "" : "belum pindah",
    last.sub,
  ];
  return {
    flags,
    current,
    labels: ["PO masuk", "Barang terdeteksi", "Berpindah zona", last.label],
    subs,
    last,
  };
}

function StageBar({ r, t }: { r: PoRow; t: TrackingColors }) {
  const { flags, current, labels, subs, last } = poStages(r);
  const lastIdx = labels.length - 1;
  const danger = last.tone === "danger";
  return (
    <ol className="flex items-start">
      {labels.map((label, i) => {
        const isLast = i === lastIdx;
        const alert = isLast && danger;
        const accent = alert ? t.dangerText : t.primary;
        return (
          <li key={label} className="flex min-w-0 flex-1 flex-col items-center text-center">
            <div className="flex w-full items-center">
              <span
                className="h-0.5 flex-1"
                style={{
                  backgroundColor: i === 0 ? "transparent" : flags[i] ? t.primary : t.stageOff,
                }}
              />
              <span
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2"
                style={{
                  borderColor: alert ? accent : flags[i] ? t.primary : t.stageOff,
                  backgroundColor: flags[i] ? t.primary : t.card,
                  boxShadow:
                    i === current
                      ? `0 0 0 3px ${t.primary}33`
                      : alert
                        ? `0 0 0 3px ${accent}33`
                        : undefined,
                }}
              >
                {alert ? (
                  <AlertTriangle className="h-3 w-3" style={{ color: accent }} />
                ) : (
                  flags[i] && <CheckCircle2 className="h-3.5 w-3.5 text-white" />
                )}
              </span>
              <span
                className="h-0.5 flex-1"
                style={{
                  backgroundColor: isLast ? "transparent" : flags[i + 1] ? t.primary : t.stageOff,
                }}
              />
            </div>
            <p
              className="mt-1.5 text-xs leading-tight"
              style={{
                color: alert ? t.dangerText : i === current ? t.textMain : t.textMuted,
                fontWeight: alert || i === current ? 700 : 500,
              }}
            >
              {label}
            </p>
            <p
              className="text-[11px] font-mono leading-tight"
              style={{ color: alert ? t.dangerText : t.textMuted }}
            >
              {subs[i]}
            </p>
          </li>
        );
      })}
    </ol>
  );
}

function PoCard({ r, t, onOpen }: { r: PoRow; t: TrackingColors; onOpen: () => void }) {
  const urgent = r.pending_approval > 0;
  const total = Math.max(r.total_pallet, 1);
  const segments = [
    { n: r.present, color: "#059669", label: "terlihat" },
    { n: r.missing, color: t.dangerText, label: "hilang" },
    { n: r.stored ?? 0, color: "#6366f1", label: "inventaris" },
    { n: r.unseen, color: "#94a3b8", label: "belum terbaca" },
    { n: r.completed_pallet, color: t.primary, label: "selesai" },
  ];
  const urgentChips = poStatusChips(r, t).filter((c) => /^Alert|perlu konfirmasi/.test(c.label));
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => e.key === "Enter" && onOpen()}
      className="cursor-pointer rounded-xl border p-4 transition-shadow hover:shadow-md"
      style={{
        borderColor: t.border,
        backgroundColor: t.card,
        borderLeftWidth: 4,
        borderLeftColor: urgent ? t.dangerText : r.active_pallet === 0 ? "#059669" : t.primary,
      }}
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(220px,0.85fr)_minmax(0,1.15fr)] lg:items-center">
        <div className="min-w-0">
          {(r.jumlah_po ?? 1) > 1 ? (
            <>
              <p
                className="mb-1.5 inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide"
                style={{ color: t.primary }}
              >
                <Layers className="h-3 w-3" /> {r.jumlah_po} PO digabung
              </p>
              <div className="flex flex-wrap gap-1.5">
                {(r.po_number ?? "")
                  .split(" + ")
                  .slice(0, 4)
                  .map((n) => (
                    <span
                      key={n}
                      className="max-w-full truncate rounded-md border px-2 py-0.5 text-sm font-semibold font-space"
                      style={{ borderColor: t.border, backgroundColor: t.bg, color: t.textMain }}
                    >
                      {n}
                    </span>
                  ))}
                {(r.po_number ?? "").split(" + ").length > 4 && (
                  <span className="px-1 py-0.5 text-xs font-mono" style={{ color: t.textMuted }}>
                    +{(r.po_number ?? "").split(" + ").length - 4}
                  </span>
                )}
              </div>
            </>
          ) : (
            <p
              className="truncate text-base font-semibold font-space"
              style={{ color: t.textMain }}
            >
              {r.po_number ?? "-"}
            </p>
          )}
          <p className="mt-1.5 text-xs font-mono" style={{ color: t.textMuted }}>
            {r.active_pallet > 0
              ? `${r.active_pallet} pallet aktif${r.completed_pallet > 0 ? ` · ${r.completed_pallet} selesai` : ""}`
              : `${r.completed_pallet} pallet selesai`}
            {(r.aruco_ids?.length ?? 0) > 0
              ? ` · Marker ${r.aruco_ids!.slice(0, 4).join(", ")}${r.aruco_ids!.length > 4 ? ` +${r.aruco_ids!.length - 4}` : ""}`
              : ""}
          </p>
          {urgentChips.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {urgentChips.map((c) => (
                <span
                  key={c.label}
                  className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold font-mono"
                  style={c.style}
                >
                  {c.label}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="min-w-0">
          <div
            className="flex h-2 w-full overflow-hidden rounded-full"
            style={{ backgroundColor: t.bg }}
          >
            {segments.map((s) =>
              s.n > 0 ? (
                <span
                  key={s.label}
                  style={{ width: `${(s.n / total) * 100}%`, backgroundColor: s.color }}
                />
              ) : null,
            )}
          </div>
          <p
            className="mt-1.5 flex flex-wrap gap-x-3 text-xs font-mono"
            style={{ color: t.textMuted }}
          >
            {segments
              .filter((s) => s.n > 0)
              .map((s) => (
                <span key={s.label} className="inline-flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: s.color }} />
                  {s.n} {s.label}
                </span>
              ))}
          </p>
          <div
            className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]"
            style={{ color: t.textMain }}
          >
            {r.zones && r.zones.length > 0 ? (
              zoneCounts(r.zones).map(([z, n]) => (
                <span key={z} className="inline-flex items-center gap-1">
                  <MapPin className="h-3 w-3 shrink-0" /> {z}
                  <span className="font-mono text-[11px]" style={{ color: t.textMuted }}>
                    ×{n}
                  </span>
                </span>
              ))
            ) : (
              <span className="text-xs font-mono" style={{ color: t.textMuted }}>
                {r.active_pallet > 0 ? "Belum ada posisi" : ""}
              </span>
            )}
          </div>
          <div className="mt-2 flex items-center justify-between gap-2">
            <p className="text-xs font-mono" style={{ color: t.textMuted }}>
              {r.active_pallet === 0
                ? poDoneAt(r)
                  ? `Keluar ${ago(poDoneAt(r))}`
                  : ""
                : r.last_event_time
                  ? `Kejadian terakhir ${ago(r.last_event_time)}`
                  : "Belum ada kejadian"}
            </p>
            <div className="flex items-center gap-2">
              {urgent && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpen();
                  }}
                  className="inline-flex h-8 items-center rounded-md px-3 text-xs font-semibold text-white hover:opacity-90"
                  style={{ backgroundColor: t.dangerText }}
                >
                  Tindakan ({r.pending_approval})
                </button>
              )}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onOpen();
                }}
                className="inline-flex h-8 items-center rounded-md border px-3 text-xs font-medium hover:opacity-80"
                style={{ borderColor: t.border, color: t.textMain }}
              >
                Detail
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Ringkasan informatif satu pallet: posisi sejak kapan, hilang sejak kapan, jumlah pindah zona
function PalletInfo({ p, t }: { p: PalletRow; t: TrackingColors }) {
  const lines: string[] = [];
  if (p.state === "UNSEEN") {
    lines.push(
      "Barang belum terdeteksi di warehouse. Mungkin belum datang, atau stiker marker belum ditempel / belum menghadap kamera.",
    );
  } else if (p.state === "MISSING") {
    lines.push(
      `Hilang dari ${p.current_zone ?? "zona terakhir"}${p.missing_since ? ` sejak ${ago(p.missing_since)}` : ""}.${
        p.approval_status === "PENDING"
          ? " Bukan zona outbound, jadi perlu tindakan konfirmasi."
          : " Zona outbound: otomatis dianggap selesai bila tidak terbaca kembali."
      }`,
    );
    if ((p.alert_level ?? 0) > 0) {
      lines.push(
        `Alert level ${p.alert_level} aktif sejak ${ago(p.alert_at)}: belum ada konfirmasi tindakan.`,
      );
    }
  } else if (p.state === "PRESENT" && p.zone_since) {
    lines.push(`Berada di ${p.current_zone ?? "-"} sejak ${ago(p.zone_since)}.`);
  }
  const meta: string[] = [];
  if (p.first_seen) meta.push(`Pertama terbaca ${formatDateTime(p.first_seen)}`);
  if (p.zone_moves) meta.push(`pindah zona ${p.zone_moves}×`);
  if (!lines.length && !meta.length) return null;
  return (
    <div className="mt-2 space-y-1 text-[12px] leading-relaxed" style={{ color: t.textMuted }}>
      {lines.map((l) => (
        <p key={l}>{l}</p>
      ))}
      {meta.length > 0 && <p>{meta.join(" · ")}</p>}
    </div>
  );
}

// Aktivitas terbaru lintas PO (tanpa "bergeser posisi" supaya tidak ramai)
function RecentActivity({ t }: { t: TrackingColors }) {
  const {
    data: events = [],
    dataUpdatedAt,
    isError,
    isFetching,
    refetch,
  } = useQuery<RecentEvent[]>({
    queryKey: ["tracking_events", "recent"],
    refetchInterval: 15000,
    queryFn: () => getJson("/api/tracking/events?limit=6&hide_moved_pos=1"),
  });
  return (
    <div
      className="rounded-xl border p-4"
      style={{ borderColor: t.border, backgroundColor: t.card }}
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <p className="text-sm font-semibold font-space" style={{ color: t.textMain }}>
          Aktivitas terbaru
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {isFetching && (
            <span className="text-[11px]" style={{ color: t.textMuted }}>
              Menyegarkan…
            </span>
          )}
          <LastUpdated at={dataUpdatedAt} t={t} compact />
        </div>
      </div>
      {isError && (
        <div
          className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-xs"
          style={{ borderColor: t.border, backgroundColor: t.dangerBg, color: t.dangerText }}
          role="status"
        >
          <span>Gagal menyegarkan log. Data yang tampil mungkin belum terbaru.</span>
          <button
            onClick={() => refetch()}
            className="inline-flex items-center gap-1 font-semibold underline underline-offset-2"
          >
            <RotateCcw className="h-3 w-3" /> Coba lagi
          </button>
        </div>
      )}
      {events.length === 0 && !isError && (
        <p className="text-xs font-mono" style={{ color: t.textMuted }}>
          Belum ada pergerakan tercatat.
        </p>
      )}
      {events.length === 0 && isError && (
        <p className="text-xs font-mono" style={{ color: t.textMuted }}>
          Log belum bisa dimuat dari server.
        </p>
      )}
      <ul className="grid gap-y-3">
        {events.map((e) => (
          <li key={e.id} className="flex items-start gap-2.5">
            <span
              className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
              style={{
                backgroundColor: ["MISSING", "MISSING_ALERT"].includes(e.event_type)
                  ? t.dangerText
                  : ["RETURNED", "COMPLETED_OUTBOUND", "APPROVED", "CHECKED_PRESENT"].includes(
                        e.event_type,
                      )
                    ? "#059669"
                    : t.primary,
              }}
            />
            <div className="min-w-0 text-[12px] font-mono">
              <p className="truncate">
                <span className="font-semibold">{EVENT_LABEL[e.event_type] ?? e.event_type}</span>
                {" · "}
                {e.po_number ?? `Marker ${e.aruco_id}`}
              </p>
              <p className="truncate" style={{ color: t.textMuted }}>
                {e.event_type === "MOVED_ZONE"
                  ? `${e.from_zone ?? "?"} → ${e.to_zone ?? "?"}`
                  : e.zone || e.to_zone || e.from_zone || "-"}{" "}
                · {ago(e.event_time)}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PalletHistory({ palletId, t }: { palletId: number; t: TrackingColors }) {
  const {
    data: events,
    isLoading,
    isError,
  } = useQuery<PalletEvent[]>({
    queryKey: ["tracking_events", palletId],
    queryFn: () => getJson(`/api/tracking/pallets/${palletId}/events`),
  });
  const jumlahPindah = events?.filter((e) => e.event_type === "MOVED_ZONE").length ?? 0;
  const jumlahTertutup = events?.filter((e) => e.event_type === "RETURNED").length ?? 0;
  const pill = { backgroundColor: t.card, border: `1px solid ${t.border}`, color: t.textMain };
  let lastDay = "";

  return (
    <div className="border-t p-4" style={{ borderColor: t.border, backgroundColor: t.bg }}>
      <div
        className="mb-4 flex flex-wrap items-center justify-between gap-2 text-[12px]"
        style={{ color: t.textMuted }}
      >
        <span className="flex flex-wrap gap-2">
          <span className="rounded-full px-2.5 py-0.5 text-[11px] font-semibold" style={pill}>
            {jumlahPindah}× pindah zona
          </span>
          <span className="rounded-full px-2.5 py-0.5 text-[11px] font-semibold" style={pill}>
            {jumlahTertutup}× sempat tidak terlihat
          </span>
        </span>
        <span>Terbaru di atas</span>
      </div>
      {isLoading ? (
        <p className="text-sm" style={{ color: t.textMuted }}>
          Memuat riwayat…
        </p>
      ) : isError ? (
        <p className="text-sm" style={{ color: t.dangerText }}>
          Gagal memuat riwayat.
        </p>
      ) : !events || events.length === 0 ? (
        <p className="text-sm" style={{ color: t.textMuted }}>
          Belum ada kejadian untuk pallet ini.
        </p>
      ) : (
        <ol className="relative ml-2 space-y-4 border-l pl-6" style={{ borderColor: t.border }}>
          {events.map((e) => {
            const day = dayLabel(e.event_time);
            const showDay = day !== "" && day !== lastDay;
            lastDay = day;
            const detail = cleanDetail(e.detail);
            const note = eventNote(events, e);
            const stay = stayText(events, e);
            const gap = gapText(events, e);
            return (
              <Fragment key={e.id}>
                {showDay && (
                  <li className="pt-1 text-[11px] font-semibold" style={{ color: t.textMuted }}>
                    {day}
                  </li>
                )}
                <li className="relative">
                  <span
                    className="absolute -left-[30px] top-1 h-3 w-3 rounded-full"
                    style={{
                      backgroundColor: eventColor(e.event_type, t),
                      boxShadow: `0 0 0 4px ${t.bg}`,
                    }}
                  />
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                    <p className="text-sm font-semibold">
                      {EVENT_LABEL[e.event_type] ?? e.event_type}
                    </p>
                    <p
                      className="flex items-center gap-1 text-[11px] font-mono tabular-nums"
                      style={{ color: t.textMuted }}
                    >
                      <Clock className="h-3 w-3" />
                      <span className="font-semibold" style={{ color: t.textMain }}>
                        {clockLabel(e.event_time)}
                      </span>
                      <span>· {ago(e.event_time)}</span>
                    </p>
                  </div>
                  <p className="text-[12px]" style={{ color: t.textMuted }}>
                    {eventZoneText(e)}
                  </p>
                  {[gap, stay, detail, note].filter(Boolean).map((line) => (
                    <p key={line as string} className="text-[12px]" style={{ color: t.textMuted }}>
                      {line}
                    </p>
                  ))}
                  {e.has_image && <EventPhoto eventId={e.id} t={t} />}
                </li>
              </Fragment>
            );
          })}
        </ol>
      )}
    </div>
  );
}

// Foto dilindungi login, jadi diambil lewat authFetch lalu dijadikan blob URL
// (tag <img> biasa tidak bisa mengirim header Authorization).
function EventPhoto({ eventId, t }: { eventId: number; t: TrackingColors }) {
  const [open, setOpen] = useState(false);
  const {
    data: url,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["tracking_image", eventId],
    enabled: open,
    staleTime: Infinity,
    queryFn: async () => {
      const res = await authFetch(`${API_BASE_URL}/api/tracking/events/${eventId}/image`);
      if (!res.ok) throw new Error(`Server merespons status ${res.status}`);
      return URL.createObjectURL(await res.blob());
    },
  });

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mt-2 inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[11px] font-mono hover:opacity-80"
        style={{ borderColor: t.border, color: t.textMuted }}
      >
        <Camera className="h-3 w-3" /> Lihat foto
      </button>
    );
  }
  if (isLoading)
    return (
      <p className="mt-2 text-[11px] font-mono" style={{ color: t.textMuted }}>
        Memuat foto…
      </p>
    );
  if (isError || !url)
    return (
      <p className="mt-2 text-[11px] font-mono" style={{ color: t.dangerText }}>
        Foto tidak tersedia.
      </p>
    );
  return (
    <img
      src={url}
      alt="Foto kejadian"
      className="mt-2 max-h-56 w-full rounded border object-contain"
      style={{ borderColor: t.border, backgroundColor: t.bg }}
    />
  );
}

// === PAGINATION COMPONENT (SAMA) ===
function Pagination({
  page,
  totalPages,
  total,
  pageSize,
  onChange,
  theme,
}: {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  onChange: (p: number) => void;
  theme: TrackingColors;
}) {
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  const getPageNumbers = () => {
    const pages: (number | "ellipsis")[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (page > 3) pages.push("ellipsis");
      const start = Math.max(2, page - 1);
      const end = Math.min(totalPages - 1, page + 1);
      for (let i = start; i <= end; i++) pages.push(i);
      if (page < totalPages - 2) pages.push("ellipsis");
      pages.push(totalPages);
    }
    return pages;
  };
  const pageNumbers = getPageNumbers();

  return (
    <div className="mt-8 flex flex-col items-center gap-3">
      <p className="text-xs font-mono" style={{ color: theme.textMuted }}>
        Menampilkan {from}–{to} dari {total} data
      </p>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onChange(page - 1)}
          disabled={page === 1}
          aria-label="Halaman sebelumnya"
          className="inline-flex h-8 w-8 items-center justify-center rounded-md border hover:opacity-80 disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ borderColor: theme.border, backgroundColor: theme.card, color: theme.textMuted }}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        {pageNumbers.map((p, idx) =>
          p === "ellipsis" ? (
            <span
              key={`ellipsis-${idx}`}
              className="px-1 text-xs font-mono"
              style={{ color: theme.textMuted }}
            >
              …
            </span>
          ) : (
            <button
              key={p}
              onClick={() => onChange(p)}
              className={`inline-flex h-8 w-8 items-center justify-center rounded-md border text-xs font-medium font-mono`}
              style={
                p === page
                  ? {
                      backgroundColor: theme.primary,
                      borderColor: theme.primary,
                      color: theme.bg === "#13130e" ? "#13130e" : "#ffffff",
                    }
                  : {
                      backgroundColor: theme.card,
                      borderColor: theme.border,
                      color: theme.textMain,
                    }
              }
            >
              {p}
            </button>
          ),
        )}
        <button
          onClick={() => onChange(page + 1)}
          disabled={page === totalPages}
          aria-label="Halaman berikutnya"
          className="inline-flex h-8 w-8 items-center justify-center rounded-md border hover:opacity-80 disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ borderColor: theme.border, backgroundColor: theme.card, color: theme.textMuted }}
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

// ---- Format angka di Isi PO: 122000000 -> "Rp 122.000.000" ----
const isPlainNumber = (v: unknown) => /^-?\d+(\.\d+)?$/.test(String(v ?? "").trim());
const MONEY_COL = /harga|total|idr|rupiah|nominal|biaya|subtotal|amount|price|ppn|pajak/i;
const QTY_COL = /kuantitas|qty|quantity|jumlah/i;
const fmtNumber = (v: unknown) => Number(String(v).trim()).toLocaleString("id-ID");
const fmtRupiah = (v: unknown) => `Rp ${fmtNumber(v)}`;
function colKind(header: string | undefined): "money" | "qty" | "text" {
  if (!header) return "text";
  if (MONEY_COL.test(header)) return "money";
  if (QTY_COL.test(header)) return "qty";
  return "text";
}
function fmtCell(cell: unknown, header: string | undefined) {
  if (cell == null || cell === "") return "";
  const kind = colKind(header);
  if (!isPlainNumber(cell)) return String(cell);
  if (kind === "money") return fmtRupiah(cell);
  if (kind === "qty") return fmtNumber(cell);
  return String(cell);
}

// Isi dokumen PO (barang, info, ringkasan) dari hasil OCR dokumen PO.
type DocBlock = { label?: string; nilai?: string | number | null };
type DocTable = { nama?: string; kolom?: string[]; baris?: (string | number | null)[][] };

function PoContents({
  documentId,
  t,
  defaultOpen,
  showNumber = false,
}: {
  documentId: number;
  t: TrackingColors;
  defaultOpen: boolean;
  showNumber?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const { data, isLoading, isError } = useQuery<{
    po_number?: string | null;
    informasi: DocBlock[] | null;
    tabel: DocTable[] | null;
    ringkasan: DocBlock[] | null;
    catatan: string | null;
  }>({
    queryKey: ["tracking_po_document", documentId],
    queryFn: () => getJson(`/api/documents/${documentId}`),
    staleTime: 5 * 60 * 1000,
  });

  const info = (data?.informasi ?? []).filter((e) => e?.label || e?.nilai != null);
  const tables = (data?.tabel ?? []).filter((x) => Array.isArray(x?.baris) && x.baris.length > 0);
  const summary = (data?.ringkasan ?? []).filter((e) => e?.label || e?.nilai != null);
  const itemCount = tables.reduce((n, x) => n + (x.baris?.length ?? 0), 0);

  return (
    <div
      className="mb-6 overflow-hidden rounded-xl border"
      style={{ borderColor: t.border, backgroundColor: t.card }}
    >
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:opacity-80"
      >
        <span className="text-sm font-semibold font-space" style={{ color: t.textMain }}>
          Isi PO{showNumber && data?.po_number ? ` · ${data.po_number}` : ""}
          {itemCount > 0 && (
            <span className="ml-2 text-xs font-normal" style={{ color: t.textMuted }}>
              {itemCount} baris barang
            </span>
          )}
        </span>
        <ChevronDown
          className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`}
          style={{ color: t.textMuted }}
        />
      </button>

      {open && (
        <div className="space-y-5 border-t px-4 py-4" style={{ borderColor: t.border }}>
          {isLoading ? (
            <div className="h-16 animate-pulse rounded-lg" style={{ backgroundColor: t.bg }} />
          ) : isError ? (
            <p className="text-xs" style={{ color: t.dangerText }}>
              Gagal memuat isi PO.
            </p>
          ) : info.length === 0 && tables.length === 0 && summary.length === 0 ? (
            <p className="text-xs" style={{ color: t.textMuted }}>
              Dokumen PO ini tidak punya data barang yang terbaca.
            </p>
          ) : (
            <>
              {info.length > 0 && (
                <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
                  {info.map((e, i) => (
                    <div key={i} className="min-w-0">
                      <dt
                        className="text-[10px] font-semibold uppercase tracking-wide"
                        style={{ color: t.textMuted }}
                      >
                        {e.label}
                      </dt>
                      <dd className="break-words text-sm" style={{ color: t.textMain }}>
                        {e.nilai ?? "-"}
                      </dd>
                    </div>
                  ))}
                </dl>
              )}

              {tables.map((tb, ti) => (
                <div key={ti}>
                  {tb.nama && (
                    <p
                      className="mb-2 text-[11px] font-semibold uppercase tracking-wide"
                      style={{ color: t.textMuted }}
                    >
                      {tb.nama}
                    </p>
                  )}
                  <div
                    className="overflow-x-auto rounded-lg border"
                    style={{ borderColor: t.border }}
                  >
                    <table className="w-full min-w-max text-left text-xs">
                      {Array.isArray(tb.kolom) && tb.kolom.length > 0 && (
                        <thead>
                          <tr style={{ backgroundColor: t.bg }}>
                            {tb.kolom.map((c, ci) => (
                              <th
                                key={ci}
                                className={`px-3 py-2 font-semibold ${colKind(c) !== "text" ? "text-right" : ""}`}
                                style={{ color: t.textMuted }}
                              >
                                {c}
                              </th>
                            ))}
                          </tr>
                        </thead>
                      )}
                      <tbody>
                        {tb.baris!.map((row, ri) => (
                          <tr key={ri} className="border-t" style={{ borderColor: t.border }}>
                            {row.map((cell, ci) => {
                              const h = tb.kolom?.[ci];
                              const numeric = colKind(h) !== "text";
                              return (
                                <td
                                  key={ci}
                                  className={`px-3 py-2 ${numeric ? "text-right font-mono tabular-nums whitespace-nowrap" : ""}`}
                                  style={{ color: t.textMain }}
                                >
                                  {fmtCell(cell, h)}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}

              {summary.length > 0 && (
                <dl className="ml-auto w-full max-w-sm space-y-2 text-sm">
                  {summary.map((e, i) => {
                    const isGrand = /total/i.test(e.label ?? "") && !/sub/i.test(e.label ?? "");
                    const val = isPlainNumber(e.nilai) ? fmtRupiah(e.nilai) : (e.nilai ?? "-");
                    return (
                      <div
                        key={i}
                        className={`flex items-baseline justify-between gap-6 ${isGrand ? "border-t pt-3" : ""}`}
                        style={{ borderColor: t.border }}
                      >
                        <dt
                          className={isGrand ? "font-semibold" : ""}
                          style={{ color: isGrand ? t.textMain : t.textMuted }}
                        >
                          {e.label}
                        </dt>
                        <dd
                          className={`font-mono tabular-nums whitespace-nowrap ${isGrand ? "text-lg font-bold" : ""}`}
                          style={{ color: isGrand ? t.primary : t.textMain }}
                        >
                          {val}
                        </dd>
                      </div>
                    );
                  })}
                </dl>
              )}

              {data?.catatan && (
                <p className="text-xs leading-relaxed" style={{ color: t.textMuted }}>
                  Catatan: {data.catatan}
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// Penanda "terakhir diperbarui": kapan browser terakhir berhasil mengambil data dari
// server. Titik jadi kuning kalau sudah > 2 menit (mis. tab di background / koneksi putus).
function LastUpdated({ at, t }: { at: number; t: TrackingColors; compact?: boolean }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 30000);
    return () => clearInterval(id);
  }, []);
  if (!at) return null;
  const d = new Date(at);
  const stale = Date.now() - at > 120000;
  const clock = d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
  return (
    <span
      className="inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs whitespace-nowrap"
      style={{ borderColor: t.border, color: t.textMuted }}
      title={`Data terakhir diambil dari server: ${d.toLocaleString("id-ID")}${
        stale ? " — sudah lebih dari 2 menit, data mungkin belum terbaru" : ""
      }`}
    >
      <Clock className="h-3.5 w-3.5" style={{ color: stale ? "#f59e0b" : t.textMuted }} />
      <span className="tracking-wide">Last updated</span>
      <span className="font-mono font-medium" style={{ color: t.textMain }}>
        {clock}
      </span>
    </span>
  );
}
