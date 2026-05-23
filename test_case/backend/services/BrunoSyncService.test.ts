import { describe, expect, it, vi } from 'vitest';
import { BrunoSyncService } from '../../../server/services/BrunoAutomation/sync';

describe('BrunoSyncService', () => {
  it('parses .bru files and persists request index', async () => {
    const replaceRequestIndex = vi.fn().mockResolvedValue(undefined);
    const service = new BrunoSyncService({
      checkoutRepository: vi.fn().mockResolvedValue({
        checkoutPath: 'D:/repos/repo-1',
        commit: 'abc123',
      }),
      findBruFiles: vi.fn().mockResolvedValue([
        'orders/create-order.bru',
        'orders/get-order.bru',
      ]),
      readBruFile: vi.fn()
        .mockResolvedValueOnce(`meta {
  name: Create Order
}
post {
  url: {{baseUrl}}/orders
}
tests {
  test("returns 201", function() {});
}
`)
        .mockResolvedValueOnce(`meta {
  name: Get Order
}
get {
  url: {{baseUrl}}/orders/{{id}}
}
`),
      repository: {
        replaceRequestIndex,
      },
    });

    const result = await service.syncRepository({
      id: 1,
      name: 'Order API',
      projectId: 5,
      gitUrl: 'https://gitlab.example.com/qa/order-api.git',
      defaultBranch: 'main',
      collectionRoot: 'collections',
      lastSyncCommit: null,
      lastSyncStatus: 'never',
      lastSyncError: null,
      createdAt: '2026-05-23',
      updatedAt: '2026-05-23',
    });

    expect(result).toEqual({
      repositoryId: 1,
      commit: 'abc123',
      requestCount: 2,
    });
    expect(replaceRequestIndex).toHaveBeenCalledWith(
      expect.objectContaining({
        repositoryId: 1,
        collectionName: 'Order API',
        collectionPath: 'collections',
        projectId: 5,
        syncCommit: 'abc123',
        requests: [
          expect.objectContaining({ name: 'Create Order', method: 'POST' }),
          expect.objectContaining({ name: 'Get Order', method: 'GET' }),
        ],
      }),
    );
  });
});
