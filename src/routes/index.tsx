import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatShortDate, formatDateTime, type EvidenceEntry } from "@/lib/evidence";
import companyLogo from "@/assets/company-logo.png";
import warehouseBg from "@/assets/warehouse-bg.jpg";
import warehouseVideo from "@/assets/warehouse-bg.mp4.asset.json";



const PAGE_SIZE = 6;

// Template tetap: lokasi tidak berubah antar entri.
// Ubah nilai di bawah ini untuk mengganti lokasi/nama perusahaan yang ditampilkan.
const TEMPLATE = {
  companyName: "PT Contoh Sejahtera",
  location: "Jalan Merdeka No. 10, Jakarta Pusat",
};

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Arsip Bukti Kejadian" },
      { name: "description", content: "Daftar entri bukti kejadian berdasarkan tanggal dan waktu." },
      { property: "og:title", content: "Arsip Bukti Kejadian" },
      { property: "og:description", content: "Daftar entri bukti kejadian berdasarkan tanggal dan waktu." },
    ],
  }),
  component: Index,
});

function Index() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [scrollY, setScrollY] = useState(0);

  useEffect(() => {
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        setScrollY(window.scrollY);
        frame = 0;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);


  const queryKey = ["entries", { from, to, limit }];

  const { data, isLoading, isError } = useQuery({
    queryKey,
    queryFn: async () => {
      let q = supabase
        .from("evidence_entries")
        .select("*", { count: "exact" })
        .order("occurred_at", { ascending: false })
        .limit(limit);

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
    setFrom("");
    setTo("");
    setLimit(PAGE_SIZE);
  };

  return (
    <main className="relative min-h-screen overflow-hidden bg-background">
      {/* Parallax warehouse background */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-x-0 top-0 -z-10 h-[120vh] will-change-transform"
        style={{
          transform: `translate3d(0, ${scrollY * 0.35}px, 0)`,
        }}
      >
        <img
          src={warehouseBg}
          alt=""
          width={1920}
          height={1280}
          className="h-full w-full object-cover opacity-40"
        />
        {/* Gradient overlay so content remains readable */}
        <div className="absolute inset-0 bg-gradient-to-b from-background/70 via-background/85 to-background" />
      </div>

      {/* Midground tint that drifts slower than the photo */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10"
        style={{
          transform: `translate3d(0, ${scrollY * 0.12}px, 0)`,
          background:
            "radial-gradient(60% 50% at 20% 10%, color-mix(in oklab, var(--primary) 12%, transparent), transparent 60%), radial-gradient(50% 40% at 90% 30%, color-mix(in oklab, var(--primary) 8%, transparent), transparent 60%)",
        }}
      />

      <header className="border-b border-border/60 bg-card/70 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl items-center gap-4 px-6 py-8">
          <img
            src={companyLogo}
            alt={`Logo ${TEMPLATE.companyName}`}
            width={56}
            height={56}
            className="h-14 w-14 shrink-0 rounded-md border border-border bg-background object-contain p-1"
          />
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {TEMPLATE.companyName}
            </p>
            <h1 className="truncate text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
              Arsip Bukti Kejadian
            </h1>
            <p className="mt-0.5 truncate text-sm text-muted-foreground">
              Lokasi: {TEMPLATE.location}
            </p>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-5xl px-6 py-8">
        <div className="rounded-lg border border-border/60 bg-card/80 p-4 shadow-[var(--shadow-soft)] backdrop-blur-md">

          <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground">Dari tanggal</span>
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
              <span className="text-xs font-medium text-muted-foreground">Sampai tanggal</span>
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
              Tidak ada entri pada rentang tanggal ini.
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
        {TEMPLATE.companyName} · Arsip Bukti Kejadian
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
          alt={`Bukti kejadian ${formatShortDate(entry.occurred_at)}`}
          loading="lazy"
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
        />
      </div>
      <div className="space-y-1 p-4">
        <p className="text-sm font-medium text-foreground">
          {formatDateTime(entry.occurred_at)}
        </p>
        <p className="text-xs text-muted-foreground">Entri #{entry.id}</p>
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
