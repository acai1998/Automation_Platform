import { getSecretOrEnv } from '../utils/secrets';
import logger from '../utils/logger';
import { LOG_CONTEXTS } from '../config/logging';
import {
  buildFallbackPlan,
  buildMapDataFromPlan,
  calculateWorkspaceCounters,
  type AiCaseGenerationPlan,
  type AiCaseMapData,
  type AiCaseNodePriority,
} from './aiCaseMapBuilder';

interface OpenAiChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface OpenAiChoice {
  index: number;
  message?: OpenAiChatMessage;
}

interface OpenAiChatResponse {
  id?: string;
  model?: string;
  choices?: OpenAiChoice[];
}

interface LlmConfig {
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

function parsePositiveInt(value: string, fallback: number): number {
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseTemperature(value: string, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(0, Math.min(1.2, parsed));
}

function trimCodeFence(raw: string): string {
  const cleaned = raw.trim();
  const fencedMatch = cleaned.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fencedMatch) {
    return fencedMatch[1].trim();
  }
  return cleaned;
}

function parsePriority(value: unknown): AiCaseNodePriority | undefined {
  if (value === 'P0' || value === 'P1' || value === 'P2' || value === 'P3') {
    return value;
  }
  return undefined;
}

function normalizePlan(raw: unknown, fallbackWorkspaceName: string): AiCaseGenerationPlan {
  if (!raw || typeof raw !== 'object') {
    throw new Error('模型返回结果不是对象');
  }

  const payload = raw as {
    workspaceName?: unknown;
    modules?: unknown;
  };

  if (!Array.isArray(payload.modules) || payload.modules.length === 0) {
    throw new Error('模型返回 modules 为空');
  }

  const modules = payload.modules
    .map((module) => {
      if (!module || typeof module !== 'object') {
        return null;
      }
      const m = module as { name?: unknown; scenarios?: unknown };
      if (typeof m.name !== 'string' || !m.name.trim() || !Array.isArray(m.scenarios)) {
        return null;
      }

      const scenarios = m.scenarios
        .map((scenario) => {
          if (!scenario || typeof scenario !== 'object') {
            return null;
          }

          const s = scenario as { name?: unknown; cases?: unknown };
          if (typeof s.name !== 'string' || !s.name.trim() || !Array.isArray(s.cases)) {
            return null;
          }

          const cases = s.cases
            .map((item) => {
              if (!item || typeof item !== 'object') {
                return null;
              }
              const testCase = item as { title?: unknown; priority?: unknown; note?: unknown };
              if (typeof testCase.title !== 'string' || !testCase.title.trim()) {
                return null;
              }

              return {
                title: testCase.title.trim(),
                priority: parsePriority(testCase.priority),
                note: typeof testCase.note === 'string' ? testCase.note.trim() : undefined,
              };
            })
            .filter((item): item is NonNullable<typeof item> => item !== null);

          if (cases.length === 0) {
            return null;
          }

          return {
            name: s.name.trim(),
            cases,
          };
        })
        .filter((item): item is NonNullable<typeof item> => item !== null);

      if (scenarios.length === 0) {
        return null;
      }

      return {
        name: m.name.trim(),
        scenarios,
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  if (modules.length === 0) {
    throw new Error('模型返回的 modules 无有效数据');
  }

  return {
    workspaceName:
      typeof payload.workspaceName === 'string' && payload.workspaceName.trim()
        ? payload.workspaceName.trim()
        : fallbackWorkspaceName,
    modules,
  };
}

export class AiCaseGenerationService {
  private readonly config: LlmConfig;

  constructor() {
    const apiKey = getSecretOrEnv('AI_CASE_LLM_API_KEY');
    const baseUrl = getSecretOrEnv('AI_CASE_LLM_BASE_URL', 'https://api.openai.com/v1');
    const model = getSecretOrEnv('AI_CASE_LLM_MODEL', 'gpt-4o-mini');

    this.config = {
      enabled: Boolean(apiKey && baseUrl && model),
      provider: getSecretOrEnv('AI_CASE_LLM_PROVIDER', 'openai-compatible'),
      baseUrl,
      model,
      apiKey,
      temperature: parseTemperature(getSecretOrEnv('AI_CASE_LLM_TEMPERATURE', '0.2'), 0.2),
      maxTokens: parsePositiveInt(getSecretOrEnv('AI_CASE_LLM_MAX_TOKENS', '3000'), 3000),
      timeoutMs: parsePositiveInt(getSecretOrEnv('AI_CASE_LLM_TIMEOUT_MS', '30000'), 30000),
    };

    logger.info('AiCaseGenerationService initialized', {
      provider: this.config.provider,
      baseUrl: this.config.baseUrl,
      model: this.config.model,
      enabled: this.config.enabled,
      timeoutMs: this.config.timeoutMs,
      maxTokens: this.config.maxTokens,
    }, LOG_CONTEXTS.CASES);
  }

  async generate(request: AiCaseGenerationRequest): Promise<AiCaseGenerationResult> {
    const requirementText = request.requirementText?.trim();
    const workspaceName = request.workspaceName?.trim() || 'AI Testcase Workspace';

    if (!requirementText) {
      throw new Error('requirementText 不能为空');
    }

    if (!this.config.enabled) {
      const fallbackPlan = buildFallbackPlan(requirementText, workspaceName);
      const mapData = buildMapDataFromPlan(fallbackPlan);
      const counters = calculateWorkspaceCounters(mapData);
      return {
        source: 'fallback',
        provider: this.config.provider,
        model: this.config.model,
        workspaceName: fallbackPlan.workspaceName,
        mapData,
        counters,
        message: 'AI_CASE_LLM_API_KEY 未配置，返回规则引擎生成结果',
      };
    }

    try {
      const plan = await this.generateViaLlm(requirementText, workspaceName);
      const mapData = buildMapDataFromPlan(plan);
      const counters = calculateWorkspaceCounters(mapData);

      return {
        source: 'llm',
        provider: this.config.provider,
        model: this.config.model,
        workspaceName: plan.workspaceName,
        mapData,
        counters,
        message: '大模型生成成功',
      };
    } catch (error) {
      logger.errorLog(error, 'LLM generation failed, fallback to template', {
        provider: this.config.provider,
        model: this.config.model,
      });

      const fallbackPlan = buildFallbackPlan(requirementText, workspaceName);
      const mapData = buildMapDataFromPlan(fallbackPlan);
      const counters = calculateWorkspaceCounters(mapData);

      return {
        source: 'fallback',
        provider: this.config.provider,
        model: this.config.model,
        workspaceName: fallbackPlan.workspaceName,
        mapData,
        counters,
        message: `大模型调用失败，已回退模板：${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  private async generateViaLlm(requirementText: string, workspaceName: string): Promise<AiCaseGenerationPlan> {
    const endpoint = this.resolveCompletionEndpoint(this.config.baseUrl);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      const systemPrompt = [
        '你是资深测试专家，请根据需求生成可执行的测试用例脑图计划。',
        '你必须只返回 JSON，不要返回额外解释。',
        'JSON schema:',
        '{',
        '  "workspaceName": "string",',
        '  "modules": [',
        '    {',
        '      "name": "string",',
        '      "scenarios": [',
        '        {',
        '          "name": "string",',
        '          "cases": [',
        '            {',
        '              "title": "string",',
        '              "priority": "P0|P1|P2|P3",',
        '              "note": "string"',
        '            }',
        '          ]',
        '        }',
        '      ]',
        '    }',
        '  ]',
        '}',
        '要求:',
        '1) modules 至少 3 个，每个 module 至少 1 个 scenario。',
        '2) 每个 scenario 至少 2 个测试点。',
        '3) 覆盖主流程、边界、异常、权限与兼容性。',
        '4) 标题使用中文，简洁可执行。',
      ].join('\n');

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.config.model,
          temperature: this.config.temperature,
          max_tokens: this.config.maxTokens,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: systemPrompt },
            {
              role: 'user',
              content: `workspaceName: ${workspaceName}\nrequirement:\n${requirementText}`,
            },
          ],
        }),
        signal: controller.signal,
      });

      const payload = (await response.json()) as OpenAiChatResponse & {
        error?: { message?: string };
      };

      if (!response.ok) {
        throw new Error(payload.error?.message || `LLM 请求失败: HTTP ${response.status}`);
      }

      const content = payload.choices?.[0]?.message?.content;
      if (!content || typeof content !== 'string') {
        throw new Error('LLM 返回内容为空');
      }

      const jsonText = trimCodeFence(content);
      const rawPlan = JSON.parse(jsonText) as unknown;
      return normalizePlan(rawPlan, workspaceName);
    } finally {
      clearTimeout(timer);
    }
  }

  private resolveCompletionEndpoint(baseUrl: string): string {
    const normalized = baseUrl.trim().replace(/\/+$/, '');
    if (normalized.endsWith('/chat/completions')) {
      return normalized;
    }
    if (normalized.endsWith('/v1')) {
      return `${normalized}/chat/completions`;
    }
    return `${normalized}/v1/chat/completions`;
  }
}

export const aiCaseGenerationService = new AiCaseGenerationService();
