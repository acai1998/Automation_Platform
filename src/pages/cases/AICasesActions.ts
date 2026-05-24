import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { toast } from 'sonner';
import { aiCasesApi, type AiCaseWorkspaceDetail } from '@/api';
import { appendNodeAttachmentId, expandImportedCaseNodesFromNote, findNodeById, generateMindDataFromRequirement, normalizeMindData, setNodeStatus } from '@/lib/aiCaseMindMap';
import { saveNodeAttachment } from '@/lib/aiCaseStorage';
import { createAiCaseAttachmentId, type AiCaseMindData, type AiCaseNodeStatus, type AiCaseWorkspaceDocument } from '@/types/aiCases';
import { MAX_UPLOAD_BYTES, getFirstGeneratedCaseId, type RemoteSyncMeta, type StreamGenerateResultPayload, type WorkspaceTab } from './AICasesUtils';

interface UploadAiCaseImageFilesOptions {
  inputFiles: File[];
  source: 'picker' | 'paste';
  mindDataRef: MutableRefObject<AiCaseMindData | null>;
  selectedNodeIdRef: MutableRefObject<string | null>;
  isUploadingRef: MutableRefObject<boolean>;
  docRef: MutableRefObject<AiCaseWorkspaceDocument | null>;
  activeDocId: string;
  setIsUploading: Dispatch<SetStateAction<boolean>>;
  setDataAndSync: (nextData: AiCaseMindData, options?: { selectedId?: string | null; refreshMind?: boolean }) => void;
  setAttachmentReloadSeed: Dispatch<SetStateAction<number>>;
}

export async function uploadAiCaseImageFiles({
  inputFiles,
  source,
  mindDataRef,
  selectedNodeIdRef,
  isUploadingRef,
  docRef,
  activeDocId,
  setIsUploading,
  setDataAndSync,
  setAttachmentReloadSeed,
}: UploadAiCaseImageFilesOptions): Promise<void> {
const currentData = mindDataRef.current;
      const currentSelectedNodeId = selectedNodeIdRef.current;

      if (!currentData || !currentSelectedNodeId) {
        toast.error('请先选中一个测试节点，再上传截图');
        return;
      }

      const selectedNodeInData = findNodeById(currentData.nodeData, currentSelectedNodeId);
      if (selectedNodeInData?.metadata?.kind !== 'testcase') {
        toast.error('请先选中一个测试节点，再上传截图');
        return;
      }

      if (inputFiles.length === 0) {
        return;
      }

      if (isUploadingRef.current) {
        toast.warning('截图上传中，请稍候');
        return;
      }

      isUploadingRef.current = true;
      setIsUploading(true);

      try {
        let nextData = currentData;
        let successCount = 0;

        for (const [index, file] of inputFiles.entries()) {
          if (!file.type.startsWith('image/')) {
            toast.error(`${file.name || '截图文件'} 不是图片文件，已跳过`);
            continue;
          }

          if (file.size > MAX_UPLOAD_BYTES) {
            toast.error(`${file.name || '截图文件'} 超过 8MB，已跳过`);
            continue;
          }

          const normalizedFile = file.name
            ? file
            : new File([file], `clipboard-${Date.now()}-${index + 1}.png`, {
                type: file.type || 'image/png',
                lastModified: Date.now(),
              });

          const attachmentId = createAiCaseAttachmentId();
          await saveNodeAttachment({
          id: attachmentId,
          docId: docRef.current?.id ?? activeDocId,
            nodeId: currentSelectedNodeId,
            name: normalizedFile.name,
            mimeType: normalizedFile.type,
            size: normalizedFile.size,
            createdAt: Date.now(),
            blob: normalizedFile,
          });

          nextData = appendNodeAttachmentId(nextData, currentSelectedNodeId, attachmentId);
          successCount += 1;
        }

        if (successCount > 0) {
          setDataAndSync(nextData, {
            selectedId: currentSelectedNodeId,
            refreshMind: false,
          });
          setAttachmentReloadSeed((value) => value + 1);
          toast.success(source === 'paste' ? `已粘贴 ${successCount} 张截图` : `已上传 ${successCount} 张截图`);
        }
      } catch (error) {
        console.error('[AICases] failed to upload attachment', error);
        toast.error('截图上传失败，请重试');
      } finally {
        isUploadingRef.current = false;
        setIsUploading(false);
      }
}

interface GenerateAiCasesOptions {
  requirementText: string;
  workspaceName: string;
  streamGenerateFromBackend: () => Promise<StreamGenerateResultPayload>;
  showNodeKindTagsRef: MutableRefObject<boolean>;
  isWorkspaceNameUserEditedRef: MutableRefObject<boolean>;
  setActiveTab: Dispatch<SetStateAction<WorkspaceTab>>;
  setIsRequirementDialogOpen: Dispatch<SetStateAction<boolean>>;
  startGenerateProgress: () => void;
  setIsGenerating: Dispatch<SetStateAction<boolean>>;
  setGenerationProgress: Dispatch<SetStateAction<number>>;
  setGenerationStageText: Dispatch<SetStateAction<string>>;
  setDataAndSync: (nextData: AiCaseMindData, options?: { selectedId?: string | null; refreshMind?: boolean }) => void;
  setWorkspaceName: Dispatch<SetStateAction<string>>;
  cleanupStaleAttachments: (nextData: AiCaseMindData) => Promise<number>;
  setAttachmentReloadSeed: Dispatch<SetStateAction<number>>;
  finishGenerateProgress: (stageText: string) => void;
  notifyProgress: (progress: number, stageText: string) => void;
  setLocation: (path: string) => void;
}

export async function generateAiCases({
  requirementText,
  workspaceName,
  streamGenerateFromBackend,
  showNodeKindTagsRef,
  isWorkspaceNameUserEditedRef,
  setActiveTab,
  setIsRequirementDialogOpen,
  startGenerateProgress,
  setIsGenerating,
  setGenerationProgress,
  setGenerationStageText,
  setDataAndSync,
  setWorkspaceName,
  cleanupStaleAttachments,
  setAttachmentReloadSeed,
  finishGenerateProgress,
  notifyProgress,
  setLocation,
}: GenerateAiCasesOptions): Promise<void> {
if (!requirementText.trim()) {
      toast.error('请先输入需求描述，再执行 AI 生成');
      return;
    }

    setActiveTab('results');
        setIsRequirementDialogOpen(false);
    startGenerateProgress();
    setIsGenerating(true);
    try {
      const payload = await streamGenerateFromBackend();
      const generated =
        payload && typeof payload === 'object' && 'generated' in payload
          ? payload.generated
          : payload;

      if (!generated || !generated.mapData) {
        throw new Error('AI 返回数据为空');
      }

      // 用 AI 自动生成的工作台名称更新主节点和工作台名
      const aiWorkspaceName =
        typeof generated.workspaceName === 'string' && generated.workspaceName.trim()
          ? generated.workspaceName.trim()
          : workspaceName;

      // AI 生成后用 AI 给出的名称覆盖，标记为"已编辑"避免后续被自动推断再次覆盖
      isWorkspaceNameUserEditedRef.current = true;

      // 始终确保 mapData 根节点 topic 与最终 workspaceName 一致（创建新对象，不直接修改）
      const finalMapData =
        generated.mapData.nodeData.topic !== aiWorkspaceName
          ? {
              ...generated.mapData,
              nodeData: { ...generated.mapData.nodeData, topic: aiWorkspaceName },
            }
          : generated.mapData;

      setGenerationStageText('正在回写节点结构与结构化步骤...');
      const normalized = normalizeMindData(finalMapData, {
        showNodeKindTags: showNodeKindTagsRef.current,
      });
      const expanded = expandImportedCaseNodesFromNote(normalized, {
        showNodeKindTags: showNodeKindTagsRef.current,
      });

      // 先更新 mindDataRef.current，再更新 workspaceName，避免因 React 状态更新异步特性
      // 导致 useEffect 在 mindDataRef.current 更新前触发，持久化旧数据覆盖新数据
      setDataAndSync(expanded.data, {
        selectedId: getFirstGeneratedCaseId(expanded.data) ?? expanded.data.nodeData.id,
        refreshMind: true,
      });

      // 在 setDataAndSync 之后更新 workspaceName，确保 mindDataRef.current 已是新数据
      if (aiWorkspaceName !== workspaceName) {
        setWorkspaceName(aiWorkspaceName);
      }

      await cleanupStaleAttachments(expanded.data);
      setAttachmentReloadSeed((value) => value + 1);
      finishGenerateProgress(generated.source === 'llm' ? 'AI 生成完成' : '模板生成完成');

      // 判断用户是否已离开 AI 用例页，若已离开则弹跨页面 toast
      const isOnAiPage = window.location.pathname === '/cases/ai';
      if (isOnAiPage) {
        toast.success(`AI 用例生成完成（${generated.source === 'llm' ? '大模型' : '回退模板'}）`);
      } else {
        toast.success('AI 用例生成完成，点击返回查看', {
          duration: 8000,
          action: {
            label: '返回查看',
            onClick: () => setLocation('/cases/ai'),
          },
        });
      }
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      console.error('[AICases] remote stream generate failed, fallback local', error);
      setGenerationProgress(68);
      setGenerationStageText('远端流式生成失败，正在切换本地模板...');
      // 通知全局 Context 进度更新（用于 Sidebar 角标）
      notifyProgress(68, '远端流式生成失败，正在切换本地模板...');

      const generated = generateMindDataFromRequirement(requirementText, workspaceName);
      const expanded = expandImportedCaseNodesFromNote(generated, {
        showNodeKindTags: showNodeKindTagsRef.current,
      });

      setDataAndSync(expanded.data, {
        selectedId: getFirstGeneratedCaseId(expanded.data) ?? expanded.data.nodeData.id,
        refreshMind: true,
      });
      await cleanupStaleAttachments(expanded.data);
      setAttachmentReloadSeed((value) => value + 1);
      finishGenerateProgress('本地模板生成完成');

      // 认证失败单独提示，引导用户重新登录
      const isAuthError =
        errMsg.includes('未提供认证令牌') ||
        errMsg.includes('无效或过期的令牌') ||
        errMsg.includes('HTTP 401') ||
        errMsg.includes('未认证');

      const isOnAiPageOnError = window.location.pathname === '/cases/ai';
      if (isAuthError) {
        toast.warning('登录状态已过期，AI 生成已切换至本地模板。请重新登录后再试', {
          duration: 6000,
          action: {
            label: '去登录',
            onClick: () => window.location.replace('/login'),
          },
        });
      } else if (!isOnAiPageOnError) {
        toast.warning('AI 生成失败，已使用本地模板，点击返回查看', {
          duration: 8000,
          action: {
            label: '返回查看',
            onClick: () => setLocation('/cases/ai'),
          },
        });
      } else {
        toast.warning(`远端 AI 生成失败，已使用本地模板生成（${errMsg}）`, { duration: 5000 });
      }
    } finally {
      setIsGenerating(false);
    }
}

