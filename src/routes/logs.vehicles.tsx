import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Car } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatDateTime } from "@/lib/evidence";

type VehicleLog = {
  id: number;
  image_url: string;
  plate_number: string;
  direction: "masuk" | "keluar";
  occurred_at: string;
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
  const { data: vehicles = [], isLoading, isError } = useQuery({
    queryKey: ["vehicle_logs", "all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vehicle_logs")
        .select("*")
        .order("occurred_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as VehicleLog[];
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
            <Car className="h-5 w-5 text-primary" />
            <h1 className="text-lg font-semibold tracking-tight text-foreground">
              Log Kendaraan
            </h1>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-6 py-8">
        <p className="mb-5 text-sm text-muted-foreground">
          Riwayat lengkap kendaraan keluar/masuk dengan bukti foto, plat nomor, dan waktu.
        </p>

        {isLoading ? (
          <p className="rounded-md border border-border bg-card p-6 text-sm text-muted-foreground">
            Memuat data…
          </p>
        ) : isError ? (
          <p className="rounded-md border border-border bg-card p-6 text-sm text-destructive">
            Gagal memuat data.
          </p>
        ) : vehicles.length === 0 ? (
          <p className="rounded-md border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">
            Belum ada log kendaraan.
          </p>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {vehicles.map((v) => (
              <li
                key={v.id}
                className="overflow-hidden rounded-lg border border-border bg-card shadow-[var(--shadow-soft)]"
              >
                <div className="aspect-[4/3] w-full overflow-hidden bg-muted">
                  <img
                    src={v.image_url}
                    alt={`Bukti kendaraan ${v.plate_number}`}
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                </div>
                <div className="space-y-2 p-4">
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-muted px-2 py-0.5 font-mono text-sm font-semibold tracking-wider text-foreground">
                      {v.plate_number}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
                        v.direction === "masuk"
                          ? "bg-primary/10 text-primary"
                          : "bg-destructive/10 text-destructive"
                      }`}
                    >
                      {v.direction}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">{formatDateTime(v.occurred_at)}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
