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
import { Moon, Sun, Settings, Zap } from "lucide-react";

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
      <head><HeadContent /></head>
      <body>
        <ThemeProvider defaultTheme="system" storageKey="vite-ui-theme">
          {children}
          <Scripts />
        </ThemeProvider>
      </body>
    </html>
  );
}

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
  const items: { label: string; path: string }[] = [];
  if (location.pathname !== '/') items.push({ label: 'Dashboard', path: '/dashboard' });
  else items.push({ label: 'Home', path: '/' });
  if (pathSegments.length > 0) {
    if (pathSegments[0] === 'dashboard') { /* ok */ }
    else if (pathSegments[0] === 'logs') {
      if (pathSegments.length >= 2) {
        const last = pathSegments[pathSegments.length - 1];
        items.push({ label: getLabel(last), path: '/' + pathSegments.join('/') });
      } else items.push({ label: 'Logs', path: '/logs' });
    } else {
      pathSegments.forEach((seg, idx) => {
        items.push({ label: getLabel(seg), path: '/' + pathSegments.slice(0, idx + 1).join('/') });
      });
    }
  }
  return (
    <Breadcrumb>
      <BreadcrumbList>
        {items.map((item, idx) => {
          const isLast = idx === items.length - 1;
          return (<div key={item.path} className="flex items-center">{idx > 0 && <BreadcrumbSeparator />}<BreadcrumbItem>{isLast ? <BreadcrumbPage className="font-semibold text-foreground">{item.label}</BreadcrumbPage> : <BreadcrumbLink asChild><Link to={item.path} className="text-muted-foreground hover:text-foreground transition-colors">{item.label}</Link></BreadcrumbLink>}</BreadcrumbItem></div>);
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const location = useLocation();
  const { theme, setTheme } = useTheme();
  const [sseStatus, setSseStatus] = useState<'online' | 'offline' | 'connecting'>('connecting');
  useEffect(() => {
    const es = new EventSource('http://localhost:5000/api/events');
    es.onopen = () => setSseStatus('online');
    es.onerror = () => setSseStatus('offline');
    return () => { es.close(); setSseStatus('offline'); };
  }, []);
  const showGlobalHeader = location.pathname !== "/";

  return (
    <QueryClientProvider client={queryClient}>
      <div className="min-h-screen bg-background flex flex-col">
        {showGlobalHeader && (
          <header className="sticky top-0 z-30 bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/75 border-b border-border/60 dark:border-zinc-800 shadow-sm flex-shrink-0">
            <div className="mx-auto max-w-7xl px-6 py-4 flex flex-col gap-3">
              
              {/* BARIS ATAS: Logo & Tombol */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <Link to="/" className="hover:opacity-80 transition-opacity">
                    <img 
                      src={companyLogo} 
                      alt="Logo" 
                      className="h-16 w-auto object-contain rounded-md border border-border/60 dark:border-zinc-800 bg-background p-1 shadow-sm"
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
                  <Link to="/settings" className="h-8 rounded-md bg-muted dark:bg-zinc-800 px-3 text-xs font-medium text-foreground dark:text-zinc-300 hover:bg-accent dark:hover:bg-zinc-700 border border-transparent hover:border-border dark:hover:border-zinc-700 transition-all flex items-center gap-1"><Settings className="h-3.5 w-3.5" /> Pengaturan</Link>
                  <Link to="/live" className="h-8 rounded-md bg-purple-100/80 dark:bg-purple-900/30 px-3 text-xs font-medium text-purple-600 dark:text-purple-300 hover:bg-purple-200 dark:hover:bg-purple-800/30 border border-transparent hover:border-purple-200 dark:hover:border-purple-800 transition-all flex items-center gap-1"><Zap className="h-3.5 w-3.5" /> Live Feed</Link>
                  <a href="http://localhost:5000/api/export/full-report" download="laporan_lengkap.pdf" className="h-8 rounded-md bg-blue-600 px-3 text-xs font-medium text-white hover:bg-blue-700 transition-all flex items-center gap-1">📄 Laporan</a>
                  <div className="hidden sm:flex items-center gap-1.5 ml-2 border-l pl-3 border-border dark:border-zinc-800"><div className={`h-2.5 w-2.5 rounded-full animate-pulse ${sseStatus === 'online' ? 'bg-green-500' : sseStatus === 'offline' ? 'bg-red-500' : 'bg-yellow-500'}`} /><span className={`text-xs font-medium ${sseStatus === 'online' ? 'text-green-600 dark:text-green-400' : sseStatus === 'offline' ? 'text-red-600 dark:text-red-400' : 'text-yellow-600 dark:text-yellow-400'}`}>{sseStatus === 'online' ? 'Live' : sseStatus === 'offline' ? 'Offline' : 'Connecting'}</span></div>
                  <button onClick={() => setTheme(theme === "dark" ? "light" : "dark")} className="p-1.5 text-muted-foreground hover:bg-accent rounded-md transition-colors">{theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}</button>
                </div>
              </div>

              {/* BARIS BAWAH: Breadcrumb */}
              <div className="pt-2 border-t border-border/40 dark:border-zinc-800">
                <BreadcrumbNav />
              </div>
            </div>
          </header>
        )}
        <main className="flex-1"><Outlet /></main>
      </div>
    </QueryClientProvider>
  );
}