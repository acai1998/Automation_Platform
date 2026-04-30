import { type ReactNode } from 'react';

export interface AiWorkspaceTabItem<TTab extends string = string> {
  id: TTab;
  label: string;
  description: string;
  icon: ReactNode;
}

interface AiWorkspaceTabsProps<TTab extends string> {
  activeTab: TTab;
  items: Array<AiWorkspaceTabItem<TTab>>;
  onChange: (tab: TTab) => void;
}

function TabButton({
  active,
  icon,
  label,
  description,
  onClick,
}: {
  active: boolean;
  icon: ReactNode;
  label: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-w-[180px] rounded-xl border px-4 py-3 text-left transition-colors ${
        active
          ? 'border-indigo-300 bg-indigo-50 text-indigo-700 dark:border-indigo-500/60 dark:bg-indigo-500/10 dark:text-indigo-300'
          : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-slate-700 dark:hover:bg-slate-800/80'
      }`}
    >
      <div className="flex items-center gap-2">
        <span className={active ? '' : 'text-slate-400 dark:text-slate-500'}>{icon}</span>
        <span className="text-sm font-semibold">{label}</span>
      </div>
      <div className={`mt-1 text-xs ${active ? 'text-indigo-600/80 dark:text-indigo-300/80' : 'text-slate-500 dark:text-slate-400'}`}>
        {description}
      </div>
    </button>
  );
}

export function AiWorkspaceTabs<TTab extends string>({
  activeTab,
  items,
  onChange,
}: AiWorkspaceTabsProps<TTab>) {
  return (
    <div className="shrink-0 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-3">
      <div className="flex gap-2 overflow-x-auto pb-1">
        {items.map((tab) => (
          <TabButton
            key={tab.id}
            active={activeTab === tab.id}
            icon={tab.icon}
            label={tab.label}
            description={tab.description}
            onClick={() => onChange(tab.id)}
          />
        ))}
      </div>
    </div>
  );
}
