import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Boxes, Clock, ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
import { formatDateTime } from "@/lib/evidence";

const PAGE_SIZE = 12;

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

export const Route = createFileRoute("/logs/staging")({
  head: () => ({
    meta: [
      { title: "Deteksi Barang Staging · Dashboard Pemantauan" },
      { name: "description", content: "Daftar lengkap deteksi barang di area staging." },
    ],
  }),
  component: StagingPage,
});

function StagingPage() {
  const [page, setPage] = useState(1);

  const { data: stagings = [], isLoading, isError } = useQuery({
    queryKey: ["staging_detections", "all"],
    queryFn: async () => {
      const res = await fetch('http://localhost:5000/api/alerts?class_name=box');
      if (!res.ok) throw new Error('Gagal fetch alerts');
      return res.json() as Promise<StagingDetection[]>;
    },
  });

  const totalPages = Math.ceil(stagings.length / PAGE_SIZE);
  const paginated = stagings.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

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
            <Boxes className="h-5 w-5 text-primary" />
            <h1 className="text-lg font-semibold tracking-tight text-foreground">
              Deteksi Barang Staging
            </h1>
          </div>
          {stagings.length > 0 && (
            <span className="ml-auto rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
              {stagings.length} total
            </span>
          )}
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-6 py-8">
        <p className="mb-5 text-sm text-muted-foreground">
          Riwayat lengkap deteksi barang di staging beserta bukti foto, waktu laporan, dan durasi.
        </p>

        {isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: PAGE_SIZE }).map((_, i) => (
              <div key={i} className="animate-pulse overflow-hidden rounded-lg border border-border bg-white shadow-sm">
                <div className="aspect-[4/3] bg-gray-200" />
                <div className="space-y-2 p-4">
                  <div className="h-4 w-2/3 rounded bg-gray-200" />
                  <div className="h-3 w-1/2 rounded bg-gray-200" />
                  <div className="h-6 w-20 rounded-full bg-gray-200" />
                </div>
              </div>
            ))}
          </div>
        ) : isError ? (
          <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-6 text-center text-sm text-destructive">
            Gagal memuat data. Silakan coba lagi nanti.
          </div>
        ) : stagings.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-white p-12 text-center">
            <Boxes className="mx-auto h-12 w-12 text-muted-foreground/40" />
            <p className="mt-4 text-sm font-medium text-foreground">Belum ada deteksi barang staging</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Data akan muncul ketika sistem mendeteksi barang di area staging.
            </p>
          </div>
        ) : (
          <>
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {paginated.map((s) => (
                <li
                  key={s.id}
                  className="group overflow-hidden rounded-lg border border-border bg-white shadow-sm transition-all duration-200 hover:shadow-md hover:-translate-y-1"
                >
                  <div className="relative aspect-[4/3] w-full overflow-hidden bg-gray-100">
                    <img
                      src={`data:image/jpeg;base64,${s.foto_base64}`}
                      alt={s.class_name ?? "Bukti deteksi barang"}
                      loading="lazy"
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                    {s.alert_level && (
                      <div className="absolute left-2 top-2 rounded-md bg-black/60 px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm">
                        {s.alert_level}
                      </div>
                    )}
                  </div>
                  <div className="space-y-2 p-4">
                    <p className="text-sm font-semibold text-foreground">
                      {s.class_name ?? "Barang tidak teridentifikasi"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Dilaporkan {formatDateTime(s.created_at)}
                    </p>
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-700">
                      <Clock className="h-3.5 w-3.5" />
                      {formatDuration(s.first_detected)}
                    </span>
                    {s.camera && (
                      <p className="text-[10px] text-muted-foreground mt-1">
                        Kamera: {s.camera}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ul>

            <Pagination
              page={page}
              totalPages={totalPages}
              total={stagings.length}
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

  // Menghasilkan daftar halaman dengan elipsis
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
                  : "border-border bg-white text-foreground hover:bg-accent"
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