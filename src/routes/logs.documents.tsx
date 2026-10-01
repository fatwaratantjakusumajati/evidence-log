import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo, useRef, useEffect } from "react";
import { toast } from "sonner";
import { API_BASE_URL } from "@/lib/api-config";
import { authFetch, downloadFile } from "@/lib/auth";
import {
  Search,
  Download,
  X,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Trash2,
  FileSpreadsheet,
  Tag,
  Inbox,
  Upload,
  RefreshCw,
  ImagePlus,
  Printer,
  QrCode,
} from "lucide-react";
import { arucoMatrix, arucoSvg } from "@/lib/aruco";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

// ------------------ Tipe data (cocok dengan backend/routes/documents.js) ------------------
type KV = { label: string; nilai: any };
type Tabel = { nama: string | null; kolom: string[]; baris: any[][] };

type DocumentRow = {
  id: number;
  jenis_dokumen: string;
  judul: string | null;
  ringkasan: KV[];
  file_name: string | null;
  po_number: string | null;
  aruco_id: number | null;
  created_at: string;
};

type DocumentDetail = DocumentRow & {
  informasi: KV[];
  tabel: Tabel[];
  catatan: string | null;
};

const PAGE_SIZE = 20;

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatValue(v: any) {
  if (v === null || v === undefined || v === "") return "-";
  if (typeof v === "number") return v.toLocaleString("id-ID");
  return String(v);
}

// ------------------ ArUco: tampilan marker + cetak ------------------
function ArucoMarker({ id, size = 96 }: { id: number; size?: number }) {
  const m = arucoMatrix(id);
  if (!m) return null;
  return (
    // latar selalu putih (quiet zone), walau dark mode, supaya tetap terbaca kamera
    <svg
      width={size}
      height={size}
      viewBox="0 0 7 7"
      shapeRendering="crispEdges"
      className="rounded-sm bg-white"
      role="img"
      aria-label={`Marker ArUco ID ${id}`}
    >
      <rect width="7" height="7" fill="#fff" />
      {m.flatMap((row, r) =>
        row.map((white, c) =>
          white ? null : <rect key={`${r}-${c}`} x={c + 0.5} y={r + 0.5} width="1" height="1" />,
        ),
      )}
    </svg>
  );
}

type PrintLayout = "single" | "grid";

// Desain mengikuti id_1-4.pdf: marker hitam-putih, label "ID n" tebal di bawahnya,
// garis abu-abu tipis sebagai pemisah. "single" = 1 marker besar per halaman,
// "grid" = 4 salinan ID yang sama dalam 2x2 (untuk dipotong jadi stiker).
function printAruco(opts: { id: number; po?: string | null; layout: PrintLayout; sizeCm: number }) {
  const { id, po, layout, sizeCm } = opts;
  const esc = (t: string) => t.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
  const cell = (cm: number) => `
    <div class="cell">
      ${arucoSvg(id, 0).replace(/width="0" height="0"/, `width="${cm}cm" height="${cm}cm"`)}
      <div class="id" style="font-size:${Math.max(cm * 0.14, 0.9)}cm">ID ${id}</div>
      ${po ? `<div class="po" style="font-size:${Math.max(cm * 0.065, 0.45)}cm">${esc(po)}</div>` : ""}
    </div>`;
  const body =
    layout === "grid"
      ? `<div class="grid">${[1, 2, 3, 4].map(() => cell(8)).join("")}</div>`
      : `<div class="single">${cell(sizeCm)}</div>`;

  const w = window.open("", "_blank");
  if (!w) {
    toast.error("Pop-up diblokir browser. Izinkan pop-up lalu coba lagi.");
    return;
  }
  w.document.write(`<!doctype html><html><head><meta charset="utf-8">
<title>ArUco ID ${id}</title>
<style>
  @page { size: A4; margin: 0 }
  * { box-sizing: border-box }
  body { margin: 0; font-family: Arial, Helvetica, sans-serif; background: #fff; color: #000 }
  .cell { display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center }
  .id { font-weight: 700; margin-top: .3cm }
  .po { margin-top: .1cm; color: #333; font-family: monospace }
  .single { width: 210mm; height: 297mm; display: flex; align-items: center; justify-content: center }
  .grid { width: 210mm; height: 297mm; display: grid; grid-template-columns: 1fr 1fr; grid-template-rows: 1fr 1fr }
  .grid .cell { border: .2mm solid #ccc; margin: -.1mm }
</style></head><body>${body}
<script>window.onload=function(){setTimeout(function(){window.print()},200)}<\/script>
</body></html>`);
  w.document.close();
}

