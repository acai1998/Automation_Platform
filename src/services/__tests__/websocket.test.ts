import { describe, it, expect, vi, beforeEach, afterEach, Mock } from 'vitest';
import { io, Socket } from 'socket.io-client';

// Mock socket.io-client
vi.mock('socket.io-client', () => ({
  io: vi.fn()
}));

// 动态导入以确保每次测试都使用新实例
async function createFreshClient() {
  // 清除模块缓存
  vi.resetModules();
  const module = await import('../websocket');
  return module;
}

describe('WebSocketClient', () => {
  let mockSocket: Partial<Socket>;
  let mockIo: Mock;
  let wsModule: any;
  let wsClient: any;

  beforeEach(async () => {
    // 创建 mock socket 实例
    mockSocket = {
      connected: false,
      id: 'test-socket-id',
      on: vi.fn(),
      once: vi.fn(),
      off: vi.fn(),
      emit: vi.fn(),
      disconnect: vi.fn(),
      io: {
        engine: {
          on: vi.fn(),
          transport: {
            name: 'websocket'
          }
        }
      } as any
    };

    mockIo = io as Mock;
    mockIo.mockReturnValue(mockSocket);
    
    // 获取新的客户端实例
    wsModule = await createFreshClient();
    wsClient = wsModule.wsClient;
  });

  afterEach(() => {
    // 清理所有订阅
    if (wsClient) {
      try {
        wsClient.disconnectAndCleanup();
      } catch (e) {
        // 忽略清理错误
      }
    }
    vi.clearAllMocks();
  });

  describe('连接管理', () => {
    it('应该成功建立连接', () => {
      wsClient.connect();

      expect(mockIo).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          path: '/api/ws',
          transports: ['websocket', 'polling'],
          reconnection: true
        })
      );
    });

    it('应该在已连接时不重复连接', () => {
      // 第一次连接
      wsClient.connect();
      expect(mockIo).toHaveBeenCalledTimes(1);
      
      // 模拟已连接状态
      mockSocket.connected = true;
      
      // 再次调用 connect 应该不会再次调用 io
      wsClient.connect();
      expect(mockIo).toHaveBeenCalledTimes(1);
    });

    it('应该正确处理连接成功事件', () => {
      wsClient.connect();

      const connectHandler = (mockSocket.on as Mock).mock.calls.find(
        call => call[0] === 'connect'
      )?.[1];

      expect(connectHandler).toBeDefined();
      
      // 模拟连接成功
      mockSocket.connected = true;
      connectHandler?.();

      expect(wsClient.isConnected()).toBe(true);
    });

    it('应该正确处理断开连接', () => {
      wsClient.connect();
      mockSocket.connected = true;

      const disconnectHandler = (mockSocket.on as Mock).mock.calls.find(
        call => call[0] === 'disconnect'
      )?.[1];

      // 模拟断开连接
      mockSocket.connected = false;
      disconnectHandler?.('transport close');

      expect(wsClient.isConnected()).toBe(false);
    });

    it('应该在达到最大重试次数后停止重连', () => {
      wsClient.connect();

      const errorHandler = (mockSocket.on as Mock).mock.calls.find(
        call => call[0] === 'connect_error'
      )?.[1];

      expect(errorHandler).toBeDefined();

      // 模拟5次连接错误
      const mockError = new Error('Connection failed');
      for (let i = 0; i < 5; i++) {
        errorHandler?.(mockError);
      }

      expect(wsClient.isConnected()).toBe(false);
    });

    it('应该在断开连接时清理资源', () => {
      wsClient.connect();
      mockSocket.connected = true;

      wsClient.disconnect();

      expect(mockSocket.disconnect).toHaveBeenCalled();
      expect(wsClient.isConnected()).toBe(false);
    });
  });

  describe('订阅管理', () => {
    beforeEach(() => {
      mockSocket.connected = true;
    });

    it('应该正确订阅执行更新', async () => {
      const unsubscribe = await wsClient.subscribeToExecution(123, {
        onUpdate: vi.fn()
      });

      expect(mockSocket.emit).toHaveBeenCalledWith('subscribe:execution', 123);
      expect(mockSocket.on).toHaveBeenCalledWith('execution:update', expect.any(Function));
      expect(typeof unsubscribe).toBe('function');
    });

    it('应该在未连接时尝试连接', async () => {
      mockSocket.connected = false;
      
      // 模拟连接成功
      const onceHandler = vi.fn((event, callback) => {
        if (event === 'connect') {
          setTimeout(() => {
            mockSocket.connected = true;
            callback();
          }, 10);
        }
      });
      mockSocket.once = onceHandler as any;

      const onUpdate = vi.fn();
      await wsClient.subscribeToExecution(123, { onUpdate });

      expect(mockSocket.emit).toHaveBeenCalledWith('subscribe:execution', 123);
    });

    it('应该正确取消订阅', async () => {
      const unsubscribe = await wsClient.subscribeToExecution(123, {
        onUpdate: vi.fn()
      });

      unsubscribe();

      expect(mockSocket.emit).toHaveBeenCalledWith('unsubscribe:execution', 123);
      expect(mockSocket.off).toHaveBeenCalledWith('execution:update', expect.any(Function));
    });

    it('应该过滤不同 runId 的消息', async () => {
      const onUpdate = vi.fn();
      await wsClient.subscribeToExecution(123, { onUpdate });

      const updateHandler = (mockSocket.on as Mock).mock.calls.find(
        call => call[0] === 'execution:update'
      )?.[1];

      expect(updateHandler).toBeDefined();

      // 发送不同 runId 的消息
      const mockData = {
        runId: 456,
        status: 'running',
        source: 'callback',
        timestamp: new Date().toISOString()
      };

      updateHandler?.(mockData);

      expect(onUpdate).not.toHaveBeenCalled();
    });

    it('应该接收匹配 runId 的消息', async () => {
      const onUpdate = vi.fn();
      await wsClient.subscribeToExecution(123, { onUpdate });

      const updateHandler = (mockSocket.on as Mock).mock.calls.find(
        call => call[0] === 'execution:update'
      )?.[1];

      const mockData = {
        runId: 123,
        status: 'success',
        passedCases: 5,
        failedCases: 0,
        source: 'callback',
        timestamp: new Date().toISOString()
      };

      updateHandler?.(mockData);

      expect(onUpdate).toHaveBeenCalledWith(mockData);
    });

    it('应该处理快速失败告警', async () => {
      const onQuickFail = vi.fn();
      await wsClient.subscribeToExecution(123, { onQuickFail });

      const quickFailHandler = (mockSocket.on as Mock).mock.calls.find(
        call => call[0] === 'execution:quick-fail'
      )?.[1];

      const mockAlert = {
        runId: 123,
        message: 'Jenkins job failed',
        errorType: 'jenkins_error',
        duration: 1000,
        timestamp: new Date().toISOString()
      };

      quickFailHandler?.(mockAlert);

      expect(onQuickFail).toHaveBeenCalledWith(mockAlert);
    });

    it('应该在接收到无效数据时调用错误回调', async () => {
      const onUpdate = vi.fn();
      const onError = vi.fn();
      await wsClient.subscribeToExecution(123, { onUpdate, onError });

      const updateHandler = (mockSocket.on as Mock).mock.calls.find(
        call => call[0] === 'execution:update'
      )?.[1];

      // 发送无效数据
      updateHandler?.({ invalid: 'data' });

      expect(onUpdate).not.toHaveBeenCalled();
      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Invalid execution update data format'
        })
      );
    });

    it('应该捕获回调中的错误', async () => {
      const throwingCallback = vi.fn(() => {
        throw new Error('Callback error');
      });
      const onError = vi.fn();

      await wsClient.subscribeToExecution(123, {
        onUpdate: throwingCallback,
        onError
      });

      const updateHandler = (mockSocket.on as Mock).mock.calls.find(
        call => call[0] === 'execution:update'
      )?.[1];

      const mockData = {
        runId: 123,
        status: 'running',
        source: 'callback',
        timestamp: new Date().toISOString()
      };

      updateHandler?.(mockData);

      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Callback error'
        })
      );
    });

    it('应该防止重复订阅', async () => {
      await wsClient.subscribeToExecution(123, { onUpdate: vi.fn() });
      
      // 清除之前的 emit 调用记录
      (mockSocket.emit as Mock).mockClear();

      await wsClient.subscribeToExecution(123, { onUpdate: vi.fn() });

      // 应该先取消订阅，再重新订阅
      expect(mockSocket.emit).toHaveBeenCalledWith('unsubscribe:execution', 123);
      expect(mockSocket.emit).toHaveBeenCalledWith('subscribe:execution', 123);
    });
  });

  describe('错误处理', () => {
    it('应该注册错误监听器', () => {
      const errorCallback = vi.fn();
      const removeListener = wsClient.onError(errorCallback);

      expect(typeof removeListener).toBe('function');
    });

    it('应该在连接失败时通知错误监听器', () => {
      const errorCallback = vi.fn();
      wsClient.onError(errorCallback);

      wsClient.connect();

      const errorHandler = (mockSocket.on as Mock).mock.calls.find(
        call => call[0] === 'connect_error'
      )?.[1];

      // 模拟达到最大重试次数
      const mockError = new Error('Connection failed');
      for (let i = 0; i < 5; i++) {
        errorHandler?.(mockError);
      }

      expect(errorCallback).toHaveBeenCalled();
      expect(errorCallback.mock.calls[0][0]).toBeInstanceOf(Error);
    });

    it('应该正确移除错误监听器', () => {
      const errorCallback = vi.fn();
      const removeListener = wsClient.onError(errorCallback);

      removeListener();

      wsClient.connect();
      const errorHandler = (mockSocket.on as Mock).mock.calls.find(
        call => call[0] === 'connect_error'
      )?.[1];

      // 模拟错误
      const mockError = new Error('Connection failed');
      for (let i = 0; i < 5; i++) {
        errorHandler?.(mockError);
      }

      expect(errorCallback).not.toHaveBeenCalled();
    });
  });

  describe('状态查询', () => {
    it('isConnected 应该返回正确的连接状态', () => {
      mockSocket.connected = false;
      expect(wsClient.isConnected()).toBe(false);

      mockSocket.connected = true;
      expect(wsClient.isConnected()).toBe(false); // 因为 this.connected 还是 false
    });

    it('getStats 应该返回完整的统计信息', () => {
      const stats = wsClient.getStats();

      expect(stats).toHaveProperty('connected');
      expect(stats).toHaveProperty('socketId');
      expect(stats).toHaveProperty('transport');
      expect(stats).toHaveProperty('reconnectAttempts');
      expect(typeof stats.reconnectAttempts).toBe('number');
    });

    it('getActiveSubscriptionsCount 应该返回正确的订阅数量', async () => {
      mockSocket.connected = true;

      expect(wsClient.getActiveSubscriptionsCount()).toBe(0);

      await wsClient.subscribeToExecution(123, { onUpdate: vi.fn() });
      expect(wsClient.getActiveSubscriptionsCount()).toBeGreaterThan(0);
    });

    it('getSubscriptionCount 应该返回指定 runId 的订阅数量', async () => {
      mockSocket.connected = true;

      expect(wsClient.getSubscriptionCount(123)).toBe(0);

      await wsClient.subscribeToExecution(123, { onUpdate: vi.fn() });
      expect(wsClient.getSubscriptionCount(123)).toBeGreaterThan(0);
    });
  });

  describe('资源清理', () => {
    it('disconnectAndCleanup 应该清理所有订阅', async () => {
      mockSocket.connected = true;

      await wsClient.subscribeToExecution(123, { onUpdate: vi.fn() });
      await wsClient.subscribeToExecution(456, { onUpdate: vi.fn() });

      wsClient.disconnectAndCleanup();

      expect(mockSocket.disconnect).toHaveBeenCalled();
      expect(wsClient.getActiveSubscriptionsCount()).toBe(0);
    });

    it('应该在清理时捕获取消订阅中的错误', async () => {
      mockSocket.connected = true;

      await wsClient.subscribeToExecution(123, { onUpdate: vi.fn() });
      
      // 模拟 emit 抛出错误
      (mockSocket.emit as Mock).mockImplementation(() => {
        throw new Error('Emit error');
      });

      // 不应该抛出错误
      expect(() => wsClient.disconnectAndCleanup()).not.toThrow();
    });
  });
});
