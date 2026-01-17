import { Router } from 'express';
import { executionService } from '../services/ExecutionService.js';
import { jenkinsService } from '../services/JenkinsService.js';
import { jenkinsAuthMiddleware, rateLimitMiddleware } from '../middleware/JenkinsAuthMiddleware.js';
import { requestValidator } from '../middleware/RequestValidator.js';

const router = Router();

/**
 * POST /api/jenkins/trigger
 * 触发 Jenkins Job 执行
 *
 * 此接口创建执行记录并返回 executionId，供 Jenkins 后续回调使用
 * 实际触发 Jenkins Job 的逻辑需要在此处或由调用方完成
 */
router.post('/trigger', async (req, res) => {
  try {
    const { taskId, triggeredBy = 1, jenkinsJobName } = req.body;

    if (!taskId) {
      return res.status(400).json({ success: false, message: 'taskId is required' });
    }

    // 创建执行记录
    const execution = await executionService.createExecution({
      taskId,
      triggeredBy,
      triggerType: 'ci_triggered',
    });

    res.json({
      success: true,
      data: {
        executionId: execution.executionId,
        totalCases: execution.totalCases,
        status: execution.status,
        jenkinsJobName: jenkinsJobName || null,
        message: 'Execution created. Waiting for Jenkins to start.'
      }
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ success: false, message });
  }
});

/**
 * POST /api/jenkins/run-case
 * 触发单个用例执行
 */
router.post('/run-case', [
  rateLimitMiddleware.limit,
  requestValidator.validateSingleExecution
], async (req, res) => {
  try {
    const { caseId, projectId, triggeredBy = 1 } = req.body;
    
    console.log(`[/api/jenkins/run-case] Starting single case execution:`, {
      caseId,
      projectId,
      triggeredBy,
      timestamp: new Date().toISOString()
    });

    // 创建执行批次记录
    const execution = await executionService.triggerTestExecution({
      caseIds: [caseId],
      projectId,
      triggeredBy,
      triggerType: 'manual',
    });
    
    console.log(`[/api/jenkins/run-case] Execution record created:`, {
      runId: execution.runId,
      totalCases: execution.totalCases
    });

    // 触发Jenkins Job
    console.log(`[/api/jenkins/run-case] Triggering Jenkins job...`);
    const triggerResult = await jenkinsService.triggerBatchJob(
      execution.runId,
      [caseId],
      [],
      `${process.env.API_CALLBACK_URL || 'http://localhost:3000'}/api/jenkins/callback`
    );
    
    console.log(`[/api/jenkins/run-case] Jenkins trigger result:`, {
      success: triggerResult.success,
      message: triggerResult.message,
      buildUrl: triggerResult.buildUrl,
      queueId: triggerResult.queueId
    });

    if (triggerResult.success) {
      // 更新Jenkins构建信息
      if (triggerResult.buildUrl) {
        // 解析Jenkins URL获取build ID
        const buildIdMatch = triggerResult.buildUrl.match(/\/(\d+)\/$/);
        const buildId = buildIdMatch ? buildIdMatch[1] : 'unknown';
        
        console.log(`[/api/jenkins/run-case] Updating Jenkins info:`, {
          runId: execution.runId,
          buildId,
          buildUrl: triggerResult.buildUrl
        });
        
        await executionService.updateBatchJenkinsInfo(execution.runId, {
          buildId,
          buildUrl: triggerResult.buildUrl,
        });
      }
    } else {
      console.error(`[/api/jenkins/run-case] Jenkins trigger failed:`, triggerResult.message);
    }

    res.json({
      success: triggerResult.success,
      data: {
        runId: execution.runId,
        buildUrl: triggerResult.buildUrl,
      },
      message: triggerResult.message,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[/api/jenkins/run-case] Error:`, { message, stack: error instanceof Error ? error.stack : 'N/A' });
    res.status(500).json({ success: false, message });
  }
});

/**
 * POST /api/jenkins/run-batch
 * 触发批量用例执行
 */
router.post('/run-batch', [
  rateLimitMiddleware.limit,
  requestValidator.validateBatchExecution
], async (req, res) => {
  try {
    const { caseIds, projectId, triggeredBy = 1 } = req.body;
    
    console.log(`[/api/jenkins/run-batch] Starting batch case execution:`, {
      caseCount: caseIds.length,
      caseIds,
      projectId,
      triggeredBy,
      timestamp: new Date().toISOString()
    });

    // 创建执行批次记录
    const execution = await executionService.triggerTestExecution({
      caseIds,
      projectId,
      triggeredBy,
      triggerType: 'manual',
    });
    
    console.log(`[/api/jenkins/run-batch] Execution record created:`, {
      runId: execution.runId,
      totalCases: execution.totalCases
    });

    // 触发Jenkins Job
    console.log(`[/api/jenkins/run-batch] Triggering Jenkins job...`);
    const triggerResult = await jenkinsService.triggerBatchJob(
      execution.runId,
      caseIds,
      [],
      `${process.env.API_CALLBACK_URL || 'http://localhost:3000'}/api/jenkins/callback`
    );
    
    console.log(`[/api/jenkins/run-batch] Jenkins trigger result:`, {
      success: triggerResult.success,
      message: triggerResult.message,
      buildUrl: triggerResult.buildUrl,
      queueId: triggerResult.queueId
    });

    if (triggerResult.success) {
      // 更新Jenkins构建信息
      if (triggerResult.buildUrl) {
        const buildIdMatch = triggerResult.buildUrl.match(/\/(\d+)\/$/);
        const buildId = buildIdMatch ? buildIdMatch[1] : 'unknown';
        
        console.log(`[/api/jenkins/run-batch] Updating Jenkins info:`, {
          runId: execution.runId,
          buildId,
          buildUrl: triggerResult.buildUrl
        });
        
        await executionService.updateBatchJenkinsInfo(execution.runId, {
          buildId,
          buildUrl: triggerResult.buildUrl,
        });
      }
    } else {
      console.error(`[/api/jenkins/run-batch] Jenkins trigger failed:`, triggerResult.message);
    }

    res.json({
      success: triggerResult.success,
      data: {
        runId: execution.runId,
        totalCases: execution.totalCases,
        buildUrl: triggerResult.buildUrl,
      },
      message: triggerResult.message,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[/api/jenkins/run-batch] Error:`, { message, stack: error instanceof Error ? error.stack : 'N/A' });
    res.status(500).json({ success: false, message });
  }
});

/**
 * GET /api/jenkins/tasks/:taskId/cases
 * 获取任务关联的用例列表
 *
 * Jenkins Job 可以调用此接口获取需要执行的用例信息
 */
router.get('/tasks/:taskId/cases', async (req, res) => {
  try {
    const taskId = parseInt(req.params.taskId);
    const cases = await executionService.getTaskCases(taskId);

    res.json({
      success: true,
      data: cases
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ success: false, message });
  }
});

/**
 * GET /api/jenkins/status/:executionId
 * 查询执行状态（预留接口）
 *
 * 用于查询 Jenkins Job 的执行状态
 */
router.get('/status/:executionId', async (req, res) => {
  try {
    const executionId = parseInt(req.params.executionId);
    const detail = await executionService.getExecutionDetail(executionId);

    if (!detail.execution) {
      return res.status(404).json({ success: false, message: 'Execution not found' });
    }

    const execution = detail.execution as Record<string, unknown>;

    res.json({
      success: true,
      data: {
        executionId,
        status: execution.status,
        totalCases: execution.total_cases,
        passedCases: execution.passed_cases,
        failedCases: execution.failed_cases,
        skippedCases: execution.skipped_cases,
        startTime: execution.start_time,
        endTime: execution.end_time,
        duration: execution.duration,
        // Jenkins 相关字段（预留）
        jenkinsStatus: null,
        buildNumber: null,
        consoleUrl: null
      }
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ success: false, message });
  }
});

/**
 * POST /api/jenkins/callback
 * Jenkins 执行结果回调接口
 */
router.post('/callback', [
  jenkinsAuthMiddleware.verify,
  rateLimitMiddleware.limit,
  requestValidator.validateCallback
], async (req, res) => {
  try {
    const { runId, status, passedCases = 0, failedCases = 0, skippedCases = 0, durationMs = 0, results = [] } = req.body;

    // 记录回调日志
    console.log(`Jenkins callback received for runId: ${runId}`, {
      status,
      passedCases,
      failedCases,
      skippedCases,
      durationMs,
      resultsCount: results.length,
      timestamp: new Date().toISOString(),
      authSource: req.jenkinsAuth?.source
    });

    // 完成执行批次
    await executionService.completeBatchExecution(runId, {
      status,
      passedCases,
      failedCases,
      skippedCases,
      durationMs,
      results,
    });

    res.json({ success: true, message: 'Callback processed successfully' });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ success: false, message });
  }
});

/**
 * GET /api/jenkins/batch/:runId
 * 获取执行批次详情
 */
router.get('/batch/:runId', async (req, res) => {
  try {
    const runId = parseInt(req.params.runId);
    const batch = await executionService.getBatchExecution(runId);

    res.json({
      success: true,
      data: batch.execution
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ success: false, message });
  }
});

/**
 * GET /api/jenkins/health
 * Jenkins 连接健康检查
 */
router.get('/health', async (req, res) => {
  try {
    console.log(`[/api/jenkins/health] Performing Jenkins health check...`);
    
    // 测试 Jenkins 连接
    const jenkinsUrl = process.env.JENKINS_URL || 'http://jenkins.wiac.xyz:8080/';
    const jenkinsUser = process.env.JENKINS_USER || 'root';
    const jenkinsToken = process.env.JENKINS_TOKEN || '';
    
    console.log(`[/api/jenkins/health] Config:`, {
      baseUrl: jenkinsUrl,
      user: jenkinsUser,
      hasToken: !!jenkinsToken
    });
    
    // 构建 API URL（处理 URL 尾部斜杠）
    let apiUrl = jenkinsUrl;
    if (!apiUrl.endsWith('/')) {
      apiUrl += '/';
    }
    apiUrl += 'api/json';
    
    console.log(`[/api/jenkins/health] Connecting to:`, apiUrl);
    
    const credentials = Buffer.from(`${jenkinsUser}:${jenkinsToken}`).toString('base64');
    
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/json',
      },
    });

    console.log(`[/api/jenkins/health] Response status:`, response.status);

    if (response.ok) {
      const data = await response.json();
      res.json({
        success: true,
        data: {
          connected: true,
          jenkinsUrl,
          version: data.version || 'unknown',
          timestamp: new Date().toISOString()
        },
        message: 'Jenkins is healthy'
      });
    } else {
      console.error(`[/api/jenkins/health] Failed:`, response.status, response.statusText);
      res.status(response.status).json({
        success: false,
        data: {
          connected: false,
          status: response.status,
          statusText: response.statusText
        },
        message: `Jenkins returned ${response.status}: ${response.statusText}`
      });
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const stack = error instanceof Error ? error.stack : '';
    console.error(`[/api/jenkins/health] Error:`, { message, stack });
    res.status(500).json({
      success: false,
      data: {
        connected: false,
        error: message,
        details: process.env.NODE_ENV === 'development' ? stack : undefined
      },
      message: `Failed to connect to Jenkins: ${message}`
    });
  }
});

/**
 * GET /api/jenkins/diagnose
 * 诊断执行问题
 */
router.get('/diagnose', async (req, res) => {
  try {
    const runId = parseInt(req.query.runId as string);
    
    if (!runId) {
      return res.status(400).json({
        success: false,
        message: 'runId parameter is required'
      });
    }

    console.log(`[/api/jenkins/diagnose] Diagnosing execution ${runId}...`);

    // 获取执行批次信息
    const batch = await executionService.getBatchExecution(runId);
    const execution = batch.execution as Record<string, unknown>;

    // 收集诊断信息
    const diagnostics = {
      executionId: execution.id,
      status: execution.status,
      jenkinsJob: execution.jenkins_job,
      jenkinsBuildId: execution.jenkins_build_id,
      jenkinsUrl: execution.jenkins_url,
      startTime: execution.start_time,
      createdAt: execution.created_at,
      totalCases: execution.total_cases,
      passedCases: execution.passed_cases,
      failedCases: execution.failed_cases,
      skippedCases: execution.skipped_cases,
      
      // 诊断信息
      diagnostics: {
        jenkinsInfoMissing: !execution.jenkins_job || !execution.jenkins_build_id || !execution.jenkins_url,
        startTimeMissing: !execution.start_time,
        stillPending: execution.status === 'pending',
        noTestResults: execution.passed_cases === 0 && execution.failed_cases === 0 && execution.skipped_cases === 0,
        
        // 建议
        suggestions: [] as string[]
      }
    };

    // 生成建议
    const sugg = diagnostics.diagnostics.suggestions;
    
    if (diagnostics.diagnostics.jenkinsInfoMissing) {
      sugg.push('Jenkins 信息未被填充。这通常表示 Jenkins 触发失败。请检查后端日志查找错误信息。');
    }
    
    if (diagnostics.diagnostics.startTimeMissing) {
      sugg.push('执行开始时间为空。这表示 Jenkins 尚未开始构建。请等待几秒后重试。');
    }
    
    if (diagnostics.diagnostics.stillPending) {
      sugg.push('执行仍处于 pending 状态。这是正常的，系统正在等待 Jenkins 接收任务。前端应该继续轮询。');
    }
    
    if (diagnostics.diagnostics.noTestResults) {
      sugg.push('测试结果为空。这可能表示 Jenkins 任务尚未完成或回调失败。请检查 Jenkins 的执行日志。');
    }

    if (sugg.length === 0) {
      sugg.push('执行状态良好，无明显问题。');
    }

    res.json({
      success: true,
      data: diagnostics
    });

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[/api/jenkins/diagnose] Error:`, message);
    res.status(500).json({
      success: false,
      message: `Diagnosis failed: ${message}`
    });
  }
});

export default router;