function PoBadge({ po }: { po: string | null }) {
  if (!po) return <span className="text-slate-400">-</span>;
  return <span className="font-mono text-xs text-slate-800 dark:text-slate-100">{po}</span>;
}

function ArucoBadge({ id }: { id: number | null }) {
  if (id === null || id === undefined) return <span className="text-slate-400">-</span>;
  return (
    <span className="inline-flex items-center gap-2">
      <ArucoMarker id={id} size={28} />
      <span className="font-mono text-xs font-semibold text-slate-800 dark:text-slate-100">
        ID {id}
      </span>
    </span>
  );
}

// Kartu di modal detail: nomor PO, ID, preview marker, tombol cetak
function ArucoCard({ po, id }: { po: string | null; id: number | null }) {
  const [layout, setLayout] = useState<PrintLayout>("single");
  const [sizeCm, setSizeCm] = useState(10);

  if (id === null || id === undefined) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 dark:border-[#2e2e25] p-4 text-sm text-slate-500 dark:text-slate-400">
        <div className="flex items-center gap-2">
          <QrCode className="h-4 w-4" />
          {po
            ? `Nomor PO ${po} terdeteksi, ID ArUco belum dibuat.`
            : "Dokumen ini bukan PO (atau nomor PO tidak terbaca), jadi belum punya ID ArUco."}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-slate-200 dark:border-[#2e2e25] p-4 flex flex-col sm:flex-row gap-4">
      <div className="shrink-0 self-center rounded-md border border-slate-200 bg-white p-1">
        <ArucoMarker id={id} size={120} />
      </div>
      <div className="flex-1 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Nomor PO
            </p>
            <p className="font-mono text-sm font-semibold text-slate-900 dark:text-slate-100 break-all">
              {po || "-"}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400">
              ID ArUco
            </p>
            <p className="font-mono text-2xl font-bold text-[#4338ca] dark:text-[#818cf8]">{id}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={layout}
            onChange={(e) => setLayout(e.target.value as PrintLayout)}
            className="rounded-md border border-slate-200 dark:border-[#2e2e25] bg-white dark:bg-[#13130e] px-2 py-1.5 text-xs text-slate-700 dark:text-slate-200"
          >
            <option value="single">1 marker per halaman</option>
            <option value="grid">4 salinan (2×2)</option>
          </select>
          {layout === "single" && (
            <select
              value={sizeCm}
              onChange={(e) => setSizeCm(Number(e.target.value))}
              className="rounded-md border border-slate-200 dark:border-[#2e2e25] bg-white dark:bg-[#13130e] px-2 py-1.5 text-xs text-slate-700 dark:text-slate-200"
            >
              <option value={5}>5 cm</option>
              <option value={8}>8 cm</option>
              <option value={10}>10 cm</option>
              <option value={14}>14 cm</option>
            </select>
          )}
          <button
            onClick={() => printAruco({ id, po, layout, sizeCm })}
            className="inline-flex items-center gap-2 rounded-md bg-[#4338ca] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#3730a3] transition-colors"
          >
            <Printer className="h-3.5 w-3.5" /> Cetak ArUco
          </button>
        </div>
      </div>
    </div>
  );
}

export const Route = createFileRoute("/logs/documents")({
  head: () => ({
    meta: [
      { title: "Dokumen · Arsip OCR" },
      {
        name: "description",
        content: "Daftar dokumen hasil OCR (invoice, PO, kwitansi, surat jalan, dll).",
      },
    ],
  }),
  component: DocumentsPage,
});

function BreadcrumbNavInside() {
  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink asChild>
            <Link
              to="/dashboard"
              className="text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 transition-colors text-sm"
            >
              Dashboard
            </Link>
          </BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem>
          <BreadcrumbPage className="font-space font-semibold text-lg text-slate-800 dark:text-slate-100">
            Dokumen
          </BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  );
}

function DocumentsPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [jenis, setJenis] = useState("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);

  // Setelah upload, n8n butuh ~10-30 detik untuk OCR + LLM. Daftar di-refresh
  // beberapa kali otomatis sampai dokumennya masuk.
  const handleUploaded = () => {
    [8000, 16000, 28000, 45000].forEach((ms) =>
      setTimeout(() => queryClient.invalidateQueries({ queryKey: ["documents"] }), ms),
    );
  };

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["documents", page, search, jenis, startDate, endDate],
    meta: { showErrorToast: true, errorLabel: "Arsip Dokumen" },
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
      if (search) params.append("search", search);
      if (jenis !== "all") params.append("jenis", jenis);
      if (startDate) params.append("start_date", startDate);
      if (endDate) params.append("end_date", endDate);
      const res = await authFetch(`${API_BASE_URL}/api/documents?${params}`);
      if (!res.ok) throw new Error(`Server merespons status ${res.status}`);
      return res.json() as Promise<{ data: DocumentRow[]; total: number; totalPages: number }>;
    },
  });

  const documents = data?.data ?? [];
  const totalPages = data?.totalPages ?? 1;
  const total = data?.total ?? 0;

  const { data: detail, isLoading: isDetailLoading } = useQuery({
    queryKey: ["document_detail", selectedId],
    enabled: selectedId !== null,
    queryFn: async () => {
      const res = await authFetch(`${API_BASE_URL}/api/documents/${selectedId}`);
      if (!res.ok) throw new Error(`Server merespons status ${res.status}`);
      return res.json() as Promise<DocumentDetail>;
    },
  });

  // Daftar "Jenis" untuk dropdown filter -- dikumpulkan dari halaman yang
  // sedang terlihat. Sederhana, tidak perlu endpoint baru khusus untuk ini.
  const jenisOptions = useMemo(() => {
    const set = new Set(documents.map((d) => d.jenis_dokumen).filter(Boolean));
    return Array.from(set);
  }, [documents]);

  const handleSearchSubmit = (e: { preventDefault: () => void }) => {
    e.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  };

  const handleDownload = async (doc: {
    id: number;
    file_name: string | null;
    jenis_dokumen: string;
  }) => {
    try {
      await downloadFile(
        `${API_BASE_URL}/api/documents/${doc.id}/file`,
        doc.file_name || `${doc.jenis_dokumen}.xlsx`,
      );
    } catch {
      toast.error("Gagal mengunduh file.");
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Hapus dokumen ini? Tindakan ini tidak bisa dibatalkan.")) return;
    setDeletingId(id);
    try {
      const res = await authFetch(`${API_BASE_URL}/api/documents/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`Server merespons status ${res.status}`);
      toast.success("Dokumen dihapus.");
      if (selectedId === id) setSelectedId(null);
      queryClient.invalidateQueries({ queryKey: ["documents"] });
    } catch {
      toast.error("Gagal menghapus dokumen (butuh akses admin).");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-[1400px] mx-auto">
      <BreadcrumbNavInside />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold font-space text-slate-900 dark:text-slate-100">
            Arsip Dokumen
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Hasil OCR invoice, PO, kwitansi, surat jalan, dan dokumen lainnya.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-slate-500 dark:text-slate-400 mr-1">
            {total} dokumen
          </span>
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            title="Muat ulang daftar"
            className="p-2 rounded-md border border-slate-200 dark:border-[#2e2e25] text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-[#22221a] disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
          </button>
          <button
            onClick={() => setUploadOpen(true)}
            className="inline-flex items-center gap-2 rounded-md bg-[#4338ca] px-4 py-2 text-sm font-medium text-white hover:bg-[#3730a3] transition-colors"
          >
            <Upload className="h-4 w-4" /> Upload Dokumen
          </button>
        </div>
      </div>

      {/* Filter bar */}
      <div className="rounded-xl border border-slate-200 dark:border-[#2e2e25] bg-white dark:bg-[#1a1a14] p-4">
        <form onSubmit={handleSearchSubmit} className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Cari isi dokumen... (nomor PO, nomor invoice, nama pihak, item, dll)"
              className="w-full rounded-md border border-slate-200 dark:border-[#2e2e25] bg-white dark:bg-[#13130e] pl-9 pr-3 py-2 text-sm text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#4338ca]/40"
            />
          </div>
          <select
            value={jenis}
            onChange={(e) => {
              setJenis(e.target.value);
              setPage(1);
            }}
            className="rounded-md border border-slate-200 dark:border-[#2e2e25] bg-white dark:bg-[#13130e] px-3 py-2 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-[#4338ca]/40"
          >
            <option value="all">Semua Jenis</option>
            {jenisOptions.map((j) => (
              <option key={j} value={j}>
                {j}
              </option>
            ))}
          </select>
          <input
            type="date"
            value={startDate}
            onChange={(e) => {
              setStartDate(e.target.value);
              setPage(1);
            }}
            className="rounded-md border border-slate-200 dark:border-[#2e2e25] bg-white dark:bg-[#13130e] px-3 py-2 text-sm text-slate-700 dark:text-slate-200"
          />
          <input
            type="date"
            value={endDate}
            onChange={(e) => {
              setEndDate(e.target.value);
              setPage(1);
            }}
            className="rounded-md border border-slate-200 dark:border-[#2e2e25] bg-white dark:bg-[#13130e] px-3 py-2 text-sm text-slate-700 dark:text-slate-200"
          />
          <button
            type="submit"
            className="inline-flex items-center justify-center gap-2 rounded-md bg-[#4338ca] px-4 py-2 text-sm font-medium text-white hover:bg-[#3730a3] transition-colors"
          >
            <Search className="h-4 w-4" /> Cari
          </button>
        </form>
      </div>

      {/* Tabel */}
      <div className="rounded-xl border border-slate-200 dark:border-[#2e2e25] bg-white dark:bg-[#1a1a14] overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
          </div>
        ) : documents.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Inbox className="h-10 w-10 mb-3 text-slate-400" strokeWidth={1.5} />
            <h4 className="text-base font-semibold font-space text-slate-900 dark:text-slate-100">
              Belum Ada Dokumen
            </h4>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Upload dokumen lewat form OCR untuk mulai mengarsipkannya di sini.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-[#2e2e25] bg-slate-50 dark:bg-[#13130e]">
                  <th className="text-left font-medium text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400 px-4 py-3">
                    Jenis
                  </th>
                  <th className="text-left font-medium text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400 px-4 py-3">
                    Judul / Ringkasan
                  </th>
                  <th className="text-left font-medium text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400 px-4 py-3">
                    No. PO
                  </th>
                  <th className="text-left font-medium text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400 px-4 py-3">
                    ArUco
                  </th>
                  <th className="text-left font-medium text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400 px-4 py-3">
                    Tanggal Masuk
                  </th>
                  <th className="text-right font-medium text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400 px-4 py-3">
                    Aksi
                  </th>
                </tr>
              </thead>
              <tbody>
                {documents.map((doc) => (
                  <tr
                    key={doc.id}
                    onClick={() => setSelectedId(doc.id)}
                    className="border-b border-slate-100 dark:border-[#22221a] last:border-0 hover:bg-slate-50 dark:hover:bg-[#22221a]/50 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 dark:bg-indigo-500/10 text-[#4338ca] dark:text-[#818cf8] px-2.5 py-1 text-xs font-medium">
                        <Tag className="h-3 w-3" /> {doc.jenis_dokumen}
                      </span>
                    </td>
                    <td className="px-4 py-3 max-w-xs">
                      <p className="font-medium text-slate-800 dark:text-slate-100 truncate">
                        {doc.judul || "-"}
                      </p>
                      {doc.ringkasan?.length > 0 && (
                        <p className="text-xs font-mono text-slate-500 dark:text-slate-400 truncate">
                          {doc.ringkasan
                            .slice(0, 2)
                            .map((r) => `${r.label}: ${formatValue(r.nilai)}`)
                            .join(" · ")}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <PoBadge po={doc.po_number} />
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <ArucoBadge id={doc.aruco_id} />
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap font-mono text-xs text-slate-500 dark:text-slate-400">
                      {formatDateTime(doc.created_at)}
                    </td>
                    <td className="px-4 py-3">
                      <div
                        className="flex items-center justify-end gap-1.5"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {doc.aruco_id != null && (
                          <button
                            onClick={() =>
                              printAruco({
                                id: doc.aruco_id as number,
                                po: doc.po_number,
                                layout: "single",
                                sizeCm: 10,
                              })
                            }
                            title="Cetak ArUco"
                            className="p-1.5 rounded-md text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-[#22221a] hover:text-[#4338ca] dark:hover:text-[#818cf8] transition-colors"
                          >
                            <Printer className="h-4 w-4" />
                          </button>
                        )}
                        <button
                          onClick={() => handleDownload(doc)}
                          title="Unduh file Excel"
                          className="p-1.5 rounded-md text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-[#22221a] hover:text-green-600 dark:hover:text-green-400 transition-colors"
                        >
                          <FileSpreadsheet className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(doc.id)}
                          disabled={deletingId === doc.id}
                          title="Hapus dokumen"
                          className="p-1.5 rounded-md text-slate-500 dark:text-slate-400 hover:bg-red-50 dark:hover:bg-red-950/30 hover:text-red-600 dark:hover:text-red-400 transition-colors disabled:opacity-50"
                        >
                          {deletingId === doc.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-slate-200 dark:border-[#2e2e25] px-4 py-3">
            <span className="text-xs font-mono text-slate-500 dark:text-slate-400">
              Halaman {page} dari {totalPages}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1 || isFetching}
                className="p-1.5 rounded-md border border-slate-200 dark:border-[#2e2e25] text-slate-600 dark:text-slate-300 disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-[#22221a]"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages || isFetching}
                className="p-1.5 rounded-md border border-slate-200 dark:border-[#2e2e25] text-slate-600 dark:text-slate-300 disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-[#22221a]"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {uploadOpen && <UploadModal onClose={() => setUploadOpen(false)} onDone={handleUploaded} />}

      {/* Modal detail */}
      {selectedId !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          onClick={() => setSelectedId(null)}
        >
          <div
            className="relative flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg bg-white dark:bg-[#1a1a14] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setSelectedId(null)}
              className="absolute right-3 top-3 z-10 rounded-full bg-black/50 p-1.5 text-white hover:bg-black/70 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>

            {isDetailLoading || !detail ? (
              <div className="flex items-center justify-center py-24">
                <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
              </div>
            ) : (
              <div className="overflow-y-auto p-6 space-y-5">
                <div>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 dark:bg-indigo-500/10 text-[#4338ca] dark:text-[#818cf8] px-2.5 py-1 text-xs font-medium mb-2">
                    <Tag className="h-3 w-3" /> {detail.jenis_dokumen}
                  </span>
                  <h2 className="text-xl font-bold font-space text-slate-900 dark:text-slate-100">
                    {detail.judul || detail.jenis_dokumen}
                  </h2>
                  <p className="text-xs font-mono text-slate-500 dark:text-slate-400 mt-1">
                    Diarsipkan {formatDateTime(detail.created_at)}
                  </p>
                </div>

                {(detail.po_number || detail.aruco_id != null) && (
                  <ArucoCard po={detail.po_number} id={detail.aruco_id} />
                )}

                {detail.informasi?.length > 0 && (
                  <div className="rounded-lg border border-slate-200 dark:border-[#2e2e25] divide-y divide-slate-100 dark:divide-[#22221a]">
                    {detail.informasi.map((e, i) => (
                      <div key={i} className="flex justify-between gap-4 px-4 py-2 text-sm">
                        <span className="text-slate-500 dark:text-slate-400">{e.label}</span>
                        <span className="font-medium text-right text-slate-800 dark:text-slate-100 font-mono">
                          {formatValue(e.nilai)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {detail.tabel?.map((t, ti) => (
                  <div key={ti} className="space-y-2">
                    {t.nama && (
                      <p className="text-sm font-semibold italic text-[#4338ca] dark:text-[#818cf8]">
                        {t.nama}
                      </p>
                    )}
                    <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-[#2e2e25]">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-[#305496] text-white">
                            {t.kolom.map((k, ki) => (
                              <th
                                key={ki}
                                className="px-3 py-2 text-left font-medium whitespace-nowrap"
                              >
                                {k}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {t.baris.map((row, ri) => (
                            <tr
                              key={ri}
                              className="border-t border-slate-100 dark:border-[#22221a]"
                            >
                              {row.map((cell, ci) => (
                                <td
                                  key={ci}
                                  className="px-3 py-2 font-mono text-slate-700 dark:text-slate-200 whitespace-nowrap"
                                >
                                  {formatValue(cell)}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}

                {detail.ringkasan?.length > 0 && (
                  <div className="ml-auto max-w-xs rounded-lg border border-slate-200 dark:border-[#2e2e25] divide-y divide-slate-100 dark:divide-[#22221a]">
                    {detail.ringkasan.map((e, i) => (
                      <div key={i} className="flex justify-between gap-4 px-4 py-2 text-sm">
                        <span className="text-slate-500 dark:text-slate-400">{e.label}</span>
                        <span className="font-semibold text-right text-slate-800 dark:text-slate-100 font-mono">
                          {formatValue(e.nilai)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {detail.catatan && (
                  <div className="rounded-lg bg-slate-50 dark:bg-[#13130e] border border-slate-200 dark:border-[#2e2e25] p-3">
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                      Catatan
                    </p>
                    <p className="text-sm text-slate-700 dark:text-slate-200 whitespace-pre-wrap">
                      {detail.catatan}
                    </p>
                  </div>
                )}

                <div className="flex justify-end pt-2 border-t border-slate-200 dark:border-[#2e2e25]">
                  <button
                    onClick={() => handleDownload(detail)}
                    className="inline-flex items-center gap-2 rounded-md bg-[#4338ca] px-4 py-2 text-sm font-medium text-white hover:bg-[#3730a3] transition-colors"
                  >
                    <Download className="h-4 w-4" /> Unduh Excel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ------------------ Modal upload (form buatan sendiri) ------------------
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

function UploadModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  const pick = (f: File | null | undefined) => {
    if (!f) return;
    if (!["image/jpeg", "image/png"].includes(f.type)) {
      toast.error("Format harus JPG atau PNG.");
      return;
    }
    if (f.size > MAX_UPLOAD_BYTES) {
      toast.error("Ukuran file maksimal 8 MB.");
      return;
    }
    setFile(f);
    setPreview(URL.createObjectURL(f));
  };

  const submit = async () => {
    if (!file) return;
    setUploading(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await authFetch(`${API_BASE_URL}/api/documents/upload`, {
        method: "POST",
        body,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error || `Server merespons status ${res.status}`);
      }
      toast.success("File diterima. Sedang diproses, daftar akan ter-update otomatis.");
      onDone();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal mengirim file.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={() => !uploading && onClose()}
    >
      <div
        className="relative w-full max-w-lg rounded-lg bg-white dark:bg-[#1a1a14] p-6 shadow-2xl space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          disabled={uploading}
          className="absolute right-3 top-3 rounded-full p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-[#22221a] disabled:opacity-40"
        >
          <X className="h-5 w-5" />
        </button>

        <div>
          <h2 className="text-lg font-bold font-space text-slate-900 dark:text-slate-100">
            Upload Dokumen
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Invoice, PO, kwitansi, surat jalan, dll. Format JPG/PNG, maksimal 8 MB.
          </p>
        </div>

        <div
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            pick(e.dataTransfer.files?.[0]);
          }}
          className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 text-center transition-colors ${
            dragOver
              ? "border-[#4338ca] bg-indigo-50 dark:bg-indigo-500/10"
              : "border-slate-300 dark:border-[#2e2e25] hover:bg-slate-50 dark:hover:bg-[#22221a]/50"
          }`}
        >
          {preview ? (
            <img src={preview} alt="Preview" className="max-h-56 rounded-md object-contain" />
          ) : (
            <>
              <ImagePlus className="h-10 w-10 mb-2 text-slate-400" strokeWidth={1.5} />
              <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                Klik atau seret file ke sini
              </p>
            </>
          )}
          <input
            ref={inputRef}
            type="file"
            accept=".jpg,.jpeg,.png,image/jpeg,image/png"
            className="hidden"
            onChange={(e) => pick(e.target.files?.[0])}
          />
        </div>

        {file && (
          <p className="text-xs font-mono text-slate-500 dark:text-slate-400 truncate">
            {file.name} · {(file.size / 1024).toFixed(0)} KB
          </p>
        )}

        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            disabled={uploading}
            className="rounded-md border border-slate-200 dark:border-[#2e2e25] px-4 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-[#22221a] disabled:opacity-50"
          >
            Batal
          </button>
          <button
            onClick={submit}
            disabled={!file || uploading}
            className="inline-flex items-center gap-2 rounded-md bg-[#4338ca] px-4 py-2 text-sm font-medium text-white hover:bg-[#3730a3] disabled:opacity-50 transition-colors"
          >
            {uploading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
            {uploading ? "Mengirim..." : "Kirim & Proses"}
          </button>
        </div>
      </div>
    </div>
  );
}
