import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, CameraOff, ChevronLeft, ChevronRight } from "lucide-react";
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
      const res = await fetch('http://localhost:5000/api/alerts?class_name=camera_offline');
      if (!res.ok) throw new Error('Gagal fetch camera offline');
      return res.json() as Promise<CameraOfflineEvent[]>;
    },
  });

  const totalPages = Math.ceil(cams.length / PAGE_SIZE);
  const paginated = cams.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

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
            <CameraOff className="h-5 w-5 text-destructive" />
            <h1 className="text-lg font-semibold tracking-tight text-foreground">
              Laporan Kamera Mati
            </h1>
          </div>
          {cams.length > 0 && (
            <span className="ml-auto rounded-full bg-destructive/10 px-3 py-1 text-xs font-medium text-destructive">
              {cams.length} total
            </span>
          )}
        </div>
      </header>

      <section className="mx-auto max-w-3xl px-6 py-8">
        <p className="mb-5 text-sm text-muted-foreground">
          Riwayat lengkap kejadian kamera mati beserta waktunya.
        </p>

        {isLoading ? (
          <div className="space-y-2 rounded-lg border border-border bg-card">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex animate-pulse items-center gap-4 px-5 py-4">
                <div className="h-10 w-10 rounded-md bg-muted" />
                <div className="h-3 w-40 rounded bg-muted" />
                <div className="ml-auto h-3 w-24 rounded bg-muted" />
              </div>
            ))}
          </div>
        ) : isError ? (
          <p className="rounded-md border border-border bg-card p-6 text-sm text-destructive">
            Gagal memuat data.
          </p>
        ) : cams.length === 0 ? (
          <p className="rounded-md border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">
            Tidak ada kamera mati.
          </p>
        ) : (
          <>
            <ul className="divide-y divide-border rounded-lg border border-border bg-card shadow-[var(--shadow-soft)]">
              {paginated.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-muted/30">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-md bg-destructive/10 text-destructive">
                      <CameraOff className="h-4 w-4" />
                    </div>
                    <p className="text-sm font-medium text-foreground">{c.camera}</p>
                  </div>
                  <span className="text-xs text-muted-foreground">{formatDateTime(c.created_at)}</span>
                </li>
              ))}
            </ul>

            <Pagination page={page} totalPages={totalPages} total={cams.length} pageSize={PAGE_SIZE} onChange={setPage} />
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