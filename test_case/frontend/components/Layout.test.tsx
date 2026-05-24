import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { Layout } from '@/components/Layout';

vi.mock('@/components/Sidebar', () => ({
  Sidebar: () => <div data-testid="sidebar" />,
}));

describe('Layout', () => {
  it('renders Sidebar component', () => {
    render(<Layout><div /></Layout>);
    expect(screen.getByTestId('sidebar')).toBeInTheDocument();
  });

  it('renders children content', () => {
    render(<Layout><div>Test Content</div></Layout>);
    expect(screen.getByText('Test Content')).toBeInTheDocument();
  });

  it('has correct layout structure', () => {
    const { container } = render(<Layout><div>Child</div></Layout>);
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.className).toContain('h-screen');
    expect(wrapper.className).toContain('flex');
    expect(wrapper.className).toContain('overflow-hidden');
    const main = wrapper.querySelector('main');
    expect(main).toBeTruthy();
    expect(main?.className).toContain('flex-1');
  });
});
