/**
 * 批量导入历史优质用例到知识库
 *
 * 功能：
 *   1. 查询所有已有需求文本的工作台
 *   2. 可过滤：仅处理指定 ID 列表、仅处理质量分 >= 阈值的记录
 *   3. 为每条记录生成 Embedding 并写入 requirement_embedding 字段
 *   4. 标记 is_knowledge_base = 1（可选）
 *
 * 使用方式：
 *   # 将所有有需求文本的工作台标记为知识库（默认质量分 60）
 *   npx ts-node --project tsconfig.server.json -r tsconfig-paths/register scripts/import-knowledge-base.ts
 *
 *   # 仅处理指定 ID
 *   WORKSPACE_IDS=1,2,3 npx ts-node ...
 *
 *   # 设置质量分
 *   QUALITY_SCORE=80 WORKSPACE_IDS=1,2,3 npx ts-node ...
 *
 *   # 仅生成 Embedding 但不标记为知识库（用于预热向量）
 *   MARK_AS_KB=false npx ts-node ...
 *
 * 环境变量：
 *   WORKSPACE_IDS     逗号分隔的工作台 ID 列表（不填则处理所有有需求文本的记录）
 *   QUALITY_SCORE     质量评分，默认 60（0-100）
 *   MARK_AS_KB        是否标记为知识库，默认 true
 *   DRY_RUN           true = 只打印，不实际写入
 *   CONCURRENCY       并发数，默认 3（避免 rate limit）
 *
 * 前置条件：
 *   - 已执行 migrate-v1.6.0.sql（或 TypeORM synchronize 已同步新字段）
 *   - .env 中已配置 AI_CASE_LLM_API_KEY 或 AI_EMBEDDING_API_KEY
 */

import 'dotenv/config';
import { query } from '../server/config/database';
import { embeddingService } from '../server/services/EmbeddingService';

// ─── 配置 ──────────────────────────────────────────────────────────────────
const WORKSPACE_IDS_RAW = process.env.WORKSPACE_IDS ?? '';
const QUALITY_SCORE = Math.max(0, Math.min(100, Number(process.env.QUALITY_SCORE ?? '60') || 60));
const MARK_AS_KB = process.env.MARK_AS_KB !== 'false';
const DRY_RUN = process.env.DRY_RUN === 'true';
const CONCURRENCY = Math.max(1, Number(process.env.CONCURRENCY ?? '3') || 3);

interface WorkspaceRow {
  id: number;
  name: string;
  requirement_text: string;
  is_knowledge_base: number;
  requirement_embedding: string | null;
  quality_score: number;
}

interface ImportResult {
  id: number;
  name: string;
  status: 'success' | 'skipped' | 'failed';
  reason?: string;
}

async function loadWorkspaces(specificIds: number[]): Promise<WorkspaceRow[]> {
  if (specificIds.length > 0) {
    const placeholders = specificIds.map(() => '?').join(',');
    return query<WorkspaceRow[]>(
      `SELECT id, name, requirement_text, is_knowledge_base, requirement_embedding, quality_score
       FROM Auto_AiCaseWorkspaces
       WHERE id IN (${placeholders})
         AND requirement_text IS NOT NULL
         AND requirement_text != ''`,
      specificIds
    );
  }

  return query<WorkspaceRow[]>(
    `SELECT id, name, requirement_text, is_knowledge_base, requirement_embedding, quality_score
     FROM Auto_AiCaseWorkspaces
     WHERE requirement_text IS NOT NULL
       AND requirement_text != ''
     ORDER BY updated_at DESC`
  );
}

