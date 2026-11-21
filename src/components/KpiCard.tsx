type KpiCardProps = {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  hint?: string;
  isLoading?: boolean;
  onClick?: () => void;
};

export function KpiCard({
  icon,
  label,
  value,
  hint,
  isLoading,
  onClick,
}: KpiCardProps) {
  return (
    <div
      onClick={onClick}
      className="relative rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-[#2e2e25] dark:bg-[#13130e] hover:-translate-y-0.5 transition-all duration-300"
    >
      {icon && (
        <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300">
          {icon}
        </div>
      )}
      <div className="flex items-start gap-3 mt-1">
        <h3 className="text-sm font-medium text-slate-600 dark:text-slate-400">{label}</h3>
        <p className="text-3xl font-bold font-space text-slate-900 dark:text-slate-100">{value}</p>
      </div>
      {hint && <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{hint}</p>}
      {isLoading && (
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-[#13130e]">
          <div className="h-full bg-blue-500 transition-all duration-500" />
        </div>
      )}
    </div>
  );
}