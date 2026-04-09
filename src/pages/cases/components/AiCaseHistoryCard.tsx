import { useCallback, useMemo, useState } from 'react';
import {
  BrainCircuit, Trash2, ExternalLink, Clock,
  CheckCircle2, XCircle, AlertCircle, Circle,
  ChevronDown, ChevronUp, FileText, CloudOff, Cloud, Loader2,
  Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { deleteWorkspaceDocument } from '@/lib/aiCaseStorage';
import { computeProgress } from '@/lib/aiCaseMindMap';
import type { AiCaseWorkspaceDocument, AiCaseProgress } from '@/types/aiCases';

// ── Helpers ──────────────────────────────────────────────────────

export function formatDate(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function formatRelativeTime(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 60_000);
  if (diff < 1) return '刚刚';
  if (diff < 60) return `${diff} 分钟前`;
  const h = Math.floor(diff / 60);
  if (h < 24) return `${h} 小时前`;
  const days = Math.floor(h / 24);
  if (days < 30) return `${days} 天前`;
  return formatDate(ts);
}

export function countModules(doc: AiCaseWorkspaceDocument): number {
  let n = 0;
  const w = (node: AiCaseWorkspaceDocument['mapData']['nodeData']): void => {
    if (node.metadata?.kind === 'module') n++;
    for (const c of node.children ?? []) w(c as typeof node);
  };
  w(doc.mapData.nodeData);
  return n;
}

// ── Sub-components ────────────────────────────────────────────────

function ProgressBar({ progress }: { progress: AiCaseProgress }) {
  const { total, passed, failed, doing, blocked, todo } = progress;
  if (total === 0) {
    return (
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full" />
        <span className="text-xs text-slate-400">暂无用例</span>
      </div>
    );
  }
  const pct = (n: number) => Math.round((n / total) * 100);
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden flex">
          <div className="h-full bg-green-500" style={{ width: `${pct(passed)}%` }} />
          <div className="h-full bg-red-400" style={{ width: `${pct(failed)}%` }} />
          <div className="h-full bg-blue-400" style={{ width: `${pct(doing + blocked)}%` }} />
        </div>
        <span className="text-xs text-slate-500 font-medium">{progress.completionRate}%</span>
      </div>
      <div className="flex gap-3 text-xs text-slate-500 flex-wrap">
        <span className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3 text-green-500" />通过 {passed}</span>
        <span className="flex items-center gap-1"><XCircle className="h-3 w-3 text-red-400" />失败 {failed}</span>
        <span className="flex items-center gap-1"><Circle className="h-3 w-3 text-slate-300" />待测 {todo}</span>
        {(doing + blocked) > 0 && (
          <span className="flex items-center gap-1">
            <AlertCircle className="h-3 w-3 text-orange-400" />进行中 {doing + blocked}
          </span>
        )}
      </div>
    </div>
  );
}

function PriorityBadges({ doc }: { doc: AiCaseWorkspaceDocument }) {
  const counts = useMemo(() => {
    const result: Record<string, number> = {};
    const w = (node: AiCaseWorkspaceDocument['mapData']['nodeData']): void => {
      if (node.metadata?.kind === 'testcase' && node.metadata?.priority)
        result[node.metadata.priority] = (result[node.metadata.priority] ?? 0) + 1;
      for (const c of node.children ?? []) w(c as typeof node);
    };
    w(doc.mapData.nodeData);
    return result;
  }, [doc.mapData]);
  const colorMap: Record<string, string> = {
    P0: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    P1: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
    P2: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
    P3: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
  };
  const badges = ['P0', 'P1', 'P2', 'P3'].filter((p) => (counts[p] ?? 0) > 0);
  if (!badges.length) return null;
  return (
    <div className="flex gap-1.5 flex-wrap">
      {badges.map((p) => (
        <span key={p} className={`text-xs px-1.5 py-0.5 rounded font-medium ${colorMap[p]}`}>
          {p} ×{counts[p]}
        </span>
      ))}
    </div>
  );
}

