import type { ReactNode } from "react";
import { NotebookText } from "lucide-react";
import { ACCENTS, type Accent } from "./accents";

// Format waktu buat feed "Log Terbaru": kalau tanggalnya hari ini, tampilkan
// "Hari ini" saja di bawah jamnya -- daripada ngulang tanggal penuh yang
// identik di 4 baris berturut-turut (bikin kolomnya keliatan monoton).
function formatRecentTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const isToday =
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear();
  const time = d.toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const dateLabel = isToday
    ? "Hari ini"
    : d.toLocaleDateString("id-ID", { day: "numeric", month: "short" });
  return { time, dateLabel };
}

export function RecentActivityCard({
  items,
}: {
  items: {
    id: string;
    time: string;
    label: string;
    category: string;
    detail?: string;
    accent: Accent;
    icon: ReactNode;
    onSelect: () => void;
  }[];
}) {
  return (
    <div
      className={`group relative overflow-hidden rounded-xl border p-5 bg-white dark:bg-[#1a1a14] border-slate-200 dark:border-[#2e2e25] transition-all duration-300 hover:-translate-y-0.5 ${ACCENTS.violet.glow}`}
    >
      <span
        className={`absolute inset-y-0 left-0 w-[3px] ${ACCENTS.violet.bar} opacity-60 group-hover:opacity-100 transition-opacity duration-300`}
      />

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`h-1.5 w-1.5 rounded-full ${ACCENTS.violet.dot} animate-pulse`} />
          <span className="text-[11px] font-medium uppercase tracking-wider font-mono text-slate-500 dark:text-slate-400">
            Log Terbaru
          </span>
        </div>
        <div
          className={`flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 dark:border-[#2e2e25] ${ACCENTS.violet.text} transition-transform duration-300 group-hover:scale-110`}
        >
          <NotebookText className="h-4 w-4" />
        </div>
      </div>

      {items.length === 0 ? (
        <p className="mt-4 py-3 text-xs font-mono text-slate-400 dark:text-slate-500">
          Belum ada aktivitas
        </p>
      ) : (
        <table className="mt-3 w-full table-fixed border-collapse text-left">
          <thead>
            <tr className="border-b border-slate-200 dark:border-[#2e2e25]">
              <th className="w-[34%] pb-1.5 pr-2 text-[10px] font-semibold uppercase tracking-wider font-mono text-slate-400 dark:text-slate-500">
                Waktu
              </th>
              <th className="pb-1.5 pr-2 text-[10px] font-semibold uppercase tracking-wider font-mono text-slate-400 dark:text-slate-500">
                Aktivitas
              </th>
              <th className="w-[26%] pb-1.5 text-right text-[10px] font-semibold uppercase tracking-wider font-mono text-slate-400 dark:text-slate-500">
                Sumber
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr
                key={item.id}
                tabIndex={0}
                onClick={item.onSelect}
                onKeyDown={(ev) => {
                  if (ev.key === "Enter") item.onSelect();
                }}
                className="cursor-pointer border-b border-slate-100 dark:border-[#22221a] last:border-0 hover:bg-slate-50 dark:hover:bg-[#22221a]/60 transition-colors"
              >
                <td className="py-1.5 pr-2 align-top">
                  <div className="flex items-center gap-2">
                    <span
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-current/10 ${ACCENTS[item.accent].text}`}
                    >
                      {item.icon}
                    </span>
                    <div className="leading-tight">
                      <p className="text-[11px] font-semibold font-mono tabular-nums text-slate-700 dark:text-slate-300">
                        {formatRecentTime(item.time).time}
                      </p>
                      <p className="text-[10px] font-mono text-slate-400 dark:text-slate-500">
                        {formatRecentTime(item.time).dateLabel}
                      </p>
                    </div>
                  </div>
                </td>
                <td className="py-1.5 pr-2 align-top">
                  <p className="truncate text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                    {item.label}
                  </p>
                  <p className="truncate text-[10px] font-mono text-slate-400 dark:text-slate-500">
                    {item.detail || "—"}
                  </p>
                </td>
                <td className="py-1.5 text-right align-top">
                  <span
                    className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-mono font-medium bg-current/10 ${ACCENTS[item.accent].text}`}
                  >
                    {item.category}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
