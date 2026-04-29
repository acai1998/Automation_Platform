import type { ResultSetHeader } from 'mysql2/promise';
import { query } from '../config/database';
import logger from '../utils/logger';
import { LOG_CONTEXTS } from '../config/logging';
import { embeddingService } from './EmbeddingService';
import type { AiCaseStructureData } from './aiCaseStructureBuilder';

// ─── 知识库检索配置 ──────────────────────────────────────────────────────────
/** 默认返回的相关用例数量 */
const DEFAULT_TOP_K = 3;
/** 最低相似度阈值：余弦相似度 < 此值的结果不返回（避免不相关噪音） */
const MIN_SIMILARITY_THRESHOLD = 0.65;
/** 知识库候选池最大数量（从数据库加载的最大行数，内存中计算相似度） */
const MAX_CANDIDATE_POOL = 200;

interface KnowledgeBaseRow {
  id: number;
  name: string;
  requirement_text: string | null;
  requirement_embedding: string | null;
  map_data: string;
  quality_score: number;
}

export interface KnowledgeCaseItem {
  id: number;
  name: string;
  requirementText: string | null;
  mapData: AiCaseStructureData;
  qualityScore: number;
  similarity: number;
}

/**
 * 计算两个向量的余弦相似度
 * @returns [-1, 1] 之间的值，1 表示完全相同，-1 表示完全相反
 */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) {
    return 0;
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) {
    return 0;
  }

  return dotProduct / denominator;
}

/**
 * 安全解析 JSON 向量字符串
 * @returns 向量数组，或 null（解析失败）
 */
function parseEmbedding(raw: string | null): number[] | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    return parsed as number[];
  } catch {
    return null;
  }
}

/**
 * 将工作区结构格式化为人类可读的 few-shot 示例文本
 * 目的：让 LLM 能理解示例的结构和颗粒度，不需要完整 JSON
 */
function formatStructureDataAsFewShot(
  name: string,
  requirementText: string | null,
  structureData: AiCaseStructureData,
): string {
  const lines: string[] = [];
  lines.push(`示例工作台名称：${name}`);

  if (requirementText) {
    const shortReq = requirementText.length > 200 ? requirementText.slice(0, 200) + '...' : requirementText;
    lines.push(`示例需求概要：${shortReq}`);
  }

  lines.push('示例用例结构：');

  const rootNode = structureData.nodeData;
  if (!rootNode || !Array.isArray(rootNode.children)) {
    return lines.join('\n');
  }

  // 只展示前 2 个模块，每个模块展示前 2 个用例，避免 prompt 过长
  const modules = rootNode.children.slice(0, 2);
  for (const module of modules) {
    lines.push(`  模块：${module.topic}`);

    if (!Array.isArray(module.children)) continue;
    const testcases = module.children.slice(0, 2);

    for (const testcase of testcases) {
      lines.push(`    测试点：${testcase.topic}`);

      // 链式子节点：前置条件 → 步骤 → 预期结果
      if (!Array.isArray(testcase.children)) continue;
      const precondNode = testcase.children[0];
      if (!precondNode) continue;

      lines.push(`      前置条件：${precondNode.topic}`);

      const stepsNode = precondNode.children?.[0];
      if (stepsNode) {
        lines.push(`      步骤：${stepsNode.topic}`);

        const expectedNode = stepsNode.children?.[0];
        if (expectedNode) {
          lines.push(`      预期结果：${expectedNode.topic}`);
        }
      }
    }
  }

  return lines.join('\n');
}

/**
 * CaseKnowledgeRetrievalService
 *
 * 基于向量语义检索，从知识库中找出与当前需求最相似的历史优质用例，
 * 作为 few-shot 示例注入 AI 生成 prompt，提升用例生成质量。
 *
 * 架构特点：
 * - 零额外基础设施：向量存储在现有 MySQL 的 LONGTEXT 字段
 * - 内存余弦相似度计算：适合数百条知识库规模（<1000 条）
 * - 优雅降级：向量化失败时返回空结果，不影响主流程
 */
