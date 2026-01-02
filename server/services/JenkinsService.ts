import { getDatabase } from '../db/index.js';

/**
 * Jenkins 配置接口
 */
export interface JenkinsConfig {
  baseUrl: string;
  username: string;
  token: string;
  jobs: {
    api: string;
    ui: string;
    performance: string;
  };
}

/**
 * Jenkins 触发结果
 */
export interface JenkinsTriggerResult {
  success: boolean;
  queueId?: number;
  buildUrl?: string;
  message: string;
}

/**
 * 用例类型
 */
export type CaseType = 'api' | 'ui' | 'performance';

/**
 * Jenkins 服务类
 * 负责与 Jenkins 交互，触发 Job 执行
 */
export class JenkinsService {
  private config: JenkinsConfig;

  constructor() {
    // 从环境变量或配置文件加载 Jenkins 配置
    this.config = {
      baseUrl: process.env.JENKINS_URL || 'http://jenkins.wiac.xyz:8080/',
      username: process.env.JENKINS_USER || 'root',
      token: process.env.JENKINS_TOKEN || '116fb13c3cc6cd3e33e688bacc26e18b60',
      jobs: {
        api: process.env.JENKINS_JOB_API || 'api-automation',
        ui: process.env.JENKINS_JOB_UI || 'ui-automation',
        performance: process.env.JENKINS_JOB_PERF || 'performance-automation',
      },
    };
  }

  /**
   * 获取基础认证头
   */
  private getAuthHeader(): string {
    const credentials = Buffer.from(`${this.config.username}:${this.config.token}`).toString('base64');
    return `Basic ${credentials}`;
  }

  /**
   * 根据用例类型获取对应的 Job 名称
   */
  private getJobName(type: CaseType): string {
    return this.config.jobs[type] || this.config.jobs.api;
  }

  /**
   * 触发 Jenkins Job 执行单个用例
   */
  async triggerJob(
    caseId: number,
    type: CaseType,
    scriptPath: string,
    callbackUrl?: string
  ): Promise<JenkinsTriggerResult> {
    const db = getDatabase();
    const jobName = this.getJobName(type);
    const triggerUrl = `${this.config.baseUrl}/job/${jobName}/buildWithParameters`;

    // 构建参数
    const params = new URLSearchParams({
      SCRIPT_PATH: scriptPath,
      CASE_ID: caseId.toString(),
      CASE_TYPE: type,
    });

    if (callbackUrl) {
      params.append('CALLBACK_URL', callbackUrl);
    }

    try {
      // 更新用例状态为 running
      db.prepare('UPDATE test_cases SET running_status = ? WHERE id = ?').run('running', caseId);

      // 调用 Jenkins API
      const response = await fetch(`${triggerUrl}?${params.toString()}`, {
        method: 'POST',
        headers: {
          'Authorization': this.getAuthHeader(),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });

      if (response.status === 201 || response.status === 200) {
        // 从 Location header 获取 queue ID
        const location = response.headers.get('Location');
        const queueId = location ? this.extractQueueId(location) : undefined;

        return {
          success: true,
          queueId,
          buildUrl: `${this.config.baseUrl}/job/${jobName}/`,
          message: 'Job triggered successfully',
        };
      } else {
        // 触发失败，恢复状态
        db.prepare('UPDATE test_cases SET running_status = ? WHERE id = ?').run('idle', caseId);

        return {
          success: false,
          message: `Failed to trigger job: ${response.status} ${response.statusText}`,
        };
      }
    } catch (error) {
      // 发生错误，恢复状态
      db.prepare('UPDATE test_cases SET running_status = ? WHERE id = ?').run('idle', caseId);

      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        message: `Error triggering job: ${errorMessage}`,
      };
    }
  }

  /**
   * 从 Location header 中提取 Queue ID
   */
  private extractQueueId(location: string): number | undefined {
    const match = location.match(/\/queue\/item\/(\d+)/);
    return match ? parseInt(match[1], 10) : undefined;
  }

  /**
   * 更新用例运行状态
   */
  updateCaseStatus(caseId: number, status: 'idle' | 'running'): void {
    const db = getDatabase();
    db.prepare('UPDATE test_cases SET running_status = ? WHERE id = ?').run(status, caseId);
  }

  /**
   * 批量更新用例状态为 idle（用于清理）
   */
  resetAllRunningStatus(): void {
    const db = getDatabase();
    db.prepare("UPDATE test_cases SET running_status = 'idle' WHERE running_status = 'running'").run();
  }

  /**
   * 获取 Jenkins 配置信息（不包含敏感信息）
   */
  getConfigInfo(): { baseUrl: string; jobs: JenkinsConfig['jobs'] } {
    return {
      baseUrl: this.config.baseUrl,
      jobs: this.config.jobs,
    };
  }

  /**
   * 测试 Jenkins 连接
   */
  async testConnection(): Promise<{ connected: boolean; message: string }> {
    try {
      const response = await fetch(`${this.config.baseUrl}/api/json`, {
        method: 'GET',
        headers: {
          'Authorization': this.getAuthHeader(),
        },
      });

      if (response.ok) {
        return { connected: true, message: 'Jenkins connection successful' };
      } else {
        return { connected: false, message: `Connection failed: ${response.status}` };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return { connected: false, message: `Connection error: ${errorMessage}` };
    }
  }
}

// 导出单例
export const jenkinsService = new JenkinsService();
