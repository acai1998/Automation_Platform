import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from 'react';

// ----------------------------------------------------------------
// Types
// ----------------------------------------------------------------

export interface AiGenerationState {
  /** AI 是否正在生成中 */
  isGenerating: boolean;
  /** 生成进度 0~100 */
  progress: number;
  /** 当前阶段文字描述 */
  stageText: string;
  /**
   * 正在生成的工作台文档 ID（来自 AICaseCreate 的 handleGenerate）。
   * 生成中时为非空字符串；生成结束后重置为 null。
   * 供 AICaseCreate 列表页用于：
   *   1. 对正在生成的卡片展示进度条 overlay
   *   2. 生成结束后自动刷新列表（从 非null → null 触发 reload）
   */
  generatingDocId: string | null;
}

interface AiGenerationContextValue extends AiGenerationState {
  /**
   * AICases 页面调用：更新进度 & 阶段描述
   */
  notifyProgress: (progress: number, stageText: string) => void;
  /**
   * AICases 页面调用：标记生成开始
   * @param docId 正在生成的文档 ID（传 null 则仅重置进度）
   */
  notifyStart: (docId?: string | null) => void;
  /**
   * AICases 页面调用：标记生成结束（成功或失败）
   */
  notifyDone: () => void;
}

// ----------------------------------------------------------------
// Context
// ----------------------------------------------------------------

const AiGenerationContext = createContext<AiGenerationContextValue | null>(null);

// ----------------------------------------------------------------
// Provider
// ----------------------------------------------------------------

export function AiGenerationProvider({ children }: { children: ReactNode }) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stageText, setStageText] = useState('');
  const [generatingDocId, setGeneratingDocId] = useState<string | null>(null);

  const notifyStart = useCallback((docId?: string | null) => {
    setIsGenerating(true);
    setProgress(0);
    setStageText('');
    if (docId !== undefined) {
      setGeneratingDocId(docId ?? null);
    }
  }, []);

  const notifyProgress = useCallback((nextProgress: number, nextStage: string) => {
    // -1 表示本次不更新 progress（仅 stage 有变化）
    if (nextProgress >= 0) {
      setProgress(nextProgress);
    }
    if (nextStage) {
      setStageText(nextStage);
    }
  }, []);

  const notifyDone = useCallback(() => {
    setIsGenerating(false);
    setProgress(0);
    setStageText('');
    setGeneratingDocId(null);
  }, []);

  return (
    <AiGenerationContext.Provider
      value={{ isGenerating, progress, stageText, generatingDocId, notifyStart, notifyProgress, notifyDone }}
    >
      {children}
    </AiGenerationContext.Provider>
  );
}

// ----------------------------------------------------------------
// Hook
// ----------------------------------------------------------------

export function useAiGeneration(): AiGenerationContextValue {
  const ctx = useContext(AiGenerationContext);
  if (!ctx) {
    throw new Error('useAiGeneration must be used within AiGenerationProvider');
  }
  return ctx;
}
