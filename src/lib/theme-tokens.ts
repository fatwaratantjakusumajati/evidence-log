export type LogsPageColors = ReturnType<typeof getLogsPageColors>;

export function getLogsPageColors(isDarkMode: boolean) {
  return {
    bg: isDarkMode ? "#0a111f" : "#f8fafc",
    card: isDarkMode ? "#0f1a2e" : "#ffffff",
    border: isDarkMode ? "#1a2c45" : "#e2e8f0",
    textMain: isDarkMode ? "#e2e8f0" : "#0f172a",
    textMuted: isDarkMode ? "#94a3b8" : "#64748b",
    primary: isDarkMode ? "#60a5fa" : "#2563eb",
    iconColor: isDarkMode ? "#94a3b8" : "#64748b",
    dangerBg: isDarkMode ? "#7f1d1d" : "#fee2e2",
    dangerText: isDarkMode ? "#fca5a5" : "#dc2626",
    dangerLightBg: isDarkMode ? "#450a0a" : "#fef2f2",
  };
}

export type SettingsPageColors = ReturnType<typeof getSettingsPageColors>;
export function getSettingsPageColors(isDarkMode: boolean) {
  return {
    bg: isDarkMode ? "#0f172a" : "#f8fafc",
    card: isDarkMode ? "#1e293b" : "#ffffff",
    border: isDarkMode ? "#334155" : "#e2e8f0",
    textMain: isDarkMode ? "#e2e8f0" : "#0f172a",
    textMuted: isDarkMode ? "#94a3b8" : "#64748b",
    primary: isDarkMode ? "#3b82f6" : "#2563eb",
    primaryLight: isDarkMode ? "rgba(59, 130, 246, 0.1)" : "rgba(37, 99, 235, 0.1)",
    danger: isDarkMode ? "#ef4444" : "#dc2626",
    dangerLight: isDarkMode ? "rgba(239, 68, 68, 0.1)" : "rgba(229, 38, 38, 0.05)",
    success: isDarkMode ? "#22c55e" : "#16a34a",
    successLight: isDarkMode ? "rgba(34, 197, 94, 0.1)" : "rgba(22, 163, 74, 0.1)",
    warning: isDarkMode ? "#f59e0b" : "#d97706",
    warningLight: isDarkMode ? "rgba(245, 158, 11, 0.1)" : "rgba(217, 119, 6, 0.1)",
    inputBg: isDarkMode ? "#0f172a" : "#f8fafc",
    inputBorder: isDarkMode ? "#475569" : "#cbd5e1",
    headerBg: isDarkMode ? "rgba(15, 23, 42, 0.95)" : "rgba(255, 255, 255, 0.95)",
  };
}
