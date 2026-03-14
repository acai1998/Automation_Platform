/**
 * 维护路由
 * 用于运行管理员级别的维护任务
 */

import { Router, Request, Response } from 'express';
import { AppDataSource } from '../config/dataSource';
import { TestRun, TestRunResult } from '../entities/index';
import logger from '../utils/logger';
import { LOG_CONTEXTS } from '../config/logging';

const router = Router();

interface CleanupResult {
  runId: number;
  status: string;
  errorCount: number;
  cleanupTarget: string;
  fixed: number;
}

/**
 * 修复孤立的 ERROR 占位符
 * POST /api/maintenance/cleanup-orphaned-errors
 */
router.post('/cleanup-orphaned-errors', async (req: Request, res: Response) => {
  try {
    const testRunRepo = AppDataSource.getRepository(TestRun);
    const testRunResultRepo = AppDataSource.getRepository(TestRunResult);

    console.log('🔍 开始扫描孤立的 ERROR 占位符...\n');

    // 1. 查找所有终态运行（使用 query builder 以支持 IN 查询）
    const finalRuns = await testRunRepo
      .createQueryBuilder('run')
      .where('run.status IN (:...statuses)', { statuses: ['success', 'failed', 'aborted'] })
      .orderBy('run.id', 'DESC')
      .take(500)
      .getMany();

    console.log(`📋 找到 ${finalRuns.length} 条终态运行记录\n`);

    const results: CleanupResult[] = [];
    let totalFixed = 0;

    for (const run of finalRuns) {
      // 2. 检查每个运行下是否有 ERROR 占位符
      if (!run.executionId) continue;

      const errorResults = await testRunResultRepo.find({
        where: {
          executionId: run.executionId as number,
          status: 'error' as any,
        },
      });

      if (errorResults.length === 0) continue;

      // 3. 确定清理目标状态
      let targetStatus: 'passed' | 'failed' | 'skipped';
      let reason: string;

      const normalizedStatus = run.status as 'pending' | 'running' | 'success' | 'failed' | 'aborted';
      switch (normalizedStatus) {
        case 'success':
          targetStatus = 'passed';
          reason = '整体运行成功，假定未收到的结果已通过';
          break;
        case 'failed':
          targetStatus = 'failed';
          reason = '整体运行失败，保守标记为失败';
          break;
        case 'aborted':
          targetStatus = 'skipped';
          reason = '运行已取消或中止';
          break;
        default:
          targetStatus = 'failed';
          reason = '未知状态，保守标记为失败';
      }

      // 4. 批量清理
      const updateResult = await testRunResultRepo.update(
        { executionId: run.executionId as number, status: 'error' as any },
        { status: targetStatus, endTime: new Date() }
      );

      const fixed = updateResult.affected || 0;
      totalFixed += fixed;

      if (fixed > 0) {
        results.push({
          runId: run.id,
          status: run.status,
          errorCount: errorResults.length,
          cleanupTarget: targetStatus,
          fixed,
        });

        console.log(`[#${run.id}] ${run.status.toUpperCase()}`);
        console.log(`    清理: ${fixed} 条 ERROR → ${targetStatus} (${reason})\n`);
      }
    }

    logger.info('Orphaned ERROR placeholder cleanup completed', {
      totalFixed,
      affectedRuns: results.length,
      summary: results,
    }, LOG_CONTEXTS.REPOSITORY);

    res.json({
      success: true,
      message: '孤立 ERROR 占位符清理完成',
      totalFixed,
      affectedRuns: results.length,
      details: results,
    });
  } catch (error) {
    logger.error('Orphaned ERROR cleanup failed', {
      error: error instanceof Error ? error.message : String(error),
    }, LOG_CONTEXTS.REPOSITORY);

    res.status(500).json({
      success: false,
      message: '清理失败',
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

export default router;
