import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getDbConfig,
  getMysql2PoolConfig,
  getTypeOrmConfig,
  sanitizeConfigForLogging,
  DB_CONFIG_CONSTANTS
} from '../dbConfig';

describe('Database Configuration', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset environment variables
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('DB_CONFIG_CONSTANTS', () => {
    it('should have all required constants defined', () => {
      expect(DB_CONFIG_CONSTANTS.DEFAULT_PORT).toBe(3306);
      expect(DB_CONFIG_CONSTANTS.DEFAULT_HOST).toBe('localhost');
      expect(DB_CONFIG_CONSTANTS.DEFAULT_USER).toBe('root');
      expect(DB_CONFIG_CONSTANTS.DEFAULT_DATABASE).toBe('autotest');
      expect(DB_CONFIG_CONSTANTS.CONNECTION_LIMIT).toBe(10);
      expect(DB_CONFIG_CONSTANTS.QUEUE_LIMIT).toBe(20);
      expect(DB_CONFIG_CONSTANTS.RETRY_ATTEMPTS).toBe(3);
      expect(DB_CONFIG_CONSTANTS.RETRY_DELAY).toBe(3000);
      expect(DB_CONFIG_CONSTANTS.CHARSET).toBe('utf8mb4');
      expect(DB_CONFIG_CONSTANTS.TIMEZONE).toBe('+08:00');
    });
  });

  describe('getDbConfig', () => {
    it('should return default configuration when no environment variables are set', () => {
      // Arrange
      delete process.env.DB_HOST;
      delete process.env.DB_PORT;
      delete process.env.DB_USER;
      delete process.env.DB_PASSWORD;
      delete process.env.DB_NAME;

      // Act
      const config = getDbConfig();

      // Assert
      expect(config).toEqual({
        host: 'localhost',
        port: 3306,
        username: 'root',
        password: '',
        database: 'autotest',
      });
    });

    it('should use environment variables when provided', () => {
      // Arrange
      process.env.DB_HOST = 'custom-host';
      process.env.DB_PORT = '5432';
      process.env.DB_USER = 'custom-user';
      process.env.DB_PASSWORD = 'custom-password';
      process.env.DB_NAME = 'custom-db';

      // Act
      const config = getDbConfig();

      // Assert
      expect(config).toEqual({
        host: 'custom-host',
        port: 5432,
        username: 'custom-user',
        password: 'custom-password',
        database: 'custom-db',
      });
    });

    it('should throw error for invalid port number', () => {
      // Arrange
      process.env.DB_PORT = 'invalid-port';

      // Act & Assert
      expect(() => getDbConfig()).toThrow(
        'Invalid port number: invalid-port. Port must be between 1 and 65535.'
      );
    });

    it('should throw error for out-of-range port number', () => {
      // Arrange
      process.env.DB_PORT = '70000';

      // Act & Assert
      expect(() => getDbConfig()).toThrow(
        'Invalid port number: 70000. Port must be between 1 and 65535.'
      );
    });

    it('should throw error for zero port number', () => {
      // Arrange
      process.env.DB_PORT = '0';

      // Act & Assert
      expect(() => getDbConfig()).toThrow(
        'Invalid port number: 0. Port must be between 1 and 65535.'
      );
    });

    it('should throw error when password is missing in production', () => {
      // Arrange
      process.env.NODE_ENV = 'production';
      delete process.env.DB_PASSWORD;

      // Act & Assert
      expect(() => getDbConfig()).toThrow(
        'Missing required environment variables: DB_PASSWORD. Please check your environment configuration.'
      );
    });

    it('should not throw error when password is missing in development', () => {
      // Arrange
      process.env.NODE_ENV = 'development';
      delete process.env.DB_PASSWORD;

      // Act
      const config = getDbConfig();

      // Assert
      expect(config.password).toBe('');
    });
  });

  describe('getMysql2PoolConfig', () => {
    it('should return mysql2 pool configuration with correct structure', () => {
      // Arrange
      process.env.DB_HOST = 'test-host';
      process.env.DB_PORT = '3307';
      process.env.DB_USER = 'test-user';
      process.env.DB_PASSWORD = 'test-password';
      process.env.DB_NAME = 'test-db';

      // Act
      const config = getMysql2PoolConfig();

      // Assert
      expect(config).toEqual({
        host: 'test-host',
        port: 3307,
        user: 'test-user',
        password: 'test-password',
        database: 'test-db',
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 20,
        enableKeepAlive: true,
        keepAliveInitialDelay: 10000,
        connectTimeout: 10000,
        idleTimeout: 60000,
        charset: 'utf8mb4',
      });
    });

    it('should include all required mysql2 pool options', () => {
      // Act
      const config = getMysql2PoolConfig();

      // Assert
      expect(config).toHaveProperty('waitForConnections', true);
      expect(config).toHaveProperty('connectionLimit', 10);
      expect(config).toHaveProperty('queueLimit', 20);
      expect(config).toHaveProperty('enableKeepAlive', true);
      expect(config).toHaveProperty('keepAliveInitialDelay', 10000);
      expect(config).toHaveProperty('connectTimeout', 10000);
      expect(config).toHaveProperty('idleTimeout', 60000);
      expect(config).toHaveProperty('charset', 'utf8mb4');
    });
  });

  describe('getTypeOrmConfig', () => {
    it('should return TypeORM configuration with correct structure', () => {
      // Arrange
      process.env.DB_HOST = 'typeorm-host';
      process.env.DB_PORT = '3308';
      process.env.DB_USER = 'typeorm-user';
      process.env.DB_PASSWORD = 'typeorm-password';
      process.env.DB_NAME = 'typeorm-db';

      // Act
      const config = getTypeOrmConfig();

      // Assert
      expect(config).toEqual({
        type: 'mysql',
        host: 'typeorm-host',
        port: 3308,
        username: 'typeorm-user',
        password: 'typeorm-password',
        database: 'typeorm-db',
        charset: 'utf8mb4',
        timezone: '+08:00',
      });
    });

    it('should have correct type property', () => {
      // Act
      const config = getTypeOrmConfig();

      // Assert
      expect(config.type).toBe('mysql');
    });
  });

  describe('sanitizeConfigForLogging', () => {
    it('should remove password from configuration object', () => {
      // Arrange
      const config = {
        host: 'localhost',
        port: 3306,
        username: 'user',
        password: 'secret-password',
        database: 'test-db',
      };

      // Act
      const sanitized = sanitizeConfigForLogging(config);

      // Assert
      expect(sanitized).toEqual({
        host: 'localhost',
        port: 3306,
        username: 'user',
        password: '***',
        database: 'test-db',
      });
    });

    it('should handle configuration without password', () => {
      // Arrange
      const config = {
        host: 'localhost',
        port: 3306,
        username: 'user',
        database: 'test-db',
      };

      // Act
      const sanitized = sanitizeConfigForLogging(config);

      // Assert
      expect(sanitized).toEqual({
        host: 'localhost',
        port: 3306,
        username: 'user',
        database: 'test-db',
        password: undefined,
      });
    });

    it('should handle empty password', () => {
      // Arrange
      const config = {
        host: 'localhost',
        password: '',
        database: 'test-db',
      };

      // Act
      const sanitized = sanitizeConfigForLogging(config);

      // Assert
      expect(sanitized).toEqual({
        host: 'localhost',
        password: undefined,
        database: 'test-db',
      });
    });

    it('should preserve other properties unchanged', () => {
      // Arrange
      const config = {
        host: 'localhost',
        port: 3306,
        password: 'secret',
        customProperty: 'value',
        nestedObject: { key: 'value' },
        arrayProperty: [1, 2, 3],
      };

      // Act
      const sanitized = sanitizeConfigForLogging(config);

      // Assert
      expect(sanitized.customProperty).toBe('value');
      expect(sanitized.nestedObject).toEqual({ key: 'value' });
      expect(sanitized.arrayProperty).toEqual([1, 2, 3]);
      expect(sanitized.password).toBe('***');
    });
  });

  describe('Edge Cases', () => {
    it('should handle undefined environment variables gracefully', () => {
      // Arrange
      process.env.DB_HOST = undefined;
      process.env.DB_PORT = undefined;

      // Act
      const config = getDbConfig();

      // Assert
      expect(config.host).toBe('localhost');
      expect(config.port).toBe(3306);
    });

    it('should handle empty string environment variables', () => {
      // Arrange
      process.env.DB_HOST = '';
      process.env.DB_PORT = '';

      // Act
      const config = getDbConfig();

      // Assert
      expect(config.host).toBe('localhost');
      expect(config.port).toBe(3306);
    });
  });
});