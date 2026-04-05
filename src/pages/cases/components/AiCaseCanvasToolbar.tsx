import {
  Maximize2,
  Minimize2,
  Focus,
  Scan,
  Tags,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface AiCaseCanvasToolbarProps {
  scalePercent: number;
  isFullscreen: boolean;
  showNodeKindTags: boolean;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onCenter: () => void;
  onFit: () => void;
  onToggleFullscreen: () => void;
  onToggleNodeTags: () => void;
}

function ToolbarButton({
  tooltip,
  onClick,
  children,
  active,
  disabled,
}: {
  tooltip: string;
  onClick: () => void;
  children: React.ReactNode;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onClick}
          disabled={disabled}
          aria-label={tooltip}
          className={`h-8 w-8 p-0 transition-colors ${
            active
              ? 'border-indigo-300 bg-indigo-50 text-indigo-700 dark:border-indigo-500/60 dark:bg-indigo-500/15 dark:text-indigo-300'
              : ''
          }`}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        <span className="text-xs">{tooltip}</span>
      </TooltipContent>
    </Tooltip>
  );
}

export function AiCaseCanvasToolbar({
  scalePercent,
  isFullscreen,
  showNodeKindTags,
  onZoomIn,
  onZoomOut,
  onCenter,
  onFit,
  onToggleFullscreen,
  onToggleNodeTags,
}: AiCaseCanvasToolbarProps) {
  return (
    <TooltipProvider delayDuration={400}>
      <div className="h-11 px-3 border-b border-slate-200/80 dark:border-slate-700/60 flex items-center justify-between bg-slate-50/80 dark:bg-slate-800/40 shrink-0">
        {/* 左侧：标签 */}
        <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
          {isFullscreen ? '沉浸全屏' : '脑图画布'}
        </div>

        {/* 右侧：工具按钮组 */}
        <div className="flex items-center gap-1.5">
          {/* 缩放组 */}
          <div className="flex items-center gap-1 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-1 py-0.5">
            <ToolbarButton tooltip="缩小 (-)" onClick={onZoomOut}>
              <ZoomOut className="h-3.5 w-3.5" />
            </ToolbarButton>
            <span className="w-12 text-center text-xs font-semibold text-slate-600 dark:text-slate-300 select-none tabular-nums">
              {scalePercent}%
            </span>
            <ToolbarButton tooltip="放大 (+)" onClick={onZoomIn}>
              <ZoomIn className="h-3.5 w-3.5" />
            </ToolbarButton>
          </div>

          {/* 视图操作组 */}
          <div className="flex items-center gap-1">
            <ToolbarButton tooltip="居中显示" onClick={onCenter}>
              <Focus className="h-3.5 w-3.5" />
            </ToolbarButton>
            <ToolbarButton tooltip="适配画布" onClick={onFit}>
              <Scan className="h-3.5 w-3.5" />
            </ToolbarButton>
            <ToolbarButton
              tooltip={showNodeKindTags ? '隐藏节点类型标签' : '显示节点类型标签'}
              onClick={onToggleNodeTags}
              active={showNodeKindTags}
            >
              <Tags className="h-3.5 w-3.5" />
            </ToolbarButton>
          </div>

          {/* 分隔线 */}
          <div className="h-5 w-px bg-slate-200 dark:bg-slate-700 mx-0.5" />

          {/* 全屏按钮 */}
          <ToolbarButton
            tooltip={isFullscreen ? '退出全屏 (Esc)' : '全屏模式'}
            onClick={onToggleFullscreen}
            active={isFullscreen}
          >
            {isFullscreen ? (
              <Minimize2 className="h-3.5 w-3.5" />
            ) : (
              <Maximize2 className="h-3.5 w-3.5" />
            )}
          </ToolbarButton>
        </div>
      </div>
    </TooltipProvider>
  );
}
