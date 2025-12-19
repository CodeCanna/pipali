/**
 * Shared in-memory store for tracking active research sessions across the application.
 * This allows both WebSocket handlers (ws.ts) and REST API (api.ts) to know which
 * conversations have active tasks running.
 */

export type SessionStatus = {
    isActive: boolean;
    latestReasoning?: string;
    isPaused?: boolean;
};

// In-memory store: conversationId -> session status
const activeSessions = new Map<string, SessionStatus>();

/**
 * Mark a session as active (research started)
 */
export function setSessionActive(conversationId: string, reasoning?: string): void {
    activeSessions.set(conversationId, {
        isActive: true,
        latestReasoning: reasoning,
        isPaused: false,
    });
}

/**
 * Update the latest reasoning for an active session
 */
export function updateSessionReasoning(conversationId: string, reasoning: string): void {
    const existing = activeSessions.get(conversationId);
    if (existing) {
        existing.latestReasoning = reasoning;
    }
}

/**
 * Mark a session as paused
 */
export function setSessionPaused(conversationId: string): void {
    const existing = activeSessions.get(conversationId);
    if (existing) {
        existing.isPaused = true;
    }
}

/**
 * Mark a session as inactive (research completed/errored)
 */
export function setSessionInactive(conversationId: string): void {
    activeSessions.delete(conversationId);
}

/**
 * Get the status of a specific session
 */
export function getActiveStatus(conversationId: string): SessionStatus | undefined {
    return activeSessions.get(conversationId);
}

/**
 * Get all active conversation IDs
 */
export function getAllActiveConversationIds(): string[] {
    return Array.from(activeSessions.keys());
}

/**
 * Get all active sessions with their status
 */
export function getAllActiveSessions(): Map<string, SessionStatus> {
    return new Map(activeSessions);
}
