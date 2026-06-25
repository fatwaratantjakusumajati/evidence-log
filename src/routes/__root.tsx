import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
  useLocation,
} from "@tanstack/react-router";
import { useEffect, type ReactNode, useState } from "react";
import { Moon, Sun, Settings, Zap } from "lucide-react"; // Tambahkan Settings & Zap

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { ThemeProvider, useTheme } from "@/lib/theme-provider";

// Import logo perusahaan
import companyLogo from "@/assets/aristides-logo.png";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-6xl font-semibold text-foreground">404</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Halaman tidak ditemukan.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Kembali ke beranda
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          Halaman gagal dimuat
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Terjadi kesalahan. Silakan coba lagi.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:opacity-90"
          >
            Coba lagi
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Beranda
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Arsip Bukti Kejadian" },
      { name: "description", content: "Daftar entri bukti kejadian — sederhana, minimalis, mudah ditelusuri." },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="id">
      <head>
        <HeadContent />
      </head>
      <body>
        <ThemeProvider defaultTheme="system" storageKey="vite-ui-theme">
          {children}
          <Scripts />
        </ThemeProvider>
      </body>
    </html>
  );
}

// --- Breadcrumb NAVIGATION ---
function BreadcrumbNav() {
  const location = useLocation();
  const pathSegments = location.pathname.split('/').filter((seg) => seg !== '');

  const getLabel = (segment: string) => {
    if (segment === 'dashboard') return 'Dashboard';
    if (segment === 'vehicles') return 'Kendaraan';
    if (segment === 'cameras') return 'Kamera';
    if (segment === 'staging') return 'Staging';
    if (segment === 'settings') return 'Pengaturan';
    if (segment === 'live') return 'Live Feed';
    if (!isNaN(Number(segment))) return 'Detail';
    return segment.charAt(0).toUpperCase() + segment.slice(1);
  };

  const breadcrumbItems: { label: string; path: string }[] = [];
  breadcrumbItems.push({ label: 'Home', path: '/' });

  if (pathSegments.length > 0) {
    if (pathSegments[0] === 'dashboard') {
      breadcrumbItems.push({ label: 'Dashboard', path: '/dashboard' });
    } else if (pathSegments[0] === 'logs') {
      breadcrumbItems.push({ label: 'Dashboard', path: '/dashboard' });
      if (pathSegments.length >= 2) {
        const lastSegment = pathSegments[pathSegments.length - 1];
        breadcrumbItems.push({ 
          label: getLabel(lastSegment), 
          path: '/' + pathSegments.join('/') 
        });
      } else {
        breadcrumbItems.push({ label: 'Logs', path: '/logs' });
      }
    } else {
      pathSegments.forEach((seg, index) => {
        const url = '/' + pathSegments.slice(0, index + 1).join('/');
        breadcrumbItems.push({ label: getLabel(seg), path: url });
      });
    }
  }

  return (
    <Breadcrumb>
      <BreadcrumbList>
        {breadcrumbItems.map((item, index) => {
          const isLast = index === breadcrumbItems.length - 1;
          return (
            <div key={item.path} className="flex items-center">
              {index > 0 && <BreadcrumbSeparator />}
              <BreadcrumbItem>
                {isLast ? (
                  <BreadcrumbPage>{item.label}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink asChild>
                    <Link to={item.path}>{item.label}</Link>
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
            </div>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}

// --- ROOT COMPONENT UTAMA ---
function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const location = useLocation();
  const { theme, setTheme } = useTheme();

  // State untuk Indikator SSE (Live Status)
  const [sseStatus, setSseStatus] = useState<'online' | 'offline' | 'connecting'>('connecting');

  useEffect(() => {
    const eventSource = new EventSource('http://localhost:5000/api/events');

    eventSource.onopen = () => setSseStatus('online');
    eventSource.onerror = () => setSseStatus('offline');

    return () => {
      eventSource.close();
      setSseStatus('offline');
    };
  }, []);

  const showGlobalHeader = location.pathname !== "/";

  return (
    <QueryClientProvider client={queryClient}>
      <div className="min-h-screen bg-background flex flex-col">
        
        {showGlobalHeader && (
          <>
            <header className="sticky top-0 z-30 bg-white/95 border-b border-border shadow-sm flex-shrink-0 backdrop-blur-xl">
              <div className="mx-auto max-w-7xl px-6 py-4 flex items-center justify-between gap-4">
                
                <Link to="/" className="flex items-center gap-4 hover:opacity-80 transition-opacity">
                  <img
                    src={companyLogo}
                    alt="Logo Perusahaan"
                    className="h-20 w-auto object-contain rounded-lg border border-border bg-background p-1 shadow-sm"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                  <div className="hidden sm:block leading-tight">
                    <p className="text-xs font-bold uppercase tracking-[0.15em] text-muted-foreground">
                      PT Aristides Logistik Indonesia
                    </p>
                    <p className="text-lg font-bold tracking-tight text-foreground">
                      Warehouse Intelligence
                    </p>
                  </div>
                </Link>

                <div className="flex items-center gap-3">
                  
                  {/* --- TOMBOL PENGATURAN --- */}
                  <Link
                    to="/settings"
                    className="hidden sm:inline-flex h-9 items-center gap-1.5 rounded-md border border-indigo-600 bg-indigo-50 px-4 text-xs font-semibold text-indigo-600 transition-colors hover:bg-indigo-100 shadow-sm"
                  >
                    <Settings className="h-4 w-4" />
                    Pengaturan
                  </Link>

                  {/* --- TOMBOL LIVE FEED --- */}
                  <Link
                    to="/live"
                    className="hidden sm:inline-flex h-9 items-center gap-1.5 rounded-md border border-purple-600 bg-purple-50 px-4 text-xs font-semibold text-purple-600 transition-colors hover:bg-purple-100 shadow-sm"
                  >
                    <Zap className="h-4 w-4" />
                    Live Feed
                  </Link>

                  {/* --- TOMBOL LAPORAN LENGKAP --- */}
                  <a
                    href="http://localhost:5000/api/export/full-report"
                    download="laporan_lengkap.pdf"
                    className="hidden sm:inline-flex h-9 items-center gap-1.5 rounded-md bg-green-600 px-4 text-xs font-semibold text-white transition-colors hover:bg-green-700 shadow-sm"
                  >
                    📄 Laporan Lengkap
                  </a>

                  {/* --- INDIKATOR SSE LIVE STATUS --- */}
                  <div className="hidden sm:flex flex-col items-end ml-2 border-l pl-3 border-border min-w-[80px]">
                    <div className="flex items-center gap-1.5">
                      <div className={`h-2.5 w-2.5 rounded-full animate-pulse ${
                        sseStatus === 'online' ? 'bg-green-500' : 
                        sseStatus === 'offline' ? 'bg-red-500' : 'bg-yellow-500'
                      }`} />
                      <span className={`text-xs font-semibold ${
                        sseStatus === 'online' ? 'text-green-600' : 
                        sseStatus === 'offline' ? 'text-red-600' : 'text-yellow-600'
                      }`}>
                        {sseStatus === 'online' ? 'Live' : 
                         sseStatus === 'offline' ? 'Terputus' : 'Menghubungkan...'}
                      </span>
                    </div>
                    <span className="text-[10px] text-muted-foreground">
                      {sseStatus === 'online' ? 'Real-time' : 'Refresh manual'}
                    </span>
                  </div>

                  {/* --- TOMBOL THEME --- */}
                  <button
                    onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                    className="rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                    aria-label="Toggle theme"
                  >
                    {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
                  </button>
                </div>
              </div>
            </header>

            {/* --- BREADCRUMB --- */}
            <div className="bg-slate-50/60 border-b border-border flex-shrink-0">
              <div className="mx-auto max-w-7xl px-6 py-2.5">
                <BreadcrumbNav />
              </div>
            </div>
          </>
        )}

        <main className="flex-1">
          <Outlet />
        </main>
      </div>
    </QueryClientProvider>
  );
}