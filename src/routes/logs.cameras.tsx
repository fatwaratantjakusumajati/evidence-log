import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, CameraOff, ChevronLeft, ChevronRight, Clock, AlertCircle, RotateCcw } from "lucide-react";
import { useState } from "react";
import { formatDateTime } from "@/lib/evidence";

const PAGE_SIZE = 20;

type CameraOfflineEvent = { id: number; camera: string; class_name: string; created_at: string; };

function parseAlertResponse(json: any) {
  if (json && typeof json === 'object' && 'data' in json && Array.isArray(json.data)) return json; 
  else if (Array.isArray(json)) return { data: json, total: json.length, totalPages: Math.ceil(json.length / PAGE_SIZE) };
  return { data: [], total: 0, totalPages: 1 };
}

export const Route = createFileRoute("/logs/cameras")({
  head: () => ({ meta: [{ title: "Laporan Kamera Mati · Dashboard Pemantauan" }, { name: "description", content: "Daftar lengkap kejadian kamera mati." }] }),
  component: CamerasPage
});

function CamerasPage() {
  const [page, setPage] = useState(1);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const navigate = useNavigate();

  const { data: response, isLoading, isError } = useQuery({
    queryKey: ["camera_offline_events", page, startDate, endDate],
    queryFn: async () => {
      try {
        const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE), class_name: 'KAMERA OFFLINE' });
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
  const uniqueCameras = new Set(paginated.map((c: CameraOfflineEvent) => c.camera)).size;
  const handleDateChange = () => setPage(1);

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-20 border-b border-border bg-white/95 backdrop-blur-xl shadow-sm">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-6 py-4">
          <button
            onClick={() => navigate({ to: '/dashboard' })}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            aria-label="Kembali ke dashboard"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="flex items-center gap-2">
            <CameraOff className="h-5 w-5 text-destructive" />
            <h1 className="text-lg font-semibold tracking-tight text-foreground">Laporan Kamera Mati</h1>
          </div>
          {totalItems > 0 && (<div className="ml-auto flex items-center gap-2"><span className="rounded-full bg-destructive/10 px-3 py-1 text-xs font-medium text-destructive">{totalItems} total</span><span className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">{uniqueCameras} kamera unik</span></div>)}
        </div>
      </header>

      <section className="mx-auto max-w-4xl px-6 py-8">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">Riwayat lengkap kejadian kamera mati beserta waktunya.</p>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 bg-white border border-border rounded-md px-2 py-1 shadow-sm"><span className="text-[10px] text-muted-foreground">Dari</span><input type="date" value={startDate} onChange={(e) => { setStartDate(e.target.value); handleDateChange(); }} className="bg-transparent text-sm outline-none w-28" /><span className="text-[10px] text-muted-foreground">s/d</span><input type="date" value={endDate} onChange={(e) => { setEndDate(e.target.value); handleDateChange(); }} className="bg-transparent text-sm outline-none w-28" /></div>
            {(startDate || endDate) && (<button onClick={() => { setStartDate(""); setEndDate(""); setPage(1); }} className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-background px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent"><RotateCcw className="h-3.5 w-3.5" /> Reset</button>)}
            <a href={`http://localhost:5000/api/alerts/export-pdf?class_name=KAMERA%20OFFLINE&start_date=${startDate}&end_date=${endDate}`} download="laporan_kamera_mati.pdf" className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed" onClick={(e) => { if (totalItems === 0) { e.preventDefault(); alert("Tidak ada data kamera mati untuk diekspor."); } }}>📄 Ekspor PDF</a>
          </div>
        </div>
        
        {isLoading ? (<div className="space-y-2 rounded-lg border border-border bg-white shadow-sm">{Array.from({ length: 8 }).map((_, i) => (<div key={i} className="flex animate-pulse items-center gap-4 px-5 py-4"><div className="h-5 w-8 rounded bg-gray-200" /><div className="h-10 w-10 rounded-md bg-gray-200" /><div className="h-4 w-32 rounded bg-gray-200" /><div className="ml-auto h-4 w-36 rounded bg-gray-200" /></div>))}</div>) : isError ? (<div className="rounded-lg border border-destructive/20 bg-destructive/5 p-6 text-center text-sm text-destructive"><AlertCircle className="mx-auto mb-2 h-6 w-6" />Gagal memuat data.</div>) : paginated.length === 0 ? (<div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-white p-12 text-center"><CameraOff className="mx-auto h-12 w-12 text-muted-foreground/40" /><p className="mt-4 text-sm font-medium text-foreground">Tidak ada laporan kamera mati</p><p className="mt-1 text-xs text-muted-foreground">Semua kamera dalam kondisi aktif dan terpantau.</p></div>) : (<><div className="overflow-hidden rounded-lg border border-border bg-white shadow-sm"><table className="w-full"><thead className="bg-gray-50 text-xs font-medium uppercase tracking-wider text-muted-foreground"><tr><th className="px-5 py-3 text-left">No.</th><th className="px-5 py-3 text-left">Kamera</th><th className="px-5 py-3 text-right">Waktu Kejadian</th></tr></thead><tbody className="divide-y divide-border">{paginated.map((c: CameraOfflineEvent, index: number) => { const globalIndex = (page - 1) * PAGE_SIZE + index + 1; return (<tr key={c.id} className="transition-colors hover:bg-red-50/50 group"><td className="px-5 py-4 text-sm text-muted-foreground">{globalIndex}</td><td className="px-5 py-4"><div className="flex items-center gap-3"><div className="flex h-9 w-9 items-center justify-center rounded-md bg-destructive/10 text-destructive transition-colors group-hover:bg-destructive/20"><CameraOff className="h-4 w-4" /></div><span className="text-sm font-medium text-foreground">{c.camera}</span><span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-semibold text-destructive">OFFLINE</span></div></td><td className="px-5 py-4 text-right"><div className="flex items-center justify-end gap-1.5 text-xs text-muted-foreground"><Clock className="h-3 w-3" /><span>{formatDateTime(c.created_at)}</span></div></td></tr>); })}</tbody></table></div><Pagination page={page} totalPages={totalPages} total={totalItems} pageSize={PAGE_SIZE} onChange={setPage} /></>)}
      </section>
    </main>
  );
}

