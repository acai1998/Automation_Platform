import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

vi.mock('@/services/authApi', () => ({
  getToken: vi.fn(() => 'mock-token-123'),
}));

import { getToken } from '@/services/authApi';
import {
  useTasks,
  useRunTask,
  useCreateTask,
  useDeleteTask,
  useUpdateTaskStatus,
  useBatchRunTask,
} from '@/hooks/useTasks';

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

async function runWithConcurrencyLimit<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  concurrency = 3
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = [];
  let index = 0;

  async function worker(): Promise<void> {
    while (index < items.length) {
      const current = index++;
      try {
        const value = await fn(items[current]);
        results[current] = { status: 'fulfilled', value };
      } catch (reason) {
        results[current] = { status: 'rejected', reason };
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);

  return results;
}

function buildAuthHeaders(): HeadersInit {
  const token = getToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

describe('runWithConcurrencyLimit (re-defined)', () => {
  it('empty array returns empty result', async () => {
    const results = await runWithConcurrencyLimit([], async (x: number) => x);
    expect(results).toEqual([]);
  });

  it('all items succeed', async () => {
    const results = await runWithConcurrencyLimit([1, 2, 3], async (x: number) => x * 2);
    expect(results).toHaveLength(3);
    expect(results.every((r) => r.status === 'fulfilled')).toBe(true);
    expect((results[0] as PromiseFulfilledResult<number>).value).toBe(2);
    expect((results[1] as PromiseFulfilledResult<number>).value).toBe(4);
    expect((results[2] as PromiseFulfilledResult<number>).value).toBe(6);
  });

  it('some items fail (mixed fulfilled/rejected)', async () => {
    const results = await runWithConcurrencyLimit(
      [1, 2, 3],
      async (x: number) => {
        if (x === 2) throw new Error('fail');
        return x;
      }
    );
    expect(results).toHaveLength(3);
    expect(results[0].status).toBe('fulfilled');
    expect(results[1].status).toBe('rejected');
    expect(results[2].status).toBe('fulfilled');
    if (results[1].status === 'rejected') {
      expect((results[1].reason as Error).message).toBe('fail');
    }
  });

  it('respects concurrency limit', async () => {
    let running = 0;
    let maxRunning = 0;

    await runWithConcurrencyLimit(
      Array.from({ length: 10 }, (_, i) => i),
      async (_item: number) => {
        running++;
        maxRunning = Math.max(maxRunning, running);
        await new Promise((r) => setTimeout(r, 20));
        running--;
      },
      2
    );

    expect(maxRunning).toBeLessThanOrEqual(2);
  });
});

describe('buildAuthHeaders (re-defined)', () => {
  beforeEach(() => {
    vi.mocked(getToken).mockReset();
  });

  it('includes token when getToken returns value', () => {
    vi.mocked(getToken).mockReturnValue('test-token');
    const headers = buildAuthHeaders();
    expect(headers).toEqual({
      'Content-Type': 'application/json',
      Authorization: 'Bearer test-token',
    });
  });

  it('no token when getToken returns null', () => {
    vi.mocked(getToken).mockReturnValue(null);
    const headers = buildAuthHeaders();
    expect(headers).toEqual({ 'Content-Type': 'application/json' });
    expect(headers).not.toHaveProperty('Authorization');
  });
});

describe('useTasks', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('constructs correct query URL', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      new Response(JSON.stringify({ data: [], total: 0 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const { result } = renderHook(
      () => useTasks({ projectId: 5, status: 'active', limit: 10, offset: 0 }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const calledUrl = fetchSpy.mock.calls[0][0] as string;
    expect(calledUrl).toContain('/api/tasks?');
    expect(calledUrl).toContain('projectId=5');
    expect(calledUrl).toContain('status=active');
    expect(calledUrl).toContain('limit=10');
    expect(calledUrl).toContain('offset=0');
  });
});

describe('useRunTask', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.mocked(getToken).mockReturnValue('mock-token');
  });

  it('sends POST to correct endpoint', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const { result } = renderHook(() => useRunTask(), { wrapper: createWrapper() });

    result.current.mutate(42);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const calledUrl = fetchSpy.mock.calls[0][0] as string;
    const calledOptions = fetchSpy.mock.calls[0][1] as RequestInit;
    expect(calledUrl).toBe('/api/tasks/42/run');
    expect(calledOptions.method).toBe('POST');
  });
});

describe('useCreateTask', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.mocked(getToken).mockReturnValue('mock-token');
  });

  it('sends POST with body', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      new Response(JSON.stringify({ success: true, data: { id: 99 } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const { result } = renderHook(() => useCreateTask(), { wrapper: createWrapper() });

    result.current.mutate({ name: 'New Task', triggerType: 'manual' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const calledUrl = fetchSpy.mock.calls[0][0] as string;
    const calledOptions = fetchSpy.mock.calls[0][1] as RequestInit;
    expect(calledUrl).toBe('/api/tasks');
    expect(calledOptions.method).toBe('POST');
    expect(JSON.parse(calledOptions.body as string)).toEqual({
      name: 'New Task',
      triggerType: 'manual',
    });
  });
});

describe('useDeleteTask', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.mocked(getToken).mockReturnValue('mock-token');
  });

  it('sends DELETE to correct endpoint', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const { result } = renderHook(() => useDeleteTask(), { wrapper: createWrapper() });

    result.current.mutate(15);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const calledUrl = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(calledUrl).toBe('/api/tasks/15');
  });
});

describe('useUpdateTaskStatus', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.mocked(getToken).mockReturnValue('mock-token');
  });

  it('sends PATCH with status body', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const { result } = renderHook(() => useUpdateTaskStatus(), { wrapper: createWrapper() });

    result.current.mutate({ id: 7, status: 'paused' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const calledUrl = fetchSpy.mock.calls[0][0] as string;
    const calledOptions = fetchSpy.mock.calls[0][1] as RequestInit;
    expect(calledUrl).toBe('/api/tasks/7/status');
    expect(calledOptions.method).toBe('PATCH');
    expect(JSON.parse(calledOptions.body as string)).toEqual({ status: 'paused' });
  });
});

describe('useBatchRunTask', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.mocked(getToken).mockReturnValue('mock-token');
  });

  it('sends POST for each task ID', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const { result } = renderHook(() => useBatchRunTask(), { wrapper: createWrapper() });

    result.current.mutate([1, 2, 3]);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const calls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls;
    const urls = calls.map((c: unknown[]) => (c[0] as string));
    expect(urls).toContain('/api/tasks/1/run');
    expect(urls).toContain('/api/tasks/2/run');
    expect(urls).toContain('/api/tasks/3/run');
    expect(result.current.data?.successes).toBe(3);
    expect(result.current.data?.failures).toBe(0);
  });
});
