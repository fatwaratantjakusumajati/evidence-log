import { useState, forwardRef, type InputHTMLAttributes, type CSSProperties } from "react";
import { ArrowRight, ClockPlus } from "lucide-react";
import DatePicker from "react-datepicker";
import { subDays, startOfMonth, endOfMonth, subMonths } from "date-fns";

import "react-datepicker/dist/react-datepicker.css";

// Bentuk ini HARUS sama persis dengan yang dikembalikan getLogsPageColors()
// di @/lib/theme-tokens (dipakai logs_staging.tsx). Kalau kamu nambah field
// baru di getLogsPageColors, tambahkan juga di sini supaya TypeScript tetap
// konsisten di kedua tempat.
export interface DateRangeFilterColors {
  bg: string;
  card: string;
  border: string;
  textMain: string;
  textMuted: string;
  primary: string;
  iconColor: string;
  dangerBg: string;
  dangerText: string;
  dangerLightBg: string;
}

interface DateRangeFilterProps {
  startDate: string;
  endDate: string;
  onChange: (start: string, end: string) => void;
  // Opsional: kalau tidak dikirim (misal dari dashboard.tsx), komponen
  // tetap pakai tampilan default (indigo/slate hardcoded) seperti sebelumnya.
  colors?: DateRangeFilterColors;
}

