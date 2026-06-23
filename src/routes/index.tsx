import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowRight, ShieldCheck, Radio, Activity, Truck, Loader2 } from "lucide-react";
import companyLogo from "@/assets/aristides-logo.png";
import warehouseVideo from "@/assets/warehouse-bg.mp4";

const TEMPLATE = {
  companyName: "PT Aristides Logistik Indonesia",
  location: "",
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
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

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

  const handleNavigate = () => {
    setIsLoading(true);
    setTimeout(() => {
      navigate({ to: "/dashboard" });
    }, 1200);
  };

  return (
    <>
      {isLoading && (
        <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center overflow-hidden">
          <div className="absolute inset-0 -z-10">
            <video
              src={warehouseVideo}
              autoPlay
              muted
              loop
              playsInline
              className="h-full w-full object-cover scale-105 blur-md brightness-50"
            />
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          </div>
          <div className="flex flex-col items-center gap-6 animate-in fade-in zoom-in duration-500">
            <div className="relative">
              <div className="absolute inset-0 rounded-full bg-white/20 blur-xl animate-pulse" />
              <Loader2 className="relative h-16 w-16 animate-spin text-white drop-shadow-[0_0_30px_rgba(255,255,255,0.3)]" />
            </div>
            <p className="text-lg font-light tracking-[0.3em] text-white/90">
              Loading
              <span className="inline-flex ml-1">
                <span className="animate-bounce [animation-delay:0ms]">.</span>
                <span className="animate-bounce [animation-delay:200ms]">.</span>
                <span className="animate-bounce [animation-delay:400ms]">.</span>
              </span>
            </p>
            <p className="text-xs tracking-[0.2em] text-white/50 animate-pulse">
              Mempersiapkan Dashboard
            </p>
          </div>
        </div>
      )}

      <main
        className="welcome-root relative min-h-screen overflow-hidden text-slate-100"
        style={{ backgroundColor: "#05070d" }}
      >
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
          @keyframes fade-in {
            from { opacity: 0; transform: scale(0.9); }
            to { opacity: 1; transform: scale(1); }
          }
          .animate-in {
            animation: fade-in 0.6s ease-out forwards;
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

        <div
          aria-hidden
          className="pointer-events-none fixed inset-x-0 top-0 z-0 h-[130vh] will-change-transform"
          style={{ transform: `translate3d(0, ${scrollY * 0.35}px, 0)` }}
        >
          <div className="welcome-video-zoom h-full w-full">
            <video
              src={warehouseVideo}
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
          <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/40 to-black/90" />
          <div className="absolute inset-0 bg-[radial-gradient(120%_80%_at_50%_40%,transparent_30%,rgba(5,7,13,0.85)_100%)]" />
          <div
            className="absolute inset-0 mix-blend-overlay opacity-60"
            style={{
              background:
                "radial-gradient(70% 50% at 20% 20%, rgba(0,0,0,0.15), transparent 60%), radial-gradient(60% 50% at 85% 80%, rgba(0,0,0,0.20), transparent 60%)",
            }}
          />
          <div
            aria-hidden
            className="absolute inset-0 opacity-[0.07] mix-blend-overlay"
            style={{
              backgroundImage:
                "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)' opacity='0.6'/></svg>\")",
            }}
          />
        </div>

        <div
          aria-hidden
          className="pointer-events-none fixed inset-0 z-0"
          style={{ transform: `translate3d(0, ${scrollY * 0.18}px, 0)` }}
        >
          <div className="welcome-orb-a absolute left-[10%] top-[20%] h-72 w-72 rounded-full bg-slate-500/10 blur-[120px]" />
          <div className="welcome-orb-b absolute right-[8%] top-[55%] h-96 w-96 rounded-full bg-slate-400/10 blur-[140px]" />
        </div>

        <section className="relative z-10 flex min-h-[calc(100vh-96px)] flex-col items-center justify-center px-6 text-center">
          <div
            className={`mb-8 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-5 py-1.5 backdrop-blur-xl welcome-ease transition-all duration-[900ms] delay-100 ${
              mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
            }`}
          >
            <ShieldCheck className="h-3.5 w-3.5 text-slate-400" />
            <span className="text-[11px] uppercase tracking-[0.2em] text-slate-300">
              Aristides Logistik Indonesia
            </span>
          </div>

          <div
            className={`flex flex-col items-center welcome-ease transition-all duration-[900ms] delay-200 ${
              mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
            }`}
          >
            <img
              src={companyLogo}
              alt="Company Logo"
              className="h-48 w-48 object-contain mb-10"
            />
          </div>

          <h1
            className={`text-4xl font-bold tracking-tight text-white sm:text-6xl lg:text-7xl welcome-ease transition-all duration-[900ms] delay-300 ${
              mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
            }`}
          >
            <span className="welcome-title-shimmer bg-gradient-to-r from-white via-slate-200 to-white bg-clip-text text-transparent">
              Warehouse Intelligence
            </span>
          </h1>
          <p className="mt-2 text-xs uppercase tracking-[0.3em] text-slate-400">
            Real-time Monitoring Platform
          </p>

          <p
            className={`mt-6 max-w-3xl text-base text-slate-300 sm:text-lg leading-relaxed welcome-ease transition-all duration-[1100ms] delay-[400ms] ${
              mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
            }`}
          >
            Warehouse Intelligence Platform untuk pemantauan staging,
            kesehatan CCTV, dan pergerakan kendaraan logistik.
          </p>

          <div
            className={`mt-10 flex flex-col items-center gap-4 sm:flex-row welcome-ease transition-all duration-[1100ms] delay-[600ms] ${
              mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
            }`}
          >
            <button
              onClick={handleNavigate}
              disabled={isLoading}
              className="group relative inline-flex items-center gap-3 overflow-hidden rounded-full border border-white/10 bg-white/10 px-8 py-4 text-base font-medium text-white backdrop-blur-sm shadow-[0_8px_32px_rgba(0,0,0,0.3)] welcome-ease transition-all duration-500 hover:bg-white hover:text-slate-900 hover:-translate-y-0.5 hover:shadow-[0_12px_48px_rgba(0,0,0,0.4)] focus:outline-none focus:ring-2 focus:ring-white/20 focus:ring-offset-2 focus:ring-offset-slate-950 disabled:opacity-70 disabled:cursor-wait"
            >
              <span className="relative">Let&apos;s Go</span>
              <ArrowRight className="relative h-5 w-5 transition-transform duration-300 group-hover:translate-x-1.5" />
            </button>
          </div>

          <div
            id="features"
            className={`mt-20 grid w-full max-w-4xl grid-cols-1 gap-4 sm:grid-cols-3 welcome-ease transition-all duration-[1100ms] delay-[800ms] ${
              mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
            }`}
          >
            {[
              { icon: Activity, label: "Deteksi Barang", desc: "Real-time staging" },
              { icon: Radio, label: "Status Kamera", desc: "24/7 monitoring" },
              { icon: Truck, label: "Log Kendaraan", desc: "Traffic reporting" },
            ].map(({ icon: Icon, label, desc }) => (
              <div
                key={label}
                className="group relative overflow-hidden rounded-2xl border border-white/5 bg-white/5 p-5 text-left backdrop-blur-sm welcome-ease transition-all duration-500 hover:border-white/20 hover:bg-white/10 hover:-translate-y-0.5"
              >
                <div className="absolute -right-6 -top-6 h-16 w-16 rounded-full bg-white/5 blur-xl transition-all group-hover:bg-white/10" />
                <Icon className="relative h-6 w-6 text-slate-400 group-hover:text-slate-200 transition-colors" />
                <div className="relative mt-3 text-sm font-medium text-white">{label}</div>
                <div className="relative mt-0.5 text-xs text-slate-400">{desc}</div>
              </div>
            ))}
          </div>

          <p className="mt-16 text-xs uppercase tracking-[0.2em] text-slate-500">
            {TEMPLATE.location}
          </p>
        </section>

        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-10 h-32 bg-gradient-to-t from-[#05070d] to-transparent" />
      </main>
    </>
  );
}