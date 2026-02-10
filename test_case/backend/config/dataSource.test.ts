import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock dependencies before importing modules
vi.mock('../../../server/utils/logger', () => ({
  default: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('../../../server/config/dbConfig', () => ({
  getTypeOrmConfig: vi.fn(() => ({
    type: 'mysql',
    host: 'localhost',
    port: 3306,
    username: 'root',
    password: 'test',
    database: 'test_db',
    charset: 'utf8mb4',
    timezone: '+08:00',
  })),
  sanitizeConfigForLogging: vi.fn((config) => ({
    ...config,
    password: config.password ? '***' : undefined,
  })),
  DB_CONFIG_CONSTANTS: {
    CONNECTION_LIMIT: 10,
    QUEUE_LIMIT: 20,
    KEEP_ALIVE_DELAY: 10000,
    CONNECT_TIMEOUT: 10000,
    IDLE_TIMEOUT: 60000,
    RETRY_ATTEMPTS: 3,
    RETRY_DELAY: 3000,
  },
}));

// Mock TypeORM DataSource
const mockDataSourceInstance = {
  isInitialized: false,
  initialize: vi.fn(),
  destroy: vi.fn(),
  query: vi.fn(),
  entityMetadatas: [
    { name: 'TestCase' },
    { name: 'TestRun' },
    { name: 'User' },
  ],
  driver: { constructor: { name: 'MysqlDriver' } },
  options: { database: 'test_db' },
};

vi.mock('typeorm', () => ({
  DataSource: function MockDataSource() {
    return mockDataSourceInstance;
  },
}));

describe('DataSource Configuration', () => {
  let mockLogger: any;

  beforeEach(async () => {
    // Reset all mocks
    vi.clearAllMocks();
    vi.resetModules();

    // Reset mock DataSource state
    mockDataSourceInstance.isInitialized = false;
    mockDataSourceInstance.initialize.mockReset();
    mockDataSourceInstance.destroy.mockReset();
    mockDataSourceInstance.query.mockReset();

    // Import logger mock
    const loggerModule = await import('../../../server/utils/logger');
    mockLogger = loggerModule.default;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('initializeDataSource', () => {
    it('should initialize DataSource successfully when not already initialized', async () => {
      // Arrange
      mockDataSourceInstance.isInitialized = false;
      mockDataSourceInstance.initialize.mockResolvedValue(undefined);

      // Act
      const { initializeDataSource } = await import('../../../server/config/dataSource');
      const result = await initializeDataSource();

      // Assert
      expect(mockDataSourceInstance.initialize).toHaveBeenCalledOnce();
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Initializing TypeORM DataSource...',
        expect.any(Object)
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        'TypeORM DataSource initialized successfully',
        expect.objectContaining({
          entitiesCount: 3,
          entityNames: ['TestCase', 'TestRun', 'User'],
        })
      );
      expect(result).toBeDefined();
    });

    it('should skip initialization when already initialized', async () => {
      // Arrange
      mockDataSourceInstance.isInitialized = true;

      // Act
      const { initializeDataSource } = await import('../../../server/config/dataSource');
      const result = await initializeDataSource();

      // Assert
      expect(mockDataSourceInstance.initialize).not.toHaveBeenCalled();
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'TypeORM DataSource already initialized, skipping...'
      );
      expect(result).toBeDefined();
    });

    it('should handle initialization errors gracefully', async () => {
      // Arrange
      const initError = new Error('Connection failed');
      mockDataSourceInstance.isInitialized = false;
      mockDataSourceInstance.initialize.mockRejectedValue(initError);

      // Act & Assert
      const { initializeDataSource } = await import('../../../server/config/dataSource');
      await expect(initializeDataSource()).rejects.toThrow(
        'Database initialization failed: Connection failed'
      );

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to initialize TypeORM DataSource',
        expect.objectContaining({
          error: 'Connection failed',
          stack: expect.any(String),
        })
      );
    });
  });

  describe('closeDataSource', () => {
    it('should close DataSource successfully when initialized', async () => {
      // Arrange
      mockDataSourceInstance.isInitialized = true;
      mockDataSourceInstance.destroy.mockResolvedValue(undefined);

      // Act
      const { closeDataSource } = await import('../../../server/config/dataSource');
      await closeDataSource();

      // Assert
      expect(mockDataSourceInstance.destroy).toHaveBeenCalledOnce();
      expect(mockLogger.info).toHaveBeenCalledWith('Closing TypeORM DataSource...');
      expect(mockLogger.info).toHaveBeenCalledWith(
        'TypeORM DataSource closed successfully',
        expect.any(Object)
      );
    });

    it('should skip closing when not initialized', async () => {
      // Arrange
      mockDataSourceInstance.isInitialized = false;

      // Act
      const { closeDataSource } = await import('../../../server/config/dataSource');
      await closeDataSource();

      // Assert
      expect(mockDataSourceInstance.destroy).not.toHaveBeenCalled();
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'TypeORM DataSource not initialized, nothing to close'
      );
    });
  });

  describe('checkDataSourceHealth', () => {
    it('should return true when health check passes', async () => {
      // Arrange
      mockDataSourceInstance.isInitialized = true;
      mockDataSourceInstance.query.mockResolvedValue([{ health_check: 1 }]);

      // Act
      const { checkDataSourceHealth } = await import('../../../server/config/dataSource');
      const result = await checkDataSourceHealth();

      // Assert
      expect(result).toBe(true);
      expect(mockDataSourceInstance.query).toHaveBeenCalledWith('SELECT 1 as health_check');
      expect(mockLogger.debug).toHaveBeenCalledWith('DataSource health check passed');
    });

    it('should return false when DataSource not initialized', async () => {
      // Arrange
      mockDataSourceInstance.isInitialized = false;

      // Act
      const { checkDataSourceHealth } = await import('../../../server/config/dataSource');
      const result = await checkDataSourceHealth();

      // Assert
      expect(result).toBe(false);
      expect(mockDataSourceInstance.query).not.toHaveBeenCalled();
      expect(mockLogger.warn).toHaveBeenCalledWith('DataSource not initialized for health check');
    });
  });

  describe('getDataSourceStats', () => {
    it('should return stats when DataSource is initialized', async () => {
      // Arrange
      mockDataSourceInstance.isInitialized = true;

      // Act
      const { getDataSourceStats } = await import('../../../server/config/dataSource');
      const stats = getDataSourceStats();

      // Assert
      expect(stats).toEqual({
        isInitialized: true,
        entitiesCount: 3,
        entityNames: ['TestCase', 'TestRun', 'User'],
        driverType: 'MysqlDriver',
        database: 'test_db',
      });
    });

    it('should return minimal stats when DataSource not initialized', async () => {
      // Arrange
      mockDataSourceInstance.isInitialized = false;

      // Act
      const { getDataSourceStats } = await import('../../../server/config/dataSource');
      const stats = getDataSourceStats();

      // Assert
      expect(stats).toEqual({
        isInitialized: false,
        entitiesCount: 0,
        entityNames: [],
      });
    });
  });
});