/**
 * CallbackQueue - Jenkins 回调异步消费队列 (P2-B)
 *
 * 设计目标：
 * - POST /callback 收到请求后立即 ACK 200，避免 Jenkins 超时重试
 * - 内存队列 + 单 worker 串行消费，消除并发写同一 runId 的竞态
 * - 指数退避重试（最多 3 次），避免瞬时 DB 抖动导致永久丢失
 * - 暴露实时指标：队列深度、平均排队时长、失败重试分布
 */

import logger from '../utils/logger';
import { LOG_CONTEXTS } from '../config/logging';

/** 单条回调任务 */
export interface CallbackJob {
  /** 唯一 ID（用于日志追踪） */
  id: string;
  /** 入队时间戳 */
  enqueuedAt: number;
  /** 已重试次数（首次 = 0） */
  retries: number;
  /** 回调载荷 */
  payload: CallbackPayload;
}

/** Jenkins 回调载荷 */
export interface CallbackPayload {
  runId: number;
  status: 'success' | 'failed' | 'cancelled';
  passedCases: number;
  failedCases: number;
  skippedCases: number;
  durationMs: number;
  results: unknown[];
  /** 轻量化回调模式：Jenkins 仅发送 buildNumber，服务端主动解析结果 */
  buildNumber?: number;
  /** 是否需要服务端主动解析（轻量化回调时为 true） */
  needsServerParsing?: boolean;
}

/** 队列统计指标（内存，进程重启后重置） */
export interface CallbackQueueMetrics {
  /** 当前队列中待处理任务数 */
  queueDepth: number;
  /** 历史总入队数 */
  totalEnqueued: number;
  /** 历史总成功消费数 */
  totalProcessed: number;
  /** 历史总永久失败数（超过最大重试次数） */
  totalFailed: number;
  /** worker 是否正在处理 */
  workerBusy: boolean;
  /** 最近 500 条排队时长样本（ms，从入队到开始消费） */
  waitTimeSamples: number[];
  /** 滚动平均排队时长（ms） */
  avgWaitMs: number;
  /** 历史最大排队时长（ms） */
  maxWaitMs: number;
  /**
   * 重试分布：key=重试次数(0/1/2/3)，value=计数
   * 0 表示首次即成功，1/2/3 表示重试N次后成功或彻底失败
   */
  retryDistribution: Record<number, number>;
}

/** 消费者函数类型（由外部注入，避免循环依赖） */
export type CallbackConsumer = (payload: CallbackPayload) => Promise<void>;

/** 最大重试次数 */
const MAX_RETRIES = 3;
/** 基础重试延迟（ms）：第 n 次重试等待 BASE * 2^(n-1) */
const BASE_RETRY_DELAY_MS = 2_000;
/** 队列最大容量，超过时拒绝入队（防止内存溢出） */
const MAX_QUEUE_SIZE = 500;

export class CallbackQueue {
  private readonly queue: CallbackJob[] = [];
  private workerBusy = false;
  private consumer: CallbackConsumer | null = null;

  private readonly metrics: CallbackQueueMetrics = {
    queueDepth: 0,
    totalEnqueued: 0,
    totalProcessed: 0,
    totalFailed: 0,
    workerBusy: false,
    waitTimeSamples: [],
    avgWaitMs: 0,
    maxWaitMs: 0,
    retryDistribution: { 0: 0, 1: 0, 2: 0, 3: 0 },
  };

  /**
   * 注册消费者函数
   * 必须在第一次 enqueue 之前调用，避免循环依赖（路由层注入）
   */
  register(consumer: CallbackConsumer): void {
    this.consumer = consumer;
    logger.info('CallbackQueue: consumer registered', {}, LOG_CONTEXTS.EXECUTION);
  }

  /**
   * 将回调任务加入队列（O(1)，非阻塞）
   * @returns true=成功入队，false=队列已满被拒绝
   */
  enqueue(payload: CallbackPayload): boolean {
    if (this.queue.length >= MAX_QUEUE_SIZE) {
      logger.error('CallbackQueue: queue full, rejecting callback', {
        runId: payload.runId,
        queueDepth: this.queue.length,
        maxSize: MAX_QUEUE_SIZE,
      }, LOG_CONTEXTS.EXECUTION);
      return false;
    }

    const job: CallbackJob = {
      id: `cb-${payload.runId}-${Date.now()}`,
      enqueuedAt: Date.now(),
      retries: 0,
      payload,
    };

    this.queue.push(job);
    this.metrics.totalEnqueued++;
    this.metrics.queueDepth = this.queue.length;

    logger.debug('CallbackQueue: job enqueued', {
      jobId: job.id,
      runId: payload.runId,
      queueDepth: this.queue.length,
    }, LOG_CONTEXTS.EXECUTION);

    // 触发 worker（如果还没在跑）
    this.scheduleWorker();
    return true;
  }

