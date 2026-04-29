export { createAiCaseNodeId } from '@shared/types/aiCaseNodeMetadata';
export type {
  AiCaseGenerationPlan,
  AiCaseGenerationPlanCase,
  AiCaseGenerationPlanModule,
  AiCaseGenerationPlanScenario,
  AiCaseStructureData,
  AiCaseStructureNode,
  AiCaseStructureStatusUpdateResult,
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
export {
  cloneStructureData,
  cloneMapData,
  normalizeStructureData,
  normalizeMapData,
} from './normalization';
export {
  buildFallbackPlan,
  buildStructureDataFromPlan,
  buildMapDataFromPlan,
} from './plan';
export {
  updateNodeStatusInStructure,
  updateNodeStatusInMap,
} from './statusUpdate';
