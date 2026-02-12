/**
 * NotificationToast — Sprint 13 (Team 04)
 *
 * Renders the stack of toast notifications from NotificationProvider.
 * Positioned top-right with slide-in/out animations.
 * Supports: success, error, warning, info types.
 * ARIA: role="alert" + aria-live="polite" for screen reader announcements.
 *
 * Place this component once in the component tree (e.g. in main.tsx or Layout).
 */

import { useNotificationContext } from '../hooks/useNotifications';
import type { Notification } from '../hooks/useNotifications';
import '../styles/notifications.css';

/* ------------------------------------------------------------------ */
/*  Icon mapping per notification type                                 */
/* ------------------------------------------------------------------ */

const TYPE_ICONS: Record<string, string> = {
  success: '\u2713',   // checkmark
  error: '\u2717',     // cross
  warning: '\u26A0',   // warning triangle
  info: '\u2139',      // info circle
};

const TYPE_LABELS: Record<string, string> = {
  success: 'Erfolg',
  error: 'Fehler',
  warning: 'Warnung',
  info: 'Information',
};

/* ------------------------------------------------------------------ */
/*  Single Toast                                                       */
/* ------------------------------------------------------------------ */

interface ToastItemProps {
  notification: Notification;
  onDismiss: (id: string) => void;
}

function ToastItem({ notification, onDismiss }: ToastItemProps) {
  const { id, type, message, action, exiting } = notification;
  const classNames = [
    'notification-toast',
    `notification-toast--${type}`,
    exiting ? 'notification-toast--exit' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={classNames}
      role="alert"
      aria-live="polite"
      data-notification-id={id}
    >
      <span className="notification-toast__icon" aria-hidden="true">
        {TYPE_ICONS[type] ?? TYPE_ICONS.info}
      </span>

      <div className="notification-toast__body">
        <span className="notification-toast__sr-label sr-only">
          {TYPE_LABELS[type] ?? 'Benachrichtigung'}:
        </span>
        <span className="notification-toast__message">{message}</span>
        {action && (
          <button
            type="button"
            className="notification-toast__action"
            onClick={action.onClick}
          >
            {action.label}
          </button>
        )}
      </div>

      <button
        type="button"
        className="notification-toast__dismiss"
        onClick={() => onDismiss(id)}
        aria-label="Benachrichtigung schliessen"
      >
        &times;
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Toast Container                                                    */
/* ------------------------------------------------------------------ */

export function NotificationToast() {
  const { notifications, dismiss } = useNotificationContext();

  if (notifications.length === 0) {
    return null;
  }

  return (
    <div className="notification-container" aria-label="Benachrichtigungen">
      {notifications.map((n) => (
        <ToastItem key={n.id} notification={n} onDismiss={dismiss} />
      ))}
    </div>
  );
}
