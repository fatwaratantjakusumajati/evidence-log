import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import companyLogo from "@/assets/company-logo.png";
import warehouseBg from "@/assets/warehouse-bg.jpg";
import warehouseVideo from "@/assets/warehouse-bg.mp4.asset.json";

const TEMPLATE = {
  companyName: "PT Contoh Sejahtera",
  location: "Jalan Merdeka No. 10, Jakarta Pusat",
};

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Selamat Datang · Arsip Bukti Kejadian" },
      { name: "description", content: "Halaman selamat datang sistem pemantauan gudang." },
    ],
  }),
  component: Welcome,
});

function Welcome() {
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

  return (
    <main className="relative min-h-screen overflow-hidden">
      {/* Parallax warehouse video background */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-x-0 top-0 z-0 h-[120vh] will-change-transform"
        style={{ transform: `translate3d(0, ${scrollY * 0.35}px, 0)` }}
      >
        <video
          src={warehouseVideo.url}
          poster={warehouseBg}
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          disableRemotePlayback
          disablePictureInPicture
          aria-hidden
          className="h-full w-full object-cover opacity-90"
        />
        <div className="absolute inset-0 bg-[radial-gradient(120%_90%_at_50%_30%,transparent_20%,color-mix(in_oklab,var(--background)_75%,transparent)_100%)]" />
      </div>

      {/* Midground tint */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          transform: `translate3d(0, ${scrollY * 0.12}px, 0)`,
          background:
            "radial-gradient(60% 50% at 20% 10%, color-mix(in oklab, var(--primary) 14%, transparent), transparent 60%), radial-gradient(50% 40% at 90% 30%, color-mix(in oklab, var(--primary) 10%, transparent), transparent 60%)",
        }}
      />

      <section className="relative z-10 flex min-h-screen flex-col items-center justify-center px-6 text-center">
        <div className="mb-8 inline-flex items-center gap-3 rounded-full border border-border/60 bg-card/80 px-5 py-2 backdrop-blur-xl">
          <img
            src={companyLogo}
            alt={`Logo ${TEMPLATE.companyName}`}
            width={32}
            height={32}
            className="h-8 w-8 rounded bg-background object-contain p-0.5"
          />
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {TEMPLATE.companyName}
          </span>
        </div>

        <div className="max-w-3xl rounded-2xl border border-border/60 bg-card/85 px-8 py-12 shadow-[var(--shadow-soft)] backdrop-blur-xl sm:px-12 sm:py-16">
          <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-6xl">
            Selamat Datang
          </h1>
          <p className="mt-4 text-base text-muted-foreground sm:text-lg">
            Sistem pemantauan dan arsip bukti kejadian gudang.
            <br className="hidden sm:block" />
            Pantau deteksi barang, status kamera, dan lalu lintas kendaraan secara real-time.
          </p>

          <div className="mt-10 flex justify-center">
            <Link
              to="/dashboard"
              className="group inline-flex items-center gap-2 rounded-full bg-primary px-8 py-4 text-base font-semibold text-primary-foreground shadow-lg transition-all hover:-translate-y-0.5 hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-ring"
            >
              Let&apos;s Go
              <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
            </Link>
          </div>
        </div>

        <p className="mt-8 text-xs text-muted-foreground/80">
          Lokasi: {TEMPLATE.location}
        </p>
      </section>
    </main>
  );
}
