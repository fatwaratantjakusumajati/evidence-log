import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ArrowLeft, Car, ChevronLeft, ChevronRight, RotateCcw, ZoomIn, ThumbsDown } from "lucide-react";
import { formatDateTime } from "@/lib/evidence";

// --- IMPORT LIGHTBOX ---
import Lightbox from 'yet-another-react-lightbox';
import 'yet-another-react-lightbox/styles.css';
import Zoom from 'yet-another-react-lightbox/plugins/zoom';

const PAGE_SIZE = 12;

type VehicleLog = {
  id: number;
  timestamp: string;
  jenis_kendaraan: string;
  warna: string;
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
  is_false_positive?: boolean;
};

function parseVehicleResponse(json: any) {
  if (json && typeof json === 'object' && 'data' in json && Array.isArray(json.data)) return json; 
  else if (Array.isArray(json)) return { data: json, total: json.length, totalPages: Math.ceil(json.length / PAGE_SIZE) };
  return { data: [], total: 0, totalPages: 1 };
}

function getConfidenceTone(confidence: number) {
  if (confidence < 0.4) return { label: "Rendah", className: "bg-red-100 text-red-700" };
  if (confidence < 0.7) return { label: "Sedang", className: "bg-yellow-100 text-yellow-700" };
  return { label: "Tinggi", className: "bg-green-100 text-green-700" };
}

