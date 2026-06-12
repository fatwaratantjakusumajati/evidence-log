import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, CameraOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatDateTime } from "@/lib/evidence";

type CameraOfflineEvent = {
  id: number;
  camera_name: string;
  occurred_at: string;
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
  const { data: cams = [], isLoading, isError } = useQuery({
    queryKey: ["camera_offline_events", "all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("camera_offline_events")
        .select("*")
        .order("occurred_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as CameraOfflineEvent[];
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
            <CameraOff className="h-5 w-5 text-destructive" />
            <h1 className="text-lg font-semibold tracking-tight text-foreground">
              Laporan Kamera Mati
            </h1>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-3xl px-6 py-8">
        <p className="mb-5 text-sm text-muted-foreground">
          Riwayat lengkap kejadian kamera mati beserta waktunya.
        </p>

        {isLoading ? (
          <p className="rounded-md border border-border bg-card p-6 text-sm text-muted-foreground">
            Memuat data…
          </p>
        ) : isError ? (
          <p className="rounded-md border border-border bg-card p-6 text-sm text-destructive">
            Gagal memuat data.
          </p>
        ) : cams.length === 0 ? (
          <p className="rounded-md border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">
            Tidak ada kamera mati.
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border bg-card shadow-[var(--shadow-soft)]">
            {cams.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-4 px-5 py-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-md bg-destructive/10 text-destructive">
                    <CameraOff className="h-4 w-4" />
                  </div>
                  <p className="text-sm font-medium text-foreground">{c.camera_name}</p>
                </div>
                <span className="text-xs text-muted-foreground">
                  {formatDateTime(c.occurred_at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
