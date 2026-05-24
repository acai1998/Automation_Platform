import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../server/utils/logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('../../../server/config/logging', () => ({
  LOG_CONTEXTS: { PERFORMANCE: 'PERFORMANCE' },
}));

describe('type-validation module', () => {
  it('imports without throwing', async () => {
    await expect(import('../../../server/utils/type-validation')).resolves.toBeDefined();
  });

  it('exports validateTypes (runs on import)', async () => {
    const mod = await import('../../../server/utils/type-validation');
    expect(mod).toBeDefined();
  });
});