function SyncBadge({ doc }: { doc: AiCaseWorkspaceDocument }) {
  if (doc.syncMode === 'hybrid' && doc.remoteWorkspaceId) {
    return (
      <span className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
        <Cloud className="h-3 w-3" />已同步至服务端
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 text-xs text-slate-400">
      <CloudOff className="h-3 w-3" />仅本地
    </span>
  );
}

function DeleteConfirm({
  docName, onConfirm, onCancel, loading,
}: {
  docName: string; onConfirm: () => void; onCancel: () => void; loading: boolean;
}) {
  return (
    <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800/40 space-y-2.5">
      <p className="text-sm text-red-700 dark:text-red-300">
        确认删除「<strong>{docName}</strong>」？此操作仅删除本地记录，不可恢复。
      </p>
      <div className="flex gap-2 justify-end">
        <Button size="sm" variant="ghost" onClick={onCancel} disabled={loading} className="h-7 text-xs">
          取消
        </Button>
        <Button size="sm" variant="destructive" onClick={onConfirm} disabled={loading} className="h-7 text-xs">
          {loading
            ? <><Loader2 className="h-3 w-3 mr-1 animate-spin" />删除中…</>
            : '确认删除'}
        </Button>
      </div>
    </div>
  );
}

// ── AI 生成中进度条 overlay ────────────────────────────────────────

/**
 * 卡片顶部的浅色生成进度条，仅当该文档正在生成时展示。
 * 使用绝对定位覆盖在卡片顶部，不影响卡片内部布局。
 */
function GeneratingOverlay({ progress }: { progress: number }) {
  return (
    <div className="absolute inset-x-0 top-0 z-10 pointer-events-none rounded-t-xl overflow-hidden">
      {/* 进度条轨道 */}
      <div className="h-1 bg-violet-100 dark:bg-violet-900/30 w-full">
        <div
          className="h-full bg-gradient-to-r from-violet-400 via-indigo-400 to-violet-500 transition-[width] duration-500 ease-out"
          style={{ width: `${Math.max(2, progress)}%` }}
        />
      </div>
    </div>
  );
}

// ── Main Card ─────────────────────────────────────────────────────

export function AiCaseHistoryCard({
  doc,
  onOpen,
  onDeleted,
  currentDocId,
  generatingDocId,
  generationProgress = 0,
}: {
  doc: AiCaseWorkspaceDocument;
  onOpen: (id: string) => void;
  onDeleted: (id: string) => void;
  /** 当前在脑图页面打开的文档 ID，用于标识「当前工作区」 badge */
  currentDocId?: string;
  /** 全局 AiGenerationContext 中正在生成的文档 ID */
  generatingDocId?: string;
  /** 全局生成进度 0~100 */
  generationProgress?: number;
}) {
  const progress = useMemo(() => computeProgress(doc.mapData), [doc.mapData]);
  const modules = useMemo(() => countModules(doc), [doc]);
  const [expanded, setExpanded] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const isCurrent = currentDocId !== undefined && doc.id === currentDocId;
  /** 该文档当前是否正在 AI 生成中 */
  const isThisGenerating = generatingDocId === doc.id;

  const handleDelete = useCallback(async () => {
    setDeleting(true);
    try {
      await deleteWorkspaceDocument(doc.id);
      toast.success(`已删除「${doc.name}」`);
      onDeleted(doc.id);
      // 删除成功后该卡从列表移除，无需 reset deleting
    } catch {
      toast.error('删除失败，请重试');
      setDeleting(false);
    }
  }, [doc.id, doc.name, onDeleted]);

  return (
    <div className={[
      'relative bg-white dark:bg-slate-900 rounded-xl border shadow-sm transition-shadow duration-200 overflow-hidden',
      isThisGenerating
        ? 'border-violet-200 dark:border-violet-700/60 shadow-violet-100 dark:shadow-none'
        : 'border-slate-200 dark:border-slate-700/80 hover:shadow-md',
    ].join(' ')}>
      {/* AI 生成中进度条 overlay（贴合卡片顶部） */}
      {isThisGenerating && <GeneratingOverlay progress={generationProgress} />}

      {/* Header */}
      <div className="p-4 pb-3">
        <div className="flex items-start gap-3">
          {/* Icon */}
          <div className={[
            'mt-0.5 flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center',
            isThisGenerating
              ? 'bg-gradient-to-br from-violet-500/20 to-indigo-500/20 dark:from-violet-500/30 dark:to-indigo-500/30'
              : 'bg-gradient-to-br from-violet-500/10 to-blue-500/10 dark:from-violet-500/20 dark:to-blue-500/20',
          ].join(' ')}>
            {isThisGenerating
              ? <Sparkles className="h-4 w-4 text-violet-500 dark:text-violet-400 animate-pulse" />
              : <BrainCircuit className="h-4 w-4 text-violet-600 dark:text-violet-400" />}
          </div>
          {/* Title row */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{doc.name}</h3>
              {isThisGenerating && (
                <span className="text-xs px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300 font-medium flex-shrink-0 flex items-center gap-1">
                  <Loader2 className="h-2.5 w-2.5 animate-spin" />
                  AI 生成中 {generationProgress > 0 ? `${generationProgress}%` : ''}
                </span>
              )}
              {!isThisGenerating && isCurrent && (
                <span className="text-xs px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300 font-medium flex-shrink-0">
                  当前工作区
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 mt-0.5 flex-wrap">
              <span className="flex items-center gap-1 text-xs text-slate-400">
                <Clock className="h-3 w-3" />{formatRelativeTime(doc.updatedAt)}
              </span>
              {!isThisGenerating && <SyncBadge doc={doc} />}
            </div>
          </div>
          {/* Actions */}
          <div className="flex items-center gap-1 flex-shrink-0">
            <Button
              size="sm" variant="ghost"
              className="h-7 w-7 p-0 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
              onClick={() => { setExpanded((v) => !v); setConfirmDel(false); }}
              title={expanded ? '收起' : '展开详情'}
              disabled={isThisGenerating}
            >
              {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
            <Button
              size="sm" variant="ghost"
              className="h-7 w-7 p-0 text-slate-400 hover:text-red-500"
              onClick={() => setConfirmDel((v) => !v)}
              title="删除"
              disabled={isThisGenerating}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              className={[
                'h-7 px-2.5 text-xs gap-1',
                isThisGenerating ? 'opacity-60 cursor-not-allowed' : '',
              ].join(' ')}
              onClick={() => !isThisGenerating && onOpen(doc.id)}
              disabled={isThisGenerating}
              title={isThisGenerating ? 'AI 正在生成，请稍候…' : undefined}
            >
              {isThisGenerating
                ? <><Loader2 className="h-3 w-3 animate-spin" />生成中</>
                : <><ExternalLink className="h-3 w-3" />打开</>}
            </Button>
          </div>
        </div>

        {/* Stats row / 生成中占位 */}
        {isThisGenerating ? (
          <div className="mt-3 flex items-center gap-2 text-xs text-violet-500 dark:text-violet-400">
            <Sparkles className="h-3 w-3" />
            <span>AI 正在分析需求并构建测试用例脑图，完成后将自动出现在列表…</span>
          </div>
        ) : (
          <div className="mt-3 flex items-center gap-3 text-xs text-slate-500 flex-wrap">
            <span className="flex items-center gap-1"><FileText className="h-3 w-3" />{modules} 个模块</span>
            <span className="text-slate-200 dark:text-slate-700">|</span>
            <span>{progress.total} 条用例</span>
            <PriorityBadges doc={doc} />
          </div>
        )}

        {/* Progress bar（生成中时不展示用例进度条，避免骨架数据误导） */}
        {!isThisGenerating && <div className="mt-3"><ProgressBar progress={progress} /></div>}

        {/* Inline delete confirm (collapsed) */}
        {confirmDel && !expanded && (
          <div className="mt-3">
            <DeleteConfirm
              docName={doc.name}
              onConfirm={handleDelete}
              onCancel={() => setConfirmDel(false)}
              loading={deleting}
            />
          </div>
        )}
      </div>

      {/* Expandable detail */}
      {expanded && (
        <div className="px-4 pb-4 border-t border-slate-100 dark:border-slate-800 pt-3 space-y-3">
          <div>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">需求描述</p>
            <div className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed bg-slate-50 dark:bg-slate-800 rounded-lg p-2.5 whitespace-pre-wrap">
              {doc.requirement
                ? (doc.requirement.length > 300 ? doc.requirement.slice(0, 300) + '…' : doc.requirement)
                : <span className="text-slate-400 italic">暂无需求描述</span>}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-y-1 text-xs text-slate-500">
            <span><span className="text-slate-400">创建时间：</span>{formatDate(doc.createdAt)}</span>
            <span><span className="text-slate-400">最后更新：</span>{formatDate(doc.updatedAt)}</span>
            {doc.lastRemoteSyncedAt && (
              <span className="col-span-2">
                <span className="text-slate-400">最后同步：</span>{formatDate(doc.lastRemoteSyncedAt)}
              </span>
            )}
          </div>
          {confirmDel ? (
            <DeleteConfirm
              docName={doc.name}
              onConfirm={handleDelete}
              onCancel={() => setConfirmDel(false)}
              loading={deleting}
            />
          ) : (
            <div className="flex justify-end">
              <Button
                size="sm" variant="outline"
                className="h-7 text-xs text-red-500 border-red-200 hover:bg-red-50 hover:border-red-300 dark:text-red-400 dark:border-red-800/40 dark:hover:bg-red-900/20"
                onClick={() => setConfirmDel(true)}
              >
                <Trash2 className="h-3 w-3 mr-1" />删除此记录
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
