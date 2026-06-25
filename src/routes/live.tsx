import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, useRef } from "react";
import { ArrowLeft, Play, Pause, Car, Boxes, VideoOff } from "lucide-react";
import { formatDateTime } from "@/lib/evidence";
import Lightbox from 'yet-another-react-lightbox';
import 'yet-another-react-lightbox/styles.css';
import Zoom from 'yet-another-react-lightbox/plugins/zoom';

type LiveEvent = {
  type: 'vehicle' | 'staging' | 'camera';
  id: string;
  event_time: string;
  title: string;
  detail: string;
  image: string | null;
  metadata: string | null;
};

export const Route = createFileRoute("/live")({
  component: LivePage,
});

function LivePage() {
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const { data: events = [], isLoading, isError, error, refetch } = useQuery({
    queryKey: ["live_feed"],
    queryFn: async () => {
      const res = await fetch('http://localhost:5000/api/live/feed');
      if (!res.ok) throw new Error(`Gagal mengambil data (Status: ${res.status})`);
      return res.json() as Promise<LiveEvent[]>;
    },
    refetchInterval: 5000,
  });

  // --- SSE: Reset slideshow saat data baru masuk ---
  useEffect(() => {
    const eventSource = new EventSource('http://localhost:5000/api/events');
    eventSource.onmessage = () => {
      queryClient.invalidateQueries({ queryKey: ["live_feed"] });
      setCurrentIndex(0);
      setIsPlaying(true);
    };
    return () => eventSource.close();
  }, [queryClient]);

  // --- Timer Slideshow (4 detik per slide) ---
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    
    if (isPlaying && events.length > 0) {
      timerRef.current = setInterval(() => {
        setIsTransitioning(true);
        setTimeout(() => {
          setCurrentIndex((prev) => (prev + 1) % events.length);
          setIsTransitioning(false);
        }, 500);
      }, 4000);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isPlaying, events]);

  useEffect(() => {
    if (currentIndex >= events.length) setCurrentIndex(0);
  }, [events, currentIndex]);

  // --- HELPERS ---
  const getIcon = (type: string) => {
    if (type === 'vehicle') return <Car className="h-6 w-6" />;
    if (type === 'staging') return <Boxes className="h-6 w-6" />;
    return <VideoOff className="h-6 w-6" />;
  };

  const getLabel = (type: string) => {
    if (type === 'vehicle') return 'KENDARAAN';
    if (type === 'staging') return 'STAGING';
    return 'KAMERA MATI';
  };

  const getColor = (type: string) => {
    if (type === 'vehicle') return 'bg-blue-500/90';
    if (type === 'staging') return 'bg-orange-500/90';
    return 'bg-red-500/90';
  };

  // ================================================================
  // PERBAIKAN FINAL: Gunakan min-h-[calc(100vh-130px)] + overflow-hidden
  // Agar konten pasti muncul dan scrollbar HILANG
  // ================================================================
  const layoutClass = "min-h-[calc(100vh-130px)] w-full flex items-center justify-center bg-black text-white overflow-hidden";

  if (isLoading) {
    return (
      <div className={layoutClass}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4" />
          <p className="text-slate-400">Memuat layar teater...</p>
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className={layoutClass}>
        <div className="text-center max-w-md bg-slate-800 p-8 rounded-xl border border-red-500/30">
          <p className="text-xl font-semibold text-red-400 mb-2">⚠️ Koneksi Terputus</p>
          <p className="text-slate-400 mb-6">{error instanceof Error ? error.message : 'Error tidak diketahui'}</p>
          <button onClick={() => refetch()} className="bg-blue-600 hover:bg-blue-700 px-6 py-2 rounded-full font-medium transition">Coba Lagi</button>
        </div>
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className={layoutClass}>
        <div className="text-center">
          <p className="text-xl font-medium text-slate-300 mb-2">🎬 Belum ada aktivitas</p>
          <p className="text-slate-500">Tunggu hingga ada deteksi baru di gudang.</p>
        </div>
      </div>
    );
  }

  // --- RENDER FULLSCREEN THEATER TANPA SCROLL ---
  const currentEvent = events[currentIndex];

  return (
    <div 
      className="min-h-[calc(100vh-130px)] w-full overflow-hidden relative bg-black cursor-pointer" 
      onClick={() => setIsPlaying(!isPlaying)}
    >
      
      {/* 1. Gambar Utama */}
      <div className="absolute inset-0 w-full h-full">
        {currentEvent.image ? (
          <img 
            key={currentEvent.id}
            src={`data:image/jpeg;base64,${currentEvent.image}`} 
            alt={currentEvent.title}
            className={`w-full h-full object-contain transition-all duration-1000 ${
              isTransitioning ? 'opacity-40 scale-95' : 'opacity-100 scale-100'
            }`}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-slate-800">
            <VideoOff className="h-24 w-24 text-slate-600 opacity-30" />
          </div>
        )}
      </div>

      {/* 2. Gradasi Gelap di Bawah */}
      <div className="absolute bottom-0 left-0 right-0 h-1/2 bg-gradient-to-t from-black/90 via-black/60 to-transparent pointer-events-none" />

      {/* 3. Informasi Teater */}
      <div className="absolute bottom-8 left-0 right-0 px-8 md:px-16 pb-4 pointer-events-none">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          
          <div className={`transition-all duration-700 delay-100 ${isTransitioning ? 'translate-y-4 opacity-0' : 'translate-y-0 opacity-100'}`}>
            <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold text-white mb-3 ${getColor(currentEvent.type)}`}>
              {getIcon(currentEvent.type)}
              {getLabel(currentEvent.type)}
            </div>
            <h1 className="text-3xl md:text-5xl font-bold text-white drop-shadow-lg mb-2">
              {currentEvent.title}
            </h1>
            <div className="flex flex-wrap gap-4 text-sm text-white/80">
              <span>{formatDateTime(currentEvent.event_time)}</span>
              <span className="opacity-50">|</span>
              <span>{currentEvent.detail}</span>
              {currentEvent.metadata && (
                <>
                  <span className="opacity-50">|</span>
                  <span className="font-medium text-white/90">{currentEvent.metadata}</span>
                </>
              )}
            </div>
          </div>

          <div className={`text-white/50 text-sm font-mono transition-all duration-700 delay-200 ${isTransitioning ? 'opacity-0' : 'opacity-100'}`}>
            {currentIndex + 1} / {events.length}
          </div>
        </div>
      </div>

      {/* 4. Tombol Play/Pause & Kembali */}
      <div className="absolute top-4 right-4 flex items-center gap-3 pointer-events-auto z-10">
        <button 
          onClick={(e) => { e.stopPropagation(); setIsPlaying(!isPlaying); }}
          className="bg-black/50 hover:bg-black/80 text-white p-3 rounded-full backdrop-blur-md border border-white/20 transition"
        >
          {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
        </button>
        <Link to="/dashboard" className="bg-black/50 hover:bg-black/80 text-white p-3 rounded-full backdrop-blur-md border border-white/20 transition">
          <ArrowLeft className="h-5 w-5" />
        </Link>
      </div>

      {/* 5. Lightbox */}
      {isOpen && selectedImage && (
        <Lightbox
          open={isOpen}
          close={() => setIsOpen(false)}
          slides={[{ src: `data:image/jpeg;base64,${selectedImage}` }]}
          plugins={[Zoom]}
        />
      )}
    </div>
  );
}