export class CaseKnowledgeRetrievalService {
  /**
   * 根据需求文本检索最相关的知识库用例
   *
   * @param requirementText 当前需求文本
   * @param topK 返回前 K 个结果，默认 3
   * @returns 相关用例列表（已按相似度降序排列），或空数组（检索失败/知识库为空）
   */
  async retrieve(requirementText: string, topK = DEFAULT_TOP_K): Promise<KnowledgeCaseItem[]> {
    if (!embeddingService.isEnabled) {
      logger.debug('CaseKnowledgeRetrievalService: EmbeddingService disabled, skipping retrieval');
      return [];
    }

    try {
      // Step 1: 生成查询向量
      const queryVector = await embeddingService.embed(requirementText);
      if (!queryVector) {
        logger.debug('CaseKnowledgeRetrievalService: failed to generate query embedding');
        return [];
      }

      // Step 2: 从数据库加载知识库候选集（只拉取有向量的记录）
      const candidates = await this.loadCandidates();
      if (candidates.length === 0) {
        logger.debug('CaseKnowledgeRetrievalService: knowledge base is empty');
        return [];
      }

      // Step 3: 计算余弦相似度，过滤低质量结果
      const scored = candidates
        .map((row) => {
          const embedding = parseEmbedding(row.requirement_embedding);
          if (!embedding) return null;

          const similarity = cosineSimilarity(queryVector, embedding);
          if (similarity < MIN_SIMILARITY_THRESHOLD) return null;

          let mapData: AiCaseStructureData | null = null;
          try {
            mapData = JSON.parse(row.map_data) as AiCaseStructureData;
          } catch {
            return null;
          }

          return {
            id: row.id,
            name: row.name,
            requirementText: row.requirement_text,
            mapData,
            qualityScore: row.quality_score,
            similarity,
          } as KnowledgeCaseItem;
        })
        .filter((item): item is KnowledgeCaseItem => item !== null);

      // Step 4: 综合评分排序（相似度 * 0.7 + 质量分 * 0.3）
      scored.sort((a, b) => {
        const scoreA = a.similarity * 0.7 + (a.qualityScore / 100) * 0.3;
        const scoreB = b.similarity * 0.7 + (b.qualityScore / 100) * 0.3;
        return scoreB - scoreA;
      });

      const results = scored.slice(0, topK);

      logger.info('CaseKnowledgeRetrievalService: retrieval completed', {
        candidateCount: candidates.length,
        scoredCount: scored.length,
        returnedCount: results.length,
        topSimilarity: results[0]?.similarity?.toFixed(3),
      }, LOG_CONTEXTS.CASES);

      return results;
    } catch (error) {
      logger.warn('CaseKnowledgeRetrievalService: retrieval failed, returning empty result', {
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  /**
   * 将检索结果格式化为 few-shot 示例文本（注入 prompt 用）
   *
   * @param items 检索到的知识库用例
   * @returns 格式化后的示例文本，或 null（无结果时）
   */
  formatAsFewShot(items: KnowledgeCaseItem[]): string | null {
    if (items.length === 0) return null;

    const blocks = items.map((item, index) => {
      const header = `【参考示例 ${index + 1}（相似度 ${(item.similarity * 100).toFixed(0)}%，质量分 ${item.qualityScore}）】`;
      const content = formatStructureDataAsFewShot(item.name, item.requirementText, item.mapData);
      return `${header}\n${content}`;
    });

    return [
      '═══ 来自知识库的参考示例（以下是团队历史优质用例，请参考其颗粒度和覆盖风格）═══',
      '',
      blocks.join('\n\n'),
    ].join('\n');
  }

  /**
   * 更新指定工作台的 Embedding（当用例被标记为知识库时调用）
   *
   * @param workspaceId 工作台 ID
   * @param requirementText 需求文本
   * @returns 是否更新成功
   */
  async updateEmbedding(workspaceId: number, requirementText: string): Promise<boolean> {
    if (!embeddingService.isEnabled) {
      logger.debug('CaseKnowledgeRetrievalService: EmbeddingService disabled, skipping embedding update');
      return false;
    }

    try {
      const vector = await embeddingService.embed(requirementText);
      if (!vector) return false;

      const embeddingJson = JSON.stringify(vector);
      await query(
        'UPDATE `Auto_AiCaseWorkspaces` SET `requirement_embedding` = ? WHERE `id` = ?',
        [embeddingJson, workspaceId]
      );

      logger.info('CaseKnowledgeRetrievalService: embedding updated', {
        workspaceId,
        vectorDimensions: vector.length,
      }, LOG_CONTEXTS.CASES);

      return true;
    } catch (error) {
      logger.warn('CaseKnowledgeRetrievalService: embedding update failed', {
        workspaceId,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * 将工作台标记为知识库（同时触发 Embedding 生成）
   *
   * @param workspaceId 工作台 ID
   * @param qualityScore 质量评分（0-100，默认 60）
   */
  async addToKnowledgeBase(workspaceId: number, qualityScore = 60): Promise<boolean> {
    try {
      // 先获取需求文本
      const rows = await query<Array<{ id: number; requirement_text: string | null }>>(
        'SELECT `id`, `requirement_text` FROM `Auto_AiCaseWorkspaces` WHERE `id` = ? LIMIT 1',
        [workspaceId]
      );

      if (!rows || rows.length === 0) {
        logger.warn('CaseKnowledgeRetrievalService: workspace not found', { workspaceId });
        return false;
      }

      const workspace = rows[0];
      const requirementText = workspace.requirement_text;

      // 更新知识库标记和质量评分
      await query(
        'UPDATE `Auto_AiCaseWorkspaces` SET `is_knowledge_base` = 1, `quality_score` = ? WHERE `id` = ?',
        [Math.max(0, Math.min(100, qualityScore)), workspaceId]
      );

      // 若有需求文本，生成 Embedding
      if (requirementText?.trim()) {
        await this.updateEmbedding(workspaceId, requirementText);
      }

      logger.info('CaseKnowledgeRetrievalService: workspace added to knowledge base', {
        workspaceId,
        qualityScore,
        hasEmbedding: Boolean(requirementText?.trim()),
      }, LOG_CONTEXTS.CASES);

      return true;
    } catch (error) {
      logger.warn('CaseKnowledgeRetrievalService: addToKnowledgeBase failed', {
        workspaceId,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * 将工作台从知识库中移除（清空 is_knowledge_base 标记）
   * 不删除 requirement_embedding，保留向量以便后续重新加入时复用
   *
   * @param workspaceId 工作台 ID
   * @returns 是否操作成功
   */
  async removeFromKnowledgeBase(workspaceId: number): Promise<boolean> {
    try {
      const result = await query<ResultSetHeader>(
        'UPDATE `Auto_AiCaseWorkspaces` SET `is_knowledge_base` = 0 WHERE `id` = ?',
        [workspaceId]
      );

      if (result.affectedRows === 0) {
        logger.warn('CaseKnowledgeRetrievalService: removeFromKnowledgeBase - workspace not found', { workspaceId });
        return false;
      }

      logger.info('CaseKnowledgeRetrievalService: workspace removed from knowledge base', {
        workspaceId,
      }, LOG_CONTEXTS.CASES);

      return true;
    } catch (error) {
      logger.warn('CaseKnowledgeRetrievalService: removeFromKnowledgeBase failed', {
        workspaceId,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /** 从数据库加载知识库候选集（仅拉取已有向量的记录） */
  private async loadCandidates(): Promise<KnowledgeBaseRow[]> {
    return query<KnowledgeBaseRow[]>(
      `SELECT id, name, requirement_text, requirement_embedding, map_data, quality_score
       FROM \`Auto_AiCaseWorkspaces\`
       WHERE is_knowledge_base = 1
         AND requirement_embedding IS NOT NULL
         AND requirement_embedding != ''
       ORDER BY quality_score DESC, updated_at DESC
       LIMIT ?`,
      [MAX_CANDIDATE_POOL]
    );
  }
}

export const caseKnowledgeRetrievalService = new CaseKnowledgeRetrievalService();
