import 'reflect-metadata';
import 'dotenv/config';
import { initializeDataSource, AppDataSource } from './server/config/dataSource';
import { ExecutionRepository } from './server/repositories/ExecutionRepository';
import logger from './server/utils/logger';
import { LOG_CONTEXTS } from './server/config/logging';

async function main() {
  try {
    console.log('Starting orphaned TestRuns fix...');
    
    // 初始化数据库连接
    console.log('Initializing database connection...');
    await initializeDataSource();
    
    // 创建 ExecutionRepository 实例
    const executionRepository = new ExecutionRepository(AppDataSource);
    
    // 运行修复
    console.log('Running fixOrphanedTestRuns...');
    const result = await executionRepository.fixOrphanedTestRuns();
    
    console.log('Fix completed:', result);
    console.log(`Checked ${result.checked} records, fixed ${result.fixed} records.`);
    
    // 关闭数据库连接
    await AppDataSource.destroy();
    console.log('Database connection closed.');
    
    process.exit(0);
  } catch (error) {
    console.error('Error during fix:', error);
    process.exit(1);
  }
}

main();