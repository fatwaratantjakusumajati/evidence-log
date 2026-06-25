import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Save, Loader2, Plus, Trash2 } from "lucide-react";
import { useState, useEffect } from "react";

type WaRecipient = {
  id: number;
  nama: string;
  nomor: string;
  aktif: boolean;
  created_at: string;
};

export const Route = createFileRoute("/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [recipients, setRecipients] = useState<WaRecipient[]>([]);

  const [showAddForm, setShowAddForm] = useState(false);
  const [newNama, setNewNama] = useState("");
  const [newNomor, setNewNomor] = useState("");

  // 1. Ambil data
  const { data: waData, isLoading } = useQuery({
    queryKey: ["wa-recipients"],
    queryFn: async () => {
      const res = await fetch('http://localhost:5000/api/wa-recipients');
      if (!res.ok) throw new Error('Gagal mengambil data kontak');
      return res.json() as Promise<WaRecipient[]>;
    },
  });

  useEffect(() => {
    if (waData) setRecipients(waData);
  }, [waData]);

  // 2. Fungsi Update (Edit Nomor)
  const mutationUpdate = useMutation({
    mutationFn: async ({ id, nomor }: { id: number; nomor: string }) => {
      const res = await fetch(`http://localhost:5000/api/wa-recipients/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nomor }),
      });
      if (!res.ok) throw new Error('Gagal menyimpan');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["wa-recipients"] });
      alert('Nomor kontak berhasil diperbarui!');
    },
    onError: () => alert('Gagal menyimpan nomor kontak.'),
  });

  // 3. Fungsi Hapus
  const mutationDelete = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`http://localhost:5000/api/wa-recipients/${id}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Gagal menghapus kontak');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["wa-recipients"] });
      alert('Kontak berhasil dihapus!');
    },
    onError: () => alert('Gagal menghapus kontak.'),
  });

  // 4. Fungsi Tambah
  const mutationAdd = useMutation({
    mutationFn: async ({ nama, nomor }: { nama: string; nomor: string }) => {
      const res = await fetch(`http://localhost:5000/api/wa-recipients`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nama, nomor, aktif: true }),
      });
      if (!res.ok) throw new Error('Gagal menambahkan penerima');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["wa-recipients"] });
      setShowAddForm(false);
      setNewNama("");
      setNewNomor("");
      alert('Penerima WhatsApp berhasil ditambahkan!');
    },
    onError: () => alert('Gagal menambahkan penerima.'),
  });

  // --- EVENT HANDLER ---
  const handleEdit = (id: number) => {
    const recipient = recipients.find(r => r.id === id);
    if (!recipient || !recipient.nomor.trim()) return alert('Nomor WA tidak boleh kosong!');
    if (!confirm(`Apakah Anda yakin ingin mengubah nomor ${recipient.nama} menjadi ${recipient.nomor}?`)) return;
    mutationUpdate.mutate({ id: recipient.id, nomor: recipient.nomor });
  };

  const handleDelete = (id: number) => {
    if (!confirm('Apakah Anda yakin ingin menghapus kontak ini secara permanen?')) return;
    mutationDelete.mutate(id);
  };

  const handleAdd = () => {
    if (!newNama.trim() || !newNomor.trim()) return alert('Nama dan Nomor WA tidak boleh kosong!');
    mutationAdd.mutate({ nama: newNama, nomor: newNomor });
  };

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-20 border-b border-border bg-white/95 backdrop-blur-xl shadow-sm">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-6 py-4">
          <button onClick={() => navigate({ to: '/dashboard' })} className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"><ArrowLeft className="h-4 w-4" /></button>
          <h1 className="text-lg font-semibold tracking-tight text-foreground">Pengaturan Sistem</h1>
        </div>
      </header>

      <section className="mx-auto max-w-2xl px-6 py-8">
        <div className="rounded-lg border border-border bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-foreground">📱 Penerima WhatsApp</h2>
            <button 
              onClick={() => setShowAddForm(!showAddForm)}
              className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              <Plus className="h-3.5 w-3.5" /> Tambah
            </button>
          </div>
          <p className="text-sm text-muted-foreground mb-6">Edit nomor dengan mengubah teks lalu klik <b>Simpan</b>, atau klik <b>Hapus</b> untuk menghapus kontak.</p>

          {isLoading ? (
            <div className="flex items-center justify-center py-10"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
          ) : (
            <div className="space-y-6">
              
              {/* --- FORM TAMBAH --- */}
              {showAddForm && (
                <div className="bg-slate-50 p-4 rounded-lg border border-border space-y-3 mb-4">
                  <h3 className="text-sm font-medium text-foreground">Tambah Penerima Baru</h3>
                  <div className="flex flex-col gap-3 sm:flex-row">
                    <input type="text" value={newNama} onChange={(e) => setNewNama(e.target.value)} placeholder="Nama kontak" className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary" />
                    <input type="text" value={newNomor} onChange={(e) => setNewNomor(e.target.value)} placeholder="6281234567890" className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary" />
                    <button onClick={handleAdd} disabled={mutationAdd.isPending} className="inline-flex items-center justify-center rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-green-700 disabled:opacity-50">
                      {mutationAdd.isPending ? '...' : 'Simpan'}
                    </button>
                  </div>
                </div>
              )}

              {/* --- DAFTAR KONTAK --- */}
              {recipients.map((recipient) => (
                <div key={recipient.id} className="flex flex-col gap-2 border-b border-border/50 pb-4 last:border-0 last:pb-0">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-foreground">{recipient.nama}</label>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${recipient.aktif ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {recipient.aktif ? 'Aktif' : 'Tidak Aktif'}
                    </span>
                  </div>
                  
                  <div className="flex gap-2">
                    {/* --- INPUT UNTUK EDIT NOMOR --- */}
                    <input
                      type="text"
                      value={recipient.nomor}
                      onChange={(e) => setRecipients(prev => prev.map(r => r.id === recipient.id ? { ...r, nomor: e.target.value } : r))}
                      className="flex-1 rounded-md border border-border bg-background px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
                    />
                    
                    {/* --- TOMBOL EDIT / SIMPAN --- */}
                    <button onClick={() => handleEdit(recipient.id)} disabled={mutationUpdate.isPending} className="inline-flex items-center justify-center gap-1 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50">
                      <Save className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">Simpan</span>
                    </button>

                    {/* --- TOMBOL HAPUS --- */}
                    <button onClick={() => handleDelete(recipient.id)} disabled={mutationDelete.isPending} className="inline-flex items-center justify-center gap-1 rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50">
                      <Trash2 className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">Hapus</span>
                    </button>
                  </div>
                </div>
              ))}
              
              {recipients.length === 0 && !isLoading && (
                <p className="text-sm text-muted-foreground text-center py-4">Belum ada penerima WhatsApp yang terdaftar.</p>
              )}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}