interface ChangeAiCaseNodeStatusOptions {
  status: AiCaseNodeStatus;
  mindData: AiCaseMindData | null;
  canEditAnySelectedNode: boolean;
  selectedTestcaseNodeIds: string[];
  selectedNodeId: string | null;
  remoteSyncMetaRef: MutableRefObject<RemoteSyncMeta>;
  workspaceName: string;
  requirementText: string;
  applyWorkspaceDetail: (workspace: AiCaseWorkspaceDetail, options?: { keepSelection?: boolean }) => void;
  updateRemoteSyncMeta: (patch: Partial<RemoteSyncMeta>) => void;
  setDataAndSync: (nextData: AiCaseMindData, options?: { selectedId?: string | null; refreshMind?: boolean }) => void;
  setIsUpdatingNodeStatus: Dispatch<SetStateAction<boolean>>;
}

export async function changeAiCaseNodeStatus({
  status,
  mindData,
  canEditAnySelectedNode,
  selectedTestcaseNodeIds,
  selectedNodeId,
  remoteSyncMetaRef,
  workspaceName,
  requirementText,
  applyWorkspaceDetail,
  updateRemoteSyncMeta,
  setDataAndSync,
  setIsUpdatingNodeStatus,
}: ChangeAiCaseNodeStatusOptions): Promise<void> {
if (!mindData || !canEditAnySelectedNode) {
      toast.error('请先选中一个可执行测试节点');
      return;
    }

    // 实际要操作的节点 ID 列表：所有选中节点中 kind=testcase 的
    const targetIds = selectedTestcaseNodeIds;
    if (targetIds.length === 0) {
      toast.error('请先选中一个可执行测试节点');
      return;
    }

    const remoteId = remoteSyncMetaRef.current.remoteWorkspaceId;
    if (remoteId) {
      setIsUpdatingNodeStatus(true);
      try {
        // 远端模式：串行更新每个 testcase 节点（API 每次只处理一个节点）
        let latestWorkspace = null;
        // 首次尝试前先做一次同步检查（只在第一个节点时处理 nodeId not found 问题）
        let needsSync = false;

        for (const nodeId of targetIds) {
          try {
            const resp = await aiCasesApi.updateNodeStatus(remoteId, {
              nodeId,
              status,
              meta: { source: 'frontend_click', localUpdatedAt: Date.now() },
            });
            if (resp.data?.workspace) {
              latestWorkspace = resp.data.workspace;
            }
          } catch (firstError) {
            const msg = firstError instanceof Error ? firstError.message : '';
            if (msg.includes('未找到指定 nodeId') && !needsSync) {
              // 首次遇到"未找到 nodeId"：同步 mapData 到远端后，重试当前节点
              needsSync = true;
              console.warn('[AICases] nodeId not found on remote, auto-syncing mapData then retrying...');
              const workspaceNameValue = workspaceName.trim() || 'AI Testcase Workspace';
              const syncResp = await aiCasesApi.updateWorkspace(remoteId, {
                name: workspaceNameValue,
                requirementText: requirementText.trim(),
                mapData: mindData,
                syncSource: 'mixed',
                status: remoteSyncMetaRef.current.remoteStatus ?? 'draft',
              });
              if (syncResp.data) {
                updateRemoteSyncMeta({
                  remoteVersion: syncResp.data.version,
                  remoteStatus: syncResp.data.status,
                  lastRemoteSyncedAt: Date.now(),
                });
              }
              // 同步后重试
              const retryResp = await aiCasesApi.updateNodeStatus(remoteId, {
                nodeId,
                status,
                meta: { source: 'frontend_click', localUpdatedAt: Date.now() },
              });
              if (retryResp.data?.workspace) {
                latestWorkspace = retryResp.data.workspace;
              }
            } else {
              throw firstError;
            }
          }
        }

        if (!latestWorkspace) {
          throw new Error('远端未返回工作台数据');
        }

        applyWorkspaceDetail(latestWorkspace, { keepSelection: true });
        toast.success(
          targetIds.length > 1
            ? `已同步 ${targetIds.length} 个节点状态到远端`
            : '节点状态已同步到远端'
        );
      } catch (error) {
        console.error('[AICases] update remote node status failed', error);
        toast.error(error instanceof Error ? error.message : '节点状态同步失败');
      } finally {
        setIsUpdatingNodeStatus(false);
      }
      return;
    }

    // 本地模式：一次性批量更新所有 testcase 节点状态
    let next = mindData;
    for (const nodeId of targetIds) {
      next = setNodeStatus(next, nodeId, status);
    }
    setDataAndSync(next, {
      // 保留当前主选中节点
      selectedId: selectedNodeId,
      refreshMind: true,
    });
    if (targetIds.length > 1) {
      toast.success(`已批量更新 ${targetIds.length} 个节点状态`);
    }
}
