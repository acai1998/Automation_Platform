import { DataSource, Repository, QueryRunner, SelectQueryBuilder, ObjectLiteral, EntityTarget } from 'typeorm';
import logger from '../utils/logger';
import { LOG_CONTEXTS } from '../config/logging';

/**
 * 基础 Repository 类
 * 提供通用的事务管理和查询构建功能
 */
export abstract class BaseRepository<T extends ObjectLiteral> {
  protected repository: Repository<T>;
  protected dataSource: DataSource;

  constructor(dataSource: DataSource, entityClass: EntityTarget<T>) {
    this.dataSource = dataSource;
    this.repository = dataSource.getRepository(entityClass);
  }

  /**
   * 在事务中执行操作
   */
  protected async executeInTransaction<R>(
    callback: (queryRunner: QueryRunner) => Promise<R>
  ): Promise<R> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();

    try {
      await queryRunner.startTransaction();
      const result = await callback(queryRunner);
      await queryRunner.commitTransaction();
      return result;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      logger.error('Transaction failed and rolled back:', {
        error: error instanceof Error ? error.message : String(error),
      }, LOG_CONTEXTS.DATABASE);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * 创建查询构建器
   */
  protected createQueryBuilder(alias: string, queryRunner?: QueryRunner): SelectQueryBuilder<T> {
    return this.repository.createQueryBuilder(alias, queryRunner);
  }

  /**
   * 批量插入
   */
  protected async batchInsert(
    entities: T[],
    chunkSize: number = 50
  ): Promise<void> {
    await this.repository.insert(entities);
  }

  /**
   * 获取 Repository 实例
   */
  getRepository(): Repository<T> {
    return this.repository;
  }
}