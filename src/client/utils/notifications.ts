/**
 * Native OS notification utilities for the Tauri desktop app.
 * Triggers notifications when user attention is required and the app window is not focused.
 */

import { isTauri } from './tauri';
import type { ConfirmationRequest } from '../../server/processor/confirmation/confirmation.types';

let notificationPermissionGranted: boolean | null = null;

/**
 * Check if the app window is currently focused.
 * Uses document.hasFocus() for cross-platform reliability.
 */
export function isWindowFocused(): boolean {
    return document.hasFocus();
}

/**
 * Initialize notification permissions.
 * Call this once when the app starts.
 */
export async function initNotifications(): Promise<boolean> {
    if (!isTauri()) {
        return false;
    }

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
        console.warn('[notifications] Failed to initialize:', err);
        return false;
    }
}

/**
 * Send a native OS notification for a confirmation request.
 * Only sends if running in Tauri and window is not focused.
 */
export async function notifyConfirmationRequest(
    request: ConfirmationRequest,
    conversationTitle?: string
): Promise<void> {
    if (!isTauri()) {
        return;
    }

    // Don't notify if window is focused - user can see the toast
    if (isWindowFocused()) {
        return;
    }

    // Check permissions
    if (notificationPermissionGranted === null) {
        await initNotifications();
    }

    if (!notificationPermissionGranted) {
        return;
    }

    try {
        const { sendNotification } = await import('@tauri-apps/plugin-notification');

        // Build notification content
        const title = request.operation === 'ask_user'
            ? 'Question from Pipali'
            : 'Action Required';

        const body = conversationTitle
            ? `${conversationTitle}: ${request.title}`
            : request.title;

        await sendNotification({ title, body });
    } catch (err) {
        console.warn('[notifications] Failed to send notification:', err);
    }
}

/**
 * Focus the app window.
 */
export async function focusAppWindow(): Promise<void> {
    if (!isTauri()) {
        return;
    }

    try {
        const { getCurrentWebviewWindow } = await import('@tauri-apps/api/webviewWindow');
        const window = getCurrentWebviewWindow();
        await window.unminimize();
        await window.show();
        await window.setFocus();
    } catch (err) {
        console.warn('[notifications] Failed to focus window:', err);
    }
}

/**
 * Set up notification click handler to focus the app window.
 * Returns an unlisten function to clean up the listener.
 */
export async function setupNotificationClickHandler(): Promise<() => void> {
    if (!isTauri()) {
        return () => {};
    }

    try {
        const { onAction } = await import('@tauri-apps/plugin-notification');
        const listener = await onAction(() => {
            focusAppWindow();
        });
        return () => listener.unregister();
    } catch (err) {
        console.warn('[notifications] Failed to setup click handler:', err);
        return () => {};
    }
}
