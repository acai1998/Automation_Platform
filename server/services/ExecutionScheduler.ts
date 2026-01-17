import { hybridSyncService, MonitoringConfig } from './HybridSyncService.js';
import { executionService } from './ExecutionService.js';

/**
 * 执行记录接口
 */
export interface ExecutionRecord {
  id: number;
  status: string;
  triggerType: string;
  totalCases: number;
  startTime: Date;
  endTime?: Date;
  jenkinsJob?: string;
  jenkinsBuildId?: string;
}

/**
 * 监控策略接口
 */
export interface MonitoringStrategy {
  callbackTimeout: number;
  pollInterval: number;
  maxPollAttempts: number;
  priority: 'low' | 'normal' | 'high';
  description: string;
}

/**
 * 调度统计接口
 */
export interface SchedulerStats {
  totalExecutions: number;
  activeMonitoring: number;
  completedToday: number;
  failedToday: number;
  averageCompletionTime: number;
  strategies: {
    [key: string]: {
      count: number;
      successRate: number;
    };
  };
}

/**
 * 执行调度器
 * 负责管理执行监控策略，根据执行类型、规模等因素选择合适的监控配置
 */
export class ExecutionScheduler {
  private monitoringTasks = new Map<number, {
    runId: number;
    strategy: MonitoringStrategy;
    startTime: Date;
    status: 'active' | 'completed' | 'failed';
  }>();

  private defaultStrategies: { [key: string]: MonitoringStrategy } = {
    // 快速执行策略 - 用于单个用例或小批量
    quick: {
      callbackTimeout: 1 * 60 * 1000,    // 1分钟回调超时
      pollInterval: 15 * 1000,           // 15秒轮询间隔
      maxPollAttempts: 20,               // 最多20次轮询（5分钟）
      priority: 'high',
      description: 'Quick execution for single cases or small batches'
    },

    // 标准执行策略 - 用于中等规模批量执行
    standard: {
      callbackTimeout: 2 * 60 * 1000,    // 2分钟回调超时
      pollInterval: 30 * 1000,           // 30秒轮询间隔
      maxPollAttempts: 20,               // 最多20次轮询（10分钟）
      priority: 'normal',
      description: 'Standard execution for medium-sized batches'
    },

    // 长时间执行策略 - 用于大批量或性能测试
    extended: {
      callbackTimeout: 5 * 60 * 1000,    // 5分钟回调超时
      pollInterval: 60 * 1000,           // 1分钟轮询间隔
      maxPollAttempts: 30,               // 最多30次轮询（30分钟）
      priority: 'low',
      description: 'Extended execution for large batches or performance tests'
    },

    // CI/CD执行策略 - 用于自动化流水线
    ci: {
      callbackTimeout: 3 * 60 * 1000,    // 3分钟回调超时
      pollInterval: 20 * 1000,           // 20秒轮询间隔
      maxPollAttempts: 25,               // 最多25次轮询（约8分钟）
      priority: 'high',
      description: 'CI/CD pipeline execution with balanced timeout and polling'
    }
  };

  constructor() {
    console.log('ExecutionScheduler initialized with strategies:', Object.keys(this.defaultStrategies));
  }

