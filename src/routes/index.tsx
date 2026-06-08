import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatShortDate, type EvidenceEntry } from "@/lib/evidence";

const PAGE_SIZE = 6;

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Arsip Bukti Kejadian" },
      { name: "description", content: "Daftar entri bukti kejadian dengan pencarian lokasi dan filter tanggal." },
      { property: "og:title", content: "Arsip Bukti Kejadian" },
      { property: "og:description", content: "Daftar entri bukti kejadian dengan pencarian lokasi dan filter tanggal." },
    ],
  }),
  component: Index,
});

function Index() {
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [limit, setLimit] = useState(PAGE_SIZE);

  const queryKey = ["entries", { search, from, to, limit }];

  const { data, isLoading, isError } = useQuery({
    queryKey,
    queryFn: async () => {
      let q = supabase
        .from("evidence_entries")
        .select("*", { count: "exact" })
        .order("occurred_at", { ascending: false })
        .limit(limit);

      if (search.trim()) q = q.ilike("location", `%${search.trim()}%`);
      if (from) q = q.gte("occurred_at", new Date(from).toISOString());
      if (to) {
        const end = new Date(to);
        end.setHours(23, 59, 59, 999);
        q = q.lte("occurred_at", end.toISOString());
      }

      const { data, error, count } = await q;
      if (error) throw error;
      return { entries: (data ?? []) as EvidenceEntry[], total: count ?? 0 };
    },
  });

  const entries = data?.entries ?? [];
  const total = data?.total ?? 0;
  const hasMore = useMemo(() => entries.length < total, [entries.length, total]);

  const reset = () => {
    setSearch("");
    setFrom("");
    setTo("");
    setLimit(PAGE_SIZE);
  };

  return (
    <main className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/60 backdrop-blur">
        <div className="mx-auto max-w-5xl px-6 py-10">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            Arsip Bukti Kejadian
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Telusuri entri bukti kejadian berdasarkan lokasi atau rentang tanggal. Klik kartu untuk melihat detail.
          </p>
        </div>
      </header>

      <section className="mx-auto max-w-5xl px-6 py-8">
        <div className="rounded-lg border border-border bg-card p-4 shadow-[var(--shadow-soft)]">
          <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto_auto]">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground">Pencarian lokasi</span>
              <input
                type="search"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setLimit(PAGE_SIZE);
                }}
                placeholder="cth. Jakarta"
                className="h-9 rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground">Dari</span>
              <input
                type="date"
                value={from}
                onChange={(e) => {
                  setFrom(e.target.value);
                  setLimit(PAGE_SIZE);
                }}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground">Sampai</span>
              <input
                type="date"
                value={to}
                onChange={(e) => {
                  setTo(e.target.value);
                  setLimit(PAGE_SIZE);
                }}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            </label>
            <div className="flex items-end">
              <button
                type="button"
                onClick={reset}
                className="h-9 rounded-md border border-border bg-background px-3 text-sm font-medium text-foreground transition-colors hover:bg-accent"
              >
                Reset
              </button>
            </div>
          </div>
        </div>

        <div className="mt-6">
          {isLoading ? (
            <SkeletonGrid />
          ) : isError ? (
            <p className="rounded-md border border-border bg-card p-6 text-sm text-destructive">
              Gagal memuat data.
            </p>
          ) : entries.length === 0 ? (
            <p className="rounded-md border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">
              Tidak ada entri yang cocok dengan filter saat ini.
            </p>
          ) : (
            <>
              <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {entries.map((entry) => (
                  <li key={entry.id}>
                    <EntryCard entry={entry} />
                  </li>
                ))}
              </ul>

              <div className="mt-8 flex items-center justify-between text-sm text-muted-foreground">
                <span>
                  Menampilkan {entries.length} dari {total} entri
                </span>
                {hasMore && (
                  <button
                    type="button"
                    onClick={() => setLimit((n) => n + PAGE_SIZE)}
                    className="rounded-md border border-border bg-card px-4 py-2 font-medium text-foreground transition-colors hover:bg-accent"
                  >
                    Muat lebih banyak
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </section>

      <footer className="border-t border-border py-8 text-center text-xs text-muted-foreground">
        Arsip Bukti Kejadian · Tampilan minimalis
      </footer>
    </main>
  );
}

function EntryCard({ entry }: { entry: EvidenceEntry }) {
  return (
    <Link
      to="/entry/$id"
      params={{ id: String(entry.id) }}
      className="group block overflow-hidden rounded-lg border border-border bg-card shadow-[var(--shadow-soft)] transition-all hover:-translate-y-0.5 hover:border-ring focus:outline-none focus:ring-2 focus:ring-ring"
    >
      <div className="aspect-[4/3] w-full overflow-hidden bg-muted">
        <img
          src={entry.image_url}
          alt={`Bukti kejadian di ${entry.location}`}
          loading="lazy"
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
        />
      </div>
      <div className="space-y-1 p-4">
        <p className="line-clamp-1 text-sm font-medium text-foreground">{entry.location}</p>
        <p className="text-xs text-muted-foreground">{formatShortDate(entry.occurred_at)}</p>
      </div>
    </Link>
  );
}

function SkeletonGrid() {
  return (
    <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <li key={i} className="overflow-hidden rounded-lg border border-border bg-card">
          <div className="aspect-[4/3] w-full animate-pulse bg-muted" />
          <div className="space-y-2 p-4">
            <div className="h-3 w-2/3 animate-pulse rounded bg-muted" />
            <div className="h-3 w-1/3 animate-pulse rounded bg-muted" />
          </div>
        </li>
      ))}
    </ul>
  );
}
