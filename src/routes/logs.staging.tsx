import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Boxes, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatDateTime } from "@/lib/evidence";

type StagingDetection = {
  id: number;
  image_url: string;
  item_label: string | null;
  reported_at: string;
  resolved_at: string | null;
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
  const { data: stagings = [], isLoading, isError } = useQuery({
    queryKey: ["staging_detections", "all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staging_detections")
        .select("*")
        .order("reported_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as StagingDetection[];
    },
  });

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
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-6 py-8">
        <p className="mb-5 text-sm text-muted-foreground">
          Riwayat lengkap deteksi barang di staging beserta bukti foto, waktu laporan, dan durasi.
        </p>

        {isLoading ? (
          <p className="rounded-md border border-border bg-card p-6 text-sm text-muted-foreground">
            Memuat data…
          </p>
        ) : isError ? (
          <p className="rounded-md border border-border bg-card p-6 text-sm text-destructive">
            Gagal memuat data.
          </p>
        ) : stagings.length === 0 ? (
          <p className="rounded-md border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">
            Belum ada deteksi barang staging.
          </p>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {stagings.map((s) => (
              <li
                key={s.id}
                className="overflow-hidden rounded-lg border border-border bg-card shadow-[var(--shadow-soft)]"
              >
                <div className="aspect-[4/3] w-full overflow-hidden bg-muted">
                  <img
                    src={s.image_url}
                    alt={s.item_label ?? "Bukti deteksi barang"}
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                </div>
                <div className="space-y-1.5 p-4">
                  <p className="text-sm font-medium text-foreground">
                    {s.item_label ?? "Barang tidak teridentifikasi"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Dilaporkan {formatDateTime(s.reported_at)}
                  </p>
                  <p className="flex items-center gap-1 text-xs">
                    <Clock className="h-3 w-3" />
                    <span
                      className={
                        s.resolved_at ? "text-muted-foreground" : "font-medium text-destructive"
                      }
                    >
                      {s.resolved_at
                        ? `Selesai dalam ${formatDuration(s.reported_at, s.resolved_at)}`
                        : `Berlangsung ${formatDuration(s.reported_at)}`}
                    </span>
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
