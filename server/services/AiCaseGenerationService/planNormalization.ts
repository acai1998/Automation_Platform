import type {
  AiCaseGenerationPlan,
  AiCaseNodePriority,
} from './types';

const PLAN_MIN_MODULES = 3;
const PLAN_MIN_CASES_PER_SCENARIO = 2;
const PLAN_MIN_STEPS_PER_CASE = 3;

export function trimCodeFence(raw: string): string {
  const cleaned = raw.trim();
  const fencedMatch = cleaned.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fencedMatch) {
    return fencedMatch[1].trim();
  }
  return cleaned;
}

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

export function normalizePlan(raw: unknown, fallbackWorkspaceName: string): AiCaseGenerationPlan {
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

  if (modules.length < PLAN_MIN_MODULES) {
    throw new Error(`模型返回的模块数量不足（得到 ${modules.length} 个，少于要求的 ${PLAN_MIN_MODULES} 个）`);
  }

  for (const m of modules) {
    for (const s of m.scenarios) {
      if (s.cases.length < PLAN_MIN_CASES_PER_SCENARIO) {
        throw new Error(`模块“${m.name}”中场景“${s.name}”的测试点不足（得到 ${s.cases.length} 个，少于要求的 ${PLAN_MIN_CASES_PER_SCENARIO} 个）`);
      }
      for (const c of s.cases) {
        if (!c.steps || c.steps.length < PLAN_MIN_STEPS_PER_CASE) {
          throw new Error(`场景“${s.name}”中测试点“${c.title}”的测试步骤不足（得到 ${c.steps?.length ?? 0} 条，少于要求的 ${PLAN_MIN_STEPS_PER_CASE} 条）`);
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
