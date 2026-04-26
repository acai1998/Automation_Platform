import { io, Socket } from 'socket.io-client';
import { TestRunStatusType } from '@shared/types/execution';

/**
 * WebSocket 客户端服务
 *
 * 功能：
 * - 实现与后端 WebSocket 服务的连接
 * - 订阅执行状态更新
 * - 接收快速失败告警
 * - 自动重连机制
 * - 优雅降级到轮询
 */

/**
 * 执行更新数据结构
 */
export interface ExecutionUpdate {
  runId: number;
  status: TestRunStatusType;
  passedCases?: number;
  failedCases?: number;
  skippedCases?: number;
  durationMs?: number;
  source: 'callback' | 'polling' | 'monitor';
  timestamp: string;
}

/**
 * 快速失败告警数据结构
 */
export interface QuickFailAlert {
  runId: number;
  message: string;
  errorType: string;
  duration: number;
  timestamp: string;
}

/**
 * 连接统计信息
 */
export interface ConnectionStats {
  connected: boolean;
  socketId: string | undefined;
  transport: string | undefined;
  reconnectAttempts: number;
}

/**
 * 日志级别枚举
 */
enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  NONE = 4
}

/**
 * Vite 环境变量类型定义
 * 扩展全局 ImportMeta 接口
 */
declare global {
  interface ImportMeta {
    readonly env: {
      readonly VITE_API_URL?: string;
      readonly PROD?: boolean;
    };
  }
}

/**
 * 数据验证函数
 */
function isValidExecutionUpdate(data: unknown): data is ExecutionUpdate {
  return (
    typeof data === 'object' &&
    data !== null &&
    'runId' in data &&
    'status' in data &&
    'timestamp' in data &&
    typeof (data as ExecutionUpdate).runId === 'number' &&
    typeof (data as ExecutionUpdate).status === 'string'
  );
}

function isValidQuickFailAlert(data: unknown): data is QuickFailAlert {
  return (
    typeof data === 'object' &&
    data !== null &&
    'runId' in data &&
    'message' in data &&
    'errorType' in data &&
    typeof (data as QuickFailAlert).runId === 'number' &&
    typeof (data as QuickFailAlert).message === 'string' &&
    typeof (data as QuickFailAlert).errorType === 'string'
  );
}

/**
 * URL 验证函数
 */
function isValidWebSocketUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ['http:', 'https:', 'ws:', 'wss:'].includes(parsed.protocol);
  } catch {
    return false;
  }
}

class WebSocketClient {
  private socket: Socket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private connected = false;
  private errorCallbacks: Set<(error: Error) => void> = new Set();
  private activeSubscriptions = new Map<number, Set<() => void>>();
  private logLevel: LogLevel = import.meta.env?.PROD ? LogLevel.WARN : LogLevel.DEBUG;

  /**
   * 日志输出辅助方法
   */
  private log(level: LogLevel, message: string, data?: unknown): void {
    if (level < this.logLevel) return;
    
    const logFn = level === LogLevel.ERROR ? console.error :
                  level === LogLevel.WARN ? console.warn :
                  console.log;
    
    if (data !== undefined) {
      logFn(message, data);
    } else {
      logFn(message);
    }
  }

  /**
   * 注册错误监听器
   * 
   * @param callback 错误回调函数
   * @returns 取消注册函数
   */
  onError(callback: (error: Error) => void): () => void {
    this.errorCallbacks.add(callback);
    return () => this.errorCallbacks.delete(callback);
  }