const formatDate = (date: Date | null): string => {
  if (!date) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const parseDate = (value: string): Date | null => {
  if (!value) return null;
  const [year, month, day] = value.split("-");
  return new Date(Number(year), Number(month) - 1, Number(day));
};

// react-datepicker's <DatePicker> tidak mengekspos prop `style` di tipenya
// (cuma `className`, yang diteruskan ke <input> internalnya). Supaya bisa
// dikasih inline style dari token tema, kita render <input> sendiri lewat
// prop `customInput`, dan react-datepicker akan meneruskan value/onClick/
// ref yang dibutuhkan ke komponen ini secara otomatis.
type ThemedDateInputProps = InputHTMLAttributes<HTMLInputElement> & {
  wrapperClassName?: string;
  wrapperStyle?: CSSProperties;
};

const ThemedDateInput = forwardRef<HTMLInputElement, ThemedDateInputProps>(
  ({ wrapperClassName, wrapperStyle, className, style, ...inputProps }, ref) => (
    <input
      ref={ref}
      // Gabungkan class milikmu dengan class dari react-datepicker
      className={`${wrapperClassName || ""} ${className || ""}`.trim()}
      // Gabungkan style milikmu dengan style dari react-datepicker
      style={{ ...wrapperStyle, ...style }}
      {...inputProps}
    />
  ),
);
ThemedDateInput.displayName = "ThemedDateInput";

export function DateRangeFilter({ startDate, endDate, onChange, colors }: DateRangeFilterProps) {
  const [quickOpen, setQuickOpen] = useState(false);

  const start = parseDate(startDate);
  const end = parseDate(endDate);

  const setRange = (start: Date, end: Date) => {
    onChange(formatDate(start), formatDate(end));
    setQuickOpen(false);
  };

  const quickRanges = [
    {
      label: "Hari ini",
      description: "Tanggal sekarang",
      action: () => setRange(new Date(), new Date()),
    },
    {
      label: "Kemarin",
      description: "1 hari terakhir",
      action: () => {
        const yesterday = subDays(new Date(), 1);
        setRange(yesterday, yesterday);
      },
    },
    {
      label: "7 hari terakhir",
      description: "Termasuk hari ini",
      action: () => setRange(subDays(new Date(), 6), new Date()),
    },
    {
      label: "30 hari terakhir",
      description: "Termasuk hari ini",
      action: () => setRange(subDays(new Date(), 29), new Date()),
    },
    {
      label: "Bulan ini",
      description: "Dari awal sampai akhir bulan",
      action: () => {
        const today = new Date();
        setRange(startOfMonth(today), endOfMonth(today));
      },
    },
    {
      label: "Bulan lalu",
      description: "Periode bulan sebelumnya",
      action: () => {
        const previousMonth = subMonths(new Date(), 1);
        setRange(startOfMonth(previousMonth), endOfMonth(previousMonth));
      },
    },
  ];

  // ------------------------------------------------------------
  // Kalau `colors` dikirim, semua warna dipakai lewat inline style
  // dari token tema. Kalau tidak (dashboard.tsx lama), fallback ke
  // class Tailwind hardcoded seperti versi asli -- supaya pemanggilan
  // yang sudah ada tidak berubah tampilannya.
  // ------------------------------------------------------------
  const themed = Boolean(colors);

  const inputWrapperClass = themed
    ? "h-11 w-full rounded-xl border pl-10 pr-3 text-xs sm:text-sm font-medium outline-none transition-all focus:ring-4"
    : "h-11 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-3 text-xs sm:text-sm font-medium text-slate-700 outline-none transition-all hover:border-indigo-300 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200";

  const inputStyle = themed
    ? { backgroundColor: colors!.card, borderColor: colors!.border, color: colors!.textMain }
    : undefined;

  const arrowBoxClass = themed
    ? "flex h-8 w-8 shrink-0 items-center justify-center rounded-xl"
    : "flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400";

  const arrowBoxStyle = themed
    ? { backgroundColor: `${colors!.primary}1a`, color: colors!.primary } // 1a hex ~= 10% opacity
    : undefined;

  const quickButtonClass = themed
    ? "flex h-11 items-center gap-2 rounded-xl border px-4 text-xs sm:text-sm font-medium shadow-sm transition-all"
    : "flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-xs sm:text-sm font-medium text-slate-600 shadow-sm transition-all hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-indigo-500/10 dark:hover:text-indigo-400";

  const quickButtonStyle = themed
    ? { backgroundColor: colors!.card, borderColor: colors!.border, color: colors!.textMuted }
    : undefined;

  const clockIconClass = themed ? "w-4 h-4" : "w-4 h-4 text-indigo-500";
  const clockIconStyle = themed ? { color: colors!.primary } : undefined;

  const dropdownClass = themed
    ? "absolute right-0 z-50 mt-2 w-64 overflow-hidden rounded-2xl border p-2 shadow-xl"
    : "absolute right-0 z-50 mt-2 w-64 overflow-hidden rounded-2xl border border-slate-200 bg-white p-2 shadow-xl shadow-slate-900/10 dark:border-slate-700 dark:bg-slate-900";

  const dropdownStyle = themed
    ? { backgroundColor: colors!.card, borderColor: colors!.border }
    : undefined;

  const quickItemClass = themed
    ? "flex w-full items-center rounded-xl px-3 py-2.5 text-left transition-all"
    : "flex w-full items-center rounded-xl px-3 py-2.5 text-left transition-all hover:bg-indigo-50 dark:hover:bg-indigo-500/10";

  const quickItemLabelClass = themed
    ? "text-xs font-medium"
    : "text-xs font-medium text-slate-700 dark:text-slate-200";

  const quickItemDescClass = themed ? "mt-0.5 text-[10px]" : "mt-0.5 text-[10px] text-slate-400";

  const resetButtonClass = themed
    ? "flex h-11 items-center gap-1.5 rounded-xl border px-3.5 text-xs font-semibold transition-all"
    : "flex h-11 items-center gap-1.5 rounded-xl border border-red-100 bg-red-50/50 px-3.5 text-xs font-semibold text-red-600 transition-all hover:border-red-500/20 hover:bg-red-100 dark:border-red-500/10 dark:text-red-400 dark:hover:bg-red-500/20";

  const resetButtonStyle = themed
    ? {
        backgroundColor: colors!.dangerLightBg,
        borderColor: colors!.dangerBg,
        color: colors!.dangerText,
      }
    : undefined;

  return (
    /* Menggunakan flex-col di HP/Layar kecil, dan flex-row tanpa wrap di layar medium/besar */
    <div className="flex flex-col md:flex-row md:items-center gap-3 w-full">
      {/* KELOMPOK INPUT TANGGAL (Selalu berdampingan) */}
      <div className="flex items-center gap-3">
        {/* TANGGAL MULAI */}
        <div className="relative w-44 sm:w-52">
          <DatePicker
            selected={start}
            onChange={(date: Date | null) => onChange(formatDate(date), endDate)}
            selectsStart
            startDate={start}
            endDate={end}
            maxDate={end || undefined}
            dateFormat="dd MMM yyyy"
            placeholderText="Tanggal mulai"
            wrapperClassName="w-full !block"
            customInput={
              <ThemedDateInput
                wrapperClassName={`${inputWrapperClass} pl-9 pr-3`}
                wrapperStyle={inputStyle}
              />
            }
          />
          <div
            className={
              themed
                ? "pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 z-10"
                : "pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 z-10 text-slate-400"
            }
            style={themed ? { color: colors!.textMuted } : undefined}
          >
            📅
          </div>
        </div>

        {/* PEMISAH PANAH */}
        <div className={arrowBoxClass} style={arrowBoxStyle}>
          <ArrowRight className="h-4 w-4" />
        </div>

        {/* TANGGAL AKHIR */}
        <div className="relative w-44 sm:w-52">
          <DatePicker
            selected={end}
            onChange={(date: Date | null) => onChange(startDate, formatDate(date))}
            selectsEnd
            startDate={start}
            endDate={end}
            minDate={start || undefined}
            dateFormat="dd MMM yyyy"
            placeholderText="Tanggal akhir"
            wrapperClassName="w-full !block"
            customInput={
              <ThemedDateInput
                wrapperClassName={`${inputWrapperClass} pl-9 pr-3`}
                wrapperStyle={inputStyle}
              />
            }
          />
          <div
            className={
              themed
                ? "pointer-events-none absolute left-3 top-1/2 -translate-y-1/2"
                : "pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            }
            style={themed ? { color: colors!.textMuted } : undefined}
          >
            📅
          </div>
        </div>
      </div>

      {/* KELOMPOK TOMBOL AKSI (Akses Cepat & Reset berjejer rapi) */}
      <div className="flex shrink-0 items-center gap-2">
        {/* QUICK ACCESS */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setQuickOpen(!quickOpen)}
            className={quickButtonClass}
            style={quickButtonStyle}
          >
            <span>
              {" "}
              <ClockPlus className={clockIconClass} style={clockIconStyle} />
            </span>
            <span>Quick Access</span>
            <svg
              className={`h-4 w-4 transition-transform ${quickOpen ? "rotate-180" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </button>

          {/* DROPDOWN MENU */}
          {quickOpen && (
            <div className={dropdownClass} style={dropdownStyle}>
              <div className="mt-1 space-y-1">
                {quickRanges.map((range) => (
                  <button
                    type="button"
                    key={range.label}
                    onClick={range.action}
                    className={quickItemClass}
                    onMouseEnter={(e) => {
                      if (themed) e.currentTarget.style.backgroundColor = `${colors!.primary}1a`;
                    }}
                    onMouseLeave={(e) => {
                      if (themed) e.currentTarget.style.backgroundColor = "transparent";
                    }}
                  >
                    <div>
                      <p
                        className={quickItemLabelClass}
                        style={themed ? { color: colors!.textMain } : undefined}
                      >
                        {range.label}
                      </p>
                      <p
                        className={quickItemDescClass}
                        style={themed ? { color: colors!.textMuted } : undefined}
                      >
                        {range.description}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* TOMBOL RESET */}
        {(startDate || endDate) && (
          <button
            type="button"
            onClick={() => onChange("", "")}
            className={resetButtonClass}
            style={resetButtonStyle}
          >
            <span>↺</span>
            <span>Reset</span>
          </button>
        )}
      </div>
    </div>
  );
}
