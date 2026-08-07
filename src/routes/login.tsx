import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Eye, EyeOff, Loader2, Lock, User } from "lucide-react";
import { toast } from "sonner";
import { login, isAuthenticated } from "@/lib/auth";
import warehouseVideo from "@/assets/warehouse-bg.mp4";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [{ title: "Login - Arsip Bukti Kejadian" }],
  }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (isAuthenticated()) {
      navigate({ to: "/dashboard" });
    }
  }, []);
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      toast.warning("Username dan password wajib diisi");
      return;
    }
    setIsLoading(true);
    try {
      await login(username.trim(), password);
      toast.success("Login berhasil");
      navigate({ to: "/dashboard" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal login");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10">
      {/* Background Video */}
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10">
        <video
          src={warehouseVideo}
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          disableRemotePlayback
          disablePictureInPicture
          className="h-full w-full object-cover"
          style={{ filter: "brightness(0.55) contrast(1.1) saturate(0.85)" }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/50 to-black/80" />
        <div className="absolute inset-0 backdrop-blur-[2px]" />
      </div>

      {/* Login Card */}
      {/* Login Card - Background putih cerah tetap dipertahankan */}
      <div
        className="relative w-full max-w-sm rounded-3xl p-8"
        style={{
          background: "linear-gradient(145deg, #eef1f6, #d8dde6)",
          boxShadow: "20px 20px 60px rgba(0,0,0,0.35), -12px -12px 30px rgba(255,255,255,0.5)",
        }}
      >
        <div className="flex flex-col items-center">
          <div
            className="mb-5 flex h-16 w-16 items-center justify-center rounded-full"
            style={{
              background: "linear-gradient(145deg, #e2e6ed, #f4f6f9)",
              boxShadow:
                "inset 4px 4px 8px rgba(0, 0, 0, 0.08), inset -4px -4px 8px rgba(255, 255, 255, 0.7)",
            }}
          >
            <User className="h-7 w-7 text-slate-800" /> {/* Icon digelapkan */}
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Welcome Back!</h1> {/* Hitam pekat */}
          <p className="mt-1 text-sm text-slate-700">Masuk untuk melanjutkan</p> {/* Abu tua */}
        </div>

        <form onSubmit={handleSubmit} className="mt-7 flex flex-col gap-5">
          {/* Username Field */}
          <div
            className="flex items-center gap-3 rounded-xl px-4 py-3"
            style={{
              background: "linear-gradient(145deg, #d8dde6, #eef1f6)",
              boxShadow:
                "inset 3px 3px 6px rgba(0,0,0,0.1), inset -3px -3px 6px rgba(255,255,255,0.6)",
            }}
          >
            <User className="h-5 w-5 text-slate-500" />
            <input
              type="text"
              placeholder="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full bg-transparent focus:outline-none"
              style={{ color: "#0f172a" }} // ✅ MEMAKSA WARNA TEKS HITAM SLATE-900
              disabled={isLoading}
              autoComplete="username"
            />
          </div>

          {/* Password Field */}
          <div
            className="flex items-center gap-3 rounded-xl px-4 py-3"
            style={{
              background: "linear-gradient(145deg, #d8dde6, #eef1f6)",
              boxShadow:
                "inset 3px 3px 6px rgba(0,0,0,0.1), inset -3px -3px 6px rgba(255,255,255,0.6)",
            }}
          >
            <Lock className="h-5 w-5 text-slate-500" />
            <input
              type={showPassword ? "text" : "password"}
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-transparent focus:outline-none"
              style={{ color: "#0f172a" }} // ✅ MEMAKSA WARNA TEKS HITAM SLATE-900
              disabled={isLoading}
              autoComplete="current-password"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="shrink-0 text-slate-500 hover:text-slate-800 transition-colors"
              tabIndex={-1}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>

          {/* Submit Button - Tetap putih tapi text gelap */}
          <button
            type="submit"
            disabled={isLoading}
            className="mt-2 flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold text-slate-800 transition-all active:scale-[0.98] hover:scale-[1.01] disabled:opacity-60 disabled:cursor-not-allowed"
            style={{
              background: "linear-gradient(145deg, #eef1f6, #d8dde6)",
              boxShadow: "5px 5px 12px rgba(0,0,0,0.15), -5px -5px 12px rgba(255,255,255,0.6)",
            }}
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Memproses...
              </>
            ) : (
              "Sign In"
            )}
          </button>
        </form>
      </div>
    </main>
  );
}
