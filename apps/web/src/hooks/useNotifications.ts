/**
 * useNotifications — Sprint 13 (Team 04)
 *
 * React Context + hook for toast notifications.
 *
 * Usage:
 *   1. Wrap app in <NotificationProvider> (see main.tsx)
 *   2. In any component: const { notify, dismissAll } = useNotifications();
 *   3. notify('success', 'Fortschritt gespeichert');
 *
 * Features:
 *   - Types: success, error, warning, info
 *   - Auto-dismiss after configurable timeout (default 5s)
 *   - Max 3 visible toasts (oldest evicted)
 *   - Manual dismiss + optional action button
 */

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  useMemo,
  ReactNode,
  createElement,
} from 'react';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type NotificationType = 'success' | 'error' | 'warning' | 'info';

export interface NotificationAction {
  label: string;
  onClick: () => void;
}

export interface NotificationOptions {
  /** Auto-dismiss duration in ms. Default 5000. Set 0 to disable. */
  duration?: number;
  /** Optional action button shown in the toast. */
  action?: NotificationAction;
}

export interface Notification {
  id: string;
  type: NotificationType;
  message: string;
  duration: number;
  action?: NotificationAction;
  /** Timestamp for ordering. */
  createdAt: number;
  /** Whether the toast is exiting (for slide-out animation). */
  exiting?: boolean;
}

export interface UseNotificationsReturn {
  /** Show a toast notification. */
  notify: (type: NotificationType, message: string, options?: NotificationOptions) => void;
  /** Dismiss all visible notifications. */
  dismissAll: () => void;
}

/* ------------------------------------------------------------------ */
/*  Internal context value (includes notifications list for rendering) */
/* ------------------------------------------------------------------ */

interface NotificationContextValue {
  notifications: Notification[];
  notify: (type: NotificationType, message: string, options?: NotificationOptions) => void;
  dismiss: (id: string) => void;
  dismissAll: () => void;
}

const NotificationContext = createContext<NotificationContextValue | null>(null);

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const MAX_VISIBLE = 3;
const DEFAULT_DURATION = 5000;
const EXIT_ANIMATION_MS = 300;

/* ------------------------------------------------------------------ */
/*  Provider                                                           */
/* ------------------------------------------------------------------ */

export interface NotificationProviderProps {
  children: ReactNode;
}

let idCounter = 0;

export function NotificationProvider({ children }: NotificationProviderProps) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: string) => {
    // Clear any pending auto-dismiss timer
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }

    // Set exiting flag for slide-out animation
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, exiting: true } : n)),
    );

    // Remove after animation completes
    setTimeout(() => {
      setNotifications((prev) => prev.filter((n) => n.id !== id));
    }, EXIT_ANIMATION_MS);
  }, []);

  const notify = useCallback(
    (type: NotificationType, message: string, options?: NotificationOptions) => {
      const duration = options?.duration ?? DEFAULT_DURATION;
      const id = `notification-${++idCounter}`;

      const notification: Notification = {
        id,
        type,
        message,
        duration,
        action: options?.action,
        createdAt: Date.now(),
      };

      setNotifications((prev) => {
        const next = [notification, ...prev];
        // If exceeding max, remove the oldest ones
        if (next.length > MAX_VISIBLE) {
          const evicted = next.slice(MAX_VISIBLE);
          evicted.forEach((n) => {
            const timer = timersRef.current.get(n.id);
            if (timer) {
              clearTimeout(timer);
              timersRef.current.delete(n.id);
            }
          });
          return next.slice(0, MAX_VISIBLE);
        }
        return next;
      });

      // Schedule auto-dismiss if duration > 0
      if (duration > 0) {
        const timer = setTimeout(() => {
          dismiss(id);
        }, duration);
        timersRef.current.set(id, timer);
      }
    },
    [dismiss],
  );

  const dismissAll = useCallback(() => {
    // Clear all timers
    timersRef.current.forEach((timer) => clearTimeout(timer));
    timersRef.current.clear();

    // Mark all as exiting
    setNotifications((prev) => prev.map((n) => ({ ...n, exiting: true })));

    // Remove all after animation
    setTimeout(() => {
      setNotifications([]);
    }, EXIT_ANIMATION_MS);
  }, []);

  const value = useMemo<NotificationContextValue>(
    () => ({ notifications, notify, dismiss, dismissAll }),
    [notifications, notify, dismiss, dismissAll],
  );

  return createElement(NotificationContext.Provider, { value }, children);
}

/* ------------------------------------------------------------------ */
/*  Hook                                                               */
/* ------------------------------------------------------------------ */

/**
 * Returns `{ notify, dismissAll }` from the nearest NotificationProvider.
 * Throws if used outside a NotificationProvider.
 */
export function useNotifications(): UseNotificationsReturn {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error(
      'useNotifications() must be used within a <NotificationProvider>. ' +
        'Wrap your component tree with <NotificationProvider>.',
    );
  }
  return { notify: context.notify, dismissAll: context.dismissAll };
}

/**
 * Internal hook for NotificationToast to access the full context
 * (including notifications list and dismiss).
 */
export function useNotificationContext(): NotificationContextValue {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error(
      'useNotificationContext() must be used within a <NotificationProvider>.',
    );
  }
  return context;
}
