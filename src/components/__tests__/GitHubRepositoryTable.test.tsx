import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import GitHubRepositoryTable from '../GitHubRepositoryTable';
import { GitHubRepository } from '@/types/repository';

// Mock Checkbox
vi.mock('@/components/ui/checkbox', () => ({
  Checkbox: ({ checked, onCheckedChange }: { checked: boolean; onCheckedChange: (checked: boolean) => void }) => (
    <input
      type="checkbox"
      checked={checked}
      onChange={(e) => onCheckedChange(e.target.checked)}
      aria-label="checkbox"
    />
  ),
}));

// Mock Tooltip components
vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TooltipProvider: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

// Mock Dialog components
vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ open, children }: { open: boolean; children: React.ReactNode }) => open ? <div data-testid="dialog">{children}</div> : null,
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogDescription: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const mockRepositories: GitHubRepository[] = [
  {
    id: '1',
    name: 'Repo 1',
    description: 'Desc 1',
    url: 'https://github.com/test/repo1',
    language: 'TypeScript',
    status: 'active',
    stars: 10,
    lastSync: '2023-01-01',
    createdAt: '2023-01-01',
  },
  {
    id: '2',
    name: 'Repo 2',
    description: 'Desc 2',
    url: 'https://github.com/test/repo2',
    language: 'Python',
    status: 'inactive',
    stars: 5,
    lastSync: '2023-01-02',
    createdAt: '2023-01-02',
  },
];

describe('GitHubRepositoryTable', () => {
  const defaultProps = {
    repositories: mockRepositories,
    selectedIds: new Set<string>(),
    onSelectChange: vi.fn(),
    onEdit: vi.fn(),
    onDelete: vi.fn(),
    onCopyUrl: vi.fn(),
    copiedId: null,
  };

  it('renders repository list correctly', () => {
    render(<GitHubRepositoryTable {...defaultProps} />);
    expect(screen.getAllByText('Repo 1')[0]).toBeInTheDocument();
    expect(screen.getAllByText('Repo 2')[0]).toBeInTheDocument();
    expect(screen.getAllByText('TypeScript')[0]).toBeInTheDocument();
    expect(screen.getAllByText('Python')[0]).toBeInTheDocument();
  });

  it('renders correct status labels', () => {
    render(<GitHubRepositoryTable {...defaultProps} />);
    expect(screen.getAllByText('活跃').length).toBeGreaterThan(0);
    expect(screen.getAllByText('不活跃').length).toBeGreaterThan(0);
  });

  it('handles selection correctly', async () => {
    render(<GitHubRepositoryTable {...defaultProps} />);
    const checkboxes = screen.getAllByRole('checkbox');
    
    if (checkboxes.length > 0) {
        fireEvent.click(checkboxes[0]);
        await waitFor(() => {
            expect(defaultProps.onSelectChange).toHaveBeenCalled();
        });
    }
  });

  it('shows delete confirmation dialog and deletes on confirm', async () => {
    render(<GitHubRepositoryTable {...defaultProps} />);
    
    // Find delete buttons (aria-label="删除")
    const deleteButtons = screen.getAllByLabelText('删除');
    expect(deleteButtons.length).toBeGreaterThan(0);
    
    // Click the first one (id: 1)
    fireEvent.click(deleteButtons[0]);
    
    // Check if dialog is open
    const dialog = screen.getByTestId('dialog');
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByText('确认删除')).toBeInTheDocument();
    
    // Find the confirm button inside dialog
    const confirmButton = within(dialog).getByText('删除', { selector: 'button' });
    
    fireEvent.click(confirmButton);
    
    expect(defaultProps.onDelete).toHaveBeenCalledWith('1');
  });
});