  /** 获取当前队列指标快照（只读副本） */
  getMetrics(): Readonly<CallbackQueueMetrics> {
    return {
      ...this.metrics,
      queueDepth: this.queue.length,
      workerBusy: this.workerBusy,
      waitTimeSamples: [...this.metrics.waitTimeSamples],
      retryDistribution: { ...this.metrics.retryDistribution },
    };
  }

  /**
   * 调度 worker：如果 worker 空闲则通过 setImmediate 异步启动
   * 使用 setImmediate 确保当前同步调用栈（ACK 响应）先返回
   */
  private scheduleWorker(): void {
    if (this.workerBusy) return;
    setImmediate(() => this.runWorker());
  }

  /** Worker 主循环：串行消费队列中的所有任务 */
  private async runWorker(): Promise<void> {
    if (this.workerBusy || this.queue.length === 0) return;

    this.workerBusy = true;
    this.metrics.workerBusy = true;

    try {
      while (this.queue.length > 0) {
        const job = this.queue.shift()!;
        this.metrics.queueDepth = this.queue.length;
        await this.processJob(job);
      }
    } finally {
      this.workerBusy = false;
      this.metrics.workerBusy = false;
    }
  }

  /** 处理单个任务；失败时指数退避重新入队 */
  private async processJob(job: CallbackJob): Promise<void> {
    if (!this.consumer) {
      logger.error('CallbackQueue: no consumer registered, dropping job', {
        jobId: job.id,
        runId: job.payload.runId,
      }, LOG_CONTEXTS.EXECUTION);
      this.metrics.totalFailed++;
      return;
    }

    // 记录排队时长
    const waitMs = Date.now() - job.enqueuedAt;
    this.recordWaitTime(waitMs);

    logger.debug('CallbackQueue: processing job', {
      jobId: job.id,
      runId: job.payload.runId,
      retries: job.retries,
      waitMs,
    }, LOG_CONTEXTS.EXECUTION);

    try {
      await this.consumer(job.payload);

      // 成功：记录重试分布
      this.metrics.totalProcessed++;
      const retryKey = Math.min(job.retries, MAX_RETRIES) as 0 | 1 | 2 | 3;
      this.metrics.retryDistribution[retryKey] = (this.metrics.retryDistribution[retryKey] ?? 0) + 1;

      logger.debug('CallbackQueue: job processed successfully', {
        jobId: job.id,
        runId: job.payload.runId,
        retries: job.retries,
        waitMs,
      }, LOG_CONTEXTS.EXECUTION);

    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);

      if (job.retries < MAX_RETRIES) {
        // 指数退避：2s / 4s / 8s
        job.retries++;
        const delayMs = BASE_RETRY_DELAY_MS * Math.pow(2, job.retries - 1);

        logger.warn('CallbackQueue: job failed, scheduling retry', {
          jobId: job.id,
          runId: job.payload.runId,
          retries: job.retries,
          maxRetries: MAX_RETRIES,
          delayMs,
          error: errMsg,
        }, LOG_CONTEXTS.EXECUTION);

        await this.sleep(delayMs);
        // 重置入队时间（排队时长从重试时刻算起）
        job.enqueuedAt = Date.now();
        // 放回队首（优先级最高，避免后续任务插队）
        this.queue.unshift(job);
        this.metrics.queueDepth = this.queue.length;

      } else {
        // 超过最大重试次数，永久丢弃
        this.metrics.totalFailed++;
        this.metrics.retryDistribution[MAX_RETRIES] =
          (this.metrics.retryDistribution[MAX_RETRIES] ?? 0) + 1;

        logger.error('CallbackQueue: job permanently failed after max retries', {
          jobId: job.id,
          runId: job.payload.runId,
          retries: job.retries,
          error: errMsg,
        }, LOG_CONTEXTS.EXECUTION);
      }
    }
  }

  /** 记录排队时长样本并更新滚动统计 */
  private recordWaitTime(waitMs: number): void {
    this.metrics.waitTimeSamples.push(waitMs);
    // 保留最近 500 条
    if (this.metrics.waitTimeSamples.length > 500) {
      this.metrics.waitTimeSamples.shift();
    }
    if (waitMs > this.metrics.maxWaitMs) {
      this.metrics.maxWaitMs = waitMs;
    }
    const samples = this.metrics.waitTimeSamples;
    this.metrics.avgWaitMs = Math.round(
      samples.reduce((sum, v) => sum + v, 0) / samples.length
    );
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/** 全局单例（应用启动时创建，并在路由初始化阶段注册 consumer） */
export const callbackQueue = new CallbackQueue();
