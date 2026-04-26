import type {
  AiCaseGenerationPlan,
  AiCaseMapData,
  AiCaseNodePriority,
} from '../aiCaseMapBuilder';

export interface OpenAiChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface OpenAiChoice {
  index: number;
  message?: OpenAiChatMessage;
}

export interface OpenAiChatResponse {
  id?: string;
  model?: string;
  choices?: OpenAiChoice[];
}

export interface LlmConfig {
  enabled: boolean;
  provider: string;
  baseUrl: string;
  model: string;
  apiKey: string;
  temperature: number;
  maxTokens: number;
  timeoutMs: number;
}

export interface AiCaseGenerationRequest {
  requirementText: string;
  workspaceName?: string;
}

export interface AiCaseGenerationResult {
  source: 'llm' | 'fallback';
  provider: string;
  model: string;
  workspaceName: string;
  mapData: AiCaseMapData;
  counters: {
    totalCases: number;
    todoCases: number;
    doingCases: number;
    blockedCases: number;
    passedCases: number;
    failedCases: number;
    skippedCases: number;
  };
  message: string;
}

export interface AiCaseGenerationProgressEvent {
  progress: number;
  stage: string;
  source: 'llm' | 'fallback' | 'system';
  detail?: string;
}

export interface AiCaseGenerationNodeEvent {
  moduleNode: AiCaseMapData['nodeData'];
  moduleIndex: number;
  totalModules: number;
}

export type {
  AiCaseGenerationPlan,
  AiCaseMapData,
  AiCaseNodePriority,
};
