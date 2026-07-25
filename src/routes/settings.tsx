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
  Upload,
  X,
  Clock,
  Coffee,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  Image as ImageIcon,
  Pencil,
  UserCheck,
} from "lucide-react";
import { useState, useEffect, useRef } from "react";
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

// ======================== TYPES ========================
type WaRecipient = {
  id: number;
  nama: string;
  nomor: string;
  aktif: boolean;
  created_at: string;
};

type BreakWindow = {
  start: string;
  end: string;
};

type EnrollResult = {
  employee_id: string;
  name: string;
  photos_received: number;
  face_photos_used: number;
  face_saved: boolean;
  break_windows_saved: boolean;
};

type Employee = {
  employee_id: string;
  name: string;
  arrival_time: string;
  departure_time: string;
  max_breaks_per_day: number;
  break_windows: BreakWindow[] | null;
  created_at: string;
};

// ======================== ROUTE ========================
export const Route = createFileRoute("/settings")({
  component: SettingsPage,
});

// ======================== COMPONENT ========================
function SettingsPage() {
  const queryClient = useQueryClient();
  const { theme } = useTheme();
  const isDarkMode = theme === "dark";
  const fileInputRef = useRef<HTMLInputElement>(null);

  const t = getSettingsPageColors(isDarkMode);

  // ======================== ENROLL STATE ========================
  const [showEnrollForm, setShowEnrollForm] = useState(false);
  // Dialog konfirmasi terpusat - menggantikan window.confirm() bawaan browser
  const [confirmDialog, setConfirmDialog] = useState<{
    title: string;
    description: string;
    onConfirm: () => void;
  } | null>(null);
  const [enrollEmployeeId, setEnrollEmployeeId] = useState("");
  const [enrollName, setEnrollName] = useState("");
  const [enrollArrivalTime, setEnrollArrivalTime] = useState("08:00");
  const [enrollDepartureTime, setEnrollDepartureTime] = useState("17:00");
  const [enrollBreakWindows, setEnrollBreakWindows] = useState<BreakWindow[]>([
    { start: "12:00", end: "13:00" },
  ]);
  const [enrollPhotos, setEnrollPhotos] = useState<File[]>([]);
  const [isReenrolling, setIsReenrolling] = useState(false);

  // ======================== EDIT STATE ========================
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [editName, setEditName] = useState("");
  const [editArrivalTime, setEditArrivalTime] = useState("08:00");
  const [editDepartureTime, setEditDepartureTime] = useState("17:00");
  const [editBreakWindows, setEditBreakWindows] = useState<BreakWindow[]>([
    { start: "12:00", end: "13:00" },
  ]);
  const [editPhotos, setEditPhotos] = useState<File[]>([]);
  const reEnrollFileRef = useRef<HTMLInputElement>(null);

  // ======================== WA STATE ========================
  const [showAddForm, setShowAddForm] = useState(false);
  const [newNama, setNewNama] = useState("");
  const [newNomor, setNewNomor] = useState("");
  const [editValues, setEditValues] = useState<Record<number, string>>({});

  // ======================== ENROLL MUTATION ========================
  const mutationEnroll = useMutation({
    mutationFn: async () => {
      if (!enrollEmployeeId.trim() || !enrollName.trim())
        throw new Error("Employee ID dan Nama wajib diisi");
      if (enrollPhotos.length === 0) throw new Error("Minimal 1 foto harus diupload");

      const validBreakWindows = enrollBreakWindows.filter((w) => w.start && w.end);

      const formData = new FormData();
      formData.append("employee_id", enrollEmployeeId.trim());
      formData.append("name", enrollName.trim());
      if (enrollArrivalTime) formData.append("arrival_time", enrollArrivalTime);
      if (enrollDepartureTime) formData.append("departure_time", enrollDepartureTime);
      if (validBreakWindows.length > 0)
        formData.append("break_windows", JSON.stringify(validBreakWindows));
      enrollPhotos.forEach((file) => formData.append("photos", file));

      const res = await fetch(`${API_BASE_URL}/api/attendance/enroll`, {
        method: "POST",
        body: formData,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Gagal melakukan enrollment");
      return json as EnrollResult;
    },
    onSuccess: (data) => {
      toast.success(`Karyawan "${data.name} berhasil didaftarkan!`);
      resetEnrollForm();
      queryClient.invalidateQueries({ queryKey: ["employees"] });
    },
    onError: (err: Error) => toast.error(`Gagal: ${err.message}`),
  });

  // ======================== EMPLOYEES QUERY ========================
  const {
    data: employeesData,
    isLoading: employeesLoading,
    isError: employeesError,
  } = useQuery({
    queryKey: ["employees"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE_URL}/api/attendance/employees/all`);
      if (!res.ok) throw new Error("Gagal mengambil data karyawan");
      return res.json() as Promise<Employee[]>;
    },
  });
  const employees = employeesData || [];

  // ======================== UPDATE MUTATION ========================
  const mutationUpdateEmployee = useMutation({
    mutationFn: async (emp: {
      employee_id: string;
      name: string;
      arrival_time: string;
      departure_time: string;
      break_windows: BreakWindow[];
    }) => {
      const res = await fetch(`${API_BASE_URL}/api/attendance/employees/${emp.employee_id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(emp),
      });
      if (!res.ok) throw new Error("Gagal mengupdate");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      setEditingEmployee(null);
      alert("Data karyawan berhasil diperbarui!");
    },
    onError: (err: Error) => alert(`Gagal: ${err.message}`),
  });

  // ======================== DELETE MUTATION ========================
  const mutationDeleteEmployee = useMutation({
    mutationFn: async (employeeId: string) => {
      const res = await fetch(`${API_BASE_URL}/api/attendance/employees/${employeeId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Gagal menghapus");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      alert("Karyawan berhasil dihapus!");
    },
    onError: (err: Error) => alert(`Gagal: ${err.message}`),
  });

  // ======================== WA QUERY ========================
  const {
    data: waData,
    isLoading: waLoading,
    isError: waError,
  } = useQuery({
    queryKey: ["wa-recipients"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE_URL}/api/wa-recipients`);
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
      const res = await fetch(`${API_BASE_URL}/api/wa-recipients/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nomor }),
      });
      if (!res.ok) throw new Error("Gagal menyimpan");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["wa-recipients"] });
      alert("Nomor kontak berhasil diperbarui!");
    },
    onError: (err: Error) => alert(`Gagal: ${err.message}`),
  });

  const mutationDelete = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`${API_BASE_URL}/api/wa-recipients/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Gagal menghapus kontak");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["wa-recipients"] });
      alert("Kontak berhasil dihapus!");
    },
    onError: (err: Error) => alert(`Gagal: ${err.message}`),
  });

  const mutationAdd = useMutation({
    mutationFn: async ({ nama, nomor }: { nama: string; nomor: string }) => {
      const res = await fetch(`${API_BASE_URL}/api/wa-recipients`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nama, nomor, aktif: true }),
      });
      if (!res.ok) throw new Error("Gagal menambahkan penerima");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["wa-recipients"] });
      setShowAddForm(false);
      setNewNama("");
      setNewNomor("");
      alert("Penerima WhatsApp berhasil ditambahkan!");
    },
    onError: (err: Error) => alert(`Gagal: ${err.message}`),
  });

  // ======================== HANDLERS ========================
  const handleEnrollPhotosChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    setEnrollPhotos((prev) => [...prev, ...Array.from(e.target.files!)]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeEnrollPhoto = (i: number) =>
    setEnrollPhotos((prev) => prev.filter((_, idx) => idx !== i));

  const addBreakWindow = (isEdit = false) => {
    if (isEdit) setEditBreakWindows((prev) => [...prev, { start: "", end: "" }]);
    else setEnrollBreakWindows((prev) => [...prev, { start: "", end: "" }]);
  };

  const removeBreakWindow = (i: number, isEdit = false) => {
    if (isEdit) setEditBreakWindows((prev) => prev.filter((_, idx) => idx !== i));
    else setEnrollBreakWindows((prev) => prev.filter((_, idx) => idx !== i));
  };

  const updateBreakWindow = (i: number, field: "start" | "end", value: string, isEdit = false) => {
    if (isEdit)
      setEditBreakWindows((prev) =>
        prev.map((w, idx) => (idx === i ? { ...w, [field]: value } : w)),
      );
    else
      setEnrollBreakWindows((prev) =>
        prev.map((w, idx) => (idx === i ? { ...w, [field]: value } : w)),
      );
  };

  const openEditModal = (emp: Employee) => {
    setEditingEmployee(emp);
    setEditName(emp.name);
    setEditArrivalTime(emp.arrival_time || "08:00");
    setEditDepartureTime(emp.departure_time || "17:00");

    // Parse break_windows dengan aman
    let bw = emp.break_windows;
    if (typeof bw === "string") {
      try {
        bw = JSON.parse(bw);
      } catch {
        bw = null;
      }
    }
    if (Array.isArray(bw) && bw.length > 0) {
      setEditBreakWindows(bw);
    } else {
      setEditBreakWindows([{ start: "12:00", end: "13:00" }]);
    }
  };

  const handleSaveEdit = async () => {
    if (!editingEmployee || !editName.trim()) return toast.warning("Nama tidak boleh kosong!");

    const validBreakWindows = editBreakWindows.filter((w) => w.start && w.end);

    const formData = new FormData();
    formData.append("name", editName.trim());
    formData.append("arrival_time", editArrivalTime);
    formData.append("departure_time", editDepartureTime);
    if (validBreakWindows.length > 0) {
      formData.append("break_windows", JSON.stringify(validBreakWindows));
    }
    editPhotos.forEach((file) => formData.append("photos", file));

    setIsReenrolling(true); // ← MULAI LOADING

    try {
      const res = await fetch(
        `${API_BASE_URL}/api/attendance/employees/${editingEmployee.employee_id}/reenroll`,
        { method: "PUT", body: formData },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal");

      queryClient.invalidateQueries({ queryKey: ["employees"] });
      setEditingEmployee(null);
      setEditPhotos([]);
      alert(
        `Berhasil!\nFace: ${data.face_updated ? "Ya" : "Tidak"} | Pose: ${data.pose_updated ? "Ya" : "Tidak"}`,
      );
    } catch (err: any) {
      alert(`Gagal: ${err.message}`);
    } finally {
      setIsReenrolling(false); // ← STOP LOADING
    }
  };

  const handleDeleteEmployee = (id: string, name: string) => {
    setConfirmDialog({
      title: "Hapus Karyawan",
      description: `Hapus karyawan "${name}" (${id})? Tindakan ini tidak bisa dibatalkan. `,
      onConfirm: () => mutationDeleteEmployee.mutate(id),
    });
  };

  const handleUpdateRecipient = (id: number) => {
    const recipient = recipients.find((r) => r.id === id);
    const newNomor = editValues[id]?.trim();
    if (!recipient || !newNomor) return alert("Nomor WA tidak boleh kosong!");
    if (newNomor === recipient.nomor) return toast.info("Tidak ada perubahan");
    setConfirmDialog({
      title: "Ubah Nomor Whatsapp",
      description: `Ubah nomor ${recipient.nama}? Dari ${recipient.nomor} menjadi ${newNomor}. `,
      onConfirm: () => mutationUpdate.mutate({ id, nomor: newNomor }),
    });
  };

  const handleDeleteRecipient = (id: number) => {
    const recipient = recipients.find((r) => r.id === id);
    if (!recipient) return;
    setConfirmDialog({
      title: "Hapus Kontak",
      description: `Hapus kontak "${recipient.nama}"? TIndakan ini tidak bisa dibatalkan. `,
      onConfirm: () => mutationDelete.mutate(id),
    });
  };

  const handleAddRecipient = () => {
    if (!newNama.trim() || !newNomor.trim()) return alert("Nama dan Nomor WA wajib diisi!");
    if (!/^[0-9]{10,15}$/.test(newNomor.trim())) return alert("Format nomor WA tidak valid.");
    mutationAdd.mutate({ nama: newNama.trim(), nomor: newNomor.trim() });
  };

  const resetEnrollForm = () => {
    setShowEnrollForm(false);
    setEnrollEmployeeId("");
    setEnrollName("");
    setEnrollArrivalTime("08:00");
    setEnrollDepartureTime("17:00");
    setEnrollBreakWindows([{ start: "12:00", end: "13:00" }]);
    setEnrollPhotos([]);
  };

  // ======================== RENDER ========================
  return (
    <main
      className="flex-1 min-h-screen transition-colors duration-300"
      style={{ backgroundColor: t.bg, color: t.textMain }}
    >
      <header
        className="sticky top-0 z-20 border-b transition-colors duration-300 backdrop-blur-xl"
        style={{ backgroundColor: t.headerBg, borderColor: t.border }}
      >
        <div className="mx-auto max-w-[1440px] px-6 py-4">
          <div className="mb-4">
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbLink asChild>
                    <Link
                      to="/dashboard"
                      className="hover:opacity-80 transition-opacity font-mono text-sm"
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

      <section className="mx-auto max-w-[1440px] px-6 py-6 space-y-6">
        {/* ==================== CARD 1: ENROLL KARYAWAN ==================== */}
        <div
          className="rounded-lg border shadow-sm"
          style={{ borderColor: t.border, backgroundColor: t.card }}
        >
          <div className="p-6 pb-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg" style={{ backgroundColor: t.primaryLight }}>
                  <UserPlus className="h-5 w-5" style={{ color: t.primary }} />
                </div>
                <div>
                  <h2 className="text-base font-semibold font-space" style={{ color: t.textMain }}>
                    Enroll Karyawan
                  </h2>
                  <p className="text-xs font-mono mt-0.5" style={{ color: t.textMuted }}>
                    Daftarkan karyawan baru untuk pengenalan wajah
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowEnrollForm(!showEnrollForm)}
                className="inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium font-mono text-white transition-all"
                style={{ backgroundColor: showEnrollForm ? t.danger : t.primary }}
              >
                {showEnrollForm ? (
                  <>
                    <X className="h-4 w-4" /> Tutup
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4" /> Tambah
                  </>
                )}
              </button>
            </div>
          </div>
          {showEnrollForm && (
            <div className="px-6 pb-6">
              <div
                className="rounded-lg border p-5 space-y-5"
                style={{ borderColor: t.border, backgroundColor: t.bg }}
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label
                      className="text-xs font-mono mb-1.5 block font-medium"
                      style={{ color: t.textMain }}
                    >
                      Employee ID <span style={{ color: t.danger }}>*</span>
                    </label>
                    <input
                      type="text"
                      value={enrollEmployeeId}
                      onChange={(e) => setEnrollEmployeeId(e.target.value)}
                      placeholder="EMP001"
                      className="w-full rounded-md border px-3 py-2.5 text-sm outline-none font-mono"
                      style={{
                        borderColor: t.inputBorder,
                        backgroundColor: t.inputBg,
                        color: t.textMain,
                      }}
                    />
                  </div>
                  <div>
                    <label
                      className="text-xs font-mono mb-1.5 block font-medium"
                      style={{ color: t.textMain }}
                    >
                      Nama <span style={{ color: t.danger }}>*</span>
                    </label>
                    <input
                      type="text"
                      value={enrollName}
                      onChange={(e) => setEnrollName(e.target.value)}
                      placeholder="John Doe"
                      className="w-full rounded-md border px-3 py-2.5 text-sm outline-none"
                      style={{
                        borderColor: t.inputBorder,
                        backgroundColor: t.inputBg,
                        color: t.textMain,
                      }}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label
                      className="text-xs font-mono mb-1.5 block font-medium"
                      style={{ color: t.textMain }}
                    >
                      <Clock className="h-3 w-3 inline mr-1" />
                      Jam Masuk
                    </label>
                    <input
                      type="time"
                      value={enrollArrivalTime}
                      onChange={(e) => setEnrollArrivalTime(e.target.value)}
                      className="w-full rounded-md border px-3 py-2.5 text-sm outline-none font-mono"
                      style={{
                        borderColor: t.inputBorder,
                        backgroundColor: t.inputBg,
                        color: t.textMain,
                      }}
                    />
                  </div>
                  <div>
                    <label
                      className="text-xs font-mono mb-1.5 block font-medium"
                      style={{ color: t.textMain }}
                    >
                      <Clock className="h-3 w-3 inline mr-1" />
                      Jam Pulang
                    </label>
                    <input
                      type="time"
                      value={enrollDepartureTime}
                      onChange={(e) => setEnrollDepartureTime(e.target.value)}
                      className="w-full rounded-md border px-3 py-2.5 text-sm outline-none font-mono"
                      style={{
                        borderColor: t.inputBorder,
                        backgroundColor: t.inputBg,
                        color: t.textMain,
                      }}
                    />
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-mono font-medium" style={{ color: t.textMain }}>
                      <Coffee className="h-3 w-3 inline mr-1" />
                      Sesi Istirahat
                    </label>
                    <button
                      type="button"
                      onClick={() => addBreakWindow()}
                      className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-mono"
                      style={{ borderColor: t.primary, color: t.primary }}
                    >
                      <Plus className="h-3 w-3" /> Tambah
                    </button>
                  </div>
                  <div className="space-y-2">
                    {enrollBreakWindows.map((w, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <span
                          className="text-xs font-mono w-14 shrink-0"
                          style={{ color: t.textMuted }}
                        >
                          Sesi {idx + 1}
                        </span>
                        <input
                          type="time"
                          value={w.start}
                          onChange={(e) => updateBreakWindow(idx, "start", e.target.value)}
                          className="flex-1 rounded-md border px-2 py-2 text-sm outline-none font-mono"
                          style={{
                            borderColor: t.inputBorder,
                            backgroundColor: t.inputBg,
                            color: t.textMain,
                          }}
                        />
                        <span className="text-xs font-mono" style={{ color: t.textMuted }}>
                          s/d
                        </span>
                        <input
                          type="time"
                          value={w.end}
                          onChange={(e) => updateBreakWindow(idx, "end", e.target.value)}
                          className="flex-1 rounded-md border px-2 py-2 text-sm outline-none font-mono"
                          style={{
                            borderColor: t.inputBorder,
                            backgroundColor: t.inputBg,
                            color: t.textMain,
                          }}
                        />
                        <button onClick={() => removeBreakWindow(idx)} style={{ color: t.danger }}>
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <label
                    className="text-xs font-mono mb-1.5 block font-medium"
                    style={{ color: t.textMain }}
                  >
                    <ImageIcon className="h-3 w-3 inline mr-1" />
                    Foto <span style={{ color: t.danger }}>*</span>
                  </label>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={(e) => {
                      console.log("File selected:", e.target.files);
                      if (e.target.files && e.target.files.length > 0) {
                        const newFiles = Array.from(e.target.files);
                        console.log(
                          "Adding:",
                          newFiles.map((f) => f.name),
                        );
                        setEnrollPhotos((prev) => [...prev, ...newFiles]);
                        e.target.value = "";
                      }
                    }}
                    style={{ display: "none" }}
                    id="enroll-file-input"
                  />
                  <div
                    onClick={() => {
                      const input = document.getElementById(
                        "enroll-file-input",
                      ) as HTMLInputElement;
                      input?.click();
                    }}
                    className="flex flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed px-4 py-8 cursor-pointer"
                    style={{ borderColor: t.primary }}
                  >
                    <Upload className="h-6 w-6" style={{ color: t.primary }} />
                    <span className="text-sm font-mono" style={{ color: t.primary }}>
                      Klik untuk pilih foto
                    </span>
                    <span className="text-xs font-mono" style={{ color: t.textMuted }}>
                      {enrollPhotos.length > 0
                        ? `Terpilih ${enrollPhotos.length} foto`
                        : "Bisa pilih beberapa foto"}
                    </span>
                  </div>
                  {enrollPhotos.length > 0 && (
                    <div className="mt-3 grid grid-cols-4 gap-2">
                      {enrollPhotos.map((file, idx) => (
                        <div
                          key={idx}
                          className="relative rounded-md border overflow-hidden group"
                          style={{ borderColor: t.border }}
                        >
                          <img
                            src={URL.createObjectURL(file)}
                            alt=""
                            className="h-16 w-full object-cover"
                          />
                          <button
                            onClick={() => removeEnrollPhoto(idx)}
                            className="absolute top-1 right-1 rounded-full bg-black/60 p-0.5 text-white opacity-0 group-hover:opacity-100"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div
                  className="flex justify-end gap-3 pt-3 border-t"
                  style={{ borderColor: t.border }}
                >
                  <button
                    onClick={resetEnrollForm}
                    className="rounded-md border px-4 py-2 text-sm font-mono"
                    style={{ borderColor: t.border, color: t.textMain }}
                  >
                    Batal
                  </button>
                  <button
                    onClick={() => mutationEnroll.mutate()}
                    disabled={mutationEnroll.isPending}
                    className="inline-flex items-center gap-2 rounded-md px-6 py-2 text-sm font-medium text-white"
                    style={{ backgroundColor: t.primary }}
                  >
                    {mutationEnroll.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" /> Mendaftarkan...
                      </>
                    ) : (
                      <>
                        <Save className="h-4 w-4" /> Daftarkan
                      </>
                    )}{" "}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ==================== CARD 2: DAFTAR KARYAWAN (NEW!) ==================== */}
        <div
          className="rounded-lg border shadow-sm"
          style={{ borderColor: t.border, backgroundColor: t.card }}
        >
          <div className="p-6 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg" style={{ backgroundColor: t.warningLight }}>
                <UserCheck className="h-5 w-5" style={{ color: t.warning }} />
              </div>
              <div>
                <h2 className="text-base font-semibold font-space" style={{ color: t.textMain }}>
                  Daftar Karyawan Terdaftar
                </h2>
                <p className="text-xs font-mono mt-0.5" style={{ color: t.textMuted }}>
                  Kelola data karyawan yang sudah terdaftar
                </p>
              </div>
            </div>
          </div>
          <div className="px-6 pb-6">
            {employeesLoading && (
              <div className="flex justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin" style={{ color: t.primary }} />
              </div>
            )}
            {employeesError && (
              <div
                className="text-center py-8 rounded-md border"
                style={{ borderColor: t.danger, backgroundColor: t.dangerLight }}
              >
                <AlertCircle className="h-6 w-6 mx-auto mb-2" style={{ color: t.danger }} />
                <p className="text-sm font-mono" style={{ color: t.danger }}>
                  Gagal memuat data
                </p>
                <button
                  onClick={() => queryClient.invalidateQueries({ queryKey: ["employees"] })}
                  className="mt-2 text-xs font-mono"
                  style={{ color: t.primary }}
                >
                  <RefreshCw className="h-3 w-3 inline mr-1" />
                  Coba lagi
                </button>
              </div>
            )}
            {!employeesLoading && !employeesError && employees.length === 0 && (
              <div
                className="text-center py-12 rounded-md border border-dashed"
                style={{ borderColor: t.border }}
              >
                <Users className="h-10 w-10 mx-auto mb-3" style={{ color: t.textMuted }} />
                <p className="text-sm font-mono" style={{ color: t.textMuted }}>
                  Belum ada karyawan terdaftar
                </p>
              </div>
            )}
            {!employeesLoading && !employeesError && employees.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b" style={{ borderColor: t.border }}>
                      <th
                        className="text-left py-3 px-3 text-xs font-mono font-semibold"
                        style={{ color: t.textMuted }}
                      >
                        ID
                      </th>
                      <th
                        className="text-left py-3 px-3 text-xs font-mono font-semibold"
                        style={{ color: t.textMuted }}
                      >
                        Nama
                      </th>
                      <th
                        className="text-left py-3 px-3 text-xs font-mono font-semibold"
                        style={{ color: t.textMuted }}
                      >
                        Masuk
                      </th>
                      <th
                        className="text-left py-3 px-3 text-xs font-mono font-semibold"
                        style={{ color: t.textMuted }}
                      >
                        Pulang
                      </th>
                      <th
                        className="text-left py-3 px-3 text-xs font-mono font-semibold"
                        style={{ color: t.textMuted }}
                      >
                        Istirahat
                      </th>
                      <th
                        className="text-right py-3 px-3 text-xs font-mono font-semibold"
                        style={{ color: t.textMuted }}
                      >
                        Aksi
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {employees.map((emp) => (
                      <tr
                        key={emp.employee_id}
                        className="border-b last:border-0"
                        style={{ borderColor: t.border }}
                      >
                        <td className="py-3 px-3 font-mono text-xs" style={{ color: t.primary }}>
                          {emp.employee_id}
                        </td>
                        <td className="py-3 px-3 font-mono text-xs" style={{ color: t.textMain }}>
                          {emp.name}
                        </td>
                        <td className="py-3 px-3 font-mono text-xs" style={{ color: t.textMuted }}>
                          {emp.arrival_time || "-"}
                        </td>
                        <td className="py-3 px-3 font-mono text-xs" style={{ color: t.textMuted }}>
                          {emp.departure_time || "-"}
                        </td>
                        <td className="py-3 px-3 font-mono text-xs" style={{ color: t.textMuted }}>
                          {/* {emp.break_windows?.length
                            ? emp.break_windows.map((bw) => `${bw.start}-${bw.end}`).join(", ")
                            : "-"} */}
                          {(() => {
                            try {
                              const bw =
                                typeof emp.break_windows === "string"
                                  ? JSON.parse(emp.break_windows)
                                  : emp.break_windows;
                              if (Array.isArray(bw) && bw.length > 0) {
                                return bw.map((b: any) => `${b.start}-${b.end}`).join(", ");
                              }
                              return "-";
                            } catch {
                              return "-";
                            }
                          })()}
                        </td>
                        <td className="py-3 px-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => openEditModal(emp)}
                              className="p-1.5 rounded-md"
                              style={{ color: t.primary }}
                              title="Edit"
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => handleDeleteEmployee(emp.employee_id, emp.name)}
                              className="p-1.5 rounded-md"
                              style={{ color: t.danger }}
                              title="Hapus"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

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
                  <p className="text-xs font-mono mt-0.5" style={{ color: t.textMuted }}>
                    Kelola kontak penerima notifikasi
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowAddForm(!showAddForm)}
                className="inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium font-mono text-white transition-all"
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
                    className="flex-1 rounded-md border px-3 py-2.5 text-sm outline-none font-mono"
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
                <p className="text-sm font-mono" style={{ color: t.danger }}>
                  Gagal memuat data
                </p>
                <button
                  onClick={() => queryClient.invalidateQueries({ queryKey: ["wa-recipients"] })}
                  className="mt-2 text-xs font-mono"
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
                <p className="text-sm font-mono" style={{ color: t.textMuted }}>
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
                          className="h-8 w-8 rounded-full flex items-center justify-center font-mono text-sm font-bold"
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
                        className="text-[10px] font-semibold px-2.5 py-1 rounded-full font-mono inline-flex items-center gap-1.5"
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
                        className="flex-1 rounded-md border px-3 py-2.5 text-sm outline-none font-mono"
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
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ==================== MODAL EDIT KARYAWAN ==================== */}
      {/* ==================== MODAL EDIT KARYAWAN ==================== */}
      {editingEmployee && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm"
          onClick={() => {
            setEditingEmployee(null);
            setEditPhotos([]);
          }}
        >
          <div
            className="bg-white dark:bg-[#1e293b] rounded-lg shadow-xl p-6 max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
            style={{ backgroundColor: t.card }}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold font-space" style={{ color: t.textMain }}>
                Edit: {editingEmployee.employee_id}
              </h3>
              <button
                onClick={() => {
                  setEditingEmployee(null);
                  setEditPhotos([]);
                }}
                style={{ color: t.textMuted }}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label
                  className="text-xs font-mono mb-1.5 block font-medium"
                  style={{ color: t.textMain }}
                >
                  Nama
                </label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  disabled={isReenrolling}
                  className="w-full rounded-md border px-3 py-2.5 text-sm outline-none font-mono disabled:opacity-50"
                  style={{
                    borderColor: t.inputBorder,
                    backgroundColor: t.inputBg,
                    color: t.textMain,
                  }}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label
                    className="text-xs font-mono mb-1.5 block font-medium"
                    style={{ color: t.textMain }}
                  >
                    <Clock className="h-3 w-3 inline mr-1" />
                    Jam Masuk
                  </label>
                  <input
                    type="time"
                    value={editArrivalTime}
                    onChange={(e) => setEditArrivalTime(e.target.value)}
                    disabled={isReenrolling}
                    className="w-full rounded-md border px-3 py-2.5 text-sm outline-none font-mono disabled:opacity-50"
                    style={{
                      borderColor: t.inputBorder,
                      backgroundColor: t.inputBg,
                      color: t.textMain,
                    }}
                  />
                </div>
                <div>
                  <label
                    className="text-xs font-mono mb-1.5 block font-medium"
                    style={{ color: t.textMain }}
                  >
                    <Clock className="h-3 w-3 inline mr-1" />
                    Jam Pulang
                  </label>
                  <input
                    type="time"
                    value={editDepartureTime}
                    onChange={(e) => setEditDepartureTime(e.target.value)}
                    disabled={isReenrolling}
                    className="w-full rounded-md border px-3 py-2.5 text-sm outline-none font-mono disabled:opacity-50"
                    style={{
                      borderColor: t.inputBorder,
                      backgroundColor: t.inputBg,
                      color: t.textMain,
                    }}
                  />
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-mono font-medium" style={{ color: t.textMain }}>
                    <Coffee className="h-3 w-3 inline mr-1" />
                    Sesi Istirahat
                  </label>
                  <button
                    type="button"
                    onClick={() => addBreakWindow(true)}
                    className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-mono"
                    style={{ borderColor: t.primary, color: t.primary }}
                  >
                    <Plus className="h-3 w-3" /> Tambah
                  </button>
                </div>
                <div className="space-y-2">
                  {editBreakWindows.map((w, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <span
                        className="text-xs font-mono w-14 shrink-0"
                        style={{ color: t.textMuted }}
                      >
                        Sesi {idx + 1}
                      </span>
                      <input
                        type="time"
                        value={w.start}
                        onChange={(e) => updateBreakWindow(idx, "start", e.target.value, true)}
                        disabled={isReenrolling}
                        className="flex-1 rounded-md border px-2 py-2 text-sm outline-none font-mono disabled:opacity-50"
                        style={{
                          borderColor: t.inputBorder,
                          backgroundColor: t.inputBg,
                          color: t.textMain,
                        }}
                      />
                      <span className="text-xs font-mono" style={{ color: t.textMuted }}>
                        s/d
                      </span>
                      <input
                        type="time"
                        value={w.end}
                        onChange={(e) => updateBreakWindow(idx, "end", e.target.value, true)}
                        disabled={isReenrolling}
                        className="flex-1 rounded-md border px-2 py-2 text-sm outline-none font-mono disabled:opacity-50"
                        style={{
                          borderColor: t.inputBorder,
                          backgroundColor: t.inputBg,
                          color: t.textMain,
                        }}
                      />
                      <button
                        onClick={() => removeBreakWindow(idx, true)}
                        style={{ color: t.danger }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* UPLOAD FOTO */}
              {/* UPLOAD FOTO - CARA SIMPEL */}
              <div>
                <label
                  className="text-xs font-mono mb-1.5 block font-medium"
                  style={{ color: t.textMain }}
                >
                  <Upload className="h-3 w-3 inline mr-1" />
                  Foto Baru (opsional)
                </label>

                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={(e) => {
                    console.log("Edit photo selected:", e.target.files);
                    if (e.target.files && e.target.files.length > 0) {
                      const newFiles = Array.from(e.target.files);
                      console.log(
                        "Adding files:",
                        newFiles.map((f) => f.name),
                      );
                      setEditPhotos((prev) => [...prev, ...newFiles]);
                      e.target.value = "";
                    }
                  }}
                  disabled={isReenrolling}
                  className="w-full rounded-md border px-3 py-2 text-sm font-mono disabled:opacity-50"
                  style={{
                    borderColor: t.inputBorder,
                    backgroundColor: t.inputBg,
                    color: t.textMain,
                  }}
                />

                {editPhotos.length > 0 && (
                  <div className="mt-2 text-xs font-mono" style={{ color: t.success }}>
                    <CheckCircle2 className="h-3 w-3 inline mr-1" />
                    {editPhotos.length} foto dipilih
                  </div>
                )}
              </div>
            </div>

            <div
              className="flex justify-end gap-3 mt-6 pt-4 border-t"
              style={{ borderColor: t.border }}
            >
              <button
                onClick={() => {
                  setEditingEmployee(null);
                  setEditPhotos([]);
                }}
                disabled={isReenrolling}
                className="rounded-md border px-4 py-2 text-sm font-mono disabled:opacity-50"
                style={{ borderColor: t.border, color: t.textMain }}
              >
                Batal
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={isReenrolling}
                className="inline-flex items-center gap-2 rounded-md px-6 py-2 text-sm font-medium text-white"
                style={{ backgroundColor: t.primary }}
              >
                {isReenrolling ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Menyimpan...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4" /> Simpan
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Dialog konfirmasi terpusat, menggantikan window.confirm() */}
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
