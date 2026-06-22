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
    <main className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 border-b border-border bg-card/95 backdrop-blur-xl">
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
              <div key={i} className="animate-pulse overflow-hidden rounded-lg border border-border bg-card">
                <div className="aspect-[4/3] bg-muted" />
                <div className="space-y-2 p-4">
                  <div className="h-3 w-2/3 rounded bg-muted" />
                  <div className="h-3 w-1/2 rounded bg-muted" />
                </div>
              </div>
            ))}
          </div>
        ) : isError ? (
          <p className="rounded-md border border-border bg-card p-6 text-sm text-destructive">
            Gagal memuat data.
          </p>
        ) : stagings.length === 0 ? (
          <p className="rounded-md border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">
            Belum ada deteksi barang staging.
          </p>
        ) : (
          <>
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {paginated.map((s) => (
                <li key={s.id} className="overflow-hidden rounded-lg border border-border bg-card shadow-[var(--shadow-soft)] transition-shadow hover:shadow-md">
                  <div className="aspect-[4/3] w-full overflow-hidden bg-muted">
                    <img
                      src={`data:image/jpeg;base64,${s.foto_base64}`}
                      alt={s.class_name ?? "Bukti deteksi barang"}
                      loading="lazy"
                      className="h-full w-full object-cover transition-transform duration-300 hover:scale-105"
                    />
                  </div>
                  <div className="space-y-1.5 p-4">
                    <p className="text-sm font-medium text-foreground">
                      {s.class_name ?? "Barang tidak teridentifikasi"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Dilaporkan {formatDateTime(s.created_at)}
                    </p>
                    <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-1 text-xs font-semibold text-red-700">
                      <Clock className="h-3 w-3" />
                      {formatDuration(s.first_detected)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>

            <Pagination page={page} totalPages={totalPages} total={stagings.length} pageSize={PAGE_SIZE} onChange={setPage} />
          </>
        )}
      </section>
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

  const pages = Array.from({ length: totalPages }, (_, i) => i + 1).filter(
    (p) => p === 1 || p === totalPages || Math.abs(p - page) <= 1
  );

  return (
    <div className="mt-8 flex flex-col items-center gap-3">
      <p className="text-xs text-muted-foreground">
        Menampilkan {from}–{to} dari {total} data
      </p>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onChange(page - 1)}
          disabled={page === 1}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-card text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        {pages.map((p, i) => {
          const prev = pages[i - 1];
          return (
            <span key={p} className="flex items-center gap-1">
              {prev && p - prev > 1 && (
                <span className="px-1 text-xs text-muted-foreground">…</span>
              )}
              <button
                onClick={() => onChange(p)}
                className={`inline-flex h-8 w-8 items-center justify-center rounded-md border text-xs font-medium transition-colors ${
                  p === page
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-foreground hover:bg-accent"
                }`}
              >
                {p}
              </button>
            </span>
          );
        })}

        <button
          onClick={() => onChange(page + 1)}
          disabled={page === totalPages}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-card text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}