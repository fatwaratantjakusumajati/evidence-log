import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Users, CheckCircle, XCircle, AlertCircle, Loader2 } from "lucide-react";
import { useState } from "react";
import { API_BASE_URL } from "@/lib/api-config";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { toast } from "sonner";

export const Route = createFileRoute("/attendance_review")({
  component: AttendanceReviewPage,
});

type ReviewItem = {
  id: number;
  track_id: string;
  employee_id: string | null;
  candidate_name: string | null;
  camera_id: string;
  event_type: string;
  direction: string;
  confidence: number;
  recognition_method: string;
  face_confidence: number | null;
  pose_confidence: number | null;
  context_score: number | null;
  fusion_score: number | null;
  timestamp: string;
  snapshot_path: string | null;
};

function AttendanceReviewPage() {
  const queryClient = useQueryClient();
  const [processingId, setProcessingId] = useState<number | null>(null);
  const [selectedReview, setSelectedReview] = useState<any | null>(null);

  const {
    data: reviewData,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["manual-review-pending"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE_URL}/api/attendance/manual-review-pending`);
      if (!res.ok) throw new Error("Gagal mengambil data review");
      const json = await res.json();
      return (Array.isArray(json) ? json : json.data || []) as ReviewItem[];
    },
    refetchInterval: 30000,
  });

  const approveMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`${API_BASE_URL}/api/attendance/manual-review-decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          attendance_event_id: id,
          decision: "APPROVE",
          reviewed_by: "admin",
        }),
      });
      if (!res.ok) throw new Error("Gagal approve");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["manual-review-pending"] });
      queryClient.invalidateQueries({ queryKey: ["attendance_log"] });
      queryClient.invalidateQueries({ queryKey: ["attendance_log_preview"] });
      setProcessingId(null);
      toast.success("Absensi berhasil disetujui");
    },
    onError: (err: Error) => {
      toast.error(`Gagal: ${err.message}`);
      setProcessingId(null);
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`${API_BASE_URL}/api/attendance/manual-review-decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          attendance_event_id: id,
          decision: "REJECT",
          reviewed_by: "admin",
        }),
      });
      if (!res.ok) throw new Error("Gagal reject");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["manual-review-pending"] });
      setProcessingId(null);
    },
    onError: (err: Error) => {
      alert(`Gagal: ${err.message}`);
      setProcessingId(null);
    },
  });

  const handleApprove = (id: number) => {
    setProcessingId(id);
    approveMutation.mutate(id);
  };

  const handleReject = (id: number) => {
    setProcessingId(id);
    rejectMutation.mutate(id);
  };

  // Filter data valid
  const reviewQueue = (reviewData || []).filter((item) => item && item.id && item.timestamp);

  return (
    <main className="flex-1 min-h-screen bg-[#f8fafc] dark:bg-[#0a111f] text-[#0f172a] dark:text-[#cbd5e1] transition-colors duration-300 font-sans">
      <header className="sticky top-0 z-20 border-b bg-white dark:bg-[#0f1a2e] border-[#e2e8f0] dark:border-[#1a2c45] backdrop-blur-xl transition-colors duration-300">
        <div className="mx-auto max-w-[1440px] px-6 py-4">
          <div className="mb-4">
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbLink asChild>
                    <Link
                      to="/dashboard"
                      className="text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 font-mono text-sm"
                    >
                      Home
                    </Link>
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbPage className="font-space font-semibold text-lg text-slate-900 dark:text-slate-100">
                    Review Kehadiran
                  </BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-orange-500" />
              <h1 className="text-lg font-semibold tracking-tight font-space transition-colors">
                Review Kehadiran AI
              </h1>
            </div>
            {reviewQueue.length > 0 && (
              <span className="rounded-full bg-orange-100 dark:bg-orange-900/30 px-3 py-1 text-xs font-medium text-orange-700 dark:text-orange-400 border border-orange-200 dark:border-orange-900/50 font-mono">
                {reviewQueue.length} butuh review
              </span>
            )}
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-[1440px] px-6 py-6">
        <p className="mb-6 text-sm text-[#64748b] dark:text-[#94a3b8] font-mono">
          Daftar absensi yang memerlukan verifikasi manual oleh admin.
        </p>

        {isLoading && (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
            <p className="text-sm font-mono text-slate-500">Memuat data review...</p>
          </div>
        )}

        {isError && (
          <div className="flex flex-col items-center justify-center rounded-lg border border-red-300 bg-red-50 dark:bg-red-900/10 dark:border-red-800 p-8 text-center">
            <XCircle className="h-10 w-10 text-red-500 mb-2" />
            <p className="text-sm font-mono text-red-600 dark:text-red-400">
              Gagal memuat data review. Pastikan backend berjalan.
            </p>
          </div>
        )}

        {!isLoading && !isError && reviewQueue.length === 0 && (
          <div className="flex w-full flex-col items-center justify-center rounded-lg border border-dashed bg-white dark:bg-[#1e293b] border-[#e2e8f0] dark:border-[#334155] p-16 text-center shadow-sm">
            <CheckCircle className="mb-4 h-14 w-14 text-green-500" strokeWidth={1.5} />
            <h3 className="text-base font-semibold font-space text-[#0f172a] dark:text-[#e2e8f0]">
              Tidak Ada Data Perlu Review
            </h3>
            <p className="mt-1.5 max-w-md text-sm text-[#64748b] dark:text-[#94a3b8] font-mono">
              Sistem AI yakin dengan semua data kehadiran saat ini.
            </p>
          </div>
        )}

        {!isLoading && !isError && reviewQueue.length > 0 && (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {reviewQueue.map((item) => (
              <li
                key={item.id}
                className="group overflow-hidden rounded-lg border bg-white dark:bg-[#1e293b] border-[#e2e8f0] dark:border-[#334155] shadow-sm transition-all hover:shadow-md"
              >
                <div
                  onClick={() => setSelectedReview(item)}
                  className="relative h-48 w-full bg-[#f1f5f9] dark:bg-[#0b1120] overflow-hidden flex items-center justify-center"
                >
                  {item.snapshot_path ? (
                    <img
                      src={`${API_BASE_URL}/${item.snapshot_path.replace(/\\/g, "/")}`}
                      alt="Snapshot"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <Users className="h-16 w-16 text-[#94a3b8]" />
                  )}
                  <div className="absolute top-2 right-2 rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-semibold text-white shadow-md">
                    <AlertCircle className="mr-1 inline h-3 w-3" />
                    {typeof item.confidence === "number" ? Math.round(item.confidence * 100) : 0}%
                  </div>
                </div>

                <div className="space-y-2 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-sm font-semibold text-[#0f172a] dark:text-[#e2e8f0] font-space">
                      {item.candidate_name || item.employee_id || "Tidak diketahui"}
                    </span>
                    <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-semibold font-mono bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400 border-yellow-200 dark:border-yellow-900/50">
                      PENDING
                    </span>
                  </div>

                  <div className="space-y-1">
                    <p className="text-xs text-[#64748b] dark:text-[#94a3b8] font-mono">
                      {(() => {
                        const d = new Date(item.timestamp);
                        d.setHours(d.getHours() + 7);
                        return d.toLocaleString("id-ID", {
                          day: "numeric",
                          month: "long",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        });
                      })()}
                    </p>
                    <p className="text-xs text-[#64748b] dark:text-[#94a3b8] font-mono">
                      Kamera: {item.camera_id}
                    </p>
                    <p className="text-xs text-[#64748b] dark:text-[#94a3b8] font-mono">
                      Metode: {item.recognition_method} | Fusion:{" "}
                      {typeof item.fusion_score === "number" ? item.fusion_score.toFixed(2) : "-"}
                    </p>
                  </div>

                  <div className="flex gap-2 pt-3 border-t border-[#e2e8f0] dark:border-[#334155]">
                    <button
                      onClick={() => handleApprove(item.id)}
                      disabled={processingId === item.id}
                      className="flex-1 flex items-center justify-center gap-1.5 rounded-md bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
                    >
                      <CheckCircle className="h-3.5 w-3.5" /> Setuju
                    </button>
                    <button
                      onClick={() => handleReject(item.id)}
                      disabled={processingId === item.id}
                      className="flex-1 flex items-center justify-center gap-1.5 rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
                    >
                      <XCircle className="h-3.5 w-3.5" /> Tolak
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
      {selectedReview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="relative bg-white dark:bg-[#1e293b] rounded-xl p-6 max-w-2xl w-full border border-[#e2e8f0] dark:border-[#334155] shadow-2xl">
            <button
              onClick={() => setSelectedReview(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-700 dark:hover:text-white font-bold text-lg"
            >
              ✕
            </button>
            <h3 className="text-lg font-bold font-space text-slate-900 dark:text-slate-100 mb-4">
              Detail Review Snapshot
            </h3>
            {selectedReview.snapshot_path ? (
              <img
                src={`${API_BASE_URL}/${selectedReview.snapshot_path.replace(/\\/g, "/")}`}
                alt="Detail Snapshot"
                className="w-full h-auto rounded-lg object-contain max-h-[60vh] mb-4 bg-black/10"
              />
            ) : (
              <div className="flex items-center justify-center h-48 bg-slate-100 dark:bg-slate-800 rounded-lg mb-4">
                <Users className="h-16 w-16 text-slate-400" />
              </div>
            )}
            <div className="space-y-1 font-mono text-sm text-slate-700 dark:text-slate-300">
              <p>
                <strong>Nama/NIK:</strong>{" "}
                {selectedReview.candidate_name || selectedReview.employee_id || "Tidak diketahui"}
              </p>
              <p>
                <strong>Kamera:</strong> {selectedReview.camera_id}
              </p>
              <p>
                <strong>Confidence:</strong>{" "}
                {typeof selectedReview.confidence === "number"
                  ? Math.round(selectedReview.confidence * 100)
                  : 0}
                %
              </p>
              <p>
                <strong>Metode:</strong> {selectedReview.recognition_method}
              </p>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
