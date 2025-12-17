/**
 * Confirmation Service
 *
 * Handles user confirmation requests for dangerous operations.
 * Works with any frontend (web, TUI) through a callback-based system.
 */

import {
    type ConfirmationRequest,
    type ConfirmationResponse,
    type ConfirmationResult,
    type ConfirmationPreferences,
    type DiffInfo,
    CONFIRMATION_OPTIONS,
    createStandardConfirmationOptions,
} from './confirmation.types';

/**
 * Callback function type for requesting confirmation from user
 * The implementer (WebSocket handler, TUI, etc.) provides this
 */
export type ConfirmationCallback = (request: ConfirmationRequest) => Promise<ConfirmationResponse>;

/**
 * Context for a confirmation-aware operation
 */
export interface ConfirmationContext {
    /** Callback to request confirmation from user */
    requestConfirmation: ConfirmationCallback;
    /** Current user preferences */
    preferences: ConfirmationPreferences;
    /** Session ID for tracking */
    sessionId?: string;
}

/**
 * Operations that require confirmation
 */
export type ConfirmableOperation =
    | 'edit_file'
    | 'write_file'
    | 'delete_file'
    | 'execute_command';

/**
 * Create a new confirmation request for a file operation
 */
export function createFileOperationConfirmation(
    operation: ConfirmableOperation,
    filePath: string,
    details: {
        toolName: string;
        toolArgs: Record<string, unknown>;
        additionalMessage?: string;
        diff?: DiffInfo;
    }
): ConfirmationRequest {
    const titles: Record<ConfirmableOperation, string> = {
        edit_file: 'Confirm File Edit',
        write_file: 'Confirm File Write',
        delete_file: 'Confirm File Deletion',
        execute_command: 'Confirm Command Execution',
    };

    const messages: Record<ConfirmableOperation, string> = {
        edit_file: `The agent wants to modify the file:\n\n**${filePath}**`,
        write_file: `The agent wants to create or overwrite the file:\n\n**${filePath}**`,
        delete_file: `The agent wants to delete the file:\n\n**${filePath}**`,
        execute_command: `The agent wants to execute a command`,
    };

    const riskLevels: Record<ConfirmableOperation, 'low' | 'medium' | 'high'> = {
        edit_file: 'medium',
        write_file: 'medium',
        delete_file: 'high',
        execute_command: 'high',
    };

    return {
        requestId: crypto.randomUUID(),
        inputType: 'choice',
        title: titles[operation],
        message: details.additionalMessage
            ? `${messages[operation]}\n\n${details.additionalMessage}`
            : messages[operation],
        operation,
        context: {
            toolName: details.toolName,
            toolArgs: details.toolArgs,
            affectedFiles: [filePath],
            riskLevel: riskLevels[operation],
        },
        diff: details.diff,
        options: createStandardConfirmationOptions(),
        defaultOptionId: CONFIRMATION_OPTIONS.NO,
        timeoutMs: 0, // No timeout - wait for user
    };
}

/**
 * Check if an operation requires confirmation
 */
export function requiresConfirmation(
    operation: ConfirmableOperation,
    preferences: ConfirmationPreferences
): boolean {
    return !preferences.skipConfirmationFor.has(operation);
}

/**
 * Process a confirmation response and return the result
 */
export function processConfirmationResponse(
    response: ConfirmationResponse
): ConfirmationResult {
    const approved = response.selectedOptionId === CONFIRMATION_OPTIONS.YES ||
        response.selectedOptionId === CONFIRMATION_OPTIONS.YES_DONT_ASK;

    const skipFutureConfirmations = response.selectedOptionId === CONFIRMATION_OPTIONS.YES_DONT_ASK;

    return {
        approved,
        selectedOption: response.selectedOptionId,
        skipFutureConfirmations,
        denialReason: approved ? undefined : 'User denied the operation',
    };
}

/**
 * Request confirmation for an operation
 *
 * @param operation - The type of operation
 * @param filePath - Path to the affected file
 * @param context - Confirmation context with callback and preferences
 * @param details - Additional details about the operation
 * @returns ConfirmationResult with approval status
 */
export async function requestOperationConfirmation(
    operation: ConfirmableOperation,
    filePath: string,
    context: ConfirmationContext,
    details: {
        toolName: string;
        toolArgs: Record<string, unknown>;
        additionalMessage?: string;
        diff?: DiffInfo;
    }
): Promise<ConfirmationResult> {
    // Check if user has opted to skip confirmations for this operation
    if (!requiresConfirmation(operation, context.preferences)) {
        return {
            approved: true,
            selectedOption: CONFIRMATION_OPTIONS.YES_DONT_ASK,
            skipFutureConfirmations: true,
        };
    }

    // Create the confirmation request
    const request = createFileOperationConfirmation(operation, filePath, details);

    // Request confirmation from user via callback
    const response = await context.requestConfirmation(request);

    // Process the response
    const result = processConfirmationResponse(response);

    // Update preferences if user chose "don't ask again"
    if (result.skipFutureConfirmations) {
        context.preferences.skipConfirmationFor.add(operation);
    }

    return result;
}

/**
 * Create a new empty preferences object
 */
export function createEmptyPreferences(): ConfirmationPreferences {
    return {
        skipConfirmationFor: new Set(),
    };
}

/**
 * Serialize preferences for storage
 */
export function serializePreferences(preferences: ConfirmationPreferences): string {
    return JSON.stringify({
        skipConfirmationFor: Array.from(preferences.skipConfirmationFor),
    });
}

/**
 * Deserialize preferences from storage
 */
export function deserializePreferences(data: string): ConfirmationPreferences {
    try {
        const parsed = JSON.parse(data);
        return {
            skipConfirmationFor: new Set(parsed.skipConfirmationFor || []),
        };
    } catch {
        return createEmptyPreferences();
    }
}
