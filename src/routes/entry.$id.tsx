import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatDateTime, type EvidenceEntry } from "@/lib/evidence";

export const Route = createFileRoute("/entry/$id")({
  head: ({ params }) => ({
    meta: [
      { title: `Entri #${params.id} · Arsip Bukti Kejadian` },
      { name: "description", content: `Detail entri bukti kejadian #${params.id}.` },
    ],
  }),
  component: EntryDetail,
  errorComponent: ({ error }) => (
    <div className="mx-auto max-w-3xl px-6 py-16 text-center">
      <p className="text-sm text-destructive">{error.message}</p>
      <Link to="/" className="mt-4 inline-block text-sm text-foreground underline">
        Kembali
      </Link>
    </div>
  ),
  notFoundComponent: () => (
    <div className="mx-auto max-w-3xl px-6 py-16 text-center">
      <p className="text-sm text-muted-foreground">Entri tidak ditemukan.</p>
      <Link to="/" className="mt-4 inline-block text-sm text-foreground underline">
        Kembali
      </Link>
    </div>
  ),
});

function EntryDetail() {
  const { id } = Route.useParams();

  const { data: entry, isLoading, isError } = useQuery({
    queryKey: ["entry", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("evidence_entries")
        .select("*")
        .eq("id", Number(id))
        .maybeSingle();
      if (error) throw error;
      if (!data) throw notFound();
      return data as EvidenceEntry;
    },
  });

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-6 py-10">
        <Link
          to="/"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          ← Kembali ke daftar
        </Link>

        {isLoading ? (
          <div className="mt-6 space-y-4">
            <div className="aspect-[16/10] w-full animate-pulse rounded-lg bg-muted" />
            <div className="h-5 w-1/2 animate-pulse rounded bg-muted" />
            <div className="h-4 w-1/3 animate-pulse rounded bg-muted" />
          </div>
        ) : isError || !entry ? (
          <p className="mt-8 text-sm text-destructive">Gagal memuat detail entri.</p>
        ) : (
          <article className="mt-6">
            <div className="overflow-hidden rounded-lg border border-border bg-card shadow-[var(--shadow-soft)]">
              <img
                src={entry.image_url}
                alt={`Bukti kejadian di ${entry.location}`}
                className="w-full object-contain"
              />
            </div>

            <header className="mt-6">
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                {entry.location}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {formatDateTime(entry.occurred_at)}
              </p>
            </header>

            {entry.description && (
              <p className="mt-4 text-sm leading-relaxed text-foreground">{entry.description}</p>
            )}

            {entry.latitude != null && entry.longitude != null && (
              <section className="mt-6">
                <h2 className="mb-2 text-sm font-medium text-foreground">Peta</h2>
                <div className="overflow-hidden rounded-lg border border-border">
                  <iframe
                    title="Peta lokasi"
                    src={`https://www.openstreetmap.org/export/embed.html?bbox=${entry.longitude - 0.01}%2C${entry.latitude - 0.01}%2C${entry.longitude + 0.01}%2C${entry.latitude + 0.01}&layer=mapnik&marker=${entry.latitude}%2C${entry.longitude}`}
                    className="h-64 w-full"
                    loading="lazy"
                  />
                </div>
                <a
                  href={`https://www.openstreetmap.org/?mlat=${entry.latitude}&mlon=${entry.longitude}#map=15/${entry.latitude}/${entry.longitude}`}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-block text-xs text-muted-foreground underline hover:text-foreground"
                >
                  Buka di OpenStreetMap
                </a>
              </section>
            )}

            <dl className="mt-6 grid grid-cols-2 gap-4 border-t border-border pt-4 text-xs">
              <div>
                <dt className="text-muted-foreground">ID Entri</dt>
                <dd className="mt-0.5 text-foreground">#{entry.id}</dd>
              </div>
              {entry.latitude != null && entry.longitude != null && (
                <div>
                  <dt className="text-muted-foreground">Koordinat</dt>
                  <dd className="mt-0.5 text-foreground">
                    {entry.latitude.toFixed(4)}, {entry.longitude.toFixed(4)}
                  </dd>
                </div>
              )}
            </dl>
          </article>
        )}
      </div>
    </main>
  );
}
