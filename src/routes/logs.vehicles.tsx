import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Car, ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
import { formatDateTime } from "@/lib/evidence";

const PAGE_SIZE = 12;

type VehicleLog = {
  id: number;
  track_id: number;
  plate_number: string;
  vehicle_type: string;
  confidence: number;
  snapshot_path: string;
  entry_time: string;
  status: string;
};

export const Route = createFileRoute("/logs/vehicles")({
  head: () => ({
    meta: [
      { title: "Log Kendaraan · Dashboard Pemantauan" },
      { name: "description", content: "Daftar lengkap log kendaraan keluar masuk warehouse." },
    ],
  }),
  component: VehicleLogsPage,
});

function VehicleLogsPage() {
  const [page, setPage] = useState(1);

  const { data: vehicles = [], isLoading, isError } = useQuery({
    queryKey: ["vehicle_logs", "all"],
    queryFn: async () => {
      const res = await fetch('http://localhost:5000/api/vehicles/logs');
      if (!res.ok) throw new Error('Gagal fetch vehicle logs');
      return res.json() as Promise<VehicleLog[]>;
    },
  });

  const totalPages = Math.ceil(vehicles.length / PAGE_SIZE);
  const paginated = vehicles.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

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
            <Car className="h-5 w-5 text-primary" />
            <h1 className="text-lg font-semibold tracking-tight text-foreground">
              Log Kendaraan
            </h1>
          </div>
          {vehicles.length > 0 && (
            <span className="ml-auto rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
              {vehicles.length} total
            </span>
          )}
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-6 py-8">
        <p className="mb-5 text-sm text-muted-foreground">
          Riwayat lengkap kendaraan keluar/masuk dengan bukti foto, plat nomor, dan waktu.
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
        ) : vehicles.length === 0 ? (
          <p className="rounded-md border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">
            Belum ada log kendaraan.
          </p>
        ) : (
          <>
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {paginated.map((v) => (
                <li key={v.id} className="overflow-hidden rounded-lg border border-border bg-card shadow-[var(--shadow-soft)] transition-shadow hover:shadow-md">
                  <div className="aspect-[4/3] w-full overflow-hidden bg-muted">
                    <img
                      src={v.snapshot_path}
                      alt={`Bukti kendaraan ${v.plate_number}`}
                      loading="lazy"
                      className="h-full w-full object-cover transition-transform duration-300 hover:scale-105"
                    />
                  </div>
                  <div className="space-y-2 p-4">
                    <div className="flex items-center gap-2">
                      <span className="rounded bg-muted px-2 py-0.5 font-mono text-sm font-semibold tracking-wider text-foreground">
                        {v.plate_number}
                      </span>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
                        v.status === "masuk" ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive"
                      }`}>
                        {v.status}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">{formatDateTime(v.entry_time)}</p>
                  </div>
                </li>
              ))}
            </ul>

            <Pagination page={page} totalPages={totalPages} total={vehicles.length} pageSize={PAGE_SIZE} onChange={setPage} />
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