interface AiWorkspaceSummaryItem {
  label: string;
  value: string;
  hint: string;
}

interface AiWorkspaceSummaryBarProps {
  items: AiWorkspaceSummaryItem[];
  gridClassName?: string;
}

function SummaryCard({ label, value, hint }: AiWorkspaceSummaryItem) {
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-3">
      <div className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</div>
      <div className="mt-1 text-xl font-semibold text-slate-900 dark:text-white">{value}</div>
      <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{hint}</div>
    </div>
  );
}

export function AiWorkspaceSummaryBar({
  items,
  gridClassName = 'grid-cols-5',
}: AiWorkspaceSummaryBarProps) {
  return (
    <div className="shrink-0 border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950 px-4 py-3">
      <div className={`grid gap-3 ${gridClassName}`}>
        {items.map((item) => (
          <SummaryCard
            key={item.label}
            label={item.label}
            value={item.value}
            hint={item.hint}
          />
        ))}
      </div>
    </div>
  );
}
