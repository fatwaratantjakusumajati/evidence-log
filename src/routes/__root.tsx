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
import { Moon, Sun, Settings, Zap, Book } from "lucide-react";

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

import companyLogo from "@/assets/aristides-logo.png";

function NotFoundComponent() { /* ... tetap sama ... */ return null; }
function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) { /* ... tetap sama ... */ return null; }

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
      // ============================================================
      // TAMBAHAN LINK FAVICON (DARI FOLDER favicon_io)
      // ============================================================
      { rel: "icon", type: "image/x-icon", href: "/favicon_io/favicon.ico" },
      { rel: "icon", type: "image/png", sizes: "16x16", href: "/favicon_io/favicon-16x16.png" },
      { rel: "icon", type: "image/png", sizes: "32x32", href: "/favicon_io/favicon-32x32.png" },
      { rel: "apple-touch-icon", sizes: "180x180", href: "/favicon_io/apple-touch-icon.png" },
      { rel: "manifest", href: "/favicon_io/site.webmanifest" },
      // ============================================================
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

// ============================================================
// BREADCRUMB NAVIGATION — Selalu menampilkan Dashboard
// ============================================================
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

  // Selalu mulai dengan Dashboard untuk semua halaman internal
  const breadcrumbItems: { label: string; path: string }[] = [];

  if (location.pathname !== '/') {
    breadcrumbItems.push({ label: 'Dashboard', path: '/dashboard' });
  } else {
    breadcrumbItems.push({ label: 'Home', path: '/' });
  }

  if (pathSegments.length > 0) {
    if (pathSegments[0] === 'dashboard') {
      // Sudah ditambahkan di atas
    } else if (pathSegments[0] === 'logs') {
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
                  <BreadcrumbPage className="font-semibold text-foreground">{item.label}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink asChild>
                    <Link to={item.path} className="text-muted-foreground hover:text-foreground transition-colors">{item.label}</Link>
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

// ============================================================
// ROOT COMPONENT UTAMA
// ============================================================
function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const location = useLocation();
  const { theme, setTheme } = useTheme();

  const [sseStatus, setSseStatus] = useState<'online' | 'offline' | 'connecting'>('connecting');

  useEffect(() => {
    const eventSource = new EventSource('http://localhost:5000/api/events');
    eventSource.onopen = () => setSseStatus('online');
    eventSource.onerror = () => setSseStatus('offline');
    return () => { eventSource.close(); setSseStatus('offline'); };
  }, []);

  const showGlobalHeader = location.pathname !== "/";

  return (
    <QueryClientProvider client={queryClient}>
      <div className="min-h-screen bg-background flex flex-col">
        {showGlobalHeader && (
          <header className="sticky top-0 z-30 bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/75 border-b border-border/60 shadow-sm flex-shrink-0">
            <div className="mx-auto max-w-7xl px-6 py-4 flex flex-col gap-3">
              
              {/* BARIS ATAS: Logo & Tombol Aksi */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <Link to="/" className="hover:opacity-80 transition-opacity">
                    <img 
                      src={companyLogo} 
                      alt="Logo Perusahaan" 
                      className="h-16 w-auto object-contain rounded-md border border-border/60 bg-background p-1 shadow-sm"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                  </Link>
                  <div className="leading-tight hidden sm:block">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      PT Aristides Logistik Indonesia
                    </p>
                    <p className="text-lg font-bold tracking-tight text-foreground">
                      Warehouse Intelligence
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {/* Tombol Pengaturan */}
                  <Link to="/settings" className="h-8 rounded-md bg-primary/10 px-3 text-xs font-medium text-foreground hover:bg-primary/10 border border-transparent hover:border-primary/20 transition-all flex items-center gap-1">
                    <Settings className="h-3.5 w-3.5" /> Pengaturan
                  </Link>
                  {/* Tombol Live Feed */}
                  <Link to="/live" className="h-8 rounded-md bg-primary/10 px-3 text-xs font-medium text-foreground hover:bg-primary/10 border border-transparent hover:border-primary/20 transition-all flex items-center gap-1">
                    <Zap className="h-3.5 w-3.5" /> Live Feed
                  </Link>
                  {/* Tombol Laporan Lengkap */}
                  <a href="http://localhost:5000/api/export/full-report" download="laporan_lengkap.pdf" className="h-8 rounded-md bg-primary/10 px-3 text-xs font-medium text-foreground hover:bg-primary/10 border border-transparent hover:border-primary/20 transition-all flex items-center gap-1">
                    <Book className="h-3.5 w-3.5"/> Report
                  </a>

                  {/* Indikator Live */}
                  <div className="hidden sm:flex items-center gap-1.5 ml-2 border-l pl-3 border-border">
                    <div className={`h-2.5 w-2.5 rounded-full animate-pulse ${sseStatus === 'online' ? 'bg-success' : sseStatus === 'offline' ? 'bg-destructive' : 'bg-warning'}`} />
                    <span className={`text-xs font-medium ${sseStatus === 'online' ? 'text-success' : sseStatus === 'offline' ? 'text-destructive' : 'text-warning'}`}>
                      {sseStatus === 'online' ? 'Live' : sseStatus === 'offline' ? 'Offline' : 'Connecting'}
                    </span>
                  </div>

                  {/* Tombol Dark Mode */}
                  <button onClick={() => setTheme(theme === "dark" ? "light" : "dark")} className="p-1.5 text-muted-foreground hover:bg-accent rounded-md transition-colors">
                    {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {/* BARIS BAWAH: Breadcrumb (Tampil di semua halaman internal) */}
              <div className="pt-2 border-t border-border/40">
                <BreadcrumbNav />
              </div>
            </div>
          </header>
        )}
        <main className="flex-1">
          <Outlet />
        </main>
      </div>
    </QueryClientProvider>
  );
}