import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

vi.mock('@/api', () => ({
  request: vi.fn(),
}));

import { request } from '@/api';
import {
  useTestRuns,
  useTestRunDetail,
  useJenkinsHealthStatus,
  useTestRunResults,
} from '@/hooks/useExecutions';

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, cacheTime: 0 },
      mutations: { retry: false },
    },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

describe('useTestRuns', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('constructs query with pagination params', async () => {
    vi.mocked(request).mockResolvedValue({
      success: true,
      data: [],
      total: 0,
    });

    const { result } = renderHook(() => useTestRuns(2, 15), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const calledEndpoint = vi.mocked(request).mock.calls[0][0] as string;
    expect(calledEndpoint).toContain('/executions/test-runs?');
    expect(calledEndpoint).toContain('limit=15');
    expect(calledEndpoint).toContain('offset=15');
  });

  it('includes filter params when provided', async () => {
    vi.mocked(request).mockResolvedValue({
      success: true,
      data: [],
      total: 0,
    });

    const { result } = renderHook(
      () =>
        useTestRuns(1, 10, {
          triggerType: ['manual', 'jenkins'],
          status: ['success'],
          startDate: '2026-01-01',
          endDate: '2026-01-31',
        }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const calledEndpoint = vi.mocked(request).mock.calls[0][0] as string;
    expect(calledEndpoint).toContain('triggerType=manual%2Cjenkins');
    expect(calledEndpoint).toContain('status=success');
    expect(calledEndpoint).toContain('startDate=2026-01-01');
    expect(calledEndpoint).toContain('endDate=2026-01-31');
  });
});

describe('useTestRunDetail', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('queries with correct ID', async () => {
    vi.mocked(request).mockResolvedValue({
      success: true,
      data: {
        id: 42,
        project_id: 1,
        project_name: 'Test',
        trigger_type: 'manual',
        trigger_by: 1,
        trigger_by_name: 'admin',
        jenkins_job: null,
        jenkins_build_id: null,
        jenkins_url: null,
        abort_reason: null,
        status: 'success',
        start_time: '2026-01-01T00:00:00Z',
        end_time: '2026-01-01T00:01:00Z',
        duration_ms: 60000,
        total_cases: 10,
        passed_cases: 9,
        failed_cases: 1,
        skipped_cases: 0,
        created_at: '2026-01-01T00:00:00Z',
      },
    });

    const { result } = renderHook(() => useTestRunDetail(42), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const calledEndpoint = vi.mocked(request).mock.calls[0][0] as string;
    expect(calledEndpoint).toBe('/executions/42');
    expect(result.current.data?.id).toBe(42);
  });
});

describe('useJenkinsHealthStatus', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns connected:false on error', async () => {
    vi.mocked(request).mockRejectedValue(new Error('Connection refused'));

    const { result } = renderHook(() => useJenkinsHealthStatus(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.connected).toBe(false);
    expect(result.current.data?.message).toBe('Connection refused');
  });

  it('returns connected:true on success', async () => {
    vi.mocked(request).mockResolvedValue({
      success: true,
      data: { connected: true, version: '2.400' },
      message: 'Jenkins is healthy',
    });

    const { result } = renderHook(() => useJenkinsHealthStatus(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.connected).toBe(true);
    expect(result.current.data?.version).toBe('2.400');
  });
});

describe('useTestRunResults', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('constructs query with pagination and status filter', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      new Response(
        JSON.stringify({
          success: true,
          data: [],
          total: 0,
          page: 1,
          pageSize: 20,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );

    const { result } = renderHook(
      () => useTestRunResults(10, { page: 3, pageSize: 50, status: 'failed' }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const calledUrl = fetchSpy.mock.calls[0][0] as string;
    expect(calledUrl).toContain('/api/executions/10/results?');
    expect(calledUrl).toContain('page=3');
    expect(calledUrl).toContain('pageSize=50');
    expect(calledUrl).toContain('status=failed');
  });
});
