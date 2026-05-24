import { renderHook, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactNode } from 'react';
import { useCases, useRunCase, useAllCasesForSelect, usePagination } from '@/hooks/useCases';

const fetchSpy = vi.fn();
globalThis.fetch = fetchSpy;

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: 0,
      },
      mutations: {
        retry: false,
      },
    },
  });

  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe('useCases', () => {
  beforeEach(() => {
    fetchSpy.mockReset();
  });

  it('constructs correct query URL with type', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ success: true, data: [], total: 0 }),
    });

    const { result } = renderHook(() => useCases({ type: 'api' }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    const calledUrl = fetchSpy.mock.calls[0][0] as string;
    expect(calledUrl).toContain('/api/cases?');
    expect(calledUrl).toContain('type=api');
    expect(calledUrl).toContain('limit=10');
    expect(calledUrl).toContain('offset=0');
  });

  it('includes search param', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ success: true, data: [], total: 0 }),
    });

    const { result } = renderHook(
      () => useCases({ type: 'ui', search: 'login' }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    const calledUrl = fetchSpy.mock.calls[0][0] as string;
    expect(calledUrl).toContain('search=login');
  });

  it('includes pagination params', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ success: true, data: [], total: 0 }),
    });

    const { result } = renderHook(
      () => useCases({ type: 'api', page: 3, pageSize: 20 }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    const calledUrl = fetchSpy.mock.calls[0][0] as string;
    expect(calledUrl).toContain('limit=20');
    expect(calledUrl).toContain('offset=40');
  });

  it('includes priority param as comma-separated string', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ success: true, data: [], total: 0 }),
    });

    const { result } = renderHook(
      () => useCases({ type: 'api', priority: ['P0', 'P1'] }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    const calledUrl = fetchSpy.mock.calls[0][0] as string;
    expect(calledUrl).toContain('priority=P0%2CP1');
  });

  it('includes owner param as comma-separated string', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ success: true, data: [], total: 0 }),
    });

    const { result } = renderHook(
      () => useCases({ type: 'api', owner: ['alice', 'bob'] }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    const calledUrl = fetchSpy.mock.calls[0][0] as string;
    expect(calledUrl).toContain('owner=alice%2Cbob');
  });

  it('throws on non-ok response', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: () => Promise.resolve({}),
    });

    const { result } = renderHook(() => useCases({ type: 'api' }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error).toBeInstanceOf(Error);
  });
});

describe('useRunCase', () => {
  beforeEach(() => {
    fetchSpy.mockReset();
  });

  it('sends POST to correct endpoint', async () => {
    const mockResponse = {
      success: true,
      data: { caseId: 42, caseName: 'test case', status: 'pending', buildUrl: 'http://jenkins/job/1' },
      message: 'Case execution started',
    };

    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    });

    const { result } = renderHook(() => useRunCase(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate(42);
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(fetchSpy).toHaveBeenCalledWith('/api/cases/42/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    expect(result.current.data).toEqual(mockResponse);
  });

  it('throws error on non-ok response', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({ message: 'Case not found' }),
    });

    const { result } = renderHook(() => useRunCase(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate(999);
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error?.message).toBe('Case not found');
  });

  it('uses default error message when none provided', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({}),
    });

    const { result } = renderHook(() => useRunCase(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate(1);
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error?.message).toBe('Failed to run case');
  });
});

describe('useAllCasesForSelect', () => {
  beforeEach(() => {
    fetchSpy.mockReset();
  });

  it('fetches with default params', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ success: true, data: [], total: 0 }),
    });

    const { result } = renderHook(() => useAllCasesForSelect(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    const calledUrl = fetchSpy.mock.calls[0][0] as string;
    expect(calledUrl).toContain('limit=500');
    expect(calledUrl).toContain('offset=0');
    expect(calledUrl).toContain('enabled=true');
  });

  it('includes type param when provided', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ success: true, data: [], total: 0 }),
    });

    const { result } = renderHook(
      () => useAllCasesForSelect({ type: 'api' }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    const calledUrl = fetchSpy.mock.calls[0][0] as string;
    expect(calledUrl).toContain('type=api');
  });

  it('includes search param when provided', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ success: true, data: [], total: 0 }),
    });

    const { result } = renderHook(
      () => useAllCasesForSelect({ search: 'login test' }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    const calledUrl = fetchSpy.mock.calls[0][0] as string;
    expect(calledUrl).toContain('search=login+test');
  });

  it('does not fetch when enabled is false', () => {
    const { result } = renderHook(
      () => useAllCasesForSelect({ enabled: false }),
      { wrapper: createWrapper() }
    );

    expect(result.current.fetchStatus).toBe('idle');
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('usePagination', () => {
  it('calculates total pages correctly', () => {
    const { result } = renderHook(() => usePagination(25, 1, 10));
    expect(result.current.totalPages).toBe(3);
  });

  it('detects hasNextPage', () => {
    const { result } = renderHook(() => usePagination(30, 2, 10));
    expect(result.current.hasNextPage).toBe(true);
    expect(result.current.hasPrevPage).toBe(true);
  });

  it('detects last page has no next', () => {
    const { result } = renderHook(() => usePagination(25, 3, 10));
    expect(result.current.hasNextPage).toBe(false);
    expect(result.current.hasPrevPage).toBe(true);
  });

  it('detects first page has no prev', () => {
    const { result } = renderHook(() => usePagination(25, 1, 10));
    expect(result.current.hasPrevPage).toBe(false);
    expect(result.current.hasNextPage).toBe(true);
  });

  it('calculates correct start and end index', () => {
    const { result } = renderHook(() => usePagination(25, 2, 10));
    expect(result.current.startIndex).toBe(11);
    expect(result.current.endIndex).toBe(20);
  });

  it('caps endIndex at total', () => {
    const { result } = renderHook(() => usePagination(25, 3, 10));
    expect(result.current.startIndex).toBe(21);
    expect(result.current.endIndex).toBe(25);
  });
});
