import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { expandImportedCaseNodesFromNote, normalizeMindData } from '@/lib/aiCaseMindMap';
import type { AiCaseMindData, AiCaseNode } from '@/types/aiCases';
import type { StreamGenerateResultPayload } from './AICasesUtils';

interface RunAiCaseStreamGenerationOptions {
  streamAbortControllerRef: MutableRefObject<AbortController | null>;
  showNodeKindTagsRef: MutableRefObject<boolean>;
  mindDataRef: MutableRefObject<AiCaseMindData | null>;
  requirementText: string;
  workspaceName: string;
  applyGenerateProgress: (event: { progress?: unknown; stage?: unknown }) => void;
  setMindData: Dispatch<SetStateAction<AiCaseMindData | null>>;
  setGenerationStageText: Dispatch<SetStateAction<string>>;
  setGenerationProgress: Dispatch<SetStateAction<number>>;
}

export async function runAiCaseStreamGeneration({
  streamAbortControllerRef,
  showNodeKindTagsRef,
  mindDataRef,
  requirementText,
  workspaceName,
  applyGenerateProgress,
  setMindData,
  setGenerationStageText,
  setGenerationProgress,
}: RunAiCaseStreamGenerationOptions): Promise<StreamGenerateResultPayload> {
// 中止上一次未完成的流式请求（如快速重复点击生成按钮）
    streamAbortControllerRef.current?.abort();
    const controller = new AbortController();
    streamAbortControllerRef.current = controller;

    const token = localStorage.getItem('auth_token') || sessionStorage.getItem('auth_token');

    const streamEndpoint =
      typeof window !== 'undefined'
        ? new URL('/api/ai-cases/generate/stream', window.location.origin).toString()
        : 'http://localhost:3000/api/ai-cases/generate/stream';

    const response = await fetch(streamEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        requirementText,
        workspaceName,
        persist: false,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      let message = `流式生成失败（HTTP ${response.status}）`;
      try {
        const payload = await response.json();
        if (typeof payload?.message === 'string' && payload.message.trim()) {
          message = payload.message;
        }
      } catch {
        // no-op
      }
      throw new Error(message);
    }

    if (!response.body) {
      throw new Error('后端未返回可读取的流式响应');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let finalPayload: StreamGenerateResultPayload | null = null;

    // 渐进式渲染：收到第一个 node_module 时初始化骨架结构
    let skeletonData: AiCaseMindData | null = null;

    const processEventBlock = (block: string): void => {
      // 如果请求已被中止，不再处理任何事件
      if (controller.signal.aborted) {
        return;
      }

      let eventName = 'message';
      const dataLines: string[] = [];

      block.split('\n').forEach((line) => {
        if (!line || line.startsWith(':')) {
          return;
        }

        if (line.startsWith('event:')) {
          eventName = line.slice(6).trim();
          return;
        }

        if (line.startsWith('data:')) {
          dataLines.push(line.slice(5).trimStart());
        }
      });

      if (dataLines.length === 0) {
        return;
      }

      let payload: Record<string, unknown>;
      try {
        payload = JSON.parse(dataLines.join('\n'));
      } catch {
        return;
      }

      if (eventName === 'progress') {
        applyGenerateProgress(payload);
        return;
      }

      // 渐进式节点推送：每收到一个 module 节点，立即按索引位置替换到骨架结构
      if (eventName === 'node_module') {
        const moduleNode = payload?.moduleNode;
        const moduleIndex: number = typeof payload?.moduleIndex === 'number' ? payload.moduleIndex : 0;
        const totalModules: number = typeof payload?.totalModules === 'number' ? payload.totalModules : 1;

        if (!moduleNode || typeof moduleNode !== 'object') {
          return;
        }

        if (!skeletonData) {
          // 第一个 module：创建最小骨架根节点（不生成默认子节点，避免白白创建再丢弃）
          const emptyRoot = normalizeMindData({
            nodeData: {
              id: `node-skeleton-root`,
              topic: workspaceName || 'AI Testcase Workspace',
              expanded: true,
              children: [],
            },
          }, { showNodeKindTags: showNodeKindTagsRef.current });
          skeletonData = emptyRoot;
        }

        // 性能优化：只对当前新模块做 normalize + expand，再按索引替换到骨架中
        // 避免每次全量 normalize 整棵树（旧逻辑每次 append 导致 O(n²) 开销）
        const singleModuleData: AiCaseMindData = {
          ...skeletonData,
          nodeData: {
            ...skeletonData.nodeData,
            children: [moduleNode as AiCaseNode],
          },
        };
        const normalizedSingleModule = normalizeMindData(singleModuleData, {
          showNodeKindTags: showNodeKindTagsRef.current,
        });
        const expandedSingleModule = expandImportedCaseNodesFromNote(normalizedSingleModule, {
          showNodeKindTags: showNodeKindTagsRef.current,
        });
        const normalizedModuleNode = expandedSingleModule.data.nodeData.children?.[0] as AiCaseNode | undefined;

        // 按索引替换（而非 append），防止并发推送或重试模块顺序错乱
        const nextChildren = [...(skeletonData.nodeData.children ?? [])];
        if (normalizedModuleNode) {
          nextChildren[moduleIndex] = normalizedModuleNode;
        }

        const nextSkeletonData: AiCaseMindData = {
          ...skeletonData,
          nodeData: {
            ...skeletonData.nodeData,
            children: nextChildren,
          },
        };
        skeletonData = nextSkeletonData;

        // 实时刷新结构数据，不触发 schedulePersist，避免频繁写 IndexedDB
        setMindData(nextSkeletonData);
        mindDataRef.current = nextSkeletonData;

        // 更新进度提示
        const progressPercent = Math.round(((moduleIndex + 1) / totalModules) * 40) + 55;
        setGenerationStageText(
          `正在生成功能模块 ${moduleIndex + 1}/${totalModules}：${String((moduleNode as Record<string, unknown>).topic ?? '').slice(0, 20)}`
        );
        setGenerationProgress(Math.min(95, progressPercent));
        return;
      }

      if (eventName === 'result') {
        finalPayload = (payload?.data ?? null) as StreamGenerateResultPayload | null;

        // 流式渲染结束时，立即用 AI 生成的 workspaceName 更新骨架根节点 topic
        if (finalPayload !== null && typeof finalPayload === 'object') {
          const fp = finalPayload as Record<string, unknown>;
          const resultGenerated = 'generated' in fp
            ? (fp.generated as { workspaceName?: string } | undefined)
            : (fp as { workspaceName?: string });
          const resultWsName =
            typeof resultGenerated?.workspaceName === 'string' && resultGenerated.workspaceName.trim()
              ? resultGenerated.workspaceName.trim()
              : null;
          if (resultWsName && skeletonData) {
            const updatedSkeleton: AiCaseMindData = {
              ...skeletonData,
              nodeData: { ...skeletonData.nodeData, topic: resultWsName },
            };
            skeletonData = updatedSkeleton;            setMindData(updatedSkeleton);
            mindDataRef.current = updatedSkeleton;
          }
        }
        return;
      }

      if (eventName === 'error') {
        throw new Error(
          typeof payload?.message === 'string' && payload.message.trim()
            ? payload.message
            : '远端 AI 生成失败'
        );
      }

      if (eventName === 'done' && payload?.success === false) {
        throw new Error(
          typeof payload?.message === 'string' && payload.message.trim()
            ? payload.message
            : '远端 AI 生成终止'
        );
      }
    };

    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');

      let separatorIndex = buffer.indexOf('\n\n');
      while (separatorIndex !== -1) {
        const block = buffer.slice(0, separatorIndex).trim();
        buffer = buffer.slice(separatorIndex + 2);

        if (block) {
          processEventBlock(block);
        }

        separatorIndex = buffer.indexOf('\n\n');
      }
    }

    buffer += decoder.decode().replace(/\r\n/g, '\n');
    if (buffer.trim()) {
      processEventBlock(buffer.trim());
    }

    if (!finalPayload) {
      throw new Error('流式响应未返回生成结果');
    }

    return finalPayload;
}
