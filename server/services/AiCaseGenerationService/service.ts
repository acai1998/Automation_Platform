import { getSecretOrEnv } from '../../utils/secrets';
import logger from '../../utils/logger';
import { LOG_CONTEXTS } from '../../config/logging';
import {
  buildFallbackPlan,
  buildMapDataFromPlan,
  calculateWorkspaceCounters,
  type AiCaseGenerationPlan,
  type AiCaseMapData,
  type AiCaseNodePriority,
} from '../aiCaseMapBuilder';
import { caseKnowledgeRetrievalService } from '../CaseKnowledgeRetrievalService';

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

// ─── normalizePlan 结构校验下限（避免魔法数字散落在代码中）─────────────────────
const PLAN_MIN_MODULES = 3;
const PLAN_MIN_CASES_PER_SCENARIO = 2;
const PLAN_MIN_STEPS_PER_CASE = 3;

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
  if (modules.length < PLAN_MIN_MODULES) {
    throw new Error(`模型返回的模块数量不足（得到 ${modules.length} 个，少于要求的 ${PLAN_MIN_MODULES} 个）`);
  }

  for (const m of modules) {
    for (const s of m.scenarios) {
      if (s.cases.length < PLAN_MIN_CASES_PER_SCENARIO) {
        throw new Error(`模块「${m.name}」中场景「${s.name}」的测试点不足（得到 ${s.cases.length} 个，少于要求的 ${PLAN_MIN_CASES_PER_SCENARIO} 个）`);
      }
      for (const c of s.cases) {
        if (!c.steps || c.steps.length < PLAN_MIN_STEPS_PER_CASE) {
          throw new Error(`场景「${s.name}」中测试点「${c.title}」的测试步骤不足（得到 ${c.steps?.length ?? 0} 条，少于要求的 ${PLAN_MIN_STEPS_PER_CASE} 条）`);
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

// ─── 静态 Few-shot 知识库（按需求类型分类，后期可替换为向量检索）────────────

/**
 * 根据需求文本关键词匹配对应类型的静态 few-shot 示例
 * 匹配优先级：精确类型 > 通用示例
 * 后期可被 CaseKnowledgeRetrievalService 的向量检索结果替换
 */
function buildStaticFewShot(requirementText: string): string {
  const text = requirementText.toLowerCase();

  // 认证/登录/注册/权限相关
  if (/登录|注册|密码|账号|认证|鉴权|token|jwt|sso|oauth|单点|权限|角色|rbac/.test(text)) {
    return `

═══ 参考示例（类似需求的高质量用例，请参考其颗粒度和覆盖风格）═══

【示例需求】用户名密码登录功能

【示例优质用例】
模块：输入校验
  场景：用户名格式校验
    测试点：在用户名输入框中输入超长字符串（101个字符），点击登录后系统拒绝提交
      前置条件：访问登录页面 /login，用户名字段最大长度限制为 100 个字符
      步骤：
        1. 打开登录页面 /login，确认页面已正常加载
        2. 在"用户名"输入框中粘贴一个长度为 101 个字符的字符串（如 101 个字母 a）
        3. 在"密码"输入框中输入任意合法密码（如 Test@1234），点击"登录"按钮
      预期结果：
        - 登录请求未发出（可通过 Network 面板确认）
        - 页面提示"用户名长度不能超过 100 个字符"或输入框拒绝超出限制的字符

模块：异常与安全
  场景：密码暴力破解防护
    测试点：连续输入错误密码 5 次后账号被临时锁定 15 分钟
      前置条件：已注册账号 testuser@example.com，账号处于正常状态（未锁定），当前错误尝试次数为 0
      步骤：
        1. 打开登录页面 /login
        2. 输入用户名 testuser@example.com，输入错误密码 wrong1，点击"登录"，记录提示信息
        3. 重复步骤 2 共计 5 次，每次使用不同的错误密码（wrong1~wrong5）
        4. 使用正确密码再次尝试登录
      预期结果：
        - 第 5 次错误后，提示"账号已被锁定，请 15 分钟后再试"
        - 使用正确密码登录时，仍返回锁定提示，未能登录成功
        - 数据库中该账号的锁定状态字段已更新，解锁时间戳正确记录`;
  }

  // 支付/订单/交易/退款相关
  if (/支付|付款|订单|交易|退款|退货|结算|账单|金额|余额|充值|提现/.test(text)) {
    return `

═══ 参考示例（类似需求的高质量用例，请参考其颗粒度和覆盖风格）═══

【示例需求】商品下单支付功能

【示例优质用例】
模块：金额边界校验
  场景：极小金额支付
    测试点：支付金额为 0.01 元时，订单正常创建且扣款精确
      前置条件：用户账户余额为 1.00 元，购物车中有单价 0.01 元的商品 1 件，支付方式选择余额支付
      步骤：
        1. 打开购物车页面，确认商品单价显示为 0.01 元
        2. 点击"去结算"按钮，在结算页面选择支付方式为"余额支付"
        3. 确认订单总价显示为 0.01 元，点击"立即支付"按钮
        4. 在支付确认弹窗中输入支付密码（如 123456），点击"确认支付"
      预期结果：
        - 支付成功，页面跳转到"支付成功"页面，显示订单号
        - 数据库中订单状态变更为"已支付"，支付金额记录为 0.01 元
        - 用户账户余额从 1.00 元扣减为 0.99 元（精确到分，无浮点误差）
        - 支付流水记录正确生成，金额与订单一致

模块：异常与幂等性
  场景：重复支付防护
    测试点：用户快速双击"立即支付"，系统只创建一笔订单和一条支付记录
      前置条件：用户已选好商品，处于结算页面，网络正常
      步骤：
        1. 在结算页面点击"立即支付"按钮后，在 500ms 内再次点击同一按钮
        2. 等待支付处理完成（最多等待 10 秒）
        3. 查看订单列表和账户流水
      预期结果：
        - 数据库中仅存在 1 条订单记录，无重复订单
        - 账户余额只被扣减 1 次
        - 第二次点击在 UI 层被拦截（按钮变灰或 loading 状态），不触发第二次请求`;
  }

  // 搜索/列表/筛选/分页相关
  if (/搜索|查询|列表|筛选|过滤|排序|分页|检索|关键字/.test(text)) {
    return `

═══ 参考示例（类似需求的高质量用例，请参考其颗粒度和覆盖风格）═══

【示例需求】商品搜索功能

【示例优质用例】
模块：搜索边界
  场景：特殊字符搜索
    测试点：在搜索框中输入 SQL 注入特殊字符，系统安全处理并返回空结果
      前置条件：系统已部署，搜索功能可用，数据库中存在商品数据
      步骤：
        1. 打开商品搜索页面 /search
        2. 在搜索框中输入 "' OR '1'='1"，点击"搜索"按钮或按 Enter
        3. 查看页面响应和返回结果
      预期结果：
        - 页面不崩溃，无 SQL 错误信息暴露
        - 返回"未找到相关商品"空态提示，不返回全量数据
        - 服务端日志无 SQL 异常记录

模块：分页与性能
  场景：最后一页边界
    测试点：当查询结果恰好为 n 页整数倍时，最后一页显示正确，无空白页
      前置条件：系统中某类商品数量恰好为 20 个（分页 size=10），第 2 页为最后一页
      步骤：
        1. 打开搜索页面，搜索该类商品，确认第 1 页显示 10 条数据
        2. 点击"下一页"跳转到第 2 页，等待加载完成
        3. 在第 2 页再次点击"下一页"按钮
      预期结果：
        - 第 2 页显示剩余 10 条数据，无空白条目
        - "下一页"按钮在第 2 页处于禁用状态（置灰或不可点击）
        - 第 3 页不存在，不出现空白列表页面`;
  }

  // 通用示例（无法识别类型时使用）
  return `

═══ 参考示例（通用高质量用例示范，请参考其颗粒度和步骤具体程度）═══

【示例优质用例特征】
  ✓ 测试点标题包含具体的条件和预期行为，如"用户未填写必填字段直接提交时，系统拒绝提交并高亮标红必填项"
  ✓ 前置条件描述具体的测试数据状态，而非"测试环境可用"
  ✓ 每个步骤包含操作对象 + 具体动作 + 输入值，如"在'手机号'输入框中输入 11111111111（11位纯数字但非合法手机号格式）"
  ✓ 预期结果描述可观察的系统状态变化，如"页面在手机号输入框下方显示红色提示'请输入正确的手机号格式'，表单不提交"`;
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

    // ── 知识库检索（可选，失败不影响主流程）─────────────────────────────────
    let knowledgeFewShot: string | undefined;
    try {
      this.pushProgress(onProgress, {
        progress: 16,
        stage: '正在检索知识库参考用例',
        source: 'system',
      });
      const knowledgeItems = await caseKnowledgeRetrievalService.retrieve(requirementText);
      const formatted = caseKnowledgeRetrievalService.formatAsFewShot(knowledgeItems);
      if (formatted) {
        knowledgeFewShot = formatted;
        logger.info('AiCaseGenerationService: knowledge base retrieval succeeded', {
          itemCount: knowledgeItems.length,
        }, LOG_CONTEXTS.CASES);
      }
    } catch (e) {
      // 知识库检索失败不阻塞生成，静默降级
      logger.debug('AiCaseGenerationService: knowledge base retrieval skipped', {
        reason: e instanceof Error ? e.message : String(e),
      });
    }

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

      const plan = await this.generateViaLlm(requirementText, workspaceName, onProgress, knowledgeFewShot);

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
    onProgress?: (event: AiCaseGenerationProgressEvent) => void,
    fewShotExamples?: string
  ): Promise<AiCaseGenerationPlan> {
    const endpoint = this.resolveCompletionEndpoint(this.config.baseUrl);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      // ── 第一层：角色人格 + 思维链引导 ─────────────────────────────────────────
      const roleLayer = [
        '你是一位在互联网行业拥有 10 年经验的资深测试专家，以严谨、细致、不放过任何角落著称。',
        '你的职责是：根据需求文本，生成一份真正可执行、覆盖全面的测试用例脑图计划。',
        '',
        '在生成测试用例之前，你必须先在内心完成以下分析（不在输出中体现，但必须作为生成依据）：',
        '1. 识别需求类型：这是 CRUD 操作、业务流程、权限管理、支付交易，还是搜索/列表功能？',
        '2. 梳理核心业务流程：正向路径是什么？每一步的输入/输出是什么？',
        '3. 找出高风险边界：哪些临界值、极端状态、并发场景会导致真实故障？',
        '4. 识别容易遗漏的角落：异步操作、超时、重试、回滚、权限越界、数据隔离……',
        '5. 评估优先级：哪些是上线前必须验证的核心路径（P0），哪些是重要但非阻塞的（P1）？',
        '6. 判断是否涉及多端/多浏览器兼容性或并发 SLA 要求，有则补充对应用例。',
        '7. 识别需求中的信息缺口：有哪些假设或待确认项可能影响用例设计？',
      ].join('\n');

      // ── 第二层：质量标准 + 负例规避（精华来自 prd-to-testcase skill 规则）──────
      const qualityLayer = [
        '',
        '═══ 质量标准（你生成的每一个用例都必须满足）═══',
        '',
        '【测试点标题】',
        '  ✓ 好标题：包含具体场景条件，如"用户在未登录状态下访问订单列表，系统返回 401"',
        '  ✗ 坏标题：笼统无意义，如"正常测试"、"异常情况"、"边界验证"',
        '',
        '【前置条件】',
        '  ✓ 好的前置条件：具体描述测试数据状态，如"存在余额为 0.01 元的测试账号，账号已绑定银行卡"',
        '  ✗ 坏的前置条件：无意义通用描述，如"测试环境可用"、"系统正常运行"',
        '',
        '【测试步骤（原子化要求，每步只做一件事）】',
        '  规则：',
        '    - 步骤必须以动词开头（点击 / 输入 / 选择 / 打开 / 确认 / 等待……）',
        '    - 一步只做一件事，禁止把两个操作合并在同一条步骤里',
        '    - 涉及 UI 操作时必须说明控件名称，如"点击页面右上角的\'提交\'按钮"',
        '    - 每步必须包含：操作对象 + 具体动作 + 输入值/条件',
        '  ✓ 好的步骤：',
        '    - 在"用户名"输入框中输入超过 50 个字符的字符串（如 51 个字母 a）',
        '    - 点击"立即支付"按钮',
        '    - 在支付确认弹窗中点击"确认支付"按钮',
        '  ✗ 坏的步骤（禁止出现）：',
        '    - 打开页面（过于笼统，必须说明"打开哪个页面"）',
        '    - 进入系统（无意义，必须明确操作路径）',
        '    - 执行操作（不具体，必须说明是什么操作）',
        '    - 输入异常数据（必须指定具体的异常值是什么）',
        '    - 点击按钮并输入密码（两个动作合并了，必须拆分）',
        '',
        '【预期结果（必须描述可观测的系统状态变化，逐条列出）】',
        '  ✓ 好的预期结果：',
        '    - 页面弹出错误提示"用户名长度不能超过 50 个字符"，提交按钮保持不可用状态',
        '    - 数据库中订单状态更新为"已退款"，用户账户余额增加对应金额，退款短信在 60 秒内发送',
        '  ✗ 坏的预期结果（禁止出现）：',
        '    - 系统正常响应（无意义）',
        '    - 操作成功（没有描述成功的具体表现）',
        '    - 页面显示正确（没有说明"正确"意味着什么）',
        '',
        '【覆盖维度要求（最低标准，缺一不可）】',
        '  ✓ 必须覆盖的维度：',
        '    1. 功能正确性：正向主流程，至少覆盖所有核心操作路径',
        '    2. 边界与等价类：临界值（最大/最小/刚好超界）、等价类划分',
        '    3. 异常与容错：空值/null/空字符串、超长输入、非法格式、网络超时/重试',
        '    4. 权限与安全：未授权访问、越权操作、SQL注入/XSS 防护、数据隔离',
        '    5. 并发与幂等性：重复提交、快速双击、并发操作（适用时）',
        '    6. 兼容性：多端/多浏览器（仅当需求涉及端侧差异时补充）',
        '    7. 性能：仅当需求明确包含 SLA/响应时间/并发指标时补充',
        '  每个功能模块至少包含：正向主流程 + 至少 2 个边界/异常/安全场景',
        '  P0 用例：上线前必须全部通过；P1 用例：重要但非阻塞；P2/P3 用例：有时间再做',
      ].join('\n');

      // ── 第三层：输出格式约束 ──────────────────────────────────────────────────
      const schemaLayer = [
        '',
        '═══ 输出格式（严格遵守，只返回 JSON，不要输出任何其他内容）═══',
        '',
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
        '',
        '硬性约束（代码层会严格校验，不满足将导致生成失败）：',
        '1. workspaceName：中文命名，简洁概括核心功能（如"用户登录功能测试"、"订单支付流程测试"），不超过 20 字，禁止使用无意义默认名',
        '2. modules：至少 3 个，按功能域划分（如：核心流程、边界异常、权限安全）',
        '3. 每个 scenario：至少 2 个测试点（cases）',
        '4. 每个 testcase：必须包含 preconditions、steps、expectedResults，steps 至少 3 条',
        '5. 标题全部使用中文',
        '6. 禁止在测试点内部使用"测试场景"作为标签',
      ].join('\n');

      // ── Few-shot 示例层（可选，由知识库检索结果或静态库注入）────────────────
      const fewShotLayer = fewShotExamples
        ? [
            '',
            '═══ 参考示例（以下是类似需求的高质量用例，请参考其颗粒度、覆盖风格和步骤具体程度）═══',
            '',
            fewShotExamples,
          ].join('\n')
        : '';

      const systemPrompt = roleLayer + qualityLayer + schemaLayer + fewShotLayer;

      // 若未传入 few-shot，尝试用静态库匹配
      const resolvedSystemPrompt = fewShotExamples
        ? systemPrompt
        : systemPrompt + buildStaticFewShot(requirementText);

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
            { role: 'system', content: resolvedSystemPrompt },
            {
              role: 'user',
              content: `以下是需要生成测试用例的需求文本：\n\n${requirementText}`,
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

    // 已经是完整路径，直接使用
    if (normalized.endsWith('/chat/completions')) {
      return normalized;
    }

    // 以 /v1 结尾：追加 /chat/completions
    if (/\/v\d+$/.test(normalized)) {
      return `${normalized}/chat/completions`;
    }

    // 其他情况：追加标准的 /v1/chat/completions
    // 注意：若 baseUrl 已包含自定义子路径（如 /v2），此处不会重复追加
    return `${normalized}/v1/chat/completions`;
  }
}

export const aiCaseGenerationService = new AiCaseGenerationService();
