import { getSecretOrEnv } from '../utils/secrets';
import logger from '../utils/logger';
import { LOG_CONTEXTS } from '../config/logging';

interface OpenAiEmbeddingData {
  object: string;
  embedding: number[];
  index: number;
}

interface OpenAiEmbeddingResponse {
  object?: string;
  data?: OpenAiEmbeddingData[];
  model?: string;
  usage?: { prompt_tokens: number; total_tokens: number };
  error?: { message?: string; type?: string };
}

interface EmbeddingConfig {
  enabled: boolean;
  baseUrl: string;
  apiKey: string;
  model: string;
  timeoutMs: number;
}

// ─── 内存缓存（避免对同一文本重复调用 API）──────────────────────────────────
// Key = 文本内容（精确匹配），Value = 向量数组
// 仅在进程内缓存，服务重启后重新生成（可接受，Embedding API 很便宜）
const embeddingCache = new Map<string, number[]>();

/** LRU 淘汰：缓存超过此数量时清空最早的一半 */
const CACHE_MAX_SIZE = 2000;

function evictCacheIfNeeded(): void {
  if (embeddingCache.size < CACHE_MAX_SIZE) {
    return;
  }
  // 简单淘汰：删除最早插入的前 1000 条（Map 迭代顺序即插入顺序）
  let count = 0;
  for (const key of embeddingCache.keys()) {
    embeddingCache.delete(key);
    if (++count >= Math.floor(CACHE_MAX_SIZE / 2)) {
      break;
    }
  }
  logger.debug('EmbeddingService: cache eviction completed', { remainingSize: embeddingCache.size }, LOG_CONTEXTS.CASES);
}

/**
 * EmbeddingService
 *
 * 负责调用 OpenAI 兼容的 text-embedding API，将文本转换为向量（float[]）。
 * 优先复用 AI_CASE_LLM_API_KEY 和 AI_CASE_LLM_BASE_URL 配置，
 * 也可以单独通过 AI_EMBEDDING_API_KEY / AI_EMBEDDING_BASE_URL 覆盖。
 *
 * 向量维度取决于所用模型：
 *   - text-embedding-3-small  → 1536 维
 *   - text-embedding-3-large  → 3072 维
 *   - text-embedding-ada-002  → 1536 维
 */
export class EmbeddingService {
  private readonly config: EmbeddingConfig;

  constructor() {
    // 优先使用独立的 Embedding 配置，fallback 到 LLM 的 key/url
    const apiKey = getSecretOrEnv('AI_EMBEDDING_API_KEY') || getSecretOrEnv('AI_CASE_LLM_API_KEY');
    const rawBaseUrl = getSecretOrEnv('AI_EMBEDDING_BASE_URL') || getSecretOrEnv('AI_CASE_LLM_BASE_URL', 'https://api.openai.com/v1');

    this.config = {
      enabled: Boolean(apiKey),
      apiKey,
      baseUrl: this.resolveEmbeddingEndpoint(rawBaseUrl),
      model: getSecretOrEnv('AI_EMBEDDING_MODEL', 'text-embedding-3-small'),
      timeoutMs: Number(getSecretOrEnv('AI_EMBEDDING_TIMEOUT_MS', '15000')) || 15000,
    };

    logger.info('EmbeddingService initialized', {
      enabled: this.config.enabled,
      model: this.config.model,
      baseUrl: this.config.baseUrl,
    }, LOG_CONTEXTS.CASES);
  }

  get isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * 将文本转换为向量
   * - 若配置未启用，返回 null（调用方须处理降级逻辑）
   * - 内存缓存命中时直接返回，不调用 API
   *
   * @param text 待向量化的文本（建议 < 8000 tokens）
   * @returns 向量数组，或 null（服务未启用/调用失败）
   */
  async embed(text: string): Promise<number[] | null> {
    if (!this.config.enabled) {
      logger.debug('EmbeddingService is disabled, skipping embedding', {}, LOG_CONTEXTS.CASES);
      return null;
    }

    const cacheKey = text.trim();
    const cached = embeddingCache.get(cacheKey);
    if (cached) {
      logger.debug('EmbeddingService: cache hit', { textLength: cacheKey.length }, LOG_CONTEXTS.CASES);
      return cached;
    }

    try {
      const vector = await this.callEmbeddingApi(cacheKey);
      evictCacheIfNeeded();
      embeddingCache.set(cacheKey, vector);
      return vector;
    } catch (error) {
      logger.warn('EmbeddingService: API call failed', {
        error: error instanceof Error ? error.message : String(error),
      }, LOG_CONTEXTS.CASES);
      return null;
    }
  }

  /**
   * 批量向量化（并发请求，适合批量导入场景）
   * 返回与输入数组等长的结果数组，失败项为 null
   *
   * @param texts 文本数组
   * @param concurrency 最大并发数，默认 3（避免触发 rate limit）
   */
  async embedBatch(texts: string[], concurrency = 3): Promise<Array<number[] | null>> {
    const results: Array<number[] | null> = new Array(texts.length).fill(null);
    const queue = texts.map((text, index) => ({ text, index }));

    const worker = async (): Promise<void> => {
      while (queue.length > 0) {
        const item = queue.shift();
        if (!item) break;
        results[item.index] = await this.embed(item.text);
      }
    };

    await Promise.all(Array.from({ length: Math.min(concurrency, texts.length) }, worker));
    return results;
  }

  private async callEmbeddingApi(text: string): Promise<number[]> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      const response = await fetch(this.config.baseUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.config.model,
          input: text,
        }),
        signal: controller.signal,
      });

      const rawText = await response.text();
      let payload: OpenAiEmbeddingResponse | null = null;

      try {
        payload = JSON.parse(rawText) as OpenAiEmbeddingResponse;
      } catch {
        throw new Error(`Embedding API 返回非 JSON 内容: ${rawText.slice(0, 200)}`);
      }

      if (!response.ok) {
        throw new Error(payload?.error?.message || `Embedding API HTTP ${response.status}`);
      }

      const embedding = payload?.data?.[0]?.embedding;
      if (!Array.isArray(embedding) || embedding.length === 0) {
        throw new Error('Embedding API 返回的向量为空');
      }

      logger.debug('EmbeddingService: embedding generated', {
        textLength: text.length,
        vectorDimensions: embedding.length,
        model: this.config.model,
      }, LOG_CONTEXTS.CASES);

      return embedding;
    } finally {
      clearTimeout(timer);
    }
  }

  private resolveEmbeddingEndpoint(baseUrl: string): string {
    const normalized = baseUrl.trim().replace(/\/+$/, '');

    // 已经是完整路径
    if (normalized.endsWith('/embeddings')) {
      return normalized;
    }

    // 已含 /v1 或 /vN
    if (/\/v\d+$/.test(normalized)) {
      return `${normalized}/embeddings`;
    }

    return `${normalized}/v1/embeddings`;
  }

  /** 清空内存缓存（测试用，或内存压力释放场景） */
  clearCache(): void {
    embeddingCache.clear();
  }

  /** 返回当前缓存大小（监控用） */
  getCacheSize(): number {
    return embeddingCache.size;
  }
}

export const embeddingService = new EmbeddingService();