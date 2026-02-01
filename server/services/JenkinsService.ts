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

  private enabled: boolean = true;

  constructor() {
    // 从环境变量或配置文件加载 Jenkins 配置
    const token = process.env.JENKINS_TOKEN;
    if (!token) {
      console.warn('[JenkinsService] JENKINS_TOKEN not set, Jenkins integration disabled');
      this.enabled = false;
      return;
    }

    this.config = {
      baseUrl: process.env.JENKINS_URL || 'http://jenkins.wiac.xyz:8080/',
      username: process.env.JENKINS_USER || 'root',
      token,
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
    if (!this.enabled) {
      return {
        success: false,
        message: 'Jenkins integration is not configured',
      };
    }

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
        return {
          success: false,
          message: `Failed to trigger job: ${response.status} ${response.statusText}`,
        };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        message: `Error triggering job: ${errorMessage}`,
      };
    }
  }

  /**
   * 触发 Jenkins Job 执行批量用例
   */
  async triggerBatchJob(
    runId: number,
    caseIds: number[],
    scriptPaths: string[],
    callbackUrl?: string
  ): Promise<JenkinsTriggerResult> {
    if (!this.enabled) {
      return {
        success: false,
        message: 'Jenkins integration is not configured',
      };
    }

    const jobName = this.config.jobs.api; // 使用默认API Job
    const triggerUrl = `${this.config.baseUrl}/job/${jobName}/buildWithParameters`;

    // 构建参数
    const params = new URLSearchParams({
      RUN_ID: runId.toString(),
      CASE_IDS: JSON.stringify(caseIds),
      SCRIPT_PATHS: scriptPaths.join(','),
    });

    if (callbackUrl) {
      params.append('CALLBACK_URL', callbackUrl);
    }

    try {
      console.log(`[JenkinsService.triggerBatchJob] Starting:`, {
        runId,
        jobName,
        caseCount: caseIds.length,
        baseUrl: this.config.baseUrl,
        triggerUrl
      });

      // 调用 Jenkins API
      const fullUrl = `${triggerUrl}?${params.toString()}`;
      console.log(`[JenkinsService.triggerBatchJob] Making request to:`, fullUrl.split('?')[0] + '?[PARAMS]');
      
      const response = await fetch(fullUrl, {
        method: 'POST',
        headers: {
          'Authorization': this.getAuthHeader(),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });

      console.log(`[JenkinsService.triggerBatchJob] Response status:`, {
        status: response.status,
        statusText: response.statusText,
        location: response.headers.get('Location')
      });

      if (response.status === 201 || response.status === 200) {
        // 从 Location header 获取 queue ID
        const location = response.headers.get('Location');
        const queueId = location ? this.extractQueueId(location) : undefined;

        console.log(`[JenkinsService.triggerBatchJob] Queue ID extracted:`, queueId);

        // 获取最新构建信息
        const buildInfo = await this.getLatestBuildInfo(jobName);
        
        console.log(`[JenkinsService.triggerBatchJob] Build info:`, buildInfo);

        return {
          success: true,
          queueId,
          buildUrl: buildInfo?.buildUrl,
          message: 'Batch job triggered successfully',
        };
      } else {
        const errorText = await response.text().catch(() => 'Unable to read response');
        console.error(`[JenkinsService.triggerBatchJob] Failed with status ${response.status}:`, errorText);
        
        return {
          success: false,
          message: `Failed to trigger batch job: ${response.status} ${response.statusText}`,
        };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : 'N/A';
      console.error(`[JenkinsService.triggerBatchJob] Exception:`, {
        message: errorMessage,
        stack: errorStack
      });
      
      return {
        success: false,
        message: `Error triggering batch job: ${errorMessage}`,
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
   * 标准化Jenkins URL，确保使用正确的域名
   */
  private normalizeJenkinsUrl(url: string): string {
    if (!url) return url;

    // 替换错误的域名为正确的域名
    return url.replace(/http:\/\/www\.wiac\.xyz:8080/g, 'http://jenkins.wiac.xyz:8080')
              .replace(/https:\/\/www\.wiac\.xyz/g, 'https://jenkins.wiac.xyz');
  }

  /**
   * 获取最新构建信息
   */
  private async getLatestBuildInfo(jobName: string): Promise<{ buildNumber: number; buildUrl: string } | null> {
    if (!this.enabled) {
      return null;
    }

    try {
      const response = await fetch(`${this.config.baseUrl}/job/${jobName}/lastBuild/api/json`, {
        method: 'GET',
        headers: {
          'Authorization': this.getAuthHeader(),
        },
      });

      if (response.ok) {
        const data = await response.json() as { number: number; url: string };
        return {
          buildNumber: data.number,
          buildUrl: this.normalizeJenkinsUrl(data.url),
        };
      }
    } catch (error) {
      console.error('Failed to get latest build info:', error);
    }
    return null;
  }

  /**
   * 获取 Jenkins 配置信息（不包含敏感信息）
   */
  getConfigInfo(): { baseUrl: string; jobs: JenkinsConfig['jobs'] } | null {
    if (!this.enabled) {
      return null;
    }
    return {
      baseUrl: this.config.baseUrl,
      jobs: this.config.jobs,
    };
  }

  /**
   * 测试 Jenkins 连接
   */
  async testConnection(): Promise<{ connected: boolean; message: string }> {
    if (!this.enabled) {
      return { connected: false, message: 'Jenkins integration is not configured' };
    }

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