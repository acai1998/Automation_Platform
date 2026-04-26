export { createAiCaseNodeId } from '@shared/types/aiCaseNodeMetadata';
export type {
  AiCaseGenerationPlan,
  AiCaseGenerationPlanCase,
  AiCaseGenerationPlanModule,
  AiCaseGenerationPlanScenario,
  AiCaseMapData,
  AiCaseMapNode,
  AiCaseNodeKind,
  AiCaseNodeMetadata,
  AiCaseNodePriority,
  AiCaseNodeStatus,
  AiCaseNodeStatusUpdateResult,
  AiCaseStatusHistoryItem,
  AiCaseWorkspaceCounters,
} from './types';
export { calculateWorkspaceCounters } from './counters';
export { normalizeMapData } from './normalization';
export { buildFallbackPlan, buildMapDataFromPlan } from './plan';
export { updateNodeStatusInMap } from './statusUpdate';
