import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Reports from '@/pages/reports/Reports';
import * as executionHooks from '@/hooks/useExecutions';

vi.mock('wouter', () => ({
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, asChild, ...props }: { children: React.ReactNode; asChild?: boolean }) => (
    asChild ? <>{children}</> : <button {...props}>{children}</button>
  ),
}));

vi.mock('@/components/ui/badge', () => ({
  Badge: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));

vi.mock('@/components/ui/date-range-picker', () => ({
  DateRangePicker: () => <div>date-range-picker</div>,
}));

vi.mock('@/components/ui/popover', () => ({
  Popover: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PopoverContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PopoverTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/components/ui/checkbox', () => ({
  Checkbox: ({
    onCheckedChange,
    checked,
  }: {
    onCheckedChange?: (checked: boolean) => void;
    checked?: boolean;
  }) => (
    <input
      type="checkbox"
      checked={checked}
      onChange={(event) => onCheckedChange?.(event.target.checked)}
      readOnly={!onCheckedChange}
      aria-label="checkbox"
    />
  ),
}));

vi.mock('@/components/ui/progress', () => ({
  Progress: ({ value, ...props }: { value: number }) => <div data-value={value} {...props} />,
}));

describe('Reports Page', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('shows trigger time from created_at instead of Jenkins start_time', () => {
    const createdAt = '2026-04-27T07:00:00.000Z';
    const startTime = '2026-04-27T07:00:15.000Z';

    vi.spyOn(executionHooks, 'useTestRuns').mockReturnValue({
      data: {
        success: true,
        total: 1,
        data: [
          {
            id: 4975,
            project_id: 1,
            project_name: 'Project #1',
            trigger_type: 'schedule',
            trigger_by: 0,
            trigger_by_name: '系统',
            jenkins_job: null,
            jenkins_build_id: null,
            jenkins_url: null,
            abort_reason: null,
            status: 'success',
            start_time: startTime,
            end_time: null,
            duration_ms: 15000,
            total_cases: 3,
            passed_cases: 3,
            failed_cases: 0,
            skipped_cases: 0,
            created_at: createdAt,
          },
        ],
      },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as any);

    render(<Reports />);

    expect(screen.getByText('触发时间')).toBeInTheDocument();
    expect(screen.getByText(new Date(createdAt).toLocaleString())).toBeInTheDocument();
    expect(screen.queryByText(new Date(startTime).toLocaleString())).not.toBeInTheDocument();
  });
});
