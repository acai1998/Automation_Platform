import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockRepository, mockQueryBuilder, mockDataSource } = vi.hoisted(() => {
  const mockQueryBuilder = {
    where: vi.fn().mockReturnThis(),
    andWhere: vi.fn().mockReturnThis(),
    getOne: vi.fn(),
  };

  const mockRepository = {
    findOne: vi.fn(),
    create: vi.fn(),
    save: vi.fn(),
    update: vi.fn(),
    createQueryBuilder: vi.fn().mockReturnValue(mockQueryBuilder),
  };

  const mockDataSource = {
    getRepository: vi.fn().mockReturnValue(mockRepository),
  };

  return { mockRepository, mockQueryBuilder, mockDataSource };
});

vi.mock('../../../server/utils/logger', () => ({
  default: {
    performanceLog: vi.fn(),
    errorLog: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
  __esModule: true,
}));

vi.mock('../../../server/config/logging', () => ({
  createTimer: vi.fn(() => () => 0),
}));

vi.mock('../../../server/config/database', () => ({
  AppDataSource: mockDataSource,
}));

import { UserRepository } from '../../../server/repositories/UserRepository';
import { User } from '../../../server/entities/User';

describe('UserRepository', () => {
  let repository: UserRepository;

  const mockUser: Partial<User> = {
    id: 1,
    username: 'testuser',
    email: 'test@example.com',
    passwordHash: 'hashedpassword',
    displayName: 'Test User',
    status: 'active',
    role: 'user',
    loginAttempts: 0,
    lockedUntil: null,
    lastLoginAt: null,
    resetToken: null,
    resetTokenExpires: null,
    rememberToken: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    repository = new UserRepository(mockDataSource as never);
  });

  describe('findByEmail', () => {
    it('returns user when found', async () => {
      mockRepository.findOne.mockResolvedValue(mockUser);

      const result = await repository.findByEmail('test@example.com');

      expect(result).toEqual(mockUser);
      expect(mockRepository.findOne).toHaveBeenCalledWith({ where: { email: 'test@example.com' } });
    });

    it('returns null when not found', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      const result = await repository.findByEmail('nonexistent@example.com');

      expect(result).toBeNull();
    });
  });

  describe('findByUsername', () => {
    it('returns user when found', async () => {
      mockRepository.findOne.mockResolvedValue(mockUser);

      const result = await repository.findByUsername('testuser');

      expect(result).toEqual(mockUser);
      expect(mockRepository.findOne).toHaveBeenCalledWith({ where: { username: 'testuser' } });
    });

    it('returns null when not found', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      const result = await repository.findByUsername('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('findById', () => {
    it('returns user when found', async () => {
      mockRepository.findOne.mockResolvedValue(mockUser);

      const result = await repository.findById(1);

      expect(result).toEqual(mockUser);
      expect(mockRepository.findOne).toHaveBeenCalledWith({ where: { id: 1 } });
    });

    it('returns null when not found', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      const result = await repository.findById(999);

      expect(result).toBeNull();
    });
  });

  describe('findByResetToken', () => {
    it('calls createQueryBuilder with correct params', async () => {
      mockQueryBuilder.getOne.mockResolvedValue(mockUser);

      const result = await repository.findByResetToken('reset-token-123');

      expect(result).toEqual(mockUser);
      expect(mockRepository.createQueryBuilder).toHaveBeenCalledWith('user');
      expect(mockQueryBuilder.where).toHaveBeenCalledWith('user.resetToken = :token', { token: 'reset-token-123' });
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith('user.resetTokenExpires > NOW()');
      expect(mockQueryBuilder.getOne).toHaveBeenCalled();
    });
  });

  describe('findByRememberToken', () => {
    it('returns user when found', async () => {
      mockRepository.findOne.mockResolvedValue(mockUser);

      const result = await repository.findByRememberToken('refresh-token-abc');

      expect(result).toEqual(mockUser);
      expect(mockRepository.findOne).toHaveBeenCalledWith({ where: { rememberToken: 'refresh-token-abc' } });
    });
  });

  describe('createUser', () => {
    it('creates with default status and loginAttempts', async () => {
      const userData = {
        username: 'newuser',
        email: 'new@example.com',
        passwordHash: 'hashedpwd',
      };
      const createdUser = { ...mockUser, ...userData, status: 'active', loginAttempts: 0 };
      mockRepository.create.mockReturnValue(createdUser);
      mockRepository.save.mockResolvedValue(createdUser);

      const result = await repository.createUser(userData);

      expect(result).toEqual(createdUser);
      expect(mockRepository.create).toHaveBeenCalledWith({
        ...userData,
        status: 'active',
        loginAttempts: 0,
      });
      expect(mockRepository.save).toHaveBeenCalledWith(createdUser);
    });
  });

  describe('updateLoginAttempts', () => {
    it('calls update with correct params', async () => {
      mockRepository.update.mockResolvedValue(undefined);

      await repository.updateLoginAttempts(1, 3);

      expect(mockRepository.update).toHaveBeenCalledWith(1, { loginAttempts: 3 });
    });
  });

  describe('lockUser', () => {
    it('updates with locked status and lockedUntil', async () => {
      const lockedUntil = new Date('2026-01-01T00:00:00Z');
      mockRepository.update.mockResolvedValue(undefined);

      await repository.lockUser(1, lockedUntil);

      expect(mockRepository.update).toHaveBeenCalledWith(1, {
        status: 'locked',
        lockedUntil,
        loginAttempts: 0,
      });
    });
  });

  describe('unlockUser', () => {
    it('updates with active status and null lockedUntil', async () => {
      mockRepository.update.mockResolvedValue(undefined);

      await repository.unlockUser(1);

      expect(mockRepository.update).toHaveBeenCalledWith(1, {
        status: 'active',
        loginAttempts: 0,
        lockedUntil: null,
      });
    });
  });

  describe('updateLastLogin', () => {
    it('updates lastLoginAt and resets loginAttempts', async () => {
      mockRepository.update.mockResolvedValue(undefined);

      await repository.updateLastLogin(1);

      expect(mockRepository.update).toHaveBeenCalledWith(1, {
        lastLoginAt: expect.any(Date),
        loginAttempts: 0,
      });
    });
  });

  describe('setResetToken', () => {
    it('updates resetToken and resetTokenExpires', async () => {
      const expiresAt = new Date('2026-06-01T00:00:00Z');
      mockRepository.update.mockResolvedValue(undefined);

      await repository.setResetToken(1, 'token-abc', expiresAt);

      expect(mockRepository.update).toHaveBeenCalledWith(1, {
        resetToken: 'token-abc',
        resetTokenExpires: expiresAt,
      });
    });
  });

  describe('resetPassword', () => {
    it('updates passwordHash and clears token fields', async () => {
      mockRepository.update.mockResolvedValue(undefined);

      await repository.resetPassword(1, 'newhashedpwd');

      expect(mockRepository.update).toHaveBeenCalledWith(1, {
        passwordHash: 'newhashedpwd',
        resetToken: null,
        resetTokenExpires: null,
      });
    });
  });

  describe('setRememberToken', () => {
    it('updates rememberToken', async () => {
      mockRepository.update.mockResolvedValue(undefined);

      await repository.setRememberToken(1, 'remember-token-xyz');

      expect(mockRepository.update).toHaveBeenCalledWith(1, {
        rememberToken: 'remember-token-xyz',
      });
    });
  });
});
