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
import { arucoMatrix, arucoSvg, ARUCO_POOL_MAX } from "@/lib/aruco";
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
  jumlah_pallet: number | null;
  pallet_ids: number[];
  pallet_bersama?: number[]; // ID marker yang dipakai bersama PO lain
  created_at: string;
};

type PalletRow = {
  id: number;
  pallet_no: number;
  aruco_id: number;
  status: "ACTIVE" | "RELEASED";
  sticker_removed: boolean;
  milik_sendiri?: boolean; // false = pallet milik PO lain yang PO ini ikut menumpang
  po_lain?: string[]; // PO lain yang ada di pallet yang sama
};

type PalletAktif = { id: number; aruco_id: number; po_list: string[] };

type DocumentDetail = DocumentRow & {
  informasi: KV[];
  tabel: Tabel[];
  catatan: string | null;
  duplicate_of: number | null;
  pallets: PalletRow[];
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

type PrintItem = { id: number; label: string };

// 1 marker = 1 halaman A4. Label: nomor PO, lalu "Pallet k/N · ID n".
function printAruco(opts: { items: PrintItem[]; po?: string | null; sizeCm: number }) {
  const { items, po, sizeCm } = opts;
  const esc = (t: string) => t.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
  const poSize = (cm: number, text: string) => {
    const maxW = Math.min(cm * 1.15, 19);
    return Math.max(Math.min(cm * 0.09, 1.5, maxW / (text.length * 0.62)), 0.35).toFixed(2);
  };
  const page = (it: PrintItem) => `
    <div class="single">
      <div class="cell">
        ${arucoSvg(it.id, `${sizeCm}cm`)}
        ${po ? `<div class="po" style="font-size:${poSize(sizeCm, po)}cm">${esc(po)}</div>` : ""}
        <div class="lbl">${esc(it.label)} · ID ${it.id}</div>
      </div>
    </div>`;
  const body = items.map(page).join("");

  const w = window.open("", "_blank");
  if (!w) {
    toast.error("Pop-up diblokir browser. Izinkan pop-up lalu coba lagi.");
    return;
  }
  w.document.write(`<!doctype html><html><head><meta charset="utf-8">
<title>ArUco ${esc(po || "")}</title>
<style>
  @page { size: A4; margin: 0 }
  * { box-sizing: border-box }
  body { margin: 0; font-family: Arial, Helvetica, sans-serif; background: #fff; color: #000 }
  .cell { display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center }
  .po { margin-top: .3cm; color: #000; font-family: monospace; font-weight: 700; white-space: nowrap }
  .lbl { margin-top: .2cm; color: #000; font-family: monospace; font-weight: 700; font-size: .7cm }
  .single { width: 210mm; height: 296mm; display: flex; align-items: center; justify-content: center }
  .single:not(:last-child) { break-after: page }
</style></head><body>${body}
<script>window.onload=function(){setTimeout(function(){window.print()},200)}<\/script>
</body></html>`);
  w.document.close();
}

function PoBadge({ po }: { po: string | null }) {
  if (!po) return <span className="text-slate-400">-</span>;
  return <span className="font-mono text-xs text-slate-800 dark:text-slate-100">{po}</span>;
}

function ArucoBadge({ ids, bersama }: { ids: number[] | null; bersama?: number[] }) {
  if (!ids || ids.length === 0) return <span className="text-slate-400">-</span>;
  const tampil = ids.slice(0, 4).join(", ");
  const nBersama = bersama?.length ?? 0;
  return (
    <span className="font-mono text-xs text-slate-800 dark:text-slate-100">
      {ids.length} pallet · ID {tampil}
      {ids.length > 4 ? ` +${ids.length - 4}` : ""}
      {nBersama > 0 && (
        <span className="ml-1 text-slate-500 dark:text-slate-400" title={`ID ${bersama!.join(", ")} dipakai bersama PO lain`}>
          · {nBersama} gabungan
        </span>
      )}
    </span>
  );
}

// Gabungkan PO ini ke pallet aktif yang sudah ada (tanpa membuat marker baru)
function GabungPicker({
  docId,
  pallets,
  onChanged,
}: {
  docId: number;
  pallets: PalletRow[];
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [pilih, setPilih] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);
  const { data: palletAktif = [], isLoading } = useQuery({
    queryKey: ["documents_pallets_aktif"],
    enabled: open,
    queryFn: async () => {
      const res = await authFetch(`${API_BASE_URL}/api/documents/pallets/aktif`);
      if (!res.ok) throw new Error(`status ${res.status}`);
      return res.json() as Promise<PalletAktif[]>;
    },
  });
  // pallet yang sudah terhubung ke PO ini tidak perlu ditawarkan lagi
  const sudah = new Set(pallets.map((p) => p.id));
  const tersedia = palletAktif.filter((p) => !sudah.has(p.id));

  const simpan = async () => {
    if (!pilih.length) return;
    setSaving(true);
    try {
      const res = await authFetch(`${API_BASE_URL}/api/documents/${docId}/gabung`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pallet_ids: pilih }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error || `Server merespons status ${res.status}`);
      }
      toast.success("PO digabung ke pallet.");
      setPilih([]);
      setOpen(false);
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal menggabungkan.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-md border border-slate-200 dark:border-[#2e2e25]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-3 py-2 text-left text-sm font-medium text-slate-700 dark:text-slate-200"
      >
        <span>Gabung ke pallet yang sudah ada</span>
        <span className="text-xs text-slate-500">{open ? "Tutup" : "Pilih"}</span>
      </button>
      {open && (
        <div className="space-y-2 border-t border-slate-200 dark:border-[#2e2e25] p-2">
          <div className="max-h-44 space-y-1 overflow-y-auto">
            {isLoading ? (
              <p className="px-1 py-2 text-xs text-slate-500 dark:text-slate-400">Memuat…</p>
            ) : tersedia.length === 0 ? (
              <p className="px-1 py-2 text-xs text-slate-500 dark:text-slate-400">
                Tidak ada pallet aktif lain yang bisa digabung.
              </p>
            ) : (
              tersedia.map((p) => (
                <label
                  key={p.id}
                  className="flex cursor-pointer items-start gap-2 rounded px-1 py-1 text-xs hover:bg-slate-50 dark:hover:bg-[#22221a]"
                >
                  <input
                    type="checkbox"
                    checked={pilih.includes(p.id)}
                    onChange={(e) =>
                      setPilih((g) => (e.target.checked ? [...g, p.id] : g.filter((x) => x !== p.id)))
                    }
                    className="mt-0.5"
                  />
                  <span className="font-mono text-slate-700 dark:text-slate-200">
                    ID {p.aruco_id}
                    <span className="text-slate-500 dark:text-slate-400">
                      {" "}
                      · {p.po_list.length ? p.po_list.join(", ") : "belum ada PO"}
                    </span>
                  </span>
                </label>
              ))
            )}
          </div>
          <div className="flex justify-end">
            <button
              onClick={simpan}
              disabled={!pilih.length || saving}
              className="inline-flex items-center gap-2 rounded-md bg-[#4338ca] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#3730a3] disabled:opacity-50 transition-colors"
            >
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Gabungkan{pilih.length ? ` (${pilih.length})` : ""}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Kartu di modal detail: nomor PO, ID, preview marker, tombol cetak
function ArucoCard({
  po,
  docId,
  pallets,
  bolehGabung,
  onChanged,
}: {
  po: string | null;
  docId: number;
  pallets: PalletRow[];
  bolehGabung: boolean;
  onChanged: () => void;
}) {
  const [sizeCm, setSizeCm] = useState(20.8);
  const aktif = pallets.filter((p) => p.status === "ACTIVE");
  const menunggu = pallets.filter((p) => p.status === "RELEASED" && !p.sticker_removed);
  const gabungan = (p: PalletRow) => p.milik_sendiri === false || (p.po_lain?.length ?? 0) > 0;
  const tunggal = aktif.filter((p) => !gabungan(p));
  const labelPallet = (p: PalletRow) =>
    gabungan(p) ? "Pallet gabungan" : `Pallet ${tunggal.indexOf(p) + 1}/${tunggal.length}`;
  const items: PrintItem[] = aktif.map((p) => ({
    id: p.aruco_id,
    label: labelPallet(p),
  }));

  const lepasGabungan = async (p: PalletRow) => {
    if (!confirm(`Keluarkan PO ini dari pallet ID ${p.aruco_id}? Pallet tetap ada untuk ${p.po_lain?.join(", ") || "PO lain"}.`)) return;
    const res = await authFetch(`${API_BASE_URL}/api/documents/${docId}/gabung/${p.id}`, { method: "DELETE" });
    if (!res.ok) {
      const err = await res.json().catch(() => null);
      toast.error(err?.error || "Gagal melepas gabungan.");
      return;
    }
    toast.success("Gabungan dilepas.");
    onChanged();
  };

  const stikerDicopot = async (palletId: number) => {
    const res = await authFetch(`${API_BASE_URL}/api/documents/pallets/${palletId}/sticker-removed`, {
      method: "POST",
    });
    if (!res.ok) {
      toast.error("Gagal memperbarui status stiker.");
      return;
    }
    toast.success("Nomor marker kembali tersedia.");
    onChanged();
  };

  if (aktif.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 dark:border-[#2e2e25] p-4 text-sm text-slate-500 dark:text-slate-400 space-y-3">
        <div className="flex items-center gap-2">
          <QrCode className="h-4 w-4" />
          {po
            ? `Nomor PO ${po} terdeteksi, marker ArUco belum dibuat.`
            : "Dokumen ini bukan PO (atau nomor PO tidak terbaca), jadi belum punya marker ArUco."}
        </div>
        {bolehGabung && <GabungPicker docId={docId} pallets={pallets} onChanged={onChanged} />}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-slate-200 dark:border-[#2e2e25] p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Nomor PO · {aktif.length} pallet
          </p>
          <p className="font-mono text-sm font-semibold text-slate-900 dark:text-slate-100 break-all">
            {po || "-"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={sizeCm}
            onChange={(e) => setSizeCm(Number(e.target.value))}
            className="rounded-md border border-slate-200 dark:border-[#2e2e25] bg-white dark:bg-[#13130e] px-2 py-1.5 text-xs text-slate-700 dark:text-slate-200"
          >
            <option value={20.8}>20,8 cm (A4 penuh)</option>
          </select>
          <button
            onClick={() => printAruco({ items, po, sizeCm })}
            className="inline-flex items-center gap-2 rounded-md bg-[#4338ca] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#3730a3] transition-colors"
          >
            <Printer className="h-3.5 w-3.5" /> Cetak semua ({items.length} halaman)
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {aktif.map((p, i) => (
          <div
            key={p.id}
            className="rounded-md border border-slate-200 dark:border-[#2e2e25] p-2 flex flex-col items-center gap-1.5"
          >
            <ArucoMarker id={p.aruco_id} size={72} />
            <p className="font-mono text-[11px] text-slate-600 dark:text-slate-300">
              {labelPallet(p)} · ID {p.aruco_id}
            </p>
            {p.po_lain && p.po_lain.length > 0 && (
              <>
                <p className="text-center text-[11px] text-slate-500 dark:text-slate-400">
                  Digabung dengan {p.po_lain.join(", ")}
                </p>
                <button
                  onClick={() => lepasGabungan(p)}
                  className="text-[11px] text-red-600 dark:text-red-400 hover:underline"
                >
                  Lepas gabungan
                </button>
              </>
            )}
            <button
              onClick={() => printAruco({ items: [items[i]], po, sizeCm })}
              className="inline-flex items-center gap-1 text-[11px] text-[#4338ca] dark:text-[#818cf8] hover:underline"
            >
              <Printer className="h-3 w-3" /> Cetak
            </button>
          </div>
        ))}
      </div>

      {menunggu.length > 0 && (
        <div className="rounded-md bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/50 p-3 space-y-2">
          <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">
            Marker dilepas, stiker belum dikonfirmasi dicopot:
          </p>
          {menunggu.map((p) => (
            <div key={p.id} className="flex items-center justify-between text-xs">
              <span className="font-mono text-slate-700 dark:text-slate-200">
                Pallet {p.pallet_no} · ID {p.aruco_id}
              </span>
              <button
                onClick={() => stikerDicopot(p.id)}
                className="rounded border border-amber-300 px-2 py-0.5 text-amber-800 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/30"
              >
                Stiker sudah dicopot
              </button>
            </div>
          ))}
        </div>
      )}

      {bolehGabung && <GabungPicker docId={docId} pallets={pallets} onChanged={onChanged} />}
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
  const [editOpen, setEditOpen] = useState(false);

  const refreshDetail = () => {
    queryClient.invalidateQueries({ queryKey: ["documents"] });
    queryClient.invalidateQueries({ queryKey: ["document_detail", selectedId] });
    queryClient.invalidateQueries({ queryKey: ["documents_pool"] });
    queryClient.invalidateQueries({ queryKey: ["documents_pallets_aktif"] });
    // tampilan Tracking PO ikut berubah karena PO yang berbagi pallet jadi satu kartu
    queryClient.invalidateQueries({ queryKey: ["tracking_pos"] });
    queryClient.invalidateQueries({ queryKey: ["tracking_summary"] });
  };

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
    if (
      !confirm(
        "Hapus dokumen ini? Marker pallet-nya akan dilepas (copot stikernya dari pallet). Tindakan ini tidak bisa dibatalkan.",
      )
    )
      return;
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
                      <ArucoBadge ids={doc.pallet_ids} bersama={doc.pallet_bersama} />
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap font-mono text-xs text-slate-500 dark:text-slate-400">
                      {formatDateTime(doc.created_at)}
                    </td>
                    <td className="px-4 py-3">
                      <div
                        className="flex items-center justify-end gap-1.5"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {doc.pallet_ids?.length > 0 && (
                          <button
                            onClick={() =>
                              printAruco({
                                po: doc.po_number,
                                sizeCm: 20.8,
                                items: doc.pallet_ids.map((id) => {
                                  const tunggal = doc.pallet_ids.filter((x) => !doc.pallet_bersama?.includes(x));
                                  return {
                                    id,
                                    label: doc.pallet_bersama?.includes(id)
                                      ? "Pallet gabungan"
                                      : `Pallet ${tunggal.indexOf(id) + 1}/${tunggal.length}`,
                                  };
                                }),
                              })
                            }
                            title="Cetak semua marker PO ini"
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

                {detail.duplicate_of && (
                  <div className="rounded-lg border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/20 p-3 text-sm text-red-700 dark:text-red-400">
                    Nomor PO ini sudah ada (dokumen #{detail.duplicate_of}). Marker tidak dibuat untuk
                    dokumen ini.
                  </div>
                )}

                {(detail.po_number || detail.pallets?.length > 0) && (
                  <ArucoCard
                    po={detail.po_number}
                    docId={detail.id}
                    pallets={detail.pallets ?? []}
                    bolehGabung={!!detail.po_number && !detail.duplicate_of}
                    onChanged={refreshDetail}
                  />
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

                <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-[#2e2e25]">
                  {!detail.duplicate_of && (
                    <button
                      onClick={() => setEditOpen(true)}
                      className="rounded-md border border-slate-200 dark:border-[#2e2e25] px-4 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-[#22221a]"
                    >
                      {detail.po_number ? "Edit PO" : "Isi nomor PO"}
                    </button>
                  )}
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

      {editOpen && detail && (
        <EditPoModal detail={detail} onClose={() => setEditOpen(false)} onSaved={refreshDetail} />
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
  const [jumlahPallet, setJumlahPallet] = useState("");
  const [gabung, setGabung] = useState<number[]>([]);
  const [bukaGabung, setBukaGabung] = useState(false);
  const { data: palletAktif = [] } = useQuery({
    queryKey: ["documents_pallets_aktif"],
    queryFn: async () => {
      const res = await authFetch(`${API_BASE_URL}/api/documents/pallets/aktif`);
      if (!res.ok) throw new Error(`status ${res.status}`);
      return res.json() as Promise<PalletAktif[]>;
    },
  });
  const { data: poolInfo } = useQuery({
    queryKey: ["documents_pool"],
    queryFn: async () => {
      const res = await authFetch(`${API_BASE_URL}/api/documents/pool`);
      if (!res.ok) throw new Error(`status ${res.status}`);
      return res.json() as Promise<{ total: number; terpakai: number; sisa: number }>;
    },
  });
  // Jumlah pallet BARU boleh kosong/0 kalau PO ini hanya digabung ke pallet yang sudah ada.
  const nPallet = jumlahPallet.trim() === "" ? 0 : Number(jumlahPallet);
  const validPallet =
    Number.isInteger(nPallet) &&
    nPallet >= 0 &&
    nPallet <= ARUCO_POOL_MAX &&
    (!poolInfo || nPallet <= poolInfo.sisa) &&
    nPallet + gabung.length >= 1;

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
    if (!file || !validPallet) return;
    setUploading(true);
    try {
      const body = new FormData();
      body.append("file", file);
      body.append("jumlah_pallet", String(nPallet));
      if (gabung.length) body.append("gabung_ke", gabung.join(","));
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
            Invoice, PO, kwitansi, surat jalan, dll. Format JPG/PNG, maksimal 8 MB. Isi jumlah pallet baru
            untuk menentukan berapa marker yang dibuat, atau gabungkan PO ini ke pallet yang sudah ada.
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

        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
            Jumlah pallet baru {gabung.length === 0 && <span className="text-red-500">*</span>}
          </label>
          <input
            type="number"
            min={0}
            max={ARUCO_POOL_MAX}
            value={jumlahPallet}
            onChange={(e) => setJumlahPallet(e.target.value)}
            placeholder={gabung.length ? "0 jika hanya digabung" : "mis. 5"}
            className="mt-1 w-full rounded-md border border-slate-200 dark:border-[#2e2e25] bg-white dark:bg-[#13130e] px-3 py-2 text-sm font-mono"
          />
          {poolInfo && (
            <p
              className={`mt-1 text-xs ${
                jumlahPallet && nPallet > poolInfo.sisa
                  ? "text-red-600 dark:text-red-400"
                  : "text-slate-500 dark:text-slate-400"
              }`}
            >
              Sisa slot marker: {poolInfo.sisa} dari {poolInfo.total}
              {jumlahPallet && nPallet > poolInfo.sisa ? " · jumlah melebihi sisa" : ""}
            </p>
          )}
        </div>

        <div className="rounded-md border border-slate-200 dark:border-[#2e2e25]">
          <button
            type="button"
            onClick={() => setBukaGabung((v) => !v)}
            className="flex w-full items-center justify-between px-3 py-2 text-left text-sm font-medium text-slate-700 dark:text-slate-200"
          >
            <span>
              Gabung ke pallet yang sudah ada
              {gabung.length > 0 && (
                <span className="ml-2 text-xs font-normal text-[#4338ca] dark:text-[#818cf8]">
                  {gabung.length} dipilih
                </span>
              )}
            </span>
            <span className="text-xs text-slate-500">{bukaGabung ? "Tutup" : "Pilih"}</span>
          </button>
          {bukaGabung && (
            <div className="max-h-44 space-y-1 overflow-y-auto border-t border-slate-200 dark:border-[#2e2e25] p-2">
              {palletAktif.length === 0 ? (
                <p className="px-1 py-2 text-xs text-slate-500 dark:text-slate-400">Belum ada pallet aktif.</p>
              ) : (
                palletAktif.map((p) => (
                  <label
                    key={p.id}
                    className="flex cursor-pointer items-start gap-2 rounded px-1 py-1 text-xs hover:bg-slate-50 dark:hover:bg-[#22221a]"
                  >
                    <input
                      type="checkbox"
                      checked={gabung.includes(p.id)}
                      onChange={(e) =>
                        setGabung((g) => (e.target.checked ? [...g, p.id] : g.filter((x) => x !== p.id)))
                      }
                      className="mt-0.5"
                    />
                    <span className="font-mono text-slate-700 dark:text-slate-200">
                      ID {p.aruco_id}
                      <span className="text-slate-500 dark:text-slate-400">
                        {" "}
                        · {p.po_list.length ? p.po_list.join(", ") : "belum ada PO"}
                      </span>
                    </span>
                  </label>
                ))
              )}
            </div>
          )}
        </div>

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
            disabled={!file || !validPallet || uploading}
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

// ------------------ Modal edit PO ------------------
function EditPoModal({
  detail,
  onClose,
  onSaved,
}: {
  detail: DocumentDetail;
  onClose: () => void;
  onSaved: () => void;
}) {
  // Hanya pallet buatan PO ini yang bisa ditambah/dikurangi di sini; pallet gabungan tidak ikut dihitung.
  const aktif = (detail.pallets ?? []).filter((p) => p.status === "ACTIVE" && p.milik_sendiri !== false);
  const [po, setPo] = useState(detail.po_number ?? "");
  const [jumlah, setJumlah] = useState(String(aktif.length));
  const [saving, setSaving] = useState(false);

  const n = Number(jumlah);
  const valid =
    po.trim() !== "" && Number.isInteger(n) && (n === aktif.length || (n >= 1 && n <= ARUCO_POOL_MAX));
  const selisih = n - aktif.length;

  const save = async () => {
    if (selisih < 0) {
      const lepas = aktif
        .slice(n)
        .map((p) => `Pallet ${p.pallet_no} (ID ${p.aruco_id})`)
        .join(", ");
      if (!confirm(`Marker ini akan dilepas: ${lepas}.\nCopot stikernya dari pallet fisik. Lanjut?`))
        return;
    }
    setSaving(true);
    try {
      const res = await authFetch(`${API_BASE_URL}/api/documents/${detail.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          n === aktif.length ? { po_number: po.trim() } : { po_number: po.trim(), jumlah_pallet: n },
        ),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error || `Server merespons status ${res.status}`);
      }
      toast.success("PO diperbarui.");
      onSaved();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal menyimpan.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={() => !saving && onClose()}
    >
      <div
        className="relative w-full max-w-md rounded-lg bg-white dark:bg-[#1a1a14] p-6 shadow-2xl space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-bold font-space text-slate-900 dark:text-slate-100">
          {detail.po_number ? "Edit PO" : "Isi nomor PO"}
        </h2>
        {!detail.po_number && (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Nomor PO tidak terbaca otomatis. Isi nomornya sesuai dokumen. Jumlah pallet boleh 0 jika tidak
            perlu marker baru (misalnya hanya ingin digabung ke pallet yang sudah ada, lewat kartu marker
            setelah nomor tersimpan).
          </p>
        )}

        <label className="block text-sm text-slate-600 dark:text-slate-300">
          Nomor PO
          <input
            value={po}
            onChange={(e) => setPo(e.target.value)}
            className="mt-1 w-full rounded-md border border-slate-200 dark:border-[#2e2e25] bg-white dark:bg-[#13130e] px-3 py-2 text-sm font-mono"
          />
        </label>

        <label className="block text-sm text-slate-600 dark:text-slate-300">
          Jumlah pallet
          <input
            type="number"
            min={0}
            max={ARUCO_POOL_MAX}
            value={jumlah}
            onChange={(e) => setJumlah(e.target.value)}
            className="mt-1 w-full rounded-md border border-slate-200 dark:border-[#2e2e25] bg-white dark:bg-[#13130e] px-3 py-2 text-sm font-mono"
          />
        </label>

        {valid && selisih > 0 && (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Akan dibuat {selisih} marker baru (cetak dari kartu marker).
          </p>
        )}
        {valid && selisih < 0 && (
          <p className="text-xs text-amber-700 dark:text-amber-400">
            {-selisih} marker akan dilepas. Stikernya harus dicopot dari pallet.
          </p>
        )}

        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            disabled={saving}
            className="rounded-md border border-slate-200 dark:border-[#2e2e25] px-4 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-[#22221a] disabled:opacity-50"
          >
            Batal
          </button>
          <button
            onClick={save}
            disabled={!valid || saving}
            className="inline-flex items-center gap-2 rounded-md bg-[#4338ca] px-4 py-2 text-sm font-medium text-white hover:bg-[#3730a3] disabled:opacity-50 transition-colors"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Simpan
          </button>
        </div>
      </div>
    </div>
  );
}