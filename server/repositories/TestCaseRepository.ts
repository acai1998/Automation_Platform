import { DataSource, Repository, DeepPartial, QueryDeepPartialEntity, QueryRunner } from 'typeorm';
import { TestCase } from '../entities/TestCase';
import { BaseRepository } from './BaseRepository';

/**
 * 测试用例 Repository
 * 负责测试用例相关的数据库操作
 */
export class TestCaseRepository extends BaseRepository<TestCase> {
  private testCaseRepo: Repository<TestCase>;

  constructor(dataSource: DataSource) {
    super(dataSource, TestCase);
    this.testCaseRepo = this.repository;
  }

  /**
   * 根据 ID 获取测试用例
   */
  async findById(id: number): Promise<TestCase | null> {
    return this.testCaseRepo.findOne({ where: { id } });
  }

  /**
   * 根据名称获取测试用例
   */
  async findByName(name: string): Promise<TestCase | null> {
    return this.testCaseRepo.findOne({ where: { name } });
  }

  /**
   * 根据脚本路径获取测试用例
   */
  async findByScriptPath(scriptPath: string): Promise<TestCase | null> {
    return this.testCaseRepo.findOne({ where: { scriptPath } });
  }

  /**
   * 获取所有测试用例
   */
  async findAll(options?: {
    type?: string;
    priority?: string;
    limit?: number;
    offset?: number;
  }): Promise<TestCase[]> {
    const queryBuilder = this.testCaseRepo.createQueryBuilder('testCase');

    if (options?.type) {
      queryBuilder.andWhere('testCase.type = :type', { type: options.type });
    }

    if (options?.priority) {
      queryBuilder.andWhere('testCase.priority = :priority', { priority: options.priority });
    }

    queryBuilder.orderBy('testCase.createdAt', 'DESC');

    if (options?.limit) {
      queryBuilder.limit(options.limit);
    }

    if (options?.offset) {
      queryBuilder.offset(options.offset);
    }

    return queryBuilder.getMany();
  }

  /**
   * 创建测试用例
   */
  async createTestCase(data: {
    name: string;
    description?: string;
    module?: string;
    priority?: 'P0' | 'P1' | 'P2' | 'P3';
    type?: 'api' | 'ui' | 'performance' | 'security';
    tags?: string;
    scriptPath?: string;
    configJson?: string;
    createdBy?: number;
  }): Promise<TestCase> {
    // 安全解析 JSON 配置
    let parsedConfig: Record<string, unknown> | null = null;
    if (data.configJson) {
      try {
        parsedConfig = JSON.parse(data.configJson);
      } catch (error) {
        throw new Error(`Invalid JSON configuration: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    // 安全解析标签
    let parsedTags: string[] | null = null;
    if (data.tags) {
      try {
        parsedTags = data.tags.split(',').map(t => t.trim()).filter(t => t.length > 0);
      } catch (error) {
        throw new Error(`Invalid tags format: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    const testCase = this.testCaseRepo.create({
      name: data.name,
      description: data.description || null,
      module: data.module || null,
      priority: data.priority || 'P1',
      type: data.type || 'api',
      tags: parsedTags,
      scriptPath: data.scriptPath || null,
      config: parsedConfig,
      enabled: true,
      createdBy: data.createdBy || null,
    } as DeepPartial<TestCase>);

    return this.testCaseRepo.save(testCase);
  }

  /**
   * 更新测试用例
   */
  async updateTestCase(id: number, data: QueryDeepPartialEntity<TestCase>): Promise<void> {
    await this.testCaseRepo.update(id, data);
  }

  /**
   * 安全更新测试用例（带 JSON 验证）
   */
  async updateTestCaseSafe(id: number, data: {
    name?: string;
    description?: string;
    module?: string;
    priority?: 'P0' | 'P1' | 'P2' | 'P3';
    type?: 'api' | 'ui' | 'performance' | 'security';
    status?: 'active' | 'inactive' | 'deprecated' | 'draft';
    tags?: string;
    scriptPath?: string;
    configJson?: string;
    enabled?: boolean;
    updatedBy?: number;
  }): Promise<void> {
    const updateData: QueryDeepPartialEntity<TestCase> = {};

    // 基本字段更新
    if (data.name !== undefined) updateData.name = data.name;
    if (data.description !== undefined) updateData.description = data.description || null;
    if (data.module !== undefined) updateData.module = data.module || null;
    if (data.priority !== undefined) updateData.priority = data.priority;
    if (data.type !== undefined) updateData.type = data.type;
    if (data.scriptPath !== undefined) updateData.scriptPath = data.scriptPath || null;
    if (data.enabled !== undefined) updateData.enabled = data.enabled;
    if (data.updatedBy !== undefined) updateData.updatedBy = data.updatedBy;

    // 安全解析 JSON 配置
    if (data.configJson !== undefined) {
      if (data.configJson) {
        try {
          updateData.config = JSON.parse(data.configJson);
        } catch (error) {
          throw new Error(`Invalid JSON configuration: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      } else {
        updateData.config = null;
      }
    }

    // 安全解析标签
    if (data.tags !== undefined) {
      if (data.tags) {
        try {
          updateData.tags = data.tags.split(',').map(t => t.trim()).filter(t => t.length > 0);
        } catch (error) {
          throw new Error(`Invalid tags format: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      } else {
        updateData.tags = null;
      }
    }

    await this.testCaseRepo.update(id, updateData);
  }

  /**
   * 删除测试用例
   */
  async deleteTestCase(id: number): Promise<void> {
    await this.testCaseRepo.delete(id);
  }

  /**
   * 统计测试用例数量
   */
  async count(options?: {
    type?: string;
    priority?: string;
    projectId?: number;
    module?: string;
    enabled?: boolean;
    search?: string;
  }): Promise<number> {
    const queryBuilder = this.testCaseRepo.createQueryBuilder('testCase');

    if (options?.type) {
      queryBuilder.andWhere('testCase.type = :type', { type: options.type });
    }

    if (options?.priority) {
      queryBuilder.andWhere('testCase.priority = :priority', { priority: options.priority });
    }

    if (options?.projectId) {
      queryBuilder.andWhere('testCase.projectId = :projectId', { projectId: options.projectId });
    }

    if (options?.module) {
      queryBuilder.andWhere('testCase.module = :module', { module: options.module });
    }

    if (options?.enabled !== undefined) {
      queryBuilder.andWhere('testCase.enabled = :enabled', { enabled: options.enabled });
    }

    if (options?.search) {
      queryBuilder.andWhere(
        '(testCase.name LIKE :search OR testCase.description LIKE :search)',
        { search: `%${options.search}%` }
      );
    }

    return queryBuilder.getCount();
  }

  /**
   * 查询测试用例列表(带关联用户)
   */
  async findAllWithUser(options?: {
    projectId?: number;
    module?: string;
    enabled?: boolean;
    type?: string;
    search?: string;
    limit?: number;
    offset?: number;
  }): Promise<Array<TestCase & { createdByName?: string }>> {
    const queryBuilder = this.testCaseRepo
      .createQueryBuilder('testCase')
      .leftJoinAndSelect('testCase.creator', 'user')
      .select([
        'testCase',
        'user.displayName',
      ]);

    if (options?.projectId) {
      queryBuilder.andWhere('testCase.projectId = :projectId', { projectId: options.projectId });
    }

    if (options?.module) {
      queryBuilder.andWhere('testCase.module = :module', { module: options.module });
    }

    if (options?.enabled !== undefined) {
      queryBuilder.andWhere('testCase.enabled = :enabled', { enabled: options.enabled });
    }

    if (options?.type) {
      queryBuilder.andWhere('testCase.type = :type', { type: options.type });
    }

    if (options?.search) {
      queryBuilder.andWhere(
        '(testCase.name LIKE :search OR testCase.description LIKE :search)',
        { search: `%${options.search}%` }
      );
    }

    queryBuilder.orderBy('testCase.updatedAt', 'DESC');

    if (options?.limit) {
      queryBuilder.limit(options.limit);
    }

    if (options?.offset) {
      queryBuilder.offset(options.offset);
    }

    const results = await queryBuilder.getMany();

    return results.map(testCase => ({
      ...testCase,
      createdByName: testCase.creator?.displayName,
    })) as Array<TestCase & { createdByName?: string }>;
  }

  /**
   * 获取不同的模块列表
   */
  async getDistinctModules(): Promise<string[]> {
    const results = await this.testCaseRepo
      .createQueryBuilder('testCase')
      .select('DISTINCT testCase.module', 'module')
      .where('testCase.module IS NOT NULL')
      .orderBy('testCase.module', 'ASC')
      .getRawMany<{ module: string }>();

    return results.map(r => r.module);
  }

  /**
   * 获取测试用例详情(带关联用户)
   */
  async findByIdWithUser(id: number): Promise<(TestCase & { createdByName?: string }) | null> {
    const testCase = await this.testCaseRepo
      .createQueryBuilder('testCase')
      .leftJoinAndSelect('testCase.creator', 'user')
      .where('testCase.id = :id', { id })
      .getOne();

    if (!testCase) {
      return null;
    }

    return {
      ...testCase,
      createdByName: testCase.creator?.displayName,
    } as TestCase & { createdByName?: string };
  }

  /**
   * 批量创建测试用例（带事务支持）
   */
  async createTestCasesBatch(testCases: Array<{
    name: string;
    description?: string;
    module?: string;
    priority?: 'P0' | 'P1' | 'P2' | 'P3';
    type?: 'api' | 'ui' | 'performance' | 'security';
    tags?: string;
    scriptPath?: string;
    configJson?: string;
    createdBy?: number;
  }>): Promise<TestCase[]> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const createdTestCases: TestCase[] = [];

      for (const data of testCases) {
        // 安全解析 JSON 配置
        let parsedConfig: Record<string, unknown> | null = null;
        if (data.configJson) {
          try {
            parsedConfig = JSON.parse(data.configJson);
          } catch (error) {
            throw new Error(`Invalid JSON configuration for test case "${data.name}": ${error instanceof Error ? error.message : 'Unknown error'}`);
          }
        }

        // 安全解析标签
        let parsedTags: string[] | null = null;
        if (data.tags) {
          try {
            parsedTags = data.tags.split(',').map(t => t.trim()).filter(t => t.length > 0);
          } catch (error) {
            throw new Error(`Invalid tags format for test case "${data.name}": ${error instanceof Error ? error.message : 'Unknown error'}`);
          }
        }

        const testCase = queryRunner.manager.create(TestCase, {
          name: data.name,
          description: data.description || null,
          module: data.module || null,
          priority: data.priority || 'P1',
          type: data.type || 'api',
          tags: parsedTags,
          scriptPath: data.scriptPath || null,
          config: parsedConfig,
          enabled: true,
          createdBy: data.createdBy || null,
        } as DeepPartial<TestCase>);

        const savedTestCase = await queryRunner.manager.save(TestCase, testCase);
        createdTestCases.push(savedTestCase);
      }

      await queryRunner.commitTransaction();
      return createdTestCases;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * 批量更新测试用例（带事务支持）
   */
  async updateTestCasesBatch(updates: Array<{
    id: number;
    data: {
      name?: string;
      description?: string;
      module?: string;
      priority?: 'P0' | 'P1' | 'P2' | 'P3';
      type?: 'api' | 'ui' | 'performance' | 'security';
      status?: 'active' | 'inactive' | 'deprecated' | 'draft';
      tags?: string;
      scriptPath?: string;
      configJson?: string;
      enabled?: boolean;
      updatedBy?: number;
    };
  }>): Promise<void> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      for (const { id, data } of updates) {
        const updateData: QueryDeepPartialEntity<TestCase> = {};

        // 基本字段更新
        if (data.name !== undefined) updateData.name = data.name;
        if (data.description !== undefined) updateData.description = data.description || null;
        if (data.module !== undefined) updateData.module = data.module || null;
        if (data.priority !== undefined) updateData.priority = data.priority;
        if (data.type !== undefined) updateData.type = data.type;
        if (data.scriptPath !== undefined) updateData.scriptPath = data.scriptPath || null;
        if (data.enabled !== undefined) updateData.enabled = data.enabled;
        if (data.updatedBy !== undefined) updateData.updatedBy = data.updatedBy;

        // 安全解析 JSON 配置
        if (data.configJson !== undefined) {
          if (data.configJson) {
            try {
              updateData.config = JSON.parse(data.configJson);
            } catch (error) {
              throw new Error(`Invalid JSON configuration for test case ID ${id}: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }
          } else {
            updateData.config = null;
          }
        }

        // 安全解析标签
        if (data.tags !== undefined) {
          if (data.tags) {
            try {
              updateData.tags = data.tags.split(',').map(t => t.trim()).filter(t => t.length > 0);
            } catch (error) {
              throw new Error(`Invalid tags format for test case ID ${id}: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }
          } else {
            updateData.tags = null;
          }
        }

        await queryRunner.manager.update(TestCase, id, updateData);
      }

      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * 批量删除测试用例（带事务支持）
   */
  async deleteTestCasesBatch(ids: number[]): Promise<void> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // 验证所有测试用例是否存在
      for (const id of ids) {
        const testCase = await queryRunner.manager.findOne(TestCase, { where: { id } });
        if (!testCase) {
          throw new Error(`Test case with ID ${id} not found`);
        }
      }

      // 删除所有测试用例
      await queryRunner.manager.delete(TestCase, ids);

      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }
}