async function processWorkspace(row: WorkspaceRow): Promise<ImportResult> {
  const { id, name, requirement_text } = row;

  // 如果已有 embedding 且已在知识库中，可以跳过（除非强制重新导入）
  if (row.requirement_embedding && row.is_knowledge_base === 1) {
    return { id, name, status: 'skipped', reason: '已在知识库中且有向量，跳过' };
  }

  if (DRY_RUN) {
    return { id, name, status: 'success', reason: '[DRY_RUN] 模拟成功' };
  }

  try {
    // 生成 Embedding
    const vector = await embeddingService.embed(requirement_text);
    if (!vector) {
      return { id, name, status: 'failed', reason: 'Embedding 生成失败（API 未启用或调用出错）' };
    }

    const embeddingJson = JSON.stringify(vector);

    // 写入数据库
    if (MARK_AS_KB) {
      await query(
        `UPDATE Auto_AiCaseWorkspaces
         SET requirement_embedding = ?, is_knowledge_base = 1, quality_score = ?
         WHERE id = ?`,
        [embeddingJson, QUALITY_SCORE, id]
      );
    } else {
      await query(
        `UPDATE Auto_AiCaseWorkspaces
         SET requirement_embedding = ?
         WHERE id = ?`,
        [embeddingJson, id]
      );
    }

    return { id, name, status: 'success' };
  } catch (error) {
    return {
      id,
      name,
      status: 'failed',
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

async function runWithConcurrency<T>(
  items: T[],
  fn: (item: T) => Promise<ImportResult>,
  concurrency: number
): Promise<ImportResult[]> {
  const results: ImportResult[] = [];
  const queue = [...items];
  let completed = 0;

  const worker = async (): Promise<void> => {
    while (queue.length > 0) {
      const item = queue.shift();
      if (!item) break;
      const result = await fn(item);
      results.push(result);
      completed++;

      const total = items.length;
      const pct = Math.round((completed / total) * 100);
      const icon = result.status === 'success' ? '✓' : result.status === 'skipped' ? '→' : '✗';
      console.log(`[${pct}%] ${icon} #${(result as ImportResult).id} ${(result as ImportResult).name} — ${result.status}${result.reason ? ` (${result.reason})` : ''}`);
    }
  };

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

async function main(): Promise<void> {
  console.log('='.repeat(60));
  console.log('AI 用例知识库批量导入工具');
  console.log('='.repeat(60));
  console.log(`配置：`);
  console.log(`  QUALITY_SCORE = ${QUALITY_SCORE}`);
  console.log(`  MARK_AS_KB    = ${MARK_AS_KB}`);
  console.log(`  DRY_RUN       = ${DRY_RUN}`);
  console.log(`  CONCURRENCY   = ${CONCURRENCY}`);
  if (WORKSPACE_IDS_RAW) {
    console.log(`  WORKSPACE_IDS = ${WORKSPACE_IDS_RAW}`);
  }
  console.log('');

  if (!embeddingService.isEnabled) {
    if (DRY_RUN) {
      console.warn('⚠ Embedding API 未配置，DRY_RUN 模式下继续...');
    } else {
      console.error('✗ Embedding API 未配置（请检查 AI_CASE_LLM_API_KEY 或 AI_EMBEDDING_API_KEY）');
      process.exit(1);
    }
  }

  // 解析指定 ID 列表
  const specificIds = WORKSPACE_IDS_RAW
    ? WORKSPACE_IDS_RAW.split(',').map((s) => Number(s.trim())).filter((n) => n > 0)
    : [];

  console.log(`正在加载工作台数据...`);
  const workspaces = await loadWorkspaces(specificIds);

  if (workspaces.length === 0) {
    console.log('没有找到符合条件的工作台（无需求文本或 ID 不存在）');
    process.exit(0);
  }

  console.log(`找到 ${workspaces.length} 个工作台，开始处理...\n`);

  const results = await runWithConcurrency(workspaces, processWorkspace, CONCURRENCY);

  // 汇总
  const successCount = results.filter((r) => r.status === 'success').length;
  const skippedCount = results.filter((r) => r.status === 'skipped').length;
  const failedCount = results.filter((r) => r.status === 'failed').length;

  console.log('');
  console.log('='.repeat(60));
  console.log('导入结果汇总：');
  console.log(`  ✓ 成功：${successCount}`);
  console.log(`  → 跳过：${skippedCount}`);
  console.log(`  ✗ 失败：${failedCount}`);
  console.log('='.repeat(60));

  if (failedCount > 0) {
    console.log('\n失败详情：');
    results
      .filter((r) => r.status === 'failed')
      .forEach((r) => console.log(`  #${r.id} ${r.name}: ${r.reason}`));
  }

  process.exit(failedCount > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('脚本执行失败：', err);
  process.exit(1);
});
