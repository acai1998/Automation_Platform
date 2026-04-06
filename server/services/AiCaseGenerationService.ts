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

export interface AiCaseGenerationProgressEvent {
  progress: number;
  stage: string;
  source: 'llm' | 'fallback' | 'system';
  detail?: string;
}

/**
 * 流式节点推送事件：每生成一个 module（含其下所有 testcase），推送一次
 */
export interface AiCaseGenerationNodeEvent {
  /** 当前 module 节点的脑图数据（含子 testcase 节点） */
  moduleNode: AiCaseMapData['nodeData'];
  /** 当前 module 在 modules 列表中的索引（0-based） */
  moduleIndex: number;
  /** modules 总数 */
  totalModules: number;
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function trimCodeFence(raw: string): string {
  const cleaned = raw.trim();
  const fencedMatch = cleaned.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fencedMatch) {
    return fencedMatch[1].trim();
  }
  return cleaned;
}

/**
 * 校验 LLM 生成的 workspaceName 是否有意义：
 * - 必须包含至少一个中文字符（避免英文无意义名）
 * - 长度在 2-30 字符之间
 * - 不是已知的无意义占位词
 */
function isValidWorkspaceName(name: string): boolean {
  if (name.length < 2 || name.length > 30) {
    return false;
  }
  const hasChinese = /[\u4e00-\u9fa5]/.test(name);
  if (!hasChinese) {
    return false;
  }
  const meaninglessPatterns = /^(ai\s*)?(test(case)?s?|workspace|plan|测试工作台)$/i;
  return !meaninglessPatterns.test(name.trim());
}

function parsePriority(value: unknown): AiCaseNodePriority | undefined {
  if (value === 'P0' || value === 'P1' || value === 'P2' || value === 'P3') {
    return value;
  }
  return undefined;
}