function ConfidenceBadge({ confidence }: { confidence: number }) {
  const { label, className } = getConfidenceTone(confidence);
  return (<span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${className}`}>{label} · {confidence.toFixed(2)}</span>);
}

export const Route = createFileRoute("/logs/vehicles")({
  head: () => ({ meta: [{ title: "Log Kendaraan · Dashboard Pemantauan" }, { name: "description", content: "Daftar lengkap log kendaraan yang terdeteksi CCTV." }] }),
  component: VehicleLogsPage,
});

function VehicleLogsPage() {
  const [page, setPage] = useState(1);
  const [filterJenis, setFilterJenis] = useState("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const [isOpen, setIsOpen] = useState(false);
  const [selectedVehicle, setSelectedVehicle] = useState<VehicleLog | null>(null);

  const queryClient = useQueryClient();

  // --- SSE LISTENER ---
  useEffect(() => {
    const eventSource = new EventSource('http://localhost:5000/api/events');
    eventSource.onmessage = () => {
      queryClient.invalidateQueries({ queryKey: ["vehicle_log"] });
    };
    return () => { eventSource.close(); };
  }, [queryClient]);

  const { data: response, isLoading, isError, refetch } = useQuery({
    queryKey: ["vehicle_log", page, filterJenis, startDate, endDate],
    queryFn: async () => {
      try {
        const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE), jenis: filterJenis });
        if (startDate) params.append('start_date', startDate);
        if (endDate) params.append('end_date', endDate);
        const res = await fetch(`http://localhost:5000/api/vehicles/log?${params}`);
        if (!res.ok) return { data: [], total: 0, totalPages: 1 };
        const json = await res.json();
        return parseVehicleResponse(json);
      } catch { return { data: [], total: 0, totalPages: 1 }; }
    },
  });

  const paginatedVehicles = response?.data || [];
  const totalPages = response?.totalPages || 1;
  const totalItems = response?.total || 0;

  const handleFilterChange = (value: string) => { setFilterJenis(value); setPage(1); };
  const handleDateChange = () => setPage(1);

  const handleFlagFalsePositive = async (id: number, currentStatus: boolean = false) => {
    try {
      await fetch(`http://localhost:5000/api/vehicles/log/${id}/flag`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_false_positive: !currentStatus })
      });
      refetch();
    } catch (error) { console.error("Gagal menandai false positive", error); }
  };

  return (
    <main className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 border-b border-border bg-card/95 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-6 py-4">
          <Link to="/dashboard" className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"><ArrowLeft className="h-4 w-4" /></Link>
          <div className="flex items-center gap-2"><Car className="h-5 w-5 text-primary" /><h1 className="text-lg font-semibold tracking-tight text-foreground">Log Kendaraan</h1></div>
          {totalItems > 0 && (<span className="ml-auto rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">{totalItems} total</span>)}
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-6 py-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">Riwayat lengkap kendaraan yang terdeteksi CCTV, lengkap dengan bukti foto dan jenis.</p>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 bg-card border border-border rounded-md px-2 py-1">
              <span className="text-[10px] text-muted-foreground">Dari</span>
              <input type="date" value={startDate} onChange={(e) => { setStartDate(e.target.value); handleDateChange(); }} className="bg-transparent text-sm outline-none w-28" />
              <span className="text-[10px] text-muted-foreground">s/d</span>
              <input type="date" value={endDate} onChange={(e) => { setEndDate(e.target.value); handleDateChange(); }} className="bg-transparent text-sm outline-none w-28" />
            </div>
            <select value={filterJenis} onChange={(e) => handleFilterChange(e.target.value)} className="h-9 rounded-md border border-border bg-card px-3 text-sm font-medium text-foreground outline-none ring-offset-background focus:ring-2 focus:ring-primary">
              <option value="all">Semua Jenis</option><option value="truk">Truk</option><option value="mobil">Mobil</option><option value="sepeda motor">Sepeda Motor</option>
            </select>
            {(filterJenis !== "all" || startDate || endDate) && (
              <button onClick={() => { setFilterJenis("all"); setStartDate(""); setEndDate(""); setPage(1); }} className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-background px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent"><RotateCcw className="h-3.5 w-3.5" /> Reset</button>
            )}
            <a href={`http://localhost:5000/api/vehicles/export?jenis=${filterJenis}&start_date=${startDate}&end_date=${endDate}`} download="vehicle_logs.csv" className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed" onClick={(e) => { if (totalItems === 0) { e.preventDefault(); alert("Tidak ada data kendaraan untuk diekspor."); } }}>📥 Ekspor CSV</a>
          </div>
        </div>

        {isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{Array.from({ length: PAGE_SIZE }).map((_, i) => (<div key={i} className="animate-pulse overflow-hidden rounded-lg border border-border bg-card"><div className="aspect-[4/3] bg-muted" /><div className="space-y-2 p-4"><div className="h-3 w-2/3 rounded bg-muted" /><div className="h-3 w-1/2 rounded bg-muted" /></div></div>))}</div>
        ) : isError ? (
          <p className="rounded-md border border-border bg-card p-6 text-sm text-destructive">Gagal memuat data.</p>
        ) : paginatedVehicles.length === 0 ? (
          <div className="flex w-full flex-col items-center justify-center rounded-lg border border-border bg-card p-16 text-center shadow-sm"><Car className="mb-4 h-14 w-14 text-muted-foreground/30" strokeWidth={1.5} /><h3 className="text-base font-semibold text-foreground">Belum Ada Data Kendaraan</h3><p className="mt-1.5 max-w-md text-sm text-muted-foreground">Sistem deteksi CCTV belum mencatat log kendaraan. Data akan muncul secara otomatis segera setelah kendaraan terdeteksi.</p></div>
        ) : (
          <>
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {paginatedVehicles.map((v: VehicleLog) => (
                <li key={v.id} className="group overflow-hidden rounded-lg border border-border bg-card shadow-[var(--shadow-soft)] transition-shadow hover:shadow-md relative">
                  <div className="relative h-48 w-full overflow-hidden bg-muted">
                    <img 
                      src={`data:image/jpeg;base64,${v.gambar_base64}`} 
                      alt={`Kendaraan ${v.jenis_kendaraan}`} 
                      loading="lazy" 
                      className="h-full w-full object-contain transition-transform duration-300 group-hover:scale-105 cursor-pointer"
                      onClick={() => {
                        setSelectedVehicle(v);
                        setIsOpen(true);
                      }}
                    />
                    <div className="absolute right-2 top-2 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                      <button 
                        className="rounded-full bg-black/60 p-1.5 text-white hover:bg-black/80 transition-colors pointer-events-auto"
                        title="Lihat Detail & Zoom"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedVehicle(v);
                          setIsOpen(true);
                        }}
                      >
                        <ZoomIn className="h-4 w-4" />
                      </button>
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          handleFlagFalsePositive(v.id, v.is_false_positive);
                        }}
                        className={`rounded-full p-1.5 transition-colors pointer-events-auto ${
                          v.is_false_positive 
                            ? 'bg-red-500 text-white' 
                            : 'bg-black/60 text-white hover:bg-black/80'
                        }`}
                        title={v.is_false_positive ? "Tandai Salah (False Positive)" : "Klik jika salah deteksi"}
                      >
                        <ThumbsDown className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  <div className="space-y-2 p-4"><div className="flex items-center justify-between gap-2"><span className="text-sm font-semibold text-foreground">{v.jenis_kendaraan}</span></div><div className="flex items-center justify-between gap-2"><p className="text-xs text-muted-foreground">{formatDateTime(v.timestamp)}</p><ConfidenceBadge confidence={Number(v.confidence)}/></div></div>
                </li>
              ))}
            </ul>
            <Pagination page={page} totalPages={totalPages} total={totalItems} pageSize={PAGE_SIZE} onChange={setPage} />
          </>
        )}
      </section>

      {/* =================================================== */}
      {/* LIGHTBOX MODERN (Error TypeScript sudah diperbaiki) */}
      {/* =================================================== */}
      {isOpen && selectedVehicle && (
        <Lightbox
          key={selectedVehicle.id}
          open={isOpen}
          close={() => setIsOpen(false)}
          slides={[{ src: `data:image/jpeg;base64,${selectedVehicle.gambar_base64}` }]}
          plugins={[Zoom]}
          carousel={{
            finite: true, // Menyembunyikan tombol panah kiri/kanan
          }}
          zoom={{
            maxZoomPixelRatio: 3, // Memungkinkan zoom hingga 3x
          }}
        />
      )}
    </main>
  );
}

