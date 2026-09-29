// ============================================================
// Palet warna dasar bersama untuk seluruh app.
//
// PERBAIKAN: sebelumnya getLogsPageColors() dan getSettingsPageColors()
// masing-masing punya nilai bg/border/text SENDIRI yang tidak sinkron
// (mis. dark bg Logs = #0f172a, dark bg Settings = #0f172a -- dua warna
// "hitam" berbeda untuk peran visual yang sama). Sekarang keduanya
// diturunkan dari satu palet dasar yang sama, diselaraskan dengan warna
// yang sudah dipakai di dashboard.tsx/__root.tsx, supaya semua halaman
// terasa sebagai satu aplikasi yang sama.
// ============================================================
const basePalette = {
  bg: { dark: "#13130e", light: "#f8fafc" },
  card: { dark: "#1a1a14", light: "#ffffff" },
  border: { dark: "#2e2e25", light: "#e2e8f0" },
  textMain: { dark: "#e2e8f0", light: "#0f172a" },
  textMuted: { dark: "#94a3b8", light: "#64748b" },
  // Warna brand disamakan dengan topnav/dashboard/login/laporan (indigo),
  // sebelumnya di sini masih emerald lama yang ketinggalan waktu warna brand
  // diganti di tempat lain -- akibatnya Settings & Staging jadi satu-satunya
  // halaman yang masih hijau.
  primary: { dark: "#818cf8", light: "#4338ca" },
  primaryLightRgb: { dark: "129, 140, 248", light: "67, 56, 202" },
  danger: { dark: "#ef4444", light: "#dc2626" },
  dangerLightRgb: { dark: "239, 68, 68", light: "220, 38, 38" },
  dangerBg: { dark: "#7f1d1d", light: "#fee2e2" },
  dangerLightBg: { dark: "#450a0a", light: "#fef2f2" },
  success: { dark: "#22c55e", light: "#16a34a" },
  successLightRgb: { dark: "34, 197, 94", light: "22, 163, 74" },
  warning: { dark: "#f59e0b", light: "#d97706" },
  warningLightRgb: { dark: "245, 158, 11", light: "217, 119, 6" },
  inputBg: { dark: "#13130e", light: "#f8fafc" },
  inputBorder: { dark: "#3d3d32", light: "#cbd5e1" },
};

export type LogsPageColors = ReturnType<typeof getLogsPageColors>;

export function getLogsPageColors(isDarkMode: boolean) {
  const mode = isDarkMode ? "dark" : "light";
  return {
    bg: basePalette.bg[mode],
    card: basePalette.card[mode],
    border: basePalette.border[mode],
    textMain: basePalette.textMain[mode],
    textMuted: basePalette.textMuted[mode],
    primary: basePalette.primary[mode],
    iconColor: basePalette.textMuted[mode],
    dangerBg: basePalette.dangerBg[mode],
    dangerText: isDarkMode ? "#fca5a5" : basePalette.danger.light,
    dangerLightBg: basePalette.dangerLightBg[mode],
  };
}

export type SettingsPageColors = ReturnType<typeof getSettingsPageColors>;
export function getSettingsPageColors(isDarkMode: boolean) {
  const mode = isDarkMode ? "dark" : "light";
  return {
    bg: basePalette.bg[mode],
    card: basePalette.card[mode],
    border: basePalette.border[mode],
    textMain: basePalette.textMain[mode],
    textMuted: basePalette.textMuted[mode],
    primary: basePalette.primary[mode],
    primaryLight: `rgba(${basePalette.primaryLightRgb[mode]}, 0.12)`,
    danger: basePalette.danger[mode],
    dangerLight: `rgba(${basePalette.dangerLightRgb[mode]}, 0.1)`,
    success: basePalette.success[mode],
    successLight: `rgba(${basePalette.successLightRgb[mode]}, 0.1)`,
    warning: basePalette.warning[mode],
    warningLight: `rgba(${basePalette.warningLightRgb[mode]}, 0.1)`,
    inputBg: basePalette.inputBg[mode],
    inputBorder: basePalette.inputBorder[mode],
    headerBg: isDarkMode ? "rgba(19, 19, 14, 0.95)" : "rgba(255, 255, 255, 0.95)",
  };
}
