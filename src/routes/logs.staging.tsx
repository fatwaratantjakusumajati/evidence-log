import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Boxes, Clock, ChevronLeft, ChevronRight, RotateCcw } from "lucide-react";
import { useState } from "react";
import { formatDateTime } from "@/lib/evidence";

const PAGE_SIZE = 12;

type StagingDetection = {
  id: number; camera: string; class_name: string | null; duration: number; timestamp: string; foto_base64: string; file_name: string; alert_level: string; created_at: string; alert_sent_1: boolean; alert_sent_2: boolean; alert_sent_3: boolean; first_detected: string;
};

function parseAlertResponse(json: any) {
  if (json && typeof json === 'object' && 'data' in json && Array.isArray(json.data)) return json; 
  else if (Array.isArray(json)) return { data: json, total: json.length, totalPages: Math.ceil(json.length / PAGE_SIZE) };
  return { data: [], total: 0, totalPages: 1 };
}

function formatDuration(fromIso: string, toIso?: string | null) {
  const start = new Date(fromIso).getTime(); const end = toIso ? new Date(toIso).getTime() : Date.now();
  const diff = Math.max(0, end - start); const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return `${minutes} menit`;
  const hours = Math.floor(minutes / 60); const remMin = minutes % 60;
  if (hours < 24) return remMin ? `${hours} jam ${remMin} menit` : `${hours} jam`;
  const days = Math.floor(hours / 24); const remHours = hours % 24;
  return remHours ? `${days} hari ${remHours} jam` : `${days} hari`;
}

// Kembalikan ke string literal murni
export const Route = createFileRoute("/logs/staging")({
  head: () => ({ meta: [{ title: "Deteksi Barang Staging · Dashboard Pemantauan" }, { name: "description", content: "Daftar lengkap deteksi barang di area staging." }] }),
  component: StagingPage
});