function Pagination({ page, totalPages, total, pageSize, onChange }: { page: number; totalPages: number; total: number; pageSize: number; onChange: (p: number) => void; }) {
  const from = (page - 1) * pageSize + 1; const to = Math.min(page * pageSize, total);
  const getPageNumbers = () => { const pages: (number | 'ellipsis')[] = []; if (totalPages <= 7) { for (let i = 1; i <= totalPages; i++) pages.push(i); } else { pages.push(1); if (page > 3) pages.push('ellipsis'); const start = Math.max(2, page - 1); const end = Math.min(totalPages - 1, page + 1); for (let i = start; i <= end; i++) pages.push(i); if (page < totalPages - 2) pages.push('ellipsis'); pages.push(totalPages); } return pages; };
  const pageNumbers = getPageNumbers();
  return (<div className="mt-8 flex flex-col items-center gap-3"><p className="text-xs text-muted-foreground">Menampilkan {from}–{to} dari {total} data</p><div className="flex items-center gap-1">{pageNumbers.map((p, idx) => p === 'ellipsis' ? (<span key={`ellipsis-${idx}`} className="px-1 text-xs text-muted-foreground">…</span>) : (<button key={p} onClick={() => onChange(p)} className={`inline-flex h-8 w-8 items-center justify-center rounded-md border text-xs font-medium transition-colors ${p === page ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-foreground hover:bg-accent"}`}>{p}</button>))}<button onClick={() => onChange(page + 1)} disabled={page === totalPages} className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-card text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed"><ChevronRight className="h-4 w-4" /></button></div></div>);
}