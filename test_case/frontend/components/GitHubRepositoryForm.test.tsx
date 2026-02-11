import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import GitHubRepositoryForm from '@/components/GitHubRepositoryForm';

// Mock Tooltip components
vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TooltipProvider: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

describe('GitHubRepositoryForm', () => {
  const defaultProps = {
    onSubmit: vi.fn(),
    onCancel: vi.fn(),
  };

  it('renders empty form correctly', () => {
    render(<GitHubRepositoryForm {...defaultProps} />);
    expect(screen.getByText('新增仓库')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('e.g., SeleniumBase-CI')).toHaveValue('');
  });

  it('validates required fields', async () => {
    render(<GitHubRepositoryForm {...defaultProps} />);
    fireEvent.click(screen.getByText('添加'));
    expect(await screen.findByText('仓库名称不能为空')).toBeInTheDocument();
  });

  it('submits valid data', async () => {
    render(<GitHubRepositoryForm {...defaultProps} />);
    
    fireEvent.change(screen.getByPlaceholderText('e.g., SeleniumBase-CI'), { target: { value: 'Test Repo' } });
    fireEvent.change(screen.getByPlaceholderText('https://github.com/example/repository'), { target: { value: 'https://github.com/test/repo' } });
    
    fireEvent.click(screen.getByText('添加'));
    
    await waitFor(() => {
      expect(defaultProps.onSubmit).toHaveBeenCalledWith(expect.objectContaining({
        name: 'Test Repo',
        url: 'https://github.com/test/repo',
      }));
    });
  });
});