function Pagination({ page, totalPages, total, pageSize, onChange }: { page: number; totalPages: number; total: number; pageSize: number; onChange: (p: number) => void; }) {
  const from = (page - 1) * pageSize + 1; const to = Math.min(page * pageSize, total);
  const getPageNumbers = () => { const pages: (number | 'ellipsis')[] = []; if (totalPages <= 7) { for (let i = 1; i <= totalPages; i++) pages.push(i); } else { pages.push(1); if (page > 3) pages.push('ellipsis'); const start = Math.max(2, page - 1); const end = Math.min(totalPages - 1, page + 1); for (let i = start; i <= end; i++) pages.push(i); if (page < totalPages - 2) pages.push('ellipsis'); pages.push(totalPages); } return pages; };
  const pageNumbers = getPageNumbers();
  return (<div className="mt-8 flex flex-col items-center gap-3"><p className="text-xs text-muted-foreground">Menampilkan {from}–{to} dari {total} data</p><div className="flex items-center gap-1">{pageNumbers.map((p, idx) => p === 'ellipsis' ? (<span key={`ellipsis-${idx}`} className="px-1 text-xs text-muted-foreground">…</span>) : (<button key={p} onClick={() => onChange(p)} className={`inline-flex h-8 w-8 items-center justify-center rounded-md border text-xs font-medium transition-colors ${p === page ? "border-primary bg-primary text-primary-foreground" : "border-border bg-white text-foreground hover:bg-accent hover:text-foreground"}`}>{p}</button>))}<button onClick={() => onChange(page + 1)} disabled={page === totalPages} className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-white text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed"><ChevronRight className="h-4 w-4" /></button></div></div>);
}