import { object } from "zod";
import { API_BASE_URL } from "./api-config";

const TOKEN_KEY = "evidence_log_token";

// export function getToken(): string | null {
//   return localStorage.getItem(TOKEN_KEY);
// }
export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

// export function setToken(token: string): void {
//   localStorage.setItem(TOKEN_KEY, token);
// }
export function setToken(token: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(TOKEN_KEY, token);
}

// export function clearToken(): void {
//   localStorage.removeItem(TOKEN_KEY);
// }
export function clearToken(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(TOKEN_KEY);
}

// export function isAuthenticated(): boolean {
//   return !!getToken();
// }
export function isAuthenticated(): boolean {
  if (typeof window === "undefined") return false;
  return !!getToken();
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

/**
 * Baca info user dari token yang tersimpan (untuk keperluan tampilan saja, misal menyembunyikan tombol "hapus pada akun sendiri")
 * Jangan dipakai untuk keputusan keamanan apa pun - server selalu memberifikasi ulang tanda tangan
 * token di setiap request lewat requireAuth
 */
export function getCurrentUser(): { userId: number; username: string } | null {
  if (typeof window === "undefined") return null;
  const token = getToken();
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return { userId: payload.userId, username: payload.username };
  } catch {
    return null;
  }
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

export function logout(): void {
  clearToken();
  window.location.href = "/login";
}

export async function authFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const token = getToken();
  if (token && isTokenExpired()) {
    clearToken();
    if (typeof window !== "undefined" && window.location.pathname !== "/login") {
      window.location.href = "/login";
    }
    throw new Error("Token expired");
  }
  const headers = new Headers(init.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(input, { ...init, headers });

  if (res.status === 401) {
    clearToken();
    if (window.location.pathname !== "/login") {
      window.location.href = "/login";
    }
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
