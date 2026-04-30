import type {
  AiCaseGenerationPlan,
  AiCaseGenerationPlanCase,
  AiCaseGenerationPlanModule,
  AiCaseGenerationPlanScenario,
  AiCaseNodeKind,
  AiCaseNodeMetadata,
  AiCaseNodePriority,
  AiCaseNodeStatus,
  AiCaseStructureData,
  AiCaseStructureNode,
  AiCaseStructureStatusUpdateResult,
  AiCaseWorkspaceCounters,
} from './aiCaseStructure';

export type AiCaseMapNode = AiCaseStructureNode;
export type AiCaseMapData = AiCaseStructureData;

export interface AiCaseNodeStatusUpdateResult extends Omit<AiCaseStructureStatusUpdateResult, 'structureData'> {
  mapData: AiCaseMapData;
}

export type {
  AiCaseGenerationPlan,
  AiCaseGenerationPlanCase,
  AiCaseGenerationPlanModule,
  AiCaseGenerationPlanScenario,
  AiCaseWorkspaceCounters,
  AiCaseNodeKind,
  AiCaseNodeMetadata,
  AiCaseNodePriority,
  AiCaseNodeStatus,
};
