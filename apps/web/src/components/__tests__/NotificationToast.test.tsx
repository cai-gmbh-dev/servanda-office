import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, checkA11y } from '../../test-utils';
import { NotificationToast } from '../NotificationToast';
import { NotificationProvider, useNotifications } from '../../hooks/useNotifications';
import type { NotificationType } from '../../hooks/useNotifications';

/* ------------------------------------------------------------------ */
/*  Test Helper: renders NotificationToast inside its Provider +       */
/*  a trigger component that exposes notify() via buttons.             */
/* ------------------------------------------------------------------ */

interface TriggerProps {
  type?: NotificationType;
  message?: string;
  duration?: number;
  action?: { label: string; onClick: () => void };
}

function Trigger({
  type = 'success',
  message = 'Test notification',
  duration,
  action,
}: TriggerProps) {
  const { notify, dismissAll } = useNotifications();
  return (
    <>
      <button
        type="button"
        data-testid="trigger"
        onClick={() => notify(type, message, { duration, action })}
      >
        Notify
      </button>
      <button
        type="button"
        data-testid="dismiss-all"
        onClick={dismissAll}
      >
        Dismiss All
      </button>
    </>
  );
}

function renderWithProvider(triggerProps: TriggerProps = {}) {
  return render(
    <NotificationProvider>
      <Trigger {...triggerProps} />
      <NotificationToast />
    </NotificationProvider>,
  );
}

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe('NotificationToast', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders a success toast with correct message', () => {
    renderWithProvider({ type: 'success', message: 'Gespeichert!' });

    act(() => {
      fireEvent.click(screen.getByTestId('trigger'));
    });

    expect(screen.getByText('Gespeichert!')).toBeInTheDocument();
    const toast = screen.getByText('Gespeichert!').closest('.notification-toast');
    expect(toast).toHaveClass('notification-toast--success');
  });

  it('renders an error toast with correct styling', () => {
    renderWithProvider({ type: 'error', message: 'Fehler aufgetreten' });

    act(() => {
      fireEvent.click(screen.getByTestId('trigger'));
    });

    expect(screen.getByText('Fehler aufgetreten')).toBeInTheDocument();
    const toast = screen.getByText('Fehler aufgetreten').closest('.notification-toast');
    expect(toast).toHaveClass('notification-toast--error');
  });

  it('renders a warning toast with correct styling', () => {
    renderWithProvider({ type: 'warning', message: 'Warnung!' });

    act(() => {
      fireEvent.click(screen.getByTestId('trigger'));
    });

    const toast = screen.getByText('Warnung!').closest('.notification-toast');
    expect(toast).toHaveClass('notification-toast--warning');
  });

  it('renders an info toast with correct styling', () => {
    renderWithProvider({ type: 'info', message: 'Information' });

    act(() => {
      fireEvent.click(screen.getByTestId('trigger'));
    });

    const toast = screen.getByText('Information').closest('.notification-toast');
    expect(toast).toHaveClass('notification-toast--info');
  });

  it('auto-dismisses after the configured timeout', () => {
    renderWithProvider({ message: 'Auto dismiss', duration: 3000 });

    act(() => {
      fireEvent.click(screen.getByTestId('trigger'));
    });

    expect(screen.getByText('Auto dismiss')).toBeInTheDocument();

    // Advance past the auto-dismiss timeout
    act(() => {
      vi.advanceTimersByTime(3000);
    });

    // After timeout, toast should get exit class
    const toast = screen.queryByText('Auto dismiss')?.closest('.notification-toast');
    if (toast) {
      expect(toast).toHaveClass('notification-toast--exit');
    }

    // After exit animation (300ms), toast is removed from DOM
    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(screen.queryByText('Auto dismiss')).not.toBeInTheDocument();
  });

  it('dismisses a toast when the dismiss button is clicked', () => {
    renderWithProvider({ message: 'Manual dismiss test', duration: 0 });

    act(() => {
      fireEvent.click(screen.getByTestId('trigger'));
    });

    expect(screen.getByText('Manual dismiss test')).toBeInTheDocument();

    // Click the dismiss (X) button
    const dismissBtn = screen.getByLabelText('Benachrichtigung schliessen');
    act(() => {
      fireEvent.click(dismissBtn);
    });

    // After exit animation
    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(screen.queryByText('Manual dismiss test')).not.toBeInTheDocument();
  });

  it('stacks a maximum of 3 toasts (oldest evicted)', () => {
    renderWithProvider({ message: 'Toast', duration: 0 });

    const trigger = screen.getByTestId('trigger');

    // Create 4 toasts — but only 3 should be visible
    act(() => {
      fireEvent.click(trigger);
      fireEvent.click(trigger);
      fireEvent.click(trigger);
      fireEvent.click(trigger);
    });

    const allToasts = screen.getAllByRole('alert');
    expect(allToasts).toHaveLength(3);
  });

  it('has correct ARIA attributes (role="alert", aria-live="polite")', () => {
    renderWithProvider({ message: 'ARIA test' });

    act(() => {
      fireEvent.click(screen.getByTestId('trigger'));
    });

    const toasts = screen.getAllByRole('alert');
    expect(toasts.length).toBeGreaterThanOrEqual(1);

    const toast = toasts[0];
    expect(toast).toHaveAttribute('aria-live', 'polite');
  });

  it('dismisses all toasts when dismissAll is called', () => {
    renderWithProvider({ message: 'Dismiss all test', duration: 0 });

    const trigger = screen.getByTestId('trigger');

    act(() => {
      fireEvent.click(trigger);
      fireEvent.click(trigger);
    });

    expect(screen.getAllByRole('alert')).toHaveLength(2);

    act(() => {
      fireEvent.click(screen.getByTestId('dismiss-all'));
    });

    // After exit animation
    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(screen.queryAllByRole('alert')).toHaveLength(0);
  });

  it('renders an action button when action option is provided', () => {
    const actionFn = vi.fn();
    renderWithProvider({
      message: 'With action',
      duration: 0,
      action: { label: 'Undo', onClick: actionFn },
    });

    act(() => {
      fireEvent.click(screen.getByTestId('trigger'));
    });

    const actionBtn = screen.getByText('Undo');
    expect(actionBtn).toBeInTheDocument();

    fireEvent.click(actionBtn);
    expect(actionFn).toHaveBeenCalledTimes(1);
  });

  it('has no axe-core accessibility violations', async () => {
    vi.useRealTimers(); // axe-core needs real timers

    const { container } = renderWithProvider({ message: 'A11y test', duration: 0 });

    act(() => {
      fireEvent.click(screen.getByTestId('trigger'));
    });

    const results = await checkA11y(container);
    expect(results).toHaveNoViolations();
  });
});
