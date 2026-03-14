/**
 * 清理无效的测试结果记录
 * 用途：清理 caseId=0 或 caseName='' 的垃圾记录
 * 这些记录是由之前的 BUG 生成的，无法正确匹配占位符
 * 
 * 使用：npm run cleanup-results
 */

import 'reflect-metadata';
import { AppDataSource } from '../server/config/database';
import { TestRunResult } from '../server/entities/TestRunResult';
import { getRepository } from 'typeorm';

async function main() {
  try {
    // 初始化数据库连接
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const testRunResultRepository = AppDataSource.getRepository(TestRunResult);

    console.log('============================================================');
    console.log('开始清理无效的测试结果记录...');
    console.log('============================================================');
    console.log('');

    // 【清理方案 1】删除 caseId=0 的垃圾记录
    console.log('【第 1 步】查找 caseId=0 的记录...');
    const invalidCaseIdResults = await testRunResultRepository.find({
      where: { caseId: 0 },
    });
    console.log(`  找到 ${invalidCaseIdResults.length} 条 caseId=0 的记录`);

    if (invalidCaseIdResults.length > 0) {
      await testRunResultRepository.delete({ caseId: 0 });
      console.log(`  ✓ 已删除 ${invalidCaseIdResults.length} 条`);
    }

    console.log('');

    // 【清理方案 2】删除 caseName='' 的垃圾记录（但保留有 caseId 的）
    console.log('【第 2 步】查找 caseName=\'\' 的记录...');
    const invalidCaseNameResults = await testRunResultRepository.find({
      where: { caseName: '' },
    });
    console.log(`  找到 ${invalidCaseNameResults.length} 条 caseName=\'\' 的记录`);

    if (invalidCaseNameResults.length > 0) {
      await testRunResultRepository.delete({ caseName: '' });
      console.log(`  ✓ 已删除 ${invalidCaseNameResults.length} 条`);
    }

    console.log('');

    // 【清理方案 3】查找仍然是 ERROR 状态但运行已完成的记录（清理可能的残留占位符）
    console.log('【第 3 步】查找可能的残留 ERROR 占位符...');
    const orphanedErrorResults = await testRunResultRepository.createQueryBuilder('r')
      .leftJoin('Auto_TestCaseTaskExecutions', 'e', 'r.execution_id = e.id')
      .where('r.status = :status', { status: 'error' })
      .andWhere('e.status IN (:...statuses)', { statuses: ['success', 'failed', 'cancelled'] })
      .getMany();

    console.log(`  找到 ${orphanedErrorResults.length} 条残留 ERROR 记录`);

    if (orphanedErrorResults.length > 0) {
      // 这些记录需要根据运行状态来清理
      console.log('  详情：');
      for (const result of orphanedErrorResults.slice(0, 10)) {
        console.log(`    - caseId=${result.caseId}, caseName='${result.caseName}'`);
      }
      if (orphanedErrorResults.length > 10) {
        console.log(`    ... 以及 ${orphanedErrorResults.length - 10} 条其他记录`);
      }
      console.log('  ⚠ 这些记录可能需要人工检查，暂不自动删除');
    }

    console.log('');

    // 【统计信息】
    console.log('【统计】清理完成后的数据统计：');
    const totalResults = await testRunResultRepository.count();
    const errorResults = await testRunResultRepository.count({ where: { status: 'error' } });
    const passedResults = await testRunResultRepository.count({ where: { status: 'passed' } });
    const failedResults = await testRunResultRepository.count({ where: { status: 'failed' } });
    const skippedResults = await testRunResultRepository.count({ where: { status: 'skipped' } });

    console.log(`  总记录数: ${totalResults}`);
    console.log(`  - passed:  ${passedResults}`);
    console.log(`  - failed:  ${failedResults}`);
    console.log(`  - skipped: ${skippedResults}`);
    console.log(`  - error:   ${errorResults}`);

    console.log('');
    console.log('============================================================');
    console.log('✓ 清理完成！');
    console.log('============================================================');

  } catch (error) {
    console.error('❌ 清理失败:', error);
    process.exit(1);
  } finally {
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
    }
  }
}

main();
