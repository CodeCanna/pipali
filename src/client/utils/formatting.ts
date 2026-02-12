// Formatting utilities for tool names, arguments, and display

/** Format bytes to a human-readable file size string. */
export function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

/**
 * Convert snake_case tool name to Title Case
 */
export function formatToolName(name: string): string {
    return name
        .replace(/_/g, ' ')
        .replace(/\b\w/g, c => c.toUpperCase());
}

/**
 * Format tool arguments for display based on tool type
 */
export function formatToolArgs(toolName: string, args: any): string {
    if (!args || typeof args !== 'object') return '';

    // Tool-specific formatting for readability
    switch (toolName) {
        case 'view_file':
            if (args.offset || args.limit) {
                const offsetStr = args.offset ? `${args.offset}` : '1';
                const limitStr = args.limit ? `${args.offset + args.limit}` : '';
                const params = [offsetStr, limitStr].filter(Boolean).join('-');
                return `${args.path} (lines ${params})`;
            }
            return args.path || '';

        case 'list_files':
            if (args.path && args.pattern) {
                return `${args.path}/${args.pattern}`;
            }
            return args.path || args.pattern || '';

        case 'grep_files':
            const parts = [];
            if (args.pattern) parts.push(`"${args.pattern}"`);
            if (args.path) parts.push(`in ${args.path}`);
            if (args.include) parts.push(`(${args.include})`);
            return parts.join(' ');

        case 'edit_file':
        case 'write_file':
            return args.file_path || '';

        case 'shell_command':
            return args.justification || '';

        case 'search_web':
            return args.query ? `${args.query}` : '';

        case 'read_webpage': {
            const parts = [];
            if (args.url) parts.push(args.url);
            return parts.join(' ');
        }

        default:
            // Generic formatting: show key values in a readable way
            return Object.entries(args)
                .filter(([_, v]) => v !== undefined && v !== null && v !== '')
                .map(([k, v]) => {
                    if (typeof v === 'string' && v.length > 50) {
                        return `${k}: "${v.slice(0, 47)}..."`;
                    }
                    return typeof v === 'string' ? `${k}: "${v}"` : `${k}: ${v}`;
                })
                .join(', ');
    }
}

/**
 * Extract filename from path
 */
export function getFileName(path: string): string {
    if (!path) return '';
    const parts = path.split('/');
    return parts[parts.length - 1] || path;
}

/**
 * Format tool calls for sidebar subtitle display
 * Uses the same friendly names and formatting as the train of thought display
 */
export function formatToolCallsForSidebar(toolCalls: any[]): string {
    if (!toolCalls || toolCalls.length === 0) return '';

    // Format each tool call with friendly name and key argument
    const formatted = toolCalls.map(tc => {
        const toolName = tc.function_name || '';
        const friendly = getFriendlyToolName(toolName);
        const args = tc.arguments || {};

        // Get a concise description of what's being done
        let detail = '';
        switch (toolName) {
            case 'view_file':
            case 'read_file':
                detail = args.path ? ` ${getFileName(args.path)}` : '';
                break;
            case 'list_files':
                detail = args.path ? ` ${args.path}` : '';
                break;
            case 'grep_files':
                detail = args.pattern ? ` "${args.pattern}"` : '';
                break;
            case 'edit_file':
            case 'write_file':
                detail = args.file_path ? ` ${getFileName(args.file_path)}` : '';
                break;
            case 'shell_command':
                detail = args.justification ? ` ${args.justification}` : '';
                break;
            case 'search_web':
                detail = args.query ? ` ${args.query}` : '';
                break;
            case 'read_webpage':
                if (args.url) {
                    try {
                        const url = new URL(args.url);
                        detail = ` ${url.hostname}`;
                    } catch {
                        detail = ` ${args.url}`;
                    }
                }
                break;
        }

        return `${friendly}${detail}`;
    });

    // Join multiple tool calls
    return formatted.join(', ');
}

// Tool activity categories for visual icon trail display
export type ToolCategory = 'web' | 'read' | 'write' | 'execute' | 'other';

/**
 * Categorize a tool by its name for the icon trail summary.
 */
export function getToolCategory(toolName: string): ToolCategory {
    switch (toolName) {
        case 'search_web':
        case 'read_webpage':
            return 'web';
        case 'view_file':
        case 'list_files':
        case 'grep_files':
            return 'read';
        case 'edit_file':
        case 'write_file':
        case 'generate_image':
        case 'email_user':
            return 'write';
        case 'shell_command':
            return 'execute';
        default:
            if (toolName.startsWith('chrome') || toolName.startsWith('browser'))
                return 'web';
            return 'other';
    }
}

/**
 * Get friendly display name for a tool
 */
export function getFriendlyToolName(toolName: string): string {
    const friendlyNames: Record<string, string> = {
        "view_file": "Read",
        "list_files": "List",
        "grep_files": "Search",
        "edit_file": "Edit",
        "write_file": "Write",
        "shell_command": "Shell",
        "search_web": "Search",
        "read_webpage": "Read",
    };
    return friendlyNames[toolName] || formatToolName(toolName);
}

/** Rich tool args with optional link and hover text */
export interface RichToolArgs {
    text: string;
    url?: string;
    hoverText?: string;
}

/**
 * Format tool arguments with rich data for interactive display
 */
export function formatToolArgsRich(toolName: string, args: any): RichToolArgs | null {
    if (!args || typeof args !== 'object') return null;

    switch (toolName) {
        case 'read_webpage': {
            if (!args.url) return null;
            let displayUrl = args.url;
            try {
                const url = new URL(args.url);
                displayUrl = url.hostname + (url.pathname !== '/' ? url.pathname : '');
            } catch { /* use full url */ }

            const hoverParts = ["Read"];
            if (args.query) hoverParts.push(`about "${args.query}" in`);
            hoverParts.push(args.url);

            return {
                text: displayUrl,
                url: args.url,
                hoverText: hoverParts.join(' '),
            };
        }

        default:
            return null;
    }
}

/**
 * Shorten home directory path for display
 */
export function shortenHomePath(path: string | undefined): string {
    return path?.replace(/^\/Users\/[^/]+/, '~') || '~';
}

// UUID generator that works in non-secure contexts (e.g., HTTP on non-localhost)
export function generateUUID(): string {
    try {
        return crypto.randomUUID();
    } catch {
        // Fallback for non-secure contexts where crypto.randomUUID throws
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
            const r = (Math.random() * 16) | 0;
            const v = c === 'x' ? r : (r & 0x3) | 0x8;
            return v.toString(16);
        });
    }
}
