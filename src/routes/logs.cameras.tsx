import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, CameraOff, ChevronLeft, ChevronRight, Clock, AlertCircle } from "lucide-react";
import { useState } from "react";
import { formatDateTime } from "@/lib/evidence";

const PAGE_SIZE = 20;

type CameraOfflineEvent = {
  id: number;
  camera: string;
  class_name: string;
  created_at: string;
};

export const Route = createFileRoute("/logs/cameras")({
  head: () => ({
    meta: [
      { title: "Laporan Kamera Mati · Dashboard Pemantauan" },
      { name: "description", content: "Daftar lengkap kejadian kamera mati." },
    ],
  }),
  component: CamerasPage,
});

function CamerasPage() {
  const [page, setPage] = useState(1);

  const { data: cams = [], isLoading, isError } = useQuery({
    queryKey: ["camera_offline_events", "all"],
    queryFn: async () => {
      const res = await fetch('http://localhost:5000/api/alerts?class_name=' + encodeURIComponent('KAMERA OFFLINE'));
      if (!res.ok) throw new Error('Gagal fetch camera offline');
      return res.json() as Promise<CameraOfflineEvent[]>;
    },
  });

  const totalPages = Math.ceil(cams.length / PAGE_SIZE);
  const paginated = cams.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Hitung unique kamera yang mati
  const uniqueCameras = new Set(cams.map(c => c.camera)).size;

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-20 border-b border-border bg-white/95 backdrop-blur-xl shadow-sm">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-6 py-4">
          <Link
            to="/dashboard"
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            aria-label="Kembali ke dashboard"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="flex items-center gap-2">
            <CameraOff className="h-5 w-5 text-destructive" />
            <h1 className="text-lg font-semibold tracking-tight text-foreground">
              Laporan Kamera Mati
            </h1>
          </div>
          {cams.length > 0 && (
            <div className="ml-auto flex items-center gap-2">
              <span className="rounded-full bg-destructive/10 px-3 py-1 text-xs font-medium text-destructive">
                {cams.length} total
              </span>
              <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
                {uniqueCameras} kamera unik
              </span>
            </div>
          )}
        </div>
      </header>

      <section className="mx-auto max-w-4xl px-6 py-8">
        <div className="mb-5 flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Riwayat lengkap kejadian kamera mati beserta waktunya.
          </p>
          {cams.length > 0 && (
            <span className="text-xs text-muted-foreground">
              Halaman {page} dari {totalPages}
            </span>
          )}
        </div>

        {isLoading ? (
          <div className="space-y-2 rounded-lg border border-border bg-white shadow-sm">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex animate-pulse items-center gap-4 px-5 py-4">
                <div className="h-5 w-8 rounded bg-gray-200" />
                <div className="h-10 w-10 rounded-md bg-gray-200" />
                <div className="h-4 w-32 rounded bg-gray-200" />
                <div className="ml-auto h-4 w-36 rounded bg-gray-200" />
              </div>
            ))}
          </div>
        ) : isError ? (
          <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-6 text-center text-sm text-destructive">
            <AlertCircle className="mx-auto mb-2 h-6 w-6" />
            Gagal memuat data. Silakan coba lagi nanti.
          </div>
        ) : cams.length === 0 ? (
          // --- EMPTY STATE YANG DIPERBAIKI (konsisten dengan halaman lain) ---
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-white p-12 text-center">
            <CameraOff className="mx-auto h-12 w-12 text-muted-foreground/40" />
            <p className="mt-4 text-sm font-medium text-foreground">Tidak ada laporan kamera mati</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Semua kamera dalam kondisi aktif dan terpantau.
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-hidden rounded-lg border border-border bg-white shadow-sm">
              <table className="w-full">
                <thead className="bg-gray-50 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-5 py-3 text-left">No.</th>
                    <th className="px-5 py-3 text-left">Kamera</th>
                    <th className="px-5 py-3 text-right">Waktu Kejadian</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {paginated.map((c, index) => {
                    const globalIndex = (page - 1) * PAGE_SIZE + index + 1;
                    return (
                      <tr
                        key={c.id}
                        className="transition-colors hover:bg-red-50/50 group"
                      >
                        <td className="px-5 py-4 text-sm text-muted-foreground">
                          {globalIndex}
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-destructive/10 text-destructive transition-colors group-hover:bg-destructive/20">
                              <CameraOff className="h-4 w-4" />
                            </div>
                            <span className="text-sm font-medium text-foreground">
                              {c.camera}
                            </span>
                            <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-semibold text-destructive">
                              OFFLINE
                            </span>
                          </div>
                        </td>
                        <td className="px-5 py-4 text-right">
                          <div className="flex items-center justify-end gap-1.5 text-xs text-muted-foreground">
                            <Clock className="h-3 w-3" />
                            <span>{formatDateTime(c.created_at)}</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <Pagination
              page={page}
              totalPages={totalPages}
              total={cams.length}
              pageSize={PAGE_SIZE}
              onChange={setPage}
            />
          </>
        )}
      </section>

      <footer className="border-t border-border bg-white py-4 text-center text-xs text-muted-foreground">
        PT Aristides Logistik Indonesia · Dashboard Pemantauan
      </footer>
    </main>
  );
}

function Pagination({ page, totalPages, total, pageSize, onChange }: {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  onChange: (p: number) => void;
}) {
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  // Daftar halaman yang ditampilkan (dengan elipsis)
  const getPageNumbers = () => {
    const pages: (number | 'ellipsis')[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (page > 3) pages.push('ellipsis');
      const start = Math.max(2, page - 1);
      const end = Math.min(totalPages - 1, page + 1);
      for (let i = start; i <= end; i++) pages.push(i);
      if (page < totalPages - 2) pages.push('ellipsis');
      pages.push(totalPages);
    }
    return pages;
  };

  const pageNumbers = getPageNumbers();

  return (
    <div className="mt-8 flex flex-col items-center gap-3">
      <p className="text-xs text-muted-foreground">
        Menampilkan {from}–{to} dari {total} data
      </p>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onChange(page - 1)}
          disabled={page === 1}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-white text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed"
          aria-label="Halaman sebelumnya"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        {pageNumbers.map((p, idx) =>
          p === 'ellipsis' ? (
            <span key={`ellipsis-${idx}`} className="px-1 text-xs text-muted-foreground">…</span>
          ) : (
            <button
              key={p}
              onClick={() => onChange(p)}
              className={`inline-flex h-8 w-8 items-center justify-center rounded-md border text-xs font-medium transition-colors ${
                p === page
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-white text-foreground hover:bg-accent hover:text-foreground"
              }`}
            >
              {p}
            </button>
          )
        )}

        <button
          onClick={() => onChange(page + 1)}
          disabled={page === totalPages}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-white text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed"
          aria-label="Halaman berikutnya"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}