import type {
  AiCaseNodeKind,
  AiCaseNodeMetadata,
  AiCaseNodePriority,
  AiCaseNodeStatus,
} from './aiCaseNodeMetadata';

export interface AiCaseMapNode {
  id: string;
  topic: string;
  note?: string;
  expanded?: boolean;
  tags?: Array<string | { text: string; style?: Record<string, string> }>;
  metadata?: Partial<AiCaseNodeMetadata>;
  children?: AiCaseMapNode[];
  [key: string]: unknown;
}

export interface AiCaseMapData {
  nodeData: AiCaseMapNode;
  arrows?: unknown[];
  summaries?: unknown[];
  direction?: 0 | 1 | 2;
  theme?: unknown;
  [key: string]: unknown;
}

export interface AiCaseWorkspaceCounters {
  totalCases: number;
  todoCases: number;
  doingCases: number;
  blockedCases: number;
  passedCases: number;
  failedCases: number;
  skippedCases: number;
}

export interface AiCaseGenerationPlanCase {
  title: string;
  priority?: AiCaseNodePriority;
  note?: string;
  preconditions?: string[];
  steps?: string[];
  expectedResults?: string[];
}

export interface AiCaseGenerationPlanScenario {
  name: string;
  cases: AiCaseGenerationPlanCase[];
}

export interface AiCaseGenerationPlanModule {
  name: string;
  scenarios: AiCaseGenerationPlanScenario[];
}

export interface AiCaseGenerationPlan {
  workspaceName: string;
  modules: AiCaseGenerationPlanModule[];
}

export interface AiCaseNodeStatusUpdateResult {
  updated: boolean;
  previousStatus: AiCaseNodeStatus | null;
  currentStatus: AiCaseNodeStatus;
  nodeTopic: string;
  nodePath: string | null;
  mapData: AiCaseMapData;
}

export type {
  AiCaseNodeKind,
  AiCaseNodeMetadata,
  AiCaseNodePriority,
  AiCaseNodeStatus,
};
