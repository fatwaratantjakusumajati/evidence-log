import { API_BASE_URL } from "./api-config";

const TOKEN_KEY = "evidence_log_token";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(TOKEN_KEY);
}

export function isAuthenticated(): boolean {
  if (typeof window === "undefined") return false;
  return !!getToken() && !isTokenExpired();
}

export function isTokenExpired(): boolean {
  const token = getToken();
  if (!token) return true;
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    const now = Date.now() / 1000;
    return payload.exp < now;
  } catch {
    return true;
  }
}

// Sisa waktu (detik) sebelum token kadaluwarsa. null kalau tidak ada token /
// token rusak. Dipakai untuk memutuskan kapan silent refresh perlu dipicu.
export function getTokenSecondsRemaining(): number | null {
  const token = getToken();
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return payload.exp - Date.now() / 1000;
  } catch {
    return null;
  }
}

export function getCurrentUser(): {
  userId: number;
  username: string;
  role: "admin" | "staff";
} | null {
  if (typeof window === "undefined") return null;
  const token = getToken();
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    // PENTING: token lama (diterbitkan sebelum fitur role ditambahkan) tidak
    // punya field role sama sekali -- dianggap 'admin' supaya user yang sudah
    // ada tidak mendadak kehilangan akses. Setelah logout+login ulang, token
    // baru akan punya role yang benar dari database.
    return {
      userId: payload.userId,
      username: payload.username,
      role: payload.role === "staff" ? "staff" : "admin",
    };
  } catch {
    return null;
  }
}

// Helper cepat buat cek role admin -- dipakai di UI untuk sembunyikan/nonaktifkan
// fitur yang cuma boleh diakses admin (manajemen user, penerima WA/report, dll).
export function isAdmin(): boolean {
  return getCurrentUser()?.role === "admin";
}

export async function login(username: string, password: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || "Gagal login");
  }
  setToken(data.token);
}

// PERBAIKAN: sebelumnya token selalu kadaluwarsa dalam 30 menit tanpa cara
// memperpanjang selain login ulang total -- dashboard yang dibiarkan terbuka
// seharian untuk monitoring jadi minta login ulang tiap setengah jam.
// Fungsi ini dipanggil diam-diam di background sebelum token lama benar-benar
// kadaluwarsa (lihat __root.tsx), memperpanjang sesi tanpa mengganggu user.
// Mengembalikan `false` (tanpa melempar error) kalau refresh gagal, supaya
// caller bisa tahu harus menampilkan modal "sesi berakhir" atau tidak.
export async function refreshToken(): Promise<boolean> {
  const token = getToken();
  if (!token) return false;
  try {
    const res = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return false;
    const data = await res.json();
    if (!data.token) return false;
    setToken(data.token);
    return true;
  } catch {
    return false;
  }
}

export function logout(): void {
  clearToken();
  // JANGAN redirect di sini!
}

export async function authFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const token = getToken();
  if (token && isTokenExpired()) {
    clearToken();
    // Lempar error saja, UI yang handle
    throw new Error("Token expired");
  }

  const headers = new Headers(init.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(input, { ...init, headers });

  if (res.status === 401) {
    clearToken();
    throw new Error("Token expired");
  }
  return res;
}

export async function downloadFile(url: string, fallbackFilename = "download"): Promise<void> {
  const res = await authFetch(url);
  if (!res.ok) {
    throw new Error(`gagal mengunduh file (status ${res.status})`);
  }
  const blob = await res.blob();
  const disposition = res.headers.get("Content-Disposition") || "";
  const match = disposition.match(/filename="?([^"]+)"?/i);
  const filename = match?.[1] || fallbackFilename;

  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(objectUrl);
}
