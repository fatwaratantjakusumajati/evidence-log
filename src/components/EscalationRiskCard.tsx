// EscalationRiskCard.tsx
// ------------------------------------------------------------
// Widget baru: daftar barang staging AKTIF yang diprediksi berisiko
// mencapai eskalasi 5 hari (alert_sent_2), diurutkan dari risiko
// tertinggi. Sumber data: GET /api/alerts/stats/escalation-risk
// (lihat penjelasan lengkap di komentar alerts.js).
//
// CARA PASANG ke dashboard.tsx:
//   1. Taruh file ini di folder komponen yang sama dengan RecentActivityCard dkk.
//   2. Di dashboard.tsx, tambahkan:
//        import { EscalationRiskCard } from "@/components/EscalationRiskCard";
//   3. Taruh <EscalationRiskCard /> di dalam grid "Logs Section"
//      (baris ~774 di file yang kamu kirim), sebagai kolom kedua
//      sejajar dengan Log Kendaraan, contoh:
//
//        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
//          <div>...Log Kendaraan (sudah ada)...</div>
//          <EscalationRiskCard />
//        </div>
// ------------------------------------------------------------

import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Clock, Camera } from "lucide-react";
import { API_BASE_URL } from "@/lib/api-config";
import { authFetch } from "@/lib/auth";
import { formatDateTime } from "@/lib/evidence";

type EscalationRiskItem = {
  id: number;
  camera: string;
  class_name: string | null;
  alert_level: string;
  duration: number;
  first_detected: string;
  historical_total: number | null;
  historical_escalated: number | null;
  predicted_risk: number | null;
};

type EscalationRiskResponse = {
  active_items: EscalationRiskItem[];
  camera_class_ranking: {
    camera: string;
    class_name: string;
    escalation_rate: number;
    historical_total: number;
  }[];
  generated_at: string;
};

function riskColor(risk: number | null) {
  if (risk === null)
    return { bg: "bg-slate-100 dark:bg-[#1a1a14]", text: "text-slate-500 dark:text-slate-400" };
  if (risk >= 0.6)
    return { bg: "bg-red-50 dark:bg-red-500/10", text: "text-red-600 dark:text-red-400" };
  if (risk >= 0.3)
    return { bg: "bg-amber-50 dark:bg-amber-500/10", text: "text-amber-600 dark:text-amber-400" };
  return {
    bg: "bg-emerald-50 dark:bg-emerald-500/10",
    text: "text-emerald-600 dark:text-emerald-400",
  };
}

export function EscalationRiskCard() {
  const { data, isLoading, isError } = useQuery<EscalationRiskResponse>({
    queryKey: ["escalation_risk"],
    // Refresh agak jarang -- ini bukan data real-time kritikal, cukup tiap 2 menit
    refetchInterval: 120_000,
    queryFn: async () => {
      const res = await authFetch(`${API_BASE_URL}/api/alerts/stats/escalation-risk`);
      if (!res.ok) throw new Error(`Server merespons status ${res.status}`);
      return res.json();
    },
  });

  const items = (data?.active_items || []).slice(0, 6);

  return (
    <div className="rounded-xl border p-5 shadow-sm transition-colors duration-300 bg-white dark:bg-[#1a1a14] border-slate-200 dark:border-[#2e2e25]">
      <div className="mb-4">
        <h3 className="text-sm font-semibold flex items-center gap-2 font-space text-slate-900 dark:text-slate-100">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          Barang Berisiko Eskalasi
        </h3>
        <p className="text-xs font-mono mt-1 text-slate-500 dark:text-slate-400">
          Prediksi berdasarkan histori barang sejenis di kamera yang sama
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-14 rounded-lg animate-pulse bg-slate-100 dark:bg-[#1a1a14]" />
          ))}
        </div>
      ) : isError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-600 dark:border-red-900 dark:bg-red-950/40 dark:text-red-400">
          Gagal memuat data risiko eskalasi.
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-center">
          <AlertTriangle
            className="h-10 w-10 mb-3 text-slate-300 dark:text-slate-600"
            strokeWidth={1.5}
          />
          <p className="text-sm font-mono text-slate-500 dark:text-slate-400">
            Tidak ada barang aktif yang berisiko tinggi saat ini
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {items.map((item) => {
            const colors = riskColor(item.predicted_risk);
            const pct = item.predicted_risk !== null ? Math.round(item.predicted_risk * 100) : null;
            return (
              <div
                key={item.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 dark:border-[#26261e] p-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold font-space text-slate-900 dark:text-slate-100 truncate">
                    {item.class_name ?? "Barang tidak teridentifikasi"}
                  </p>
                  <div className="mt-1 flex items-center gap-3 text-[11px] font-mono text-slate-500 dark:text-slate-400">
                    <span className="flex items-center gap-1">
                      <Camera className="h-3 w-3" /> {item.camera}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" /> {formatDateTime(item.first_detected)}
                    </span>
                  </div>
                </div>
                <span
                  className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold font-mono ${colors.bg} ${colors.text}`}
                  title={
                    item.historical_total
                      ? `Berdasarkan ${item.historical_total} kejadian historis sejenis`
                      : "Belum cukup data historis"
                  }
                >
                  {pct !== null ? `${pct}%` : "—"}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