function StagingPage() {
  const [page, setPage] = useState(1);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const navigate = useNavigate();

  const { data: response, isLoading, isError } = useQuery({
    queryKey: ["staging_detections", page, startDate, endDate],
    queryFn: async () => {
      try {
        const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE), class_name: 'box' });
        if (startDate) params.append('start_date', startDate);
        if (endDate) params.append('end_date', endDate);
        const res = await fetch(`http://localhost:5000/api/alerts?${params}`);
        if (!res.ok) return { data: [], total: 0, totalPages: 1 };
        const json = await res.json();
        return parseAlertResponse(json);
      } catch { return { data: [], total: 0, totalPages: 1 }; }
    },
  });

  const paginated = response?.data || [];
  const totalPages = response?.totalPages || 1;
  const totalItems = response?.total || 0;
  const handleDateChange = () => setPage(1);

  return (
    <main className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 border-b border-border bg-card/95 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-6 py-4">
          <button
            onClick={() => navigate({ to: '/dashboard' })}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            aria-label="Kembali ke dashboard"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="flex items-center gap-2">
            <Boxes className="h-5 w-5 text-primary" />
            <h1 className="text-lg font-semibold tracking-tight text-foreground">Deteksi Barang Staging</h1>
          </div>
          {totalItems > 0 && (<span className="ml-auto rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">{totalItems} total</span>)}
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-6 py-8">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">Riwayat lengkap deteksi barang di staging...</p>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 bg-card border border-border rounded-md px-2 py-1 shadow-sm">
              <span className="text-[10px] text-muted-foreground">Dari</span>
              <input type="date" value={startDate} onChange={(e) => { setStartDate(e.target.value); handleDateChange(); }} className="bg-transparent text-sm outline-none w-28" />
              <span className="text-[10px] text-muted-foreground">s/d</span>
              <input type="date" value={endDate} onChange={(e) => { setEndDate(e.target.value); handleDateChange(); }} className="bg-transparent text-sm outline-none w-28" />
            </div>
            {(startDate || endDate) && (<button onClick={() => { setStartDate(""); setEndDate(""); setPage(1); }} className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-background px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent"><RotateCcw className="h-3.5 w-3.5" /> Reset</button>)}
            <a href={`http://localhost:5000/api/alerts/export-pdf?class_name=box&start_date=${startDate}&end_date=${endDate}`} download="laporan_staging.pdf" className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed" onClick={(e) => { if (totalItems === 0) { e.preventDefault(); alert("Tidak ada data staging untuk diekspor."); } }}>📄 Ekspor PDF</a>
          </div>
        </div>

        {isLoading ? (<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{Array.from({ length: PAGE_SIZE }).map((_, i) => (<div key={i} className="animate-pulse overflow-hidden rounded-lg border border-border bg-card"><div className="aspect-[4/3] bg-muted" /><div className="space-y-2 p-4"><div className="h-4 w-2/3 rounded bg-muted" /><div className="h-3 w-1/2 rounded bg-muted" /><div className="h-6 w-20 rounded-full bg-muted" /></div></div>))}</div>) : isError ? (<div className="rounded-lg border border-destructive/20 bg-destructive/5 p-6 text-center text-sm text-destructive">Gagal memuat data.</div>) : paginated.length === 0 ? (<div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card p-12 text-center"><Boxes className="mx-auto h-12 w-12 text-muted-foreground/40" /><p className="mt-4 text-sm font-medium text-foreground">Belum ada deteksi barang staging</p><p className="mt-1 text-xs text-muted-foreground">Data akan muncul ketika sistem mendeteksi barang di area staging.</p></div>) : (<><ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{paginated.map((s: StagingDetection) => (<li key={s.id} className="group overflow-hidden rounded-lg border border-border bg-card shadow-sm transition-all duration-200 hover:shadow-md hover:-translate-y-1"><div className="relative aspect-[4/3] w-full overflow-hidden bg-muted"><img src={`data:image/jpeg;base64,${s.foto_base64}`} alt={s.class_name ?? "Bukti"} loading="lazy" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />{s.alert_level && (<div className="absolute left-2 top-2 rounded-md bg-black/60 px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm">{s.alert_level}</div>)}</div><div className="space-y-2 p-4"><p className="text-sm font-semibold text-foreground">{s.class_name ?? "Barang tidak teridentifikasi"}</p><p className="text-xs text-muted-foreground">Dilaporkan {formatDateTime(s.created_at)}</p><span className="inline-flex items-center gap-1.5 rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-700"><Clock className="h-3.5 w-3.5" />{formatDuration(s.first_detected)}</span>{s.camera && (<p className="text-[10px] text-muted-foreground mt-1">Kamera: {s.camera}</p>)}</div></li>))}</ul><Pagination page={page} totalPages={totalPages} total={totalItems} pageSize={PAGE_SIZE} onChange={setPage} /></>)}
      </section>
    </main>
  );
}

function Pagination({ page, totalPages, total, pageSize, onChange }: { page: number; totalPages: number; total: number; pageSize: number; onChange: (p: number) => void; }) {
  const from = (page - 1) * pageSize + 1; const to = Math.min(page * pageSize, total);
  const getPageNumbers = () => { const pages: (number | 'ellipsis')[] = []; if (totalPages <= 7) { for (let i = 1; i <= totalPages; i++) pages.push(i); } else { pages.push(1); if (page > 3) pages.push('ellipsis'); const start = Math.max(2, page - 1); const end = Math.min(totalPages - 1, page + 1); for (let i = start; i <= end; i++) pages.push(i); if (page < totalPages - 2) pages.push('ellipsis'); pages.push(totalPages); } return pages; };
  const pageNumbers = getPageNumbers();
  return (<div className="mt-8 flex flex-col items-center gap-3"><p className="text-xs text-muted-foreground">Menampilkan {from}–{to} dari {total} data</p><div className="flex items-center gap-1">{pageNumbers.map((p, idx) => p === 'ellipsis' ? (<span key={`ellipsis-${idx}`} className="px-1 text-xs text-muted-foreground">…</span>) : (<button key={p} onClick={() => onChange(p)} className={`inline-flex h-8 w-8 items-center justify-center rounded-md border text-xs font-medium transition-colors ${p === page ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-foreground hover:bg-accent"}`}>{p}</button>))}<button onClick={() => onChange(page + 1)} disabled={page === totalPages} className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-card text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed"><ChevronRight className="h-4 w-4" /></button></div></div>);
}