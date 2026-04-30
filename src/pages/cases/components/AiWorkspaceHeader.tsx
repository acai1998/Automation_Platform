import { type ReactNode } from 'react';
import { BrainCircuit, FileText, History } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface AiWorkspaceHeaderProps {
  title: string;
  saveStateText: string;
  remoteStatusText: string;
  onOpenRequirement: () => void;
  onOpenHistory: () => void;
  titleIcon?: ReactNode;
}

export function AiWorkspaceHeader({
  title,
  saveStateText,
  remoteStatusText,
  onOpenRequirement,
  onOpenHistory,
  titleIcon,
}: AiWorkspaceHeaderProps) {
  return (
    <header className="shrink-0 h-12 flex items-center justify-between px-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
      <div className="flex items-center gap-2.5">
        <div className="p-1.5 rounded-md bg-indigo-500/10 text-indigo-600 dark:text-indigo-300">
          {titleIcon ?? <BrainCircuit className="h-4 w-4" />}
        </div>
        <h1 className="text-sm font-semibold text-slate-900 dark:text-white">{title}</h1>
      </div>
      <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs gap-1.5 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white"
          onClick={onOpenRequirement}
        >
          <FileText className="h-3.5 w-3.5" />
          <span>需求信息</span>
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs gap-1.5 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white"
          onClick={onOpenHistory}
        >
          <History className="h-3.5 w-3.5" />
          <span>用例记录</span>
        </Button>
        <span>{saveStateText}</span>
        <span>{remoteStatusText}</span>
      </div>
    </header>
  );
}
