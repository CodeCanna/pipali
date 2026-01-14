/**
 * Notification utilities for Pipali.
 * Uses native OS notifications in Tauri desktop app, or Web Notification API in browser.
 * Triggers notifications when user attention is required and the app window is not focused.
 */

import { isTauri } from './tauri';
import type { ConfirmationRequest } from '../../server/processor/confirmation/confirmation.types';

let notificationPermissionGranted: boolean | null = null;

// Track active web notifications for cleanup
const activeWebNotifications: Map<string, Notification> = new Map();

/**
 * Send a web notification using the Web Notification API.
 * @param tag - Unique identifier for the notification (prevents duplicates with same tag)
 * @param title - Notification title
 * @param body - Notification body text
 * @returns The created Notification or null if failed
 */
function sendWebNotification(tag: string, title: string, body: string): Notification | null {
    if (!('Notification' in window) || !notificationPermissionGranted) {
        return null;
    }

    try {
        const notification = new Notification(title, {
            body,
            icon: '/icons/pipali_128.png',
            tag,
        });

        notification.onclick = () => {
            window.focus();
            notification.close();
            activeWebNotifications.delete(tag);
        };

        notification.onclose = () => {
            activeWebNotifications.delete(tag);
        };

        activeWebNotifications.set(tag, notification);
        return notification;
    } catch (err) {
        console.warn('[notifications] Failed to create web notification:', err);
        return null;
    }
}

/**
 * Check if the app tab/window is currently visible to the user.
 */
export function isWindowFocused(): boolean {
    // In Tauri, only check if window is in focus since it's a dedicated window
    if (isTauri()) {
        return document.hasFocus();
    }
    // In browser, check if both tab and window are in focus
    return document.visibilityState === 'visible' && document.hasFocus();
}

/**
 * Initialize notification permissions.
 * Call this once when the app starts.
 */
export async function initNotifications(): Promise<boolean> {
    // Tauri path - use native notifications
    if (isTauri()) {
        try {
            const { isPermissionGranted, requestPermission } =
                await import('@tauri-apps/plugin-notification');

            let granted = await isPermissionGranted();

            if (!granted) {
                const result = await requestPermission();
                granted = result === 'granted';
            }

            notificationPermissionGranted = granted;
            return granted;
        } catch (err) {
            console.warn('[notifications] Failed to initialize Tauri notifications:', err);
            return false;
        }
    }

    // Web path - use Web Notification API
    if (!('Notification' in window)) {
        console.warn('[notifications] Web Notification API not supported');
        notificationPermissionGranted = false;
        return false;
    }

    if (Notification.permission === 'granted') {
        notificationPermissionGranted = true;
        return true;
    }

    if (Notification.permission === 'denied') {
        notificationPermissionGranted = false;
        return false;
    }

    // Permission is 'default' - request permission
    try {
        const result = await Notification.requestPermission();
        notificationPermissionGranted = result === 'granted';
        return notificationPermissionGranted;
    } catch (err) {
        console.warn('[notifications] Failed to request web notification permission:', err);
        notificationPermissionGranted = false;
        return false;
    }
}

/**
 * Send a notification for a confirmation request.
 * Uses native OS notifications in Tauri, or Web Notification API in browser.
 * Only sends if window is not focused.
 */
export async function notifyConfirmationRequest(
    request: ConfirmationRequest,
    conversationTitle?: string
): Promise<void> {
    // Don't notify if window is focused - user can see the toast
    if (isWindowFocused()) {
        return;
    }

    // Check permissions (lazy init)
    if (notificationPermissionGranted === null) {
        await initNotifications();
    }

    if (!notificationPermissionGranted) {
        return;
    }

    // Build notification content
    const title = request.operation === 'ask_user'
        ? 'Question from Pipali'
        : 'Action Required';

    const body = conversationTitle
        ? `${conversationTitle}: ${request.title}`
        : request.title;

    // Tauri path - use native notifications
    if (isTauri()) {
        try {
            const { sendNotification } = await import('@tauri-apps/plugin-notification');
            await sendNotification({ title, body });
        } catch (err) {
            console.warn('[notifications] Failed to send Tauri notification:', err);
        }
        return;
    }

    // Web path - use Web Notification API
    const tag = `confirmation-${request.requestId}`;
    sendWebNotification(tag, title, body);
}

/**
 * Send a notification when a task completes.
 * Uses native OS notifications in Tauri, or Web Notification API in browser.
 * Only sends if window is not focused.
 *
 * @param userRequest - The original user request/query
 * @param responseSnippet - A snippet of the agent's response
 */
export async function notifyTaskComplete(
    userRequest?: string,
    responseSnippet?: string
): Promise<void> {
    // Don't notify if window is focused - user can see the result
    if (isWindowFocused()) {
        return;
    }

    // Check permissions (lazy init)
    if (notificationPermissionGranted === null) {
        await initNotifications();
    }

    if (!notificationPermissionGranted) {
        return;
    }

    // Build notification content
    const title = userRequest
        ? truncate(userRequest, 50)
        : 'Task Complete';

    const body = responseSnippet
        ? truncate(responseSnippet, 100)
        : 'Your task has finished';

    // Tauri path - use native notifications
    if (isTauri()) {
        try {
            const { sendNotification } = await import('@tauri-apps/plugin-notification');
            await sendNotification({ title, body });
        } catch (err) {
            console.warn('[notifications] Failed to send Tauri notification:', err);
        }
        return;
    }

    // Web path - use Web Notification API
    const tag = `task-complete-${Date.now()}`;
    sendWebNotification(tag, title, body);
}

/**
 * Truncate text to a maximum length, adding ellipsis if needed.
 */
function truncate(text: string, maxLength: number): string {
    // Normalize whitespace (collapse newlines and multiple spaces)
    const normalized = text.replace(/\s+/g, ' ').trim();
    if (normalized.length <= maxLength) {
        return normalized;
    }
    return normalized.slice(0, maxLength - 1) + '…';
}

/**
 * Focus the app window.
 * In Tauri, uses native window APIs. In browser, uses window.focus().
 */
export async function focusAppWindow(): Promise<void> {
    // Tauri path - use native window APIs
    if (isTauri()) {
        try {
            const { getCurrentWebviewWindow } = await import('@tauri-apps/api/webviewWindow');
            const appWindow = getCurrentWebviewWindow();
            await appWindow.unminimize();
            await appWindow.show();
            await appWindow.setFocus();
        } catch (err) {
            console.warn('[notifications] Failed to focus Tauri window:', err);
        }
        return;
    }

    // Web path - focus the browser window/tab
    window.focus();
}

/**
 * Set up notification click handler to focus the app window.
 * Returns an unlisten function to clean up the listener.
 */
export async function setupNotificationClickHandler(): Promise<() => void> {
    // Tauri path - use Tauri notification action handler
    if (isTauri()) {
        try {
            const { onAction } = await import('@tauri-apps/plugin-notification');
            const listener = await onAction(() => {
                focusAppWindow();
            });
            return () => listener.unregister();
        } catch (err) {
            console.warn('[notifications] Failed to setup Tauri click handler:', err);
            return () => {};
        }
    }

    // Web path - click handlers are set up per-notification in sendWebNotification()
    // Return a cleanup function that closes all active notifications
    return () => {
        activeWebNotifications.forEach(notification => {
            notification.close();
        });
        activeWebNotifications.clear();
    };
}
