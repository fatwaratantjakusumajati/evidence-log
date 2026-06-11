import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowRight, ShieldCheck, Radio, Activity } from "lucide-react";
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
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
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
    <main
      className="welcome-root relative min-h-screen overflow-hidden text-slate-100"
      style={{ backgroundColor: "#05070d" }}
    >
      {/* Scoped, GPU-friendly animations + reduced-motion safety */}
      <style>{`
        @keyframes welcome-zoom {
          0% { transform: scale(1.05); }
          50% { transform: scale(1.12); }
          100% { transform: scale(1.05); }
        }
        @keyframes welcome-drift-a {
          0%, 100% { transform: translate3d(0, 0, 0); }
          50% { transform: translate3d(20px, -18px, 0); }
        }
        @keyframes welcome-drift-b {
          0%, 100% { transform: translate3d(0, 0, 0); }
          50% { transform: translate3d(-24px, 16px, 0); }
        }
        @keyframes welcome-shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        .welcome-ease { transition-timing-function: cubic-bezier(0.22, 1, 0.36, 1); }
        .welcome-video-zoom { animation: welcome-zoom 24s ease-in-out infinite; will-change: transform; }
        .welcome-orb-a { animation: welcome-drift-a 14s ease-in-out infinite; will-change: transform; }
        .welcome-orb-b { animation: welcome-drift-b 18s ease-in-out infinite; will-change: transform; }
        .welcome-title-shimmer {
          background-size: 200% auto;
          animation: welcome-shimmer 8s linear infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .welcome-root *,
          .welcome-root *::before,
          .welcome-root *::after {
            animation-duration: 0.001ms !important;
            animation-iteration-count: 1 !important;
            transition-duration: 0.001ms !important;
          }
        }
      `}</style>

      {/* Parallax warehouse video background */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-x-0 top-0 z-0 h-[130vh] will-change-transform"
        style={{ transform: `translate3d(0, ${scrollY * 0.35}px, 0)` }}
      >
        <div className="welcome-video-zoom h-full w-full">
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
            className="h-full w-full object-cover"
            style={{ filter: "brightness(0.55) contrast(1.1) saturate(0.85)" }}
          />
        </div>
        {/* Cinematic dark gradients */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/40 to-black/90" />
        <div className="absolute inset-0 bg-[radial-gradient(120%_80%_at_50%_40%,transparent_30%,rgba(5,7,13,0.85)_100%)]" />
        {/* Color tint */}
        <div
          className="absolute inset-0 mix-blend-overlay opacity-60"
          style={{
            background:
              "radial-gradient(70% 50% at 20% 20%, rgba(239,68,68,0.20), transparent 60%), radial-gradient(60% 50% at 85% 80%, rgba(190,18,60,0.22), transparent 60%)",
          }}
        />
        {/* Grain */}
        <div
          aria-hidden
          className="absolute inset-0 opacity-[0.07] mix-blend-overlay"
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)' opacity='0.6'/></svg>\")",
          }}
        />
      </div>

      {/* Floating ambient orbs */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-0"
        style={{ transform: `translate3d(0, ${scrollY * 0.18}px, 0)` }}
      >
        <div className="welcome-orb-a absolute left-[10%] top-[20%] h-72 w-72 rounded-full bg-red-500/20 blur-[120px]" />
        <div className="welcome-orb-b absolute right-[8%] top-[55%] h-96 w-96 rounded-full bg-rose-600/20 blur-[140px]" />
      </div>

      {/* Top bar */}
      <header
        className={`relative z-20 flex items-center justify-between px-6 py-6 sm:px-12 welcome-ease transition-all duration-[900ms] ${
          mounted ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-4"
        }`}
      >
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 bg-white/5 backdrop-blur-xl">
            <img
              src={companyLogo}
              alt={`Logo ${TEMPLATE.companyName}`}
              width={28}
              height={28}
              className="h-7 w-7 object-contain"
            />
          </div>
          <div className="flex flex-col leading-tight">
            <span className="text-xs uppercase tracking-[0.2em] text-slate-400">Sentinel</span>
            <span className="text-sm font-medium text-slate-100">{TEMPLATE.companyName}</span>
          </div>
        </div>
        <div className="hidden items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 backdrop-blur-xl sm:flex">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
          </span>
          <span className="text-xs text-slate-300">Sistem aktif · Live monitoring</span>
        </div>
      </header>

      {/* Hero */}
      <section className="relative z-10 flex min-h-[calc(100vh-96px)] flex-col items-center justify-center px-6 text-center">
        <div
          className={`mb-8 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 backdrop-blur-xl welcome-ease transition-all duration-[900ms] delay-100 ${
            mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
          }`}
        >
          <ShieldCheck className="h-3.5 w-3.5 text-red-400" />
          <span className="text-xs uppercase tracking-[0.18em] text-slate-300">
            Warehouse Intelligence Platform
          </span>
        </div>

        <h1
          className={`max-w-4xl text-5xl font-semibold tracking-tight text-white sm:text-7xl lg:text-8xl welcome-ease transition-all duration-[1100ms] delay-200 ${
            mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
          }`}
          style={{ textShadow: "0 4px 40px rgba(0,0,0,0.5)" }}
        >
          Pantau gudang.
          <br />
          <span className="bg-gradient-to-r from-red-400 via-rose-300 to-red-400 bg-clip-text welcome-title-shimmer text-transparent">
            Tanpa kompromi.
          </span>
        </h1>

        <p
          className={`mt-8 max-w-2xl text-base text-slate-300 sm:text-lg leading-relaxed welcome-ease transition-all duration-[1100ms] delay-[400ms] ${
            mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
          }`}
        >
          Sistem pemantauan dan arsip bukti kejadian real-time.
          Deteksi barang, status kamera, dan lalu lintas kendaraan dalam satu pandangan.
        </p>

        <div
          className={`mt-12 flex flex-col items-center gap-4 sm:flex-row welcome-ease transition-all duration-[1100ms] delay-[600ms] ${
            mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
          }`}
        >
          <Link
            to="/dashboard"
            className="group relative inline-flex items-center gap-3 overflow-hidden rounded-full bg-white px-8 py-4 text-base font-semibold text-slate-900 shadow-[0_8px_32px_rgba(239,68,68,0.35)] welcome-ease transition-all duration-500 hover:-translate-y-0.5 hover:shadow-[0_12px_48px_rgba(190,18,60,0.5)] focus:outline-none focus:ring-2 focus:ring-red-400 focus:ring-offset-2 focus:ring-offset-slate-950"
          >
            <span className="absolute inset-0 bg-gradient-to-r from-red-200 via-white to-rose-200 opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
            <span className="relative">Let&apos;s Go</span>
            <ArrowRight className="relative h-5 w-5 transition-transform duration-300 group-hover:translate-x-1.5" />
          </Link>
          <a
            href="#features"
            className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-6 py-4 text-sm text-slate-200 backdrop-blur-xl welcome-ease transition-all duration-500 hover:border-white/30 hover:bg-white/10"
          >
            Pelajari sistem
          </a>
        </div>

        {/* Feature pills */}
        <div
          id="features"
          className={`mt-20 grid w-full max-w-4xl grid-cols-1 gap-4 sm:grid-cols-3 welcome-ease transition-all duration-[1100ms] delay-[800ms] ${
            mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
          }`}
        >
          {[
            { icon: Activity, label: "Deteksi Barang", desc: "Real-time staging" },
            { icon: Radio, label: "Status Kamera", desc: "24/7 monitoring" },
            { icon: ShieldCheck, label: "Log Kendaraan", desc: "Arsip lengkap" },
          ].map(({ icon: Icon, label, desc }) => (
            <div
              key={label}
              className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] p-5 text-left backdrop-blur-xl welcome-ease transition-all duration-500 hover:border-white/20 hover:-translate-y-0.5 hover:bg-white/[0.08]"
            >
              <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-red-500/10 blur-2xl transition-all group-hover:bg-red-500/20" />
              <Icon className="relative h-5 w-5 text-red-400" />
              <div className="relative mt-3 text-sm font-medium text-white">{label}</div>
              <div className="relative mt-0.5 text-xs text-slate-400">{desc}</div>
            </div>
          ))}
        </div>

        <p className="mt-16 text-xs uppercase tracking-[0.2em] text-slate-500">
          {TEMPLATE.location}
        </p>
      </section>

      {/* Bottom fade */}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-10 h-32 bg-gradient-to-t from-[#05070d] to-transparent" />
    </main>
  );
}