  /**
   * 等待连接建立
   * 
   * @param timeout 超时时间（毫秒）
   * @returns Promise，连接成功时 resolve
   */
  private waitForConnection(timeout: number): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.socket?.connected) {
        resolve();
        return;
      }
      
      const timer = setTimeout(() => {
        reject(new Error('WebSocket connection timeout'));
      }, timeout);
      
      const connectHandler = () => {
        clearTimeout(timer);
        resolve();
      };
      
      this.socket?.once('connect', connectHandler);
    });
  }

  /**
   * 连接到 WebSocket 服务器
   */
  connect(): void {
    if (this.socket?.connected) {
      this.log(LogLevel.INFO, '[WebSocket] Already connected');
      return;
    }

    // 使用正确的类型定义
    const apiUrl = import.meta.env?.VITE_API_URL || 'http://localhost:3000';

    // URL 验证
    if (!isValidWebSocketUrl(apiUrl)) {
      const error = new Error(`Invalid WebSocket URL: ${apiUrl}`);
      this.log(LogLevel.ERROR, '[WebSocket] Invalid API URL', { url: apiUrl });
      this.errorCallbacks.forEach(cb => cb(error));
      return;
    }

    this.log(LogLevel.INFO, '[WebSocket] Connecting to:', apiUrl);

    this.socket = io(apiUrl, {
      path: '/api/ws',
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: this.maxReconnectAttempts
    });

    this.setupEventHandlers();
  }

  /**
   * 设置事件处理器
   */
  private setupEventHandlers(): void {
    if (!this.socket) return;

    this.socket.on('connect', () => {
      this.log(LogLevel.INFO, '[WebSocket] Connected successfully', {
        socketId: this.socket?.id,
        transport: this.socket?.io.engine.transport.name
      });
      this.connected = true;
      this.reconnectAttempts = 0;
    });

    this.socket.on('disconnect', (reason) => {
      this.log(LogLevel.WARN, '[WebSocket] Disconnected:', reason);
      this.connected = false;
    });

    this.socket.on('connect_error', (error) => {
      this.log(LogLevel.ERROR, '[WebSocket] Connection error:', error.message);
      this.reconnectAttempts++;

      if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        this.log(LogLevel.WARN, '[WebSocket] Max reconnection attempts reached, falling back to polling');
        this.connected = false;
        
        // 通知所有错误监听器
        const connectionError = new Error(
          `WebSocket connection failed after ${this.maxReconnectAttempts} retries: ${error.message}`
        );
        this.errorCallbacks.forEach(cb => {
          try {
            cb(connectionError);
          } catch (callbackError) {
            this.log(LogLevel.ERROR, '[WebSocket] Error in error callback:', callbackError);
          }
        });
      }
    });

    // 传输升级事件
    this.socket.io.engine.on('upgrade', (transport) => {
      this.log(LogLevel.DEBUG, '[WebSocket] Transport upgraded to:', transport.name);
    });
  }

  /**
   * 断开连接
   */
  disconnect(): void {
    if (this.socket) {
      this.log(LogLevel.INFO, '[WebSocket] Disconnecting...');
      this.socket.disconnect();
      this.socket = null;
      this.connected = false;
    }
  }

  /**
   * 断开连接并清理所有订阅
   */
  disconnectAndCleanup(): void {
    this.log(LogLevel.INFO, '[WebSocket] Disconnecting and cleaning up all subscriptions');
    
    // 清理所有订阅
    this.activeSubscriptions.forEach((subs, runId) => {
      this.log(LogLevel.DEBUG, `[WebSocket] Cleaning up subscriptions for runId: ${runId}`);
      subs.forEach(unsub => {
        try {
          unsub();
        } catch (error) {
          this.log(LogLevel.ERROR, `[WebSocket] Error cleaning up subscription for runId ${runId}:`, error);
        }
      });
    });
    this.activeSubscriptions.clear();
    
    // 断开连接
    this.disconnect();
  }

  /**
   * 订阅执行状态更新
   *
   * @param runId 执行批次ID
   * @param callbacks 回调函数集合
   * @param callbacks.onUpdate 收到状态更新时的回调
   * @param callbacks.onQuickFail 收到快速失败告警时的回调
   * @param callbacks.onError 发生错误时的回调
   * @returns 取消订阅函数，调用后将停止接收该执行的更新
   * 
   * @example
   * ```typescript
   * const unsubscribe = wsClient.subscribeToExecution(123, {
   *   onUpdate: (data) => console.log('Update:', data),
   *   onQuickFail: (alert) => console.error('Quick fail:', alert),
   *   onError: (error) => console.error('Error:', error)
   * });
   * 
   * // 不再需要时取消订阅
   * unsubscribe();
   * ```
   */
  async subscribeToExecution(
    runId: number,
    callbacks: {
      onUpdate?: (data: ExecutionUpdate) => void;
      onQuickFail?: (data: QuickFailAlert) => void;
      onError?: (error: Error) => void;
    }
  ): Promise<() => void> {
    // 如果未连接，尝试连接并等待
    if (!this.socket?.connected) {
      this.log(LogLevel.WARN, '[WebSocket] Not connected, attempting to connect for runId:', runId);
      this.connect();
      
      try {
        await this.waitForConnection(5000);
      } catch (error) {
        const connectionError = error instanceof Error ? error : new Error(String(error));
        this.log(LogLevel.ERROR, '[WebSocket] Connection failed for subscription:', connectionError);
        callbacks.onError?.(connectionError);
        return () => {}; // 返回空的取消订阅函数
      }
    }

    this.log(LogLevel.INFO, '[WebSocket] Subscribing to execution:', runId);

    // 先清理可能存在的旧订阅（防止重复订阅）
    this.socket?.emit('unsubscribe:execution', runId);

    // 订阅执行（此时已确保 socket 已连接）
    if (!this.socket) {
      const error = new Error('Socket is null after connection wait');
      this.log(LogLevel.ERROR, '[WebSocket] Unexpected null socket');
      callbacks.onError?.(error);
      return () => {};
    }

    this.socket.emit('subscribe:execution', runId);

    // 监听更新事件（带数据验证和错误处理）
    const updateHandler = (data: unknown) => {
      try {
        if (!isValidExecutionUpdate(data)) {
          this.log(LogLevel.ERROR, '[WebSocket] Invalid execution update data:', data);
          callbacks.onError?.(new Error('Invalid execution update data format'));
          return;
        }

        if (data.runId === runId) {
          this.log(LogLevel.DEBUG, '[WebSocket] Execution update received:', {
            runId: data.runId,
            status: data.status,
            source: data.source,
            timestamp: data.timestamp
          });
          callbacks.onUpdate?.(data);
        }
      } catch (error) {
        const handlerError = error instanceof Error ? error : new Error(String(error));
        this.log(LogLevel.ERROR, '[WebSocket] Error in update handler:', handlerError);
        callbacks.onError?.(handlerError);
      }
    };

    // 监听快速失败事件（带数据验证和错误处理）
    const quickFailHandler = (data: unknown) => {
      try {
        if (!isValidQuickFailAlert(data)) {
          this.log(LogLevel.ERROR, '[WebSocket] Invalid quick fail alert data:', data);
          callbacks.onError?.(new Error('Invalid quick fail alert data format'));
          return;
        }

        if (data.runId === runId) {
          this.log(LogLevel.WARN, '[WebSocket] Quick fail alert received:', {
            runId: data.runId,
            errorType: data.errorType,
            duration: `${data.duration}ms`,
            message: data.message
          });
          callbacks.onQuickFail?.(data);
        }
      } catch (error) {
        const handlerError = error instanceof Error ? error : new Error(String(error));
        this.log(LogLevel.ERROR, '[WebSocket] Error in quick fail handler:', handlerError);
        callbacks.onError?.(handlerError);
      }
    };

    // 注册事件监听器
    if (callbacks.onUpdate) {
      this.socket.on('execution:update', updateHandler);
    }

    if (callbacks.onQuickFail) {
      this.socket.on('execution:quick-fail', quickFailHandler);
    }

    // 创建取消订阅函数
    const unsubscribe = () => {
      this.log(LogLevel.INFO, '[WebSocket] Unsubscribing from execution:', runId);
      this.socket?.emit('unsubscribe:execution', runId);
      this.socket?.off('execution:update', updateHandler);
      this.socket?.off('execution:quick-fail', quickFailHandler);
      
      // 从订阅清单中移除
      const subs = this.activeSubscriptions.get(runId);
      subs?.delete(unsubscribe);
      if (subs?.size === 0) {
        this.activeSubscriptions.delete(runId);
      }
    };

    // 记录到订阅清单
    if (!this.activeSubscriptions.has(runId)) {
      this.activeSubscriptions.set(runId, new Set());
    }
    this.activeSubscriptions.get(runId)!.add(unsubscribe);

    return unsubscribe;
  }

  /**
   * 检查连接状态
   */
  isConnected(): boolean {
    return this.connected && this.socket?.connected === true;
  }

  /**
   * 获取连接统计信息
   * 
   * @returns 连接统计对象
   */
  getStats(): ConnectionStats {
    return {
      connected: this.connected,
      socketId: this.socket?.id,
      transport: this.socket?.io.engine.transport.name,
      reconnectAttempts: this.reconnectAttempts
    };
  }

  /**
   * 获取活跃订阅数量
   * 
   * @returns 活跃订阅的 runId 数量
   */
  getActiveSubscriptionsCount(): number {
    return this.activeSubscriptions.size;
  }

  /**
   * 获取指定 runId 的订阅数量
   * 
   * @param runId 执行批次ID
   * @returns 该 runId 的订阅数量
   */
  getSubscriptionCount(runId: number): number {
    return this.activeSubscriptions.get(runId)?.size || 0;
  }
}

// 导出单例
export const wsClient = new WebSocketClient();

/**
 * 在页面空闲时自动连接 WebSocket
 * 使用 requestIdleCallback 优化性能
 */
function connectWhenIdle(): void {
  if ('requestIdleCallback' in window) {
    requestIdleCallback(
      () => {
        wsClient.connect();
      },
      { timeout: 2000 } // 最多等待2秒
    );
  } else {
    // 降级方案：使用 setTimeout
    setTimeout(() => {
      wsClient.connect();
    }, 1000);
  }
}

// 自动连接（仅在浏览器环境）
if (typeof window !== 'undefined') {
  // 等待页面加载完成后再连接，避免阻塞页面加载
  if (document.readyState === 'complete') {
    connectWhenIdle();
  } else {
    window.addEventListener('load', connectWhenIdle, { once: true });
  }
  
  // 页面卸载时清理连接和订阅
  window.addEventListener('beforeunload', () => {
    wsClient.disconnectAndCleanup();
  });
}
