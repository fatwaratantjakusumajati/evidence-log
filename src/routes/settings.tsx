import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { API_BASE_URL } from "@/lib/api-config";
import {
  Save,
  Loader2,
  Plus,
  Trash2,
  Users,
  UserPlus,
  X,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  Pencil,
  EyeOff,
  Shield,
  Eye,
  Lock,
  NotebookText,
  ChevronDown,
} from "lucide-react";
import { useState, useEffect, useRef, useMemo } from "react";
import { useTheme } from "@/lib/theme-provider";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { toast } from "sonner";
import { getSettingsPageColors } from "@/lib/theme-tokens";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { authFetch, getCurrentUser } from "@/lib/auth";

// ======================== TYPES ========================
type WaRecipient = {
  id: number;
  nama: string;
  nomor: string;
  aktif: boolean;
  akses_staging: boolean;
  akses_laporan_harian: boolean;
  akses_laporan_mingguan: boolean;
  akses_chatbot: boolean;
  created_at: string;
};
// ======================== ROUTE ========================
export const Route = createFileRoute("/settings")({
  component: SettingsPage,
});

// ======================== COMPONENT ========================
function SettingsPage() {
  const queryClient = useQueryClient();
  const { resolvedTheme } = useTheme();
  const isDarkMode = resolvedTheme === "dark";

  const t = useMemo(() => getSettingsPageColors(isDarkMode), [isDarkMode]);
  // const currentUser = getCurrentUser();

  const [confirmDialog, setConfirmDialog] = useState<{
    title: string;
    description: string;
    onConfirm: () => void;
  } | null>(null);

  // ======================== WA STATE ========================
  const [showAddForm, setShowAddForm] = useState(false);
  const [newNama, setNewNama] = useState("");
  const [newNomor, setNewNomor] = useState("");
  const [newAksesStaging, setNewAksesStaging] = useState(true);
  const [newAksesHarian, setNewAksesHarian] = useState(false);
  const [newAksesMingguan, setNewAksesMingguan] = useState(false);
  const [newAksesChatbot, setNewAksesChatbot] = useState(false);
  const [editValues, setEditValues] = useState<Record<number, string>>({});

  // ======================== Manajemen User =========================
  const [showAddUserForm, setShowUserForm] = useState(false);
  const [newUsername, setNewUsername] = useState("");
  const [newUserRole, setNewUserRole] = useState<"admin" | "staff">("staff");
  const [newPassword, setNewPassword] = useState("");
  const [newPasswordConfirm, setNewPasswordConfirm] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showNewPasswordConfirm, setShowNewPasswordConfirm] = useState(false);

  // ======================== Ganti Password =========================
  const [showChangePasswordForm, setShowChangePasswordForm] = useState(false);
  const [currentPasswordInput, setCurrentPasswordInput] = useState("");
  const [newPasswordInput, setNewPasswordInput] = useState("");
  const [newPasswordInputConfirm, setNewPasswordInputConfirm] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPasswordInput, setShowNewPasswordInput] = useState(false);
  const [showNewPasswordConfirmInput, setShowNewPasswordConfirmInput] = useState(false);

  const [currentUser, setCurrrentUser] = useState<ReturnType<typeof getCurrentUser>>(null);
  useEffect(() => {
    setCurrrentUser(getCurrentUser());
  }, []);

  // ======================== USER MANAGEMENT ========================
  type AppUser = { id: number; username: string; role: "admin" | "staff"; created_at: string };

  const {
    data: usersData,
    isLoading: usersLoading,
    isError: usersError,
  } = useQuery({
    queryKey: ["users"],
    queryFn: async () => {
      const res = await authFetch(`${API_BASE_URL}/api/auth/users`);
      if (!res.ok) throw new Error("Gagal mengambil daftar user");
      return (await res.json()) as AppUser[];
    },
  });
  const appUsers = usersData || [];

  // ======================== AUDIT LOG ========================
  type AuditLogEntry = {
    id: number;
    actor_username: string;
    action: string;
    target_type: string;
    target_label: string | null;
    details: Record<string, unknown> | null;
    created_at: string;
  };

  const AUDIT_ACTION_LABELS: Record<string, string> = {
    create_user: "Membuat user",
    delete_user: "Menghapus user",
    create_wa_recipient: "Menambah kontak WA",
    update_wa_recipient: "Mengubah kontak WA",
    delete_wa_recipient: "Menghapus kontak WA",
    create_report_recipient: "Menambah penerima laporan",
    update_report_recipient: "Mengubah penerima laporan",
    delete_report_recipient: "Menghapus penerima laporan",
  };

  const [showAuditLog, setShowAuditLog] = useState(false);
  const {
    data: auditLogData,
    isLoading: auditLogLoading,
    isError: auditLogError,
  } = useQuery({
    queryKey: ["audit-log"],
    queryFn: async () => {
      const res = await authFetch(`${API_BASE_URL}/api/audit-log?limit=30`);
      if (!res.ok) throw new Error("Gagal mengambil audit log");
      return (await res.json()) as { data: AuditLogEntry[]; total: number };
    },
    enabled: showAuditLog,
  });
  const auditEntries = auditLogData?.data || [];

  const mutationAddUser = useMutation({
    mutationFn: async ({
      username,
      password,
      role,
    }: {
      username: string;
      password: string;
      role: "admin" | "staff";
    }) => {
      const res = await authFetch(`${API_BASE_URL}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password, role }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal mendaftarkan user");
      return data;
    },
    onSuccess: (data: AppUser) => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      setShowUserForm(false);
      setNewUsername("");
      setNewUserRole("staff");
      setNewPassword("");
      setNewPasswordConfirm("");
      toast.success(`User "${data.username}" berhasil didaftarkan!`);
    },
    onError: (err: Error) => toast.error(`Gagal: ${err.message}`),
  });

  const mutationDeleteUser = useMutation({
    mutationFn: async (id: number) => {
      const res = await authFetch(`${API_BASE_URL}/api/auth/users/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal menghapus user");
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      toast.success("User berhasil dihapus!");
    },
    onError: (err: Error) => toast.error(`Gagal: ${err.message}`),
  });

  const handleAddUser = () => {
    if (!newUsername.trim() || !newPassword) {
      return toast.warning("Username dan password wajib diisi");
    }
    if (newPassword.length < 8) {
      return toast.warning("Password minimal 8 karakter");
    }
    if (newPassword !== newPasswordConfirm) {
      return toast.warning("Konfirmasi password tidak cocok");
    }
    mutationAddUser.mutate({
      username: newUsername.trim(),
      password: newPassword,
      role: newUserRole,
    });
  };

  const handleDeleteUser = (id: number, username: string) => {
    setConfirmDialog({
      title: "Hapus User",
      description: `Hapus akun "${username}"? User ini tidak akan bisa login lagi setelah dihapus.`,
      onConfirm: () => mutationDeleteUser.mutate(id),
    });
  };

  const mutationChangePassword = useMutation({
    mutationFn: async ({
      currentPassword,
      newPassword,
    }: {
      currentPassword: string;
      newPassword: string;
    }) => {
      const res = await authFetch(`${API_BASE_URL}/api/auth/change-password`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal mengganti password");
      return data;
    },
    onSuccess: () => {
      setShowChangePasswordForm(false);
      setCurrentPasswordInput("");
      setNewPasswordInput("");
      setNewPasswordInputConfirm("");
      toast.success("Password berhasil diganti");
    },
    onError: (err: Error) => toast.error(`Gagal: ${err.message}`),
  });

  const handleChangePassword = () => {
    if (!currentPasswordInput || !newPasswordInput) {
      return toast.warning("Password lama dan baru wajib diisi");
    }
    if (newPasswordInput.length < 8) {
      return toast.warning("Password baru minimal 8 karakter");
    }
    if (newPasswordInput !== newPasswordInputConfirm) {
      return toast.warning("Konfirmasi password baru tidak cocok");
    }
    mutationChangePassword.mutate({
      currentPassword: currentPasswordInput,
      newPassword: newPasswordInput,
    });
  };

  // ======================== WA QUERY ========================
  const {
    data: waData,
    isLoading: waLoading,
    isError: waError,
  } = useQuery({
    queryKey: ["wa-recipients"],
    queryFn: async () => {
      const res = await authFetch(`${API_BASE_URL}/api/wa-recipients`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error("Gagal mengambil data kontak");
      const json = await res.json();
      if (Array.isArray(json)) return json as WaRecipient[];
      if (json.data && Array.isArray(json.data)) return json.data as WaRecipient[];
      throw new Error("Format data tidak valid");
    },
  });
  const recipients = waData || [];

  useEffect(() => {
    if (recipients.length > 0) {
      const values: Record<number, string> = {};
      recipients.forEach((r) => {
        values[r.id] = r.nomor;
      });
      setEditValues(values);
    }
  }, [waData]);

  // ======================== WA MUTATIONS ========================
  const mutationUpdate = useMutation({
    mutationFn: async ({ id, nomor }: { id: number; nomor: string }) => {
      const res = await authFetch(`${API_BASE_URL}/api/wa-recipients/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nomor }),
        cache: "no-store",
      });
      if (!res.ok) throw new Error("Gagal menyimpan");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["wa-recipients"] });
      toast.success("Nomor kontak berhasil diperbarui!");
    },
    onError: (err: Error) => toast.error(`Gagal: ${err.message}`),
  });

  // Toggle 1 hak akses (staging/laporan harian/mingguan/chatbot) tanpa perlu
  // dialog konfirmasi -- ini switch ringan, beda dari ubah nomor/hapus kontak
  // yang dampaknya lebih besar dan tetap perlu konfirmasi.
  const mutationTogglePermission = useMutation({
    mutationFn: async ({ id, field, value }: { id: number; field: string; value: boolean }) => {
      const res = await authFetch(`${API_BASE_URL}/api/wa-recipients/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value }),
        cache: "no-store",
      });
      if (!res.ok) throw new Error("Gagal menyimpan hak akses");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["wa-recipients"] });
    },
    onError: (err: Error) => toast.error(`Gagal ubah hak akses: ${err.message}`),
  });

  const mutationDelete = useMutation({
    mutationFn: async (id: number) => {
      const res = await authFetch(`${API_BASE_URL}/api/wa-recipients/${id}`, {
        method: "DELETE",
        cache: "no-store",
      });
      if (!res.ok) throw new Error("Gagal menghapus kontak");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["wa-recipients"] });
      toast.success("Kontak berhasil dihapus!");
    },
    onError: (err: Error) => toast.error(`Gagal: ${err.message}`),
  });

  const mutationAdd = useMutation({
    mutationFn: async ({
      nama,
      nomor,
      akses_staging,
      akses_laporan_harian,
      akses_laporan_mingguan,
      akses_chatbot,
    }: {
      nama: string;
      nomor: string;
      akses_staging: boolean;
      akses_laporan_harian: boolean;
      akses_laporan_mingguan: boolean;
      akses_chatbot: boolean;
    }) => {
      const res = await authFetch(`${API_BASE_URL}/api/wa-recipients`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nama,
          nomor,
          aktif: true,
          akses_staging,
          akses_laporan_harian,
          akses_laporan_mingguan,
          akses_chatbot,
        }),
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal menambahkan penerima");
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["wa-recipients"] });
      setShowAddForm(false);
      setNewNama("");
      setNewNomor("");
      setNewAksesStaging(true);
      setNewAksesHarian(false);
      setNewAksesMingguan(false);
      setNewAksesChatbot(false);
      toast.success("Penerima WhatsApp berhasil ditambahkan!");
    },
    onError: (err: Error) => toast.error(`Gagal: ${err.message}`),
  });

  const handleUpdateRecipient = (id: number) => {
    const recipient = recipients.find((r) => r.id === id);
    const newNomor = editValues[id]?.trim();
    if (!recipient || !newNomor) return toast.warning("Nomor WA tidak boleh kosong!");
    if (newNomor === recipient.nomor) return toast.info("Tidak ada perubahan");
    setConfirmDialog({
      title: "Ubah Nomor Whatsapp",
      description: `Ubah nomor ${recipient.nama}? Dari ${recipient.nomor} menjadi ${newNomor}.`,
      onConfirm: () => mutationUpdate.mutate({ id, nomor: newNomor }),
    });
  };

  const handleDeleteRecipient = (id: number) => {
    const recipient = recipients.find((r) => r.id === id);
    if (!recipient) return;
    setConfirmDialog({
      title: "Hapus Kontak",
      description: `Hapus kontak "${recipient.nama}"? Tindakan ini tidak bisa dibatalkan.`,
      onConfirm: () => mutationDelete.mutate(id),
    });
  };

  const handleAddRecipient = () => {
    if (!newNama.trim() || !newNomor.trim()) return toast.warning("Nama dan Nomor WA wajib diisi!");
    if (!/^[0-9]{10,15}$/.test(newNomor.trim()))
      return toast.warning("Format nomor WA tidak valid.");
    mutationAdd.mutate({
      nama: newNama.trim(),
      nomor: newNomor.trim(),
      akses_staging: newAksesStaging,
      akses_laporan_harian: newAksesHarian,
      akses_laporan_mingguan: newAksesMingguan,
      akses_chatbot: newAksesChatbot,
    });
  };

  // ======================== RENDER ========================

  // Halaman Settings isinya konfigurasi sensitif (akun user, nomor WA,
  // jadwal laporan) -- cuma admin yang boleh buka. currentUser masih null
  // sesaat sebelum useEffect di atas selesai jalan (hindari flash konten
  // buat admin asli), jadi baru diblokir begitu KITA TAHU PASTI role-nya
  // staff, bukan cuma "belum kebaca".
  if (currentUser && currentUser.role !== "admin") {
    return (
      <main
        className="flex min-h-screen flex-1 items-center justify-center transition-colors duration-300"
        style={{ backgroundColor: t.bg, color: t.textMain }}
      >
        <div className="max-w-sm text-center px-6">
          <div
            className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full"
            style={{ backgroundColor: t.dangerLight, color: t.danger }}
          >
            <Lock className="h-6 w-6" />
          </div>
          <h1 className="text-lg font-semibold mb-1">Akses Terbatas</h1>
          <p className="text-sm mb-6" style={{ color: t.textMuted }}>
            Halaman Pengaturan cuma bisa diakses oleh akun admin. Hubungi admin kalau kamu perlu
            mengubah sesuatu di sini.
          </p>
          <Link
            to="/dashboard"
            className="inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium text-white transition-colors"
            style={{ backgroundColor: t.primary }}
          >
            Kembali ke Dashboard
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main
      className="flex-1 min-h-screen transition-colors duration-300"
      style={{ backgroundColor: t.bg, color: t.textMain }}
    >
      <header
        className="sticky top-0 z-20 border-b transition-colors duration-300 backdrop-blur-xl"
        style={{ backgroundColor: t.headerBg, borderColor: t.border }}
      >
        <div className="mx-auto max-w-[1680px] px-6 py-4">
          <div className="mb-4">
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbLink asChild>
                    <Link
                      to="/dashboard"
                      className="hover:opacity-80 transition-opacity text-sm"
                      style={{ color: t.textMuted }}
                    >
                      Home
                    </Link>
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbPage
                    className="font-space font-semibold text-lg"
                    style={{ color: t.textMain }}
                  >
                    Pengaturan Sistem
                  </BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </div>
          <h1
            className="text-lg font-semibold tracking-tight font-space"
            style={{ color: t.textMain }}
          >
            Pengaturan Sistem
          </h1>
        </div>
      </header>

      <section className="mx-auto max-w-[1680px] px-6 py-6 space-y-6">
        {/* ==================== CARD 3: PENERIMA WHATSAPP ==================== */}
        <div
          className="rounded-lg border shadow-sm"
          style={{ borderColor: t.border, backgroundColor: t.card }}
        >
          <div className="p-6 pb-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg" style={{ backgroundColor: t.successLight }}>
                  <Users className="h-5 w-5" style={{ color: t.success }} />
                </div>
                <div>
                  <h2 className="text-base font-semibold font-space" style={{ color: t.textMain }}>
                    Penerima WhatsApp
                  </h2>
                  <p className="text-xs mt-0.5" style={{ color: t.textMuted }}>
                    Kelola kontak penerima notifikasi
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowAddForm(!showAddForm)}
                className="inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium text-white transition-all"
                style={{ backgroundColor: showAddForm ? t.danger : t.success }}
              >
                {showAddForm ? (
                  <>
                    <X className="h-4 w-4" /> Batal
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4" /> Tambah
                  </>
                )}
              </button>
            </div>
          </div>
          <div className="px-6 pb-6">
            {showAddForm && (
              <div
                className="rounded-lg border p-4 space-y-3 mb-6"
                style={{ borderColor: t.border, backgroundColor: t.bg }}
              >
                <h3 className="text-sm font-semibold font-space" style={{ color: t.textMain }}>
                  Tambah Penerima Baru
                </h3>
                <div className="flex flex-col gap-3 sm:flex-row">
                  <input
                    type="text"
                    value={newNama}
                    onChange={(e) => setNewNama(e.target.value)}
                    placeholder="Nama kontak"
                    className="flex-1 rounded-md border px-3 py-2.5 text-sm outline-none"
                    style={{
                      borderColor: t.inputBorder,
                      backgroundColor: t.inputBg,
                      color: t.textMain,
                    }}
                    onKeyDown={(e) => e.key === "Enter" && handleAddRecipient()}
                  />
                  <input
                    type="tel"
                    value={newNomor}
                    onChange={(e) => setNewNomor(e.target.value)}
                    placeholder="6281234567890"
                    className="flex-1 rounded-md border px-3 py-2.5 text-sm outline-none font-mono"
                    style={{
                      borderColor: t.inputBorder,
                      backgroundColor: t.inputBg,
                      color: t.textMain,
                    }}
                    onKeyDown={(e) => e.key === "Enter" && handleAddRecipient()}
                  />
                  <button
                    onClick={handleAddRecipient}
                    disabled={mutationAdd.isPending}
                    className="inline-flex items-center justify-center rounded-md px-6 py-2.5 text-sm font-medium text-white"
                    style={{ backgroundColor: t.success }}
                  >
                    {mutationAdd.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <Save className="h-4 w-4" /> Simpan
                      </>
                    )}
                  </button>
                </div>

                {/* Hak akses fitur otomatis n8n -- staging alert, laporan harian/mingguan,
                    dan boleh minta laporan lewat chatbot WA. Ini yang connect langsung ke
                    query di workflow n8n (filter berdasarkan kolom akses_* di database). */}
                <div className="flex flex-wrap gap-4 pt-1">
                  <label className="flex items-center gap-2 text-sm" style={{ color: t.textMain }}>
                    <input
                      type="checkbox"
                      checked={newAksesStaging}
                      onChange={(e) => setNewAksesStaging(e.target.checked)}
                      className="h-4 w-4 rounded"
                    />
                    Alert Staging
                  </label>
                  <label className="flex items-center gap-2 text-sm" style={{ color: t.textMain }}>
                    <input
                      type="checkbox"
                      checked={newAksesHarian}
                      onChange={(e) => setNewAksesHarian(e.target.checked)}
                      className="h-4 w-4 rounded"
                    />
                    Laporan Harian
                  </label>
                  <label className="flex items-center gap-2 text-sm" style={{ color: t.textMain }}>
                    <input
                      type="checkbox"
                      checked={newAksesMingguan}
                      onChange={(e) => setNewAksesMingguan(e.target.checked)}
                      className="h-4 w-4 rounded"
                    />
                    Laporan Mingguan
                  </label>
                  <label className="flex items-center gap-2 text-sm" style={{ color: t.textMain }}>
                    <input
                      type="checkbox"
                      checked={newAksesChatbot}
                      onChange={(e) => setNewAksesChatbot(e.target.checked)}
                      className="h-4 w-4 rounded"
                    />
                    Minta via Chatbot WA
                  </label>
                </div>
              </div>
            )}
            {waLoading && (
              <div className="flex justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin" style={{ color: t.primary }} />
              </div>
            )}
            {waError && (
              <div
                className="text-center py-8 rounded-md border"
                style={{ borderColor: t.danger, backgroundColor: t.dangerLight }}
              >
                <AlertCircle className="h-6 w-6 mx-auto mb-2" style={{ color: t.danger }} />
                <p className="text-sm" style={{ color: t.danger }}>
                  Gagal memuat data
                </p>
                <button
                  onClick={() => queryClient.invalidateQueries({ queryKey: ["wa-recipients"] })}
                  className="mt-2 text-xs"
                  style={{ color: t.primary }}
                >
                  <RefreshCw className="h-3 w-3 inline mr-1" />
                  Coba lagi
                </button>
              </div>
            )}
            {!waLoading && !waError && recipients.length === 0 && (
              <div
                className="text-center py-12 rounded-md border border-dashed"
                style={{ borderColor: t.border }}
              >
                <Users className="h-10 w-10 mx-auto mb-3" style={{ color: t.textMuted }} />
                <p className="text-sm" style={{ color: t.textMuted }}>
                  Belum ada penerima terdaftar
                </p>
              </div>
            )}
            {!waLoading && !waError && recipients.length > 0 && (
              <div className="space-y-4">
                {recipients.map((recipient) => (
                  <div
                    key={recipient.id}
                    className="flex flex-col gap-3 p-4 rounded-md border"
                    style={{ borderColor: t.border, backgroundColor: t.bg }}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div
                          className="h-8 w-8 rounded-full flex items-center justify-center text-sm font-bold"
                          style={{ backgroundColor: t.primaryLight, color: t.primary }}
                        >
                          {recipient.nama.charAt(0).toUpperCase()}
                        </div>
                        <h3
                          className="text-sm font-semibold font-space"
                          style={{ color: t.textMain }}
                        >
                          {recipient.nama}
                        </h3>
                      </div>
                      <span
                        className="text-[10px] font-semibold px-2.5 py-1 rounded-full inline-flex items-center gap-1.5"
                        style={{
                          backgroundColor: recipient.aktif ? t.successLight : t.dangerLight,
                          color: recipient.aktif ? t.success : t.danger,
                        }}
                      >
                        {recipient.aktif ? (
                          <CheckCircle2 className="h-3 w-3" />
                        ) : (
                          <AlertCircle className="h-3 w-3" />
                        )}
                        {recipient.aktif ? "Aktif" : "Nonaktif"}
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={editValues[recipient.id] ?? recipient.nomor}
                        onChange={(e) =>
                          setEditValues((prev) => ({ ...prev, [recipient.id]: e.target.value }))
                        }
                        className="flex-1 rounded-md border px-3 py-2.5 text-sm outline-none"
                        style={{
                          borderColor: t.inputBorder,
                          backgroundColor: t.inputBg,
                          color: t.textMain,
                        }}
                        onKeyDown={(e) => e.key === "Enter" && handleUpdateRecipient(recipient.id)}
                      />
                      <button
                        onClick={() => handleUpdateRecipient(recipient.id)}
                        disabled={mutationUpdate.isPending}
                        className="inline-flex items-center gap-1.5 rounded-md px-4 py-2.5 text-sm font-medium text-white"
                        style={{ backgroundColor: t.primary }}
                      >
                        {mutationUpdate.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <>
                            <Save className="h-4 w-4" /> Simpan
                          </>
                        )}
                      </button>
                      <button
                        onClick={() => handleDeleteRecipient(recipient.id)}
                        disabled={mutationDelete.isPending}
                        className="inline-flex items-center gap-1.5 rounded-md px-4 py-2.5 text-sm font-medium text-white"
                        style={{ backgroundColor: t.danger }}
                      >
                        {mutationDelete.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <>
                            <Trash2 className="h-4 w-4" /> Hapus
                          </>
                        )}
                      </button>
                    </div>

                    {/* Hak akses fitur otomatis n8n -- diklik langsung, tanpa dialog
                        konfirmasi (beda dari ubah nomor/hapus yang dampaknya lebih besar).
                        Ini yang dibaca query di workflow n8n untuk filter siapa dapat apa. */}
                    <div className="flex flex-wrap gap-2 pt-1">
                      {(
                        [
                          { field: "akses_staging", label: "Alert Staging" },
                          { field: "akses_laporan_harian", label: "Laporan Harian" },
                          { field: "akses_laporan_mingguan", label: "Laporan Mingguan" },
                          { field: "akses_chatbot", label: "Chatbot WA" },
                        ] as const
                      ).map(({ field, label }) => {
                        const active = Boolean(recipient[field]);
                        return (
                          <button
                            key={field}
                            onClick={() =>
                              mutationTogglePermission.mutate({
                                id: recipient.id,
                                field,
                                value: !active,
                              })
                            }
                            className="text-[11px] font-medium px-2.5 py-1 rounded-full border transition-colors"
                            style={
                              active
                                ? {
                                    backgroundColor: t.primaryLight,
                                    color: t.primary,
                                    borderColor: t.primary,
                                  }
                                : {
                                    backgroundColor: "transparent",
                                    color: t.textMuted,
                                    borderColor: t.border,
                                  }
                            }
                          >
                            {active ? "✓ " : ""}
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ==================== CARD 4: MANAJEMEN USER ==================== */}
        <div
          className="rounded-lg border shadow-sm"
          style={{ borderColor: t.border, backgroundColor: t.card }}
        >
          <div className="p-6 pb-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg" style={{ backgroundColor: t.primaryLight }}>
                  <Shield className="h-5 w-5" style={{ color: t.primary }} />
                </div>
                <div>
                  <h2 className="text-base font-semibold font-space" style={{ color: t.textMain }}>
                    Manajemen User
                  </h2>
                  <p className="text-xs mt-0.5" style={{ color: t.textMuted }}>
                    Mengelola akses login pada sistem ini
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowUserForm(!showAddUserForm)}
                className="inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium text-white transition-all"
                style={{ backgroundColor: showAddUserForm ? t.danger : t.success }}
              >
                {showAddUserForm ? (
                  <>
                    <X className="h-4 w-4" /> Batal
                  </>
                ) : (
                  <>
                    <UserPlus className="h-4 w-4" /> Daftarkan User
                  </>
                )}
              </button>
            </div>
          </div>
          <div className="px-6 pb-6">
            {/* GANTI PASSWORD */}
            <div
              className="rounded-lg border p-4 mb-6"
              style={{ borderColor: t.border, backgroundColor: t.bg }}
            >
              <button
                onClick={() => setShowChangePasswordForm(!showChangePasswordForm)}
                className="flex w-full items-center justify-between text-left"
              >
                <span
                  className="flex items-center gap-2 text-sm font-semibold font-space"
                  style={{ color: t.textMain }}
                >
                  <Lock className="h-4 w-4" style={{ color: t.textMuted }} />
                  Ganti Password Saya {currentUser?.username ? `(${currentUser.username})` : ""}
                </span>
                {showChangePasswordForm ? (
                  <X className="h-4 w-4" style={{ color: t.textMuted }} />
                ) : (
                  <Pencil className="h-4 w-4" style={{ color: t.textMuted }} />
                )}
              </button>

              {showChangePasswordForm && (
                <div className="mt-4 flex flex-col gap-3">
                  {/* Password Lama */}
                  <div className="relative">
                    <input
                      type={showCurrentPassword ? "text" : "password"}
                      value={currentPasswordInput}
                      onChange={(e) => setCurrentPasswordInput(e.target.value)}
                      placeholder="Password lama"
                      className="w-full rounded-md border px-3 py-2.5 pr-10 text-sm outline-none"
                      style={{
                        borderColor: t.inputBorder,
                        backgroundColor: t.inputBg,
                        color: t.textMain,
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowCurrentPassword((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2"
                      style={{ color: t.textMuted }}
                      tabIndex={-1}
                      aria-label={
                        showCurrentPassword ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"
                      }
                    >
                      {showCurrentPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>

                  <div className="flex flex-col gap-3 sm:flex-row">
                    {/* Password Baru */}
                    <div className="relative flex-1">
                      <input
                        type={showNewPasswordInput ? "text" : "password"}
                        value={newPasswordInput}
                        onChange={(e) => setNewPasswordInput(e.target.value)}
                        placeholder="Password baru (min. 8 karakter)"
                        className="w-full rounded-md border px-3 py-2.5 pr-10 text-sm outline-none"
                        style={{
                          borderColor: t.inputBorder,
                          backgroundColor: t.inputBg,
                          color: t.textMain,
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewPasswordInput((v) => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2"
                        style={{ color: t.textMuted }}
                        tabIndex={-1}
                        aria-label={
                          showNewPasswordInput ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"
                        }
                      >
                        {showNewPasswordInput ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    </div>

                    {/* Konfirmasi Password Baru */}
                    <div className="relative flex-1">
                      <input
                        type={showNewPasswordConfirmInput ? "text" : "password"}
                        value={newPasswordInputConfirm}
                        onChange={(e) => setNewPasswordInputConfirm(e.target.value)}
                        placeholder="Konfirmasi password baru"
                        className="w-full rounded-md border px-3 py-2.5 pr-10 text-sm outline-none"
                        style={{
                          borderColor: t.inputBorder,
                          backgroundColor: t.inputBg,
                          color: t.textMain,
                        }}
                        onKeyDown={(e) => e.key === "Enter" && handleChangePassword()}
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewPasswordConfirmInput((v) => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2"
                        style={{ color: t.textMuted }}
                        tabIndex={-1}
                        aria-label={
                          showNewPasswordConfirmInput
                            ? "Sembunyikan kata sandi"
                            : "Tampilkan kata sandi"
                        }
                      >
                        {showNewPasswordConfirmInput ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </div>
                  <button
                    onClick={handleChangePassword}
                    disabled={mutationChangePassword.isPending}
                    className="inline-flex items-center justify-center gap-2 rounded-md px-6 py-2.5 text-sm font-medium text-white self-start"
                    style={{ backgroundColor: t.primary }}
                  >
                    {mutationChangePassword.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <Save className="h-4 w-4" /> Simpan Password Baru
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>

            {/* DAFTARKAN USER BARU */}
            {showAddUserForm && (
              <div
                className="rounded-lg border p-4 space-y-3 mb-6"
                style={{ borderColor: t.border, backgroundColor: t.bg }}
              >
                <h3 className="text-sm font-semibold font-space" style={{ color: t.textMain }}>
                  Daftarkan User Baru
                </h3>
                <div className="flex flex-col gap-3">
                  <input
                    type="text"
                    value={newUsername}
                    onChange={(e) => setNewUsername(e.target.value)}
                    placeholder="Username (huruf/angka/underscore, min. 3 karakter)"
                    className="w-full rounded-md border px-3 py-2.5 text-sm outline-none"
                    style={{
                      borderColor: t.inputBorder,
                      backgroundColor: t.inputBg,
                      color: t.textMain,
                    }}
                  />

                  {/* Pilihan role: staff cuma bisa lihat dashboard & log (monitoring),
                      admin bisa akses semua termasuk halaman Pengaturan ini. */}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setNewUserRole("staff")}
                      className="flex-1 rounded-md border px-3 py-2 text-sm font-medium transition-colors"
                      style={
                        newUserRole === "staff"
                          ? {
                              borderColor: t.primary,
                              backgroundColor: t.primaryLight,
                              color: t.primary,
                            }
                          : { borderColor: t.border, color: t.textMuted }
                      }
                    >
                      Staff (monitoring saja)
                    </button>
                    <button
                      type="button"
                      onClick={() => setNewUserRole("admin")}
                      className="flex-1 rounded-md border px-3 py-2 text-sm font-medium transition-colors"
                      style={
                        newUserRole === "admin"
                          ? {
                              borderColor: t.primary,
                              backgroundColor: t.primaryLight,
                              color: t.primary,
                            }
                          : { borderColor: t.border, color: t.textMuted }
                      }
                    >
                      Admin (akses penuh)
                    </button>
                  </div>

                  <div className="flex flex-col gap-3 sm:flex-row">
                    {/* Password Baru */}
                    <div className="relative flex-1">
                      <input
                        type={showNewPassword ? "text" : "password"}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="Password (min. 8 karakter)"
                        className="w-full rounded-md border px-3 py-2.5 pr-10 text-sm outline-none"
                        style={{
                          borderColor: t.inputBorder,
                          backgroundColor: t.inputBg,
                          color: t.textMain,
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewPassword((v) => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2"
                        style={{ color: t.textMuted }}
                        tabIndex={-1}
                        aria-label={
                          showNewPassword ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"
                        }
                      >
                        {showNewPassword ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    </div>

                    {/* Konfirmasi Password */}
                    <div className="relative flex-1">
                      <input
                        type={showNewPasswordConfirm ? "text" : "password"}
                        value={newPasswordConfirm}
                        onChange={(e) => setNewPasswordConfirm(e.target.value)}
                        placeholder="Konfirmasi Password"
                        className="w-full rounded-md border px-3 py-2.5 pr-10 text-sm outline-none"
                        style={{
                          borderColor: t.inputBorder,
                          backgroundColor: t.inputBg,
                          color: t.textMain,
                        }}
                        onKeyDown={(e) => e.key === "Enter" && handleAddUser()}
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewPasswordConfirm((v) => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2"
                        style={{ color: t.textMuted }}
                        tabIndex={-1}
                        aria-label={
                          showNewPasswordConfirm ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"
                        }
                      >
                        {showNewPasswordConfirm ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </div>
                  <button
                    onClick={handleAddUser}
                    disabled={mutationAddUser.isPending}
                    className="inline-flex items-center justify-center gap-2 rounded-md px-6 py-2.5 text-sm font-medium text-white self-start"
                    style={{ backgroundColor: t.success }}
                  >
                    {mutationAddUser.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <Save className="h-4 w-4" /> Daftarkan
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}

            {usersLoading && (
              <div className="flex justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin" style={{ color: t.primary }} />
              </div>
            )}
            {usersError && (
              <div
                className="text-center py-8 rounded-md border"
                style={{ borderColor: t.danger, backgroundColor: t.dangerLight }}
              >
                <AlertCircle className="h-6 w-6 mx-auto mb-2" style={{ color: t.danger }} />
                <p className="text-sm" style={{ color: t.danger }}>
                  Gagal memuat daftar user
                </p>
                <button
                  onClick={() => queryClient.invalidateQueries({ queryKey: ["users"] })}
                  className="mt-2 text-xs"
                  style={{ color: t.primary }}
                >
                  <RefreshCw className="h-3 w-3 inline mr-1" />
                  Coba lagi
                </button>
              </div>
            )}
            {!usersLoading && !usersError && appUsers.length > 0 && (
              <div className="space-y-3">
                {appUsers.map((u) => {
                  const isSelf = u.id === currentUser?.userId;
                  return (
                    <div
                      key={u.id}
                      className="flex items-center justify-between gap-3 p-4 rounded-md border"
                      style={{ borderColor: t.border, backgroundColor: t.bg }}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className="h-8 w-8 shrink-0 rounded-full flex items-center justify-center text-sm font-bold"
                          style={{ backgroundColor: t.primaryLight, color: t.primary }}
                        >
                          {u.username.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p
                            className="text-sm font-semibold font-space truncate"
                            style={{ color: t.textMain }}
                          >
                            {u.username}
                            <span
                              className="ml-2 text-[10px] font-semibold px-2 py-0.5 rounded-full"
                              style={
                                u.role === "admin"
                                  ? { backgroundColor: t.primaryLight, color: t.primary }
                                  : { backgroundColor: t.border, color: t.textMuted }
                              }
                            >
                              {u.role === "admin" ? "Admin" : "Staff"}
                            </span>
                            {isSelf && (
                              <span
                                className="ml-2 text-[10px] font-semibold px-2 py-0.5 rounded-full"
                                style={{ backgroundColor: t.successLight, color: t.success }}
                              >
                                Anda
                              </span>
                            )}
                          </p>
                          <div
                            className="text-xs mt-0.5 flex items-center gap-2"
                            style={{ color: t.textMuted }}
                          >
                            <span>
                              Terdaftar {new Date(u.created_at).toLocaleDateString("id-ID")}
                            </span>
                            {!isSelf && (
                              <button
                                onClick={() => handleDeleteUser(u.id, u.username)}
                                disabled={mutationDeleteUser.isPending}
                                className="inline-flex shrink-0 items-center gap-1.5 rounded-md px-3 py-2 text-xs font-medium text-white"
                                style={{ backgroundColor: t.danger }}
                              >
                                <Trash2 className="h-3.5 w-3.5" /> Hapus
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ==================== AUDIT LOG ==================== */}
      <section
        className="mx-auto max-w-4xl mt-6 rounded-lg border transition-colors duration-300"
        style={{ borderColor: t.border, backgroundColor: t.card }}
      >
        <button
          onClick={() => setShowAuditLog((v) => !v)}
          className="flex w-full items-center justify-between px-5 py-4"
        >
          <div className="flex items-center gap-2">
            <NotebookText className="h-5 w-5" style={{ color: t.primary }} />
            <div className="text-left">
              <h2 className="text-sm font-semibold font-space" style={{ color: t.textMain }}>
                Audit Log
              </h2>
              <p className="text-xs" style={{ color: t.textMuted }}>
                Riwayat aktivitas admin: kelola user, kontak WA, dan penerima laporan
              </p>
            </div>
          </div>
          <ChevronDown
            className={`h-4 w-4 transition-transform ${showAuditLog ? "rotate-180" : ""}`}
            style={{ color: t.textMuted }}
          />
        </button>

        {showAuditLog && (
          <div className="px-5 pb-5 space-y-2">
            {auditLogLoading && (
              <p className="text-sm py-4 text-center" style={{ color: t.textMuted }}>
                Memuat audit log...
              </p>
            )}
            {auditLogError && (
              <p className="text-sm py-4 text-center" style={{ color: t.danger }}>
                Gagal memuat audit log.
              </p>
            )}
            {!auditLogLoading && !auditLogError && auditEntries.length === 0 && (
              <p className="text-sm py-4 text-center" style={{ color: t.textMuted }}>
                Belum ada aktivitas tercatat.
              </p>
            )}
            {!auditLogLoading &&
              !auditLogError &&
              auditEntries.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-start justify-between gap-3 rounded-md border px-3 py-2.5"
                  style={{ borderColor: t.border, backgroundColor: t.bg }}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium" style={{ color: t.textMain }}>
                      {AUDIT_ACTION_LABELS[entry.action] || entry.action}
                    </p>
                    <p className="text-xs mt-0.5 truncate" style={{ color: t.textMuted }}>
                      {entry.target_label || "-"}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs font-medium" style={{ color: t.textMain }}>
                      {entry.actor_username}
                    </p>
                    <p className="text-[11px] mt-0.5" style={{ color: t.textMuted }}>
                      {new Date(entry.created_at).toLocaleString("id-ID", {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                </div>
              ))}
          </div>
        )}
      </section>

      {/* Dialog konfirmasi */}
      <AlertDialog open={!!confirmDialog} onOpenChange={(open) => !open && setConfirmDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmDialog?.title}</AlertDialogTitle>
            <AlertDialogDescription>{confirmDialog?.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                confirmDialog?.onConfirm();
                setConfirmDialog(null);
              }}
            >
              Lanjutkan
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}