function parseStringList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const next = value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter((item) => Boolean(item));

  return next.length > 0 ? next : undefined;
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
              const testCase = item as {
                title?: unknown;
                priority?: unknown;
                note?: unknown;
                preconditions?: unknown;
                steps?: unknown;
                expectedResults?: unknown;
              };
              if (typeof testCase.title !== 'string' || !testCase.title.trim()) {
                return null;
              }

              return {
                title: testCase.title.trim(),
                priority: parsePriority(testCase.priority),
                note: typeof testCase.note === 'string' ? testCase.note.trim() : undefined,
                preconditions: parseStringList(testCase.preconditions),
                steps: parseStringList(testCase.steps),
                expectedResults: parseStringList(testCase.expectedResults),
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

  // 代码层强制校验结构下限，不仅靠 prompt 约束
  if (modules.length < 3) {
    throw new Error(`模型返回的模块数量不足（得到 ${modules.length} 个，少于要求的 3 个）`);
  }

  for (const m of modules) {
    for (const s of m.scenarios) {
      if (s.cases.length < 2) {
        throw new Error(`模块「${m.name}」中场景「${s.name}」的测试点不足（得到 ${s.cases.length} 个，少于要求的 2 个）`);
      }
      for (const c of s.cases) {
        if (!c.steps || c.steps.length < 2) {
          throw new Error(`场景「${s.name}」中测试点「${c.title}」的测试步骤不足（得到 ${c.steps?.length ?? 0} 条，少于要求的 2 条）`);
        }
      }
    }
  }

  const rawWsName = typeof payload.workspaceName === 'string' ? payload.workspaceName.trim() : '';
  return {
    workspaceName: rawWsName && isValidWorkspaceName(rawWsName) ? rawWsName : fallbackWorkspaceName,
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

  private pushProgress(
    onProgress: ((event: AiCaseGenerationProgressEvent) => void) | undefined,
    event: AiCaseGenerationProgressEvent
  ): void {
    if (!onProgress) {
      return;
    }

    onProgress({
      ...event,
      progress: Math.max(0, Math.min(100, Math.round(event.progress))),
    });
  }

  private async streamModuleNodes(
    mapData: AiCaseMapData,
    onNode: ((event: AiCaseGenerationNodeEvent) => void) | undefined,
    delayMs = 80
  ): Promise<void> {
    if (!onNode || !mapData.nodeData.children) {
      return;
    }
    const totalModules = mapData.nodeData.children.length;
    for (let moduleIndex = 0; moduleIndex < totalModules; moduleIndex++) {
      onNode({ moduleNode: mapData.nodeData.children[moduleIndex], moduleIndex, totalModules });
      if (moduleIndex < totalModules - 1) {
        await sleep(delayMs);
      }
    }
  }

  async generate(
    request: AiCaseGenerationRequest,
    onProgress?: (event: AiCaseGenerationProgressEvent) => void,
    onNode?: (event: AiCaseGenerationNodeEvent) => void
  ): Promise<AiCaseGenerationResult> {
    const requirementText = request.requirementText?.trim();
    const workspaceName = request.workspaceName?.trim() || 'AI Testcase Workspace';

    this.pushProgress(onProgress, {
      progress: 6,
      stage: '后端已接收生成请求',
      source: 'system',
    });

    if (!requirementText) {
      throw new Error('requirementText 不能为空');
    }

    this.pushProgress(onProgress, {
      progress: 12,
      stage: '正在解析需求文本',
      source: 'system',
    });

    if (!this.config.enabled) {
      this.pushProgress(onProgress, {
        progress: 35,
        stage: '未配置大模型，切换规则模板生成',
        source: 'fallback',
      });

      const fallbackPlan = buildFallbackPlan(requirementText, workspaceName);
      const mapData = buildMapDataFromPlan(fallbackPlan);
      const counters = calculateWorkspaceCounters(mapData);

      // 逐个推送 fallback 的每个 module 节点（各模块间加延迟让前端可见流式效果）
      await this.streamModuleNodes(mapData, onNode);

      this.pushProgress(onProgress, {
        progress: 95,
        stage: '模板结果整理完成',
        source: 'fallback',
      });

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
      this.pushProgress(onProgress, {
        progress: 22,
        stage: '开始调用大模型服务',
        source: 'llm',
      });

      const plan = await this.generateViaLlm(requirementText, workspaceName, onProgress);

      this.pushProgress(onProgress, {
        progress: 88,
        stage: '正在组装脑图节点结构',
        source: 'llm',
      });

      const mapData = buildMapDataFromPlan(plan);
      const counters = calculateWorkspaceCounters(mapData);

      // 逐个推送 module 节点（各模块间加延迟让前端可见渐进式渲染效果）
      await this.streamModuleNodes(mapData, onNode);

      this.pushProgress(onProgress, {
        progress: 98,
        stage: '正在计算统计指标',
        source: 'llm',
      });

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

      this.pushProgress(onProgress, {
        progress: 66,
        stage: '大模型调用失败，切换规则模板',
        source: 'fallback',
        detail: error instanceof Error ? error.message : String(error),
      });

      const fallbackPlan = buildFallbackPlan(requirementText, workspaceName);
      const mapData = buildMapDataFromPlan(fallbackPlan);
      const counters = calculateWorkspaceCounters(mapData);

      // 逐个推送 fallback 的每个 module 节点（各模块间加延迟让前端可见流式效果）
      await this.streamModuleNodes(mapData, onNode);

      this.pushProgress(onProgress, {
        progress: 95,
        stage: '模板结果整理完成',
        source: 'fallback',
      });

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

  private async generateViaLlm(
    requirementText: string,
    workspaceName: string,
    onProgress?: (event: AiCaseGenerationProgressEvent) => void
  ): Promise<AiCaseGenerationPlan> {
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
        '              "preconditions": ["string"],',
        '              "steps": ["string"],',
        '              "expectedResults": ["string"]',
        '            }',
        '          ]',
        '        }',
        '      ]',
        '    }',
        '  ]',
        '}',
        '要求:',
        '1) workspaceName 根据需求内容自动命名，使用中文，简洁概括核心功能（如"登录功能测试"、"支付流程测试"），不超过 20 字，禁止使用"AI Testcase Workspace"等无意义默认名。',
        '2) modules 至少 3 个，每个 module 至少 1 个 scenario。',
        '3) 每个 scenario 至少 2 个测试点。',
        '4) 覆盖主流程、边界、异常、权限与兼容性。',
        '5) 标题使用中文，简洁可执行。',
        '6) 每个测试点都必须输出 preconditions / steps / expectedResults，且 steps 至少 2 条。',
        '7) 每个测试点遵循固定顺序：测试点 -> 前置条件 -> 测试步骤 -> 预期结果。',
        '8) 禁止输出"测试场景"作为测试点内部标签。',
      ].join('\n');

      this.pushProgress(onProgress, {
        progress: 30,
        stage: '已发送模型请求，等待响应',
        source: 'llm',
      });

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
              content: `requirement:\n${requirementText}`,
            },
          ],
        }),
        signal: controller.signal,
      });

      this.pushProgress(onProgress, {
        progress: 58,
        stage: '模型已返回响应，正在解析内容',
        source: 'llm',
      });

      // 先读取原始文本，再手动解析 JSON，避免网关错误等非 JSON 响应导致上下文丢失
      const rawText = await response.text();
      let payload: (OpenAiChatResponse & { error?: { message?: string } }) | null = null;
      try {
        payload = JSON.parse(rawText) as OpenAiChatResponse & { error?: { message?: string } };
      } catch {
        if (!response.ok) {
          throw new Error(`LLM 请求失败: HTTP ${response.status}, 响应内容=${rawText.slice(0, 300)}`);
        }
        throw new Error(`LLM 返回了非 JSON 内容: ${rawText.slice(0, 300)}`);
      }

      if (!response.ok) {
        throw new Error(payload?.error?.message || `LLM 请求失败: HTTP ${response.status}`);
      }

      const content = payload?.choices?.[0]?.message?.content;
      if (!content || typeof content !== 'string') {
        throw new Error('LLM 返回内容为空');
      }

      this.pushProgress(onProgress, {
        progress: 74,
        stage: '正在校验模型输出结构',
        source: 'llm',
      });

      const jsonText = trimCodeFence(content);
      const rawPlan = JSON.parse(jsonText) as unknown;

      this.pushProgress(onProgress, {
        progress: 82,
        stage: '模型输出解析成功',
        source: 'llm',
      });

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
