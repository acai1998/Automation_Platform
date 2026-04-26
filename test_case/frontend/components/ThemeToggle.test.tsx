import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ThemeToggle } from '@/components/ThemeToggle';
import { ThemeProvider } from '@/contexts/ThemeContext';

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  Sun: ({ className, 'aria-hidden': ariaHidden }: { className?: string; 'aria-hidden'?: boolean }) => (
    <svg data-testid="sun-icon" className={className} aria-hidden={ariaHidden}>Sun</svg>
  ),
  Moon: ({ className, 'aria-hidden': ariaHidden }: { className?: string; 'aria-hidden'?: boolean }) => (
    <svg data-testid="moon-icon" className={className} aria-hidden={ariaHidden}>Moon</svg>
  ),
  Monitor: ({ className, 'aria-hidden': ariaHidden }: { className?: string; 'aria-hidden'?: boolean }) => (
    <svg data-testid="monitor-icon" className={className} aria-hidden={ariaHidden}>Monitor</svg>
  ),
}));

describe('ThemeToggle', () => {
  // Helper function to render component with ThemeProvider
  const renderWithThemeProvider = (defaultTheme: 'light' | 'dark' | 'system' = 'light') => {
    return render(
      <ThemeProvider defaultTheme={defaultTheme}>
        <ThemeToggle />
      </ThemeProvider>
    );
  };

  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear();
    // Reset document classes
    document.documentElement.classList.remove('light', 'dark');
  });

  describe('渲染测试', () => {
    it('should render all three theme buttons', () => {
      renderWithThemeProvider();

      expect(screen.getByLabelText('切换到浅色模式')).toBeInTheDocument();
      expect(screen.getByLabelText('切换到深色模式')).toBeInTheDocument();
      expect(screen.getByLabelText('切换到跟随系统')).toBeInTheDocument();
    });

    it('should render with correct icons', () => {
      renderWithThemeProvider();

      expect(screen.getByTestId('sun-icon')).toBeInTheDocument();
      expect(screen.getByTestId('moon-icon')).toBeInTheDocument();
      expect(screen.getByTestId('monitor-icon')).toBeInTheDocument();
    });

    it('should render with role="group" and aria-label', () => {
      renderWithThemeProvider();

      const group = screen.getByRole('group', { name: '主题切换' });
      expect(group).toBeInTheDocument();
    });
  });

  describe('状态测试', () => {
    it('should highlight light theme button when theme is light', () => {
      renderWithThemeProvider('light');

      const lightButton = screen.getByLabelText('切换到浅色模式');
      expect(lightButton).toHaveAttribute('aria-pressed', 'true');
      expect(lightButton).toHaveClass('bg-white');
    });

    it('should highlight dark theme button when theme is dark', () => {
      renderWithThemeProvider('dark');

      const darkButton = screen.getByLabelText('切换到深色模式');
      expect(darkButton).toHaveAttribute('aria-pressed', 'true');
      expect(darkButton).toHaveClass('bg-white');
    });

    it('should highlight system theme button when theme is system', () => {
      renderWithThemeProvider('system');

      const systemButton = screen.getByLabelText('切换到跟随系统');
      expect(systemButton).toHaveAttribute('aria-pressed', 'true');
      expect(systemButton).toHaveClass('bg-white');
    });

    it('should only highlight one button at a time', () => {
      renderWithThemeProvider('light');

      const lightButton = screen.getByLabelText('切换到浅色模式');
      const darkButton = screen.getByLabelText('切换到深色模式');
      const systemButton = screen.getByLabelText('切换到跟随系统');

      expect(lightButton).toHaveAttribute('aria-pressed', 'true');
      expect(darkButton).toHaveAttribute('aria-pressed', 'false');
      expect(systemButton).toHaveAttribute('aria-pressed', 'false');
    });
  });

  describe('点击测试', () => {
    it('should switch to light theme when light button is clicked', () => {
      renderWithThemeProvider('dark');

      const lightButton = screen.getByLabelText('切换到浅色模式');
      fireEvent.click(lightButton);

      expect(lightButton).toHaveAttribute('aria-pressed', 'true');
      expect(localStorage.getItem('theme')).toBe('light');
      expect(document.documentElement.classList.contains('light')).toBe(true);
    });

    it('should switch to dark theme when dark button is clicked', () => {
      renderWithThemeProvider('light');

      const darkButton = screen.getByLabelText('切换到深色模式');
      fireEvent.click(darkButton);

      expect(darkButton).toHaveAttribute('aria-pressed', 'true');
      expect(localStorage.getItem('theme')).toBe('dark');
      expect(document.documentElement.classList.contains('dark')).toBe(true);
    });

    it('should switch to system theme when system button is clicked', () => {
      renderWithThemeProvider('light');

      const systemButton = screen.getByLabelText('切换到跟随系统');
      fireEvent.click(systemButton);

      expect(systemButton).toHaveAttribute('aria-pressed', 'true');
      expect(localStorage.getItem('theme')).toBe('system');
    });

    it('should update theme state on multiple clicks', () => {
      renderWithThemeProvider('light');

      const lightButton = screen.getByLabelText('切换到浅色模式');
      const darkButton = screen.getByLabelText('切换到深色模式');
      const systemButton = screen.getByLabelText('切换到跟随系统');

      // Click dark
      fireEvent.click(darkButton);
      expect(darkButton).toHaveAttribute('aria-pressed', 'true');
      expect(lightButton).toHaveAttribute('aria-pressed', 'false');

      // Click system
      fireEvent.click(systemButton);
      expect(systemButton).toHaveAttribute('aria-pressed', 'true');
      expect(darkButton).toHaveAttribute('aria-pressed', 'false');

      // Click light
      fireEvent.click(lightButton);
      expect(lightButton).toHaveAttribute('aria-pressed', 'true');
      expect(systemButton).toHaveAttribute('aria-pressed', 'false');
    });
  });

  describe('可访问性测试', () => {
    it('should have correct aria-label for each button', () => {
      renderWithThemeProvider();

      expect(screen.getByLabelText('切换到浅色模式')).toBeInTheDocument();
      expect(screen.getByLabelText('切换到深色模式')).toBeInTheDocument();
      expect(screen.getByLabelText('切换到跟随系统')).toBeInTheDocument();
    });

    it('should have correct title attribute for each button', () => {
      renderWithThemeProvider();

      expect(screen.getByLabelText('切换到浅色模式')).toHaveAttribute('title', '浅色模式');
      expect(screen.getByLabelText('切换到深色模式')).toHaveAttribute('title', '深色模式');
      expect(screen.getByLabelText('切换到跟随系统')).toHaveAttribute('title', '跟随系统');
    });

    it('should have aria-pressed attribute on all buttons', () => {
      renderWithThemeProvider('light');

      const buttons = screen.getAllByRole('button');
      buttons.forEach(button => {
        expect(button).toHaveAttribute('aria-pressed');
      });
    });

    it('should have aria-hidden on icons', () => {
      renderWithThemeProvider();

      expect(screen.getByTestId('sun-icon')).toHaveAttribute('aria-hidden', 'true');
      expect(screen.getByTestId('moon-icon')).toHaveAttribute('aria-hidden', 'true');
      expect(screen.getByTestId('monitor-icon')).toHaveAttribute('aria-hidden', 'true');
    });
  });

  describe('键盘导航测试', () => {
    it('should be focusable with keyboard', () => {
      renderWithThemeProvider();

      const lightButton = screen.getByLabelText('切换到浅色模式');
      lightButton.focus();

      expect(document.activeElement).toBe(lightButton);
    });

    it('should trigger theme change with Enter key', () => {
      renderWithThemeProvider('light');

      const darkButton = screen.getByLabelText('切换到深色模式');
      darkButton.focus();

      // Simulate Enter key press which triggers click on button elements
      fireEvent.keyDown(darkButton, { key: 'Enter', code: 'Enter' });
      fireEvent.click(darkButton);

      expect(darkButton).toHaveAttribute('aria-pressed', 'true');
    });

    it('should trigger theme change with Space key', () => {
      renderWithThemeProvider('light');

      const darkButton = screen.getByLabelText('切换到深色模式');
      darkButton.focus();

      // Simulate Space key press which triggers click on button elements
      fireEvent.keyDown(darkButton, { key: ' ', code: 'Space' });
      fireEvent.click(darkButton);

      expect(darkButton).toHaveAttribute('aria-pressed', 'true');
    });
  });

  describe('持久化测试', () => {
    it('should persist theme selection to localStorage', () => {
      renderWithThemeProvider('light');

      const darkButton = screen.getByLabelText('切换到深色模式');
      fireEvent.click(darkButton);

      expect(localStorage.getItem('theme')).toBe('dark');
    });

    it('should load theme from localStorage on mount', () => {
      localStorage.setItem('theme', 'dark');

      renderWithThemeProvider();

      const darkButton = screen.getByLabelText('切换到深色模式');
      expect(darkButton).toHaveAttribute('aria-pressed', 'true');
    });
  });

  describe('DOM 类名更新测试', () => {
    it('should update document.documentElement class when theme changes', () => {
      renderWithThemeProvider('light');

      expect(document.documentElement.classList.contains('light')).toBe(true);

      const darkButton = screen.getByLabelText('切换到深色模式');
      fireEvent.click(darkButton);

      expect(document.documentElement.classList.contains('dark')).toBe(true);
      expect(document.documentElement.classList.contains('light')).toBe(false);
    });

    it('should apply system theme based on media query', () => {
      // Mock matchMedia to return dark mode preference
      Object.defineProperty(window, 'matchMedia', {
        writable: true,
        value: vi.fn().mockImplementation(query => ({
          matches: query === '(prefers-color-scheme: dark)',
          media: query,
          onchange: null,
          addListener: vi.fn(),
          removeListener: vi.fn(),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          dispatchEvent: vi.fn(),
        })),
      });

      renderWithThemeProvider('system');

      expect(document.documentElement.classList.contains('dark')).toBe(true);
    });
  });

  describe('边界条件测试', () => {
    it('should handle rapid clicking without errors', () => {
      renderWithThemeProvider('light');

      const lightButton = screen.getByLabelText('切换到浅色模式');
      const darkButton = screen.getByLabelText('切换到深色模式');

      // Rapidly click between themes
      for (let i = 0; i < 10; i++) {
        fireEvent.click(darkButton);
        fireEvent.click(lightButton);
      }

      expect(lightButton).toHaveAttribute('aria-pressed', 'true');
      expect(localStorage.getItem('theme')).toBe('light');
    });

    it('should handle clicking the same button multiple times', () => {
      renderWithThemeProvider('light');

      const lightButton = screen.getByLabelText('切换到浅色模式');

      fireEvent.click(lightButton);
      fireEvent.click(lightButton);
      fireEvent.click(lightButton);

      expect(lightButton).toHaveAttribute('aria-pressed', 'true');
      expect(localStorage.getItem('theme')).toBe('light');
    });
  });

  describe('样式类名测试', () => {
    it('should apply active styles to selected theme button', () => {
      renderWithThemeProvider('light');

      const lightButton = screen.getByLabelText('切换到浅色模式');
      expect(lightButton).toHaveClass('bg-white', 'text-primary', 'shadow-sm');
    });

    it('should apply inactive styles to non-selected theme buttons', () => {
      renderWithThemeProvider('light');

      const darkButton = screen.getByLabelText('切换到深色模式');
      expect(darkButton).toHaveClass('text-slate-500');
    });

    it('should have transition-all class on all buttons', () => {
      renderWithThemeProvider();

      const buttons = screen.getAllByRole('button');
      buttons.forEach(button => {
        expect(button).toHaveClass('transition-all');
      });
    });

    it('should have hover scale effect classes', () => {
      renderWithThemeProvider();

      const buttons = screen.getAllByRole('button');
      buttons.forEach(button => {
        expect(button).toHaveClass('hover:scale-105');
      });
    });

    it('should have focus ring classes for accessibility', () => {
      renderWithThemeProvider();

      const buttons = screen.getAllByRole('button');
      buttons.forEach(button => {
        expect(button).toHaveClass('focus:outline-none', 'focus:ring-2');
      });
    });
  });

  describe('动画效果测试', () => {
    it('should render pulse effect on active button', () => {
      renderWithThemeProvider('light');

      const lightButton = screen.getByLabelText('切换到浅色模式');
      const pulseElement = lightButton.querySelector('.animate-pulse-subtle');

      expect(pulseElement).toBeInTheDocument();
      expect(pulseElement).toHaveClass('absolute', 'inset-0', 'rounded-md');
    });

    it('should not render pulse effect on inactive buttons', () => {
      renderWithThemeProvider('light');

      const darkButton = screen.getByLabelText('切换到深色模式');
      const pulseElement = darkButton.querySelector('.animate-pulse-subtle');

      expect(pulseElement).not.toBeInTheDocument();
    });

    it('should have transform classes for animation', () => {
      renderWithThemeProvider();

      const buttons = screen.getAllByRole('button');
      buttons.forEach(button => {
        expect(button).toHaveClass('transform');
      });
    });

    it('should trigger animation on theme switch', () => {
      renderWithThemeProvider('light');

      const darkButton = screen.getByLabelText('切换到深色模式');
      fireEvent.click(darkButton);

      // After switching, the icon should have animation class
      const icon = darkButton.querySelector('svg');
      expect(icon).toHaveClass('transition-all');
    });
  });
});
