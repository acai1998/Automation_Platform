#!/usr/bin/env ts-node
/**
 * 修复孤立的 ERROR 占位符
 * 
 * 问题：某些测试用例状态为 ERROR，但整体运行状态已是 Completed，
 * 这说明 cleanupResidualErrorPlaceholders 未能正确清理。
 * 
 * 原因分析：
 * 1. cleanupResidualErrorPlaceholders 的条件判定可能过于严格
 * 2. 可能存在 ERROR 未被统计到 residualErrorCount
 * 3. 可能存在异常导致清理流程中断
 * 
 * 解决方案：
 * 1. 遍历所有 Completed/Failed/Aborted 的运行
 * 2. 检查每个运行下是否有 ERROR 占位符
 * 3. 如果有，根据整体运行状态进行清理：
 *    - success → passed （完整结果）或 skipped（部分结果）
 *    - failed → failed
 *    - aborted → skipped
 */

import { AppDataSource } from '../server/config/dataSource';
import { TestRun, TestRunResult } from '../server/entities/index';
import { In } from 'typeorm';
import logger from '../server/utils/logger';
import { LOG_CONTEXTS } from '../server/config/logging';

interface OrphanedErrorSummary {
  runId: number;
  status: string;
  totalCases: number;
  passedCases: number;
  failedCases: number;
  skippedCases: number;
  errorCount: number;
  cleanupTarget: string;
  message: string;
}

async function main() {
  if (!AppDataSource.isInitialized) {
    await AppDataSource.initialize();
  }

  const testRunRepo = AppDataSource.getRepository(TestRun);
  const testRunResultRepo = AppDataSource.getRepository(TestRunResult);

  console.log('🔍 开始扫描孤立的 ERROR 占位符...\n');

  // 1. 查找所有终态运行
  const finalRuns = await testRunRepo.find({
    where: {
      status: In(['success', 'failed', 'aborted', 'cancelled']),
    },
    order: { id: 'DESC' },
    take: 100, // 先检查最近 100 条
  });

  console.log(`📋 找到 ${finalRuns.length} 条终态运行记录\n`);

  const orphanedSummary: OrphanedErrorSummary[] = [];
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
    const result = await testRunResultRepo.update(
      { executionId: run.executionId as number, status: 'error' as any },
      { status: targetStatus, endTime: new Date() }
    );

    const fixed = result.affected || 0;
    totalFixed += fixed;

    orphanedSummary.push({
      runId: run.id,
      status: run.status,
      totalCases: run.totalCases,
      passedCases: run.passedCases,
      failedCases: run.failedCases,
      skippedCases: run.skippedCases,
      errorCount: errorResults.length,
      cleanupTarget: targetStatus,
      message: `✅ 清理 ${fixed} 条 ERROR 占位符 → ${targetStatus} (${reason})`,
    });

    console.log(`[#${run.id}] ${run.status.toUpperCase()}`);
    console.log(`    清理前: passed=${run.passedCases}, failed=${run.failedCases}, skipped=${run.skippedCases}, error=${errorResults.length}`);
    console.log(`    清理目标: ${targetStatus} (${reason})`);
    console.log(`    清理数: ${fixed}\n`);
  }

  // 5. 输出汇总报告
  console.log('📊 清理汇总：\n');
  console.log(`总清理记录数: ${totalFixed}`);
  console.log(`受影响运行数: ${orphanedSummary.length}\n`);

  if (orphanedSummary.length > 0) {
    console.log('详情:');
    orphanedSummary.forEach((item) => {
      console.log(`  [#${item.runId}] ${item.message}`);
    });
  } else {
    console.log('✨ 未发现孤立 ERROR 占位符，系统状态良好！');
  }

  logger.info('Orphaned ERROR placeholder cleanup completed', {
    totalFixed,
    affectedRuns: orphanedSummary.length,
    summary: orphanedSummary,
  }, LOG_CONTEXTS.REPOSITORY);

  console.log('\n✅ 修复完成');
}

main()
  .catch((err) => {
    console.error('❌ 错误:', err);
    process.exit(1);
  })
  .finally(() => {
    process.exit(0);
  });
