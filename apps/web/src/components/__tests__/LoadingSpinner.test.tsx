import { describe, it, expect } from 'vitest';
import { render, screen, checkA11y } from '../../test-utils';
import { LoadingSpinner } from '../LoadingSpinner';

describe('LoadingSpinner', () => {
  it('renders the spinner with loading text', () => {
    render(<LoadingSpinner />);

    expect(screen.getByText('Wird geladen...')).toBeInTheDocument();
  });

  it('has role="status" and correct aria-label for accessibility', () => {
    render(<LoadingSpinner />);

    const spinner = screen.getByRole('status');
    expect(spinner).toBeInTheDocument();
    expect(spinner).toHaveAttribute('aria-label', 'Seite wird geladen');
  });

  it('has no axe-core accessibility violations', async () => {
    const { container } = render(<LoadingSpinner />);

    const results = await checkA11y(container);
    expect(results).toHaveNoViolations();
  });
});