  /**
   * 启动监控
   * 根据执行特征选择合适的监控策略
   */
  async startMonitoring(runId: number, execution?: Partial<ExecutionRecord>): Promise<{
    success: boolean;
    strategy: MonitoringStrategy;
    message: string;
  }> {
    try {
      console.log(`Starting monitoring for runId: ${runId}`);

      // 1. 获取执行记录详情（如果没有提供）
      let executionDetails = execution;
      if (!executionDetails) {
        const batchExecution = await executionService.getBatchExecution(runId);
        executionDetails = {
          id: runId,
          status: batchExecution.execution.status,
          triggerType: batchExecution.execution.trigger_type,
          totalCases: batchExecution.execution.total_cases,
          startTime: new Date(batchExecution.execution.start_time || Date.now()),
          jenkinsJob: batchExecution.execution.jenkins_job,
          jenkinsBuildId: batchExecution.execution.jenkins_build_id
        };
      }

      // 2. 选择监控策略
      const strategy = this.getMonitoringStrategy(executionDetails as ExecutionRecord);

      // 3. 记录监控任务
      this.monitoringTasks.set(runId, {
        runId,
        strategy,
        startTime: new Date(),
        status: 'active'
      });

      // 4. 启动混合同步服务
      await hybridSyncService.startMonitoring(runId, {
        callbackTimeout: strategy.callbackTimeout,
        pollInterval: strategy.pollInterval,
        maxPollAttempts: strategy.maxPollAttempts,
        consistencyCheckInterval: 5 * 60 * 1000 // 保持5分钟一致性检查
      });

      console.log(`Monitoring started for runId: ${runId} with strategy: ${this.getStrategyName(strategy)}`);

      return {
        success: true,
        strategy,
        message: `Monitoring started with ${this.getStrategyName(strategy)} strategy`
      };

    } catch (error) {
      console.error(`Failed to start monitoring for runId: ${runId}:`, error);

      return {
        success: false,
        strategy: this.defaultStrategies.standard, // 返回默认策略
        message: `Failed to start monitoring: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * 停止监控
   */
  async stopMonitoring(runId: number): Promise<void> {
    console.log(`Stopping monitoring for runId: ${runId}`);

    // 1. 停止混合同步服务
    hybridSyncService.stopMonitoring(runId);

    // 2. 更新监控任务状态
    const task = this.monitoringTasks.get(runId);
    if (task) {
      task.status = 'completed';
    }

    // 3. 清理任务记录（延迟删除，保留统计信息）
    setTimeout(() => {
      this.monitoringTasks.delete(runId);
    }, 24 * 60 * 60 * 1000); // 24小时后删除
  }

  /**
   * 根据执行记录选择监控策略
   */
  private getMonitoringStrategy(execution: ExecutionRecord): MonitoringStrategy {
    // 策略选择逻辑

    // 1. 根据触发类型
    if (execution.triggerType === 'jenkins' || execution.triggerType === 'ci_triggered') {
      return this.defaultStrategies.ci;
    }

    // 2. 根据用例数量
    if (execution.totalCases <= 5) {
      // 小批量：使用快速策略
      return this.defaultStrategies.quick;
    } else if (execution.totalCases <= 50) {
      // 中等批量：使用标准策略
      return this.defaultStrategies.standard;
    } else {
      // 大批量：使用扩展策略
      return this.defaultStrategies.extended;
    }
  }

  /**
   * 获取策略名称
   */
  private getStrategyName(strategy: MonitoringStrategy): string {
    for (const [name, s] of Object.entries(this.defaultStrategies)) {
      if (JSON.stringify(s) === JSON.stringify(strategy)) {
        return name;
      }
    }
    return 'custom';
  }

  /**
   * 获取监控状态
   */
  getMonitoringStatus(runId: number): {
    isMonitoring: boolean;
    strategy?: MonitoringStrategy;
    startTime?: Date;
    duration?: number;
    syncStatus?: any;
  } {
    const task = this.monitoringTasks.get(runId);
    const syncStatus = hybridSyncService.getSyncStatus(runId);

    if (!task) {
      return { isMonitoring: false };
    }

    return {
      isMonitoring: task.status === 'active',
      strategy: task.strategy,
      startTime: task.startTime,
      duration: Date.now() - task.startTime.getTime(),
      syncStatus
    };
  }

  /**
   * 获取所有活跃监控
   */
  getActiveMonitoring(): Array<{
    runId: number;
    strategy: MonitoringStrategy;
    startTime: Date;
    duration: number;
    syncStatus: any;
  }> {
    const active: Array<{
      runId: number;
      strategy: MonitoringStrategy;
      startTime: Date;
      duration: number;
      syncStatus: any;
    }> = [];

    for (const [runId, task] of this.monitoringTasks.entries()) {
      if (task.status === 'active') {
        const syncStatus = hybridSyncService.getSyncStatus(runId);
        active.push({
          runId,
          strategy: task.strategy,
          startTime: task.startTime,
          duration: Date.now() - task.startTime.getTime(),
          syncStatus
        });
      }
    }

    return active;
  }

  /**
   * 获取调度器统计信息
   */
  async getSchedulerStats(): Promise<SchedulerStats> {
    try {
      // 获取混合同步服务统计
      const syncStats = hybridSyncService.getMonitoringStats();

      // 统计策略使用情况
      const strategyStats: { [key: string]: { count: number; successRate: number } } = {};

      for (const [runId, task] of this.monitoringTasks.entries()) {
        const strategyName = this.getStrategyName(task.strategy);
        if (!strategyStats[strategyName]) {
          strategyStats[strategyName] = { count: 0, successRate: 0 };
        }
        strategyStats[strategyName].count++;
      }

      // 计算成功率（简化版本，实际应该基于历史数据）
      for (const strategy of Object.keys(strategyStats)) {
        strategyStats[strategy].successRate = 0.85; // 假设85%成功率
      }

      // 获取今日统计（需要数据库查询）
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      return {
        totalExecutions: this.monitoringTasks.size,
        activeMonitoring: syncStats.totalMonitored,
        completedToday: syncStats.completed,
        failedToday: syncStats.failed + syncStats.timeout,
        averageCompletionTime: 5 * 60 * 1000, // 假设平均5分钟完成
        strategies: strategyStats
      };

    } catch (error) {
      console.error('Failed to get scheduler stats:', error);
      return {
        totalExecutions: 0,
        activeMonitoring: 0,
        completedToday: 0,
        failedToday: 0,
        averageCompletionTime: 0,
        strategies: {}
      };
    }
  }

  /**
   * 手动调整策略
   */
  adjustStrategy(runId: number, newStrategy: Partial<MonitoringStrategy>): {
    success: boolean;
    message: string;
  } {
    const task = this.monitoringTasks.get(runId);
    if (!task) {
      return {
        success: false,
        message: `No monitoring task found for runId: ${runId}`
      };
    }

    if (task.status !== 'active') {
      return {
        success: false,
        message: `Cannot adjust strategy for inactive monitoring task`
      };
    }

    // 更新策略
    task.strategy = { ...task.strategy, ...newStrategy };

    // 更新混合同步服务配置
    hybridSyncService.updateConfig({
      callbackTimeout: task.strategy.callbackTimeout,
      pollInterval: task.strategy.pollInterval,
      maxPollAttempts: task.strategy.maxPollAttempts
    });

    console.log(`Strategy adjusted for runId: ${runId}`, newStrategy);

    return {
      success: true,
      message: 'Strategy updated successfully'
    };
  }

  /**
   * 添加自定义策略
   */
  addCustomStrategy(name: string, strategy: MonitoringStrategy): {
    success: boolean;
    message: string;
  } {
    if (this.defaultStrategies[name]) {
      return {
        success: false,
        message: `Strategy '${name}' already exists`
      };
    }

    this.defaultStrategies[name] = strategy;

    console.log(`Custom strategy '${name}' added:`, strategy);

    return {
      success: true,
      message: `Custom strategy '${name}' added successfully`
    };
  }

  /**
   * 获取所有可用策略
   */
  getAvailableStrategies(): { [key: string]: MonitoringStrategy } {
    return { ...this.defaultStrategies };
  }

  /**
   * 批量启动监控
   * 用于系统重启后恢复监控状态
   */
  async recoverMonitoring(): Promise<{
    recovered: number;
    failed: number;
    details: Array<{ runId: number; success: boolean; message: string }>;
  }> {
    try {
      console.log('Recovering monitoring for running executions...');

      // 查询所有运行中的执行
      const runningExecutions = await executionService.getAllTestRuns(100, 0);
      const activeExecutions = runningExecutions.data.filter((exec: any) =>
        ['pending', 'running'].includes(exec.status)
      );

      console.log(`Found ${activeExecutions.length} active executions to recover`);

      const results: Array<{ runId: number; success: boolean; message: string }> = [];
      let recovered = 0;
      let failed = 0;

      for (const execution of activeExecutions) {
        try {
          const result = await this.startMonitoring(execution.id, {
            id: execution.id,
            status: execution.status,
            triggerType: execution.trigger_type,
            totalCases: execution.total_cases,
            startTime: new Date(execution.start_time || Date.now()),
            jenkinsJob: execution.jenkins_job,
            jenkinsBuildId: execution.jenkins_build_id
          });

          if (result.success) {
            recovered++;
            results.push({
              runId: execution.id,
              success: true,
              message: result.message
            });
          } else {
            failed++;
            results.push({
              runId: execution.id,
              success: false,
              message: result.message
            });
          }

        } catch (error) {
          failed++;
          results.push({
            runId: execution.id,
            success: false,
            message: `Recovery failed: ${error instanceof Error ? error.message : String(error)}`
          });
        }
      }

      console.log(`Monitoring recovery completed: ${recovered} recovered, ${failed} failed`);

      return { recovered, failed, details: results };

    } catch (error) {
      console.error('Failed to recover monitoring:', error);
      return { recovered: 0, failed: 0, details: [] };
    }
  }

  /**
   * 健康检查
   */
  async healthCheck(): Promise<{
    healthy: boolean;
    issues: string[];
    stats: any;
  }> {
    const issues: string[] = [];

    try {
      // 检查混合同步服务状态
      const syncStats = hybridSyncService.getMonitoringStats();

      // 检查是否有长时间运行的监控
      const activeMonitoring = this.getActiveMonitoring();
      const longRunningThreshold = 30 * 60 * 1000; // 30分钟

      for (const monitoring of activeMonitoring) {
        if (monitoring.duration > longRunningThreshold) {
          issues.push(`Long-running monitoring detected for runId: ${monitoring.runId} (${Math.round(monitoring.duration / 60000)} minutes)`);
        }
      }

      // 检查失败率
      const totalMonitored = syncStats.totalMonitored;
      const failedCount = syncStats.failed + syncStats.timeout;
      if (totalMonitored > 0 && failedCount / totalMonitored > 0.2) {
        issues.push(`High failure rate: ${Math.round((failedCount / totalMonitored) * 100)}%`);
      }

      return {
        healthy: issues.length === 0,
        issues,
        stats: {
          syncStats,
          activeMonitoring: activeMonitoring.length,
          totalTasks: this.monitoringTasks.size
        }
      };

    } catch (error) {
      issues.push(`Health check failed: ${error instanceof Error ? error.message : String(error)}`);
      return {
        healthy: false,
        issues,
        stats: {}
      };
    }
  }
}

// 导出单例
export const executionScheduler = new ExecutionScheduler();