// Satu warna semantik per kategori, dipakai konsisten untuk garis aksen,
// badge ikon, glow saat hover, dan sparkline — bukan sekadar dekorasi.
// Diekstrak dari dashboard.tsx agar bisa dipakai bersama oleh komponen
// dashboard yang sudah dipecah ke file terpisah.
export const ACCENTS = {
  blue: {
    text: "text-blue-600 dark:text-blue-400",
    bar: "bg-blue-500",
    dot: "bg-blue-500",
    glow: "hover:shadow-[0_16px_36px_-16px_rgba(59,130,246,0.45)]",
    stroke: "#3b82f6",
  },
  amber: {
    text: "text-amber-600 dark:text-amber-400",
    bar: "bg-amber-500",
    dot: "bg-amber-500",
    glow: "hover:shadow-[0_16px_36px_-16px_rgba(245,158,11,0.45)]",
    stroke: "#f59e0b",
  },
  emerald: {
    text: "text-emerald-600 dark:text-emerald-400",
    bar: "bg-emerald-500",
    dot: "bg-emerald-500",
    glow: "hover:shadow-[0_16px_36px_-16px_rgba(16,185,129,0.45)]",
    stroke: "#10b981",
  },
  rose: {
    text: "text-rose-600 dark:text-rose-400",
    bar: "bg-rose-500",
    dot: "bg-rose-500",
    glow: "hover:shadow-[0_16px_36px_-16px_rgba(244,63,94,0.45)]",
    stroke: "#f43f5e",
  },
  violet: {
    text: "text-violet-600 dark:text-violet-400",
    bar: "bg-violet-500",
    dot: "bg-violet-500",
    glow: "hover:shadow-[0_16px_36px_-16px_rgba(139,92,246,0.45)]",
    stroke: "#8b5cf6",
  },
  orange: {
    text: "text-orange-600 dark:text-orange-400",
    bar: "bg-orange-500",
    dot: "bg-orange-500",
    glow: "hover:shadow-[0_16px_36px_-16px_rgba(249,115,22,0.45)]",
    stroke: "#f97316",
  },
} as const;

export type Accent = keyof typeof ACCENTS;
