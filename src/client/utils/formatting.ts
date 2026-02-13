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
 * Format tool arguments as plain text. Used as fallback for tools
 * not handled by formatToolArgsRich (shell_command, search_web, unknown tools).
 */
export function formatToolArgs(toolName: string, args: any): string {
    if (!args || typeof args !== 'object') return '';

    switch (toolName) {
        case 'shell_command':
            return args.justification || '';

        case 'search_web':
            return args.query ? `${args.query}` : '';

        default:
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
            case 'generate_image':
                if (args.prompt) {
                    const end = args.prompt.search(/[.!?](\s|$)/);
                    detail = end > 0 && end < args.prompt.length - 1
                        ? ` "${args.prompt.slice(0, end + 1)}\u2026"`
                        : ` "${args.prompt}"`;
                }
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
        "generate_image": "Generate",
    };
    return friendlyNames[toolName] || formatToolName(toolName);
}

/** Rich tool args with optional link, hover text, and secondary context */
export interface RichToolArgs {
    text: string;
    secondary?: string; // De-emphasized context like "in folder/path"
    url?: string;
    hoverText?: string;
}

/**
 * Split a path into basename and folder with home dir stripped.
 * Returns [basename, folder] where folder has ~/ prefix removed.
 */
function splitPath(fullPath: string): [string, string] {
    const shortened = shortenHomePath(fullPath);
    const lastSlash = shortened.lastIndexOf('/');
    if (lastSlash <= 0) return [shortened, ''];
    const basename = shortened.slice(lastSlash + 1);
    let folder = shortened.slice(0, lastSlash);
    if (folder.startsWith('~/')) folder = folder.slice(2);
    else if (folder === '~') folder = '';
    return [basename, folder];
}

/**
 * Format tool arguments with rich data for interactive display.
 * File tools return structured primary/secondary text at all detail levels.
 * In outline mode, primary is basename; in full mode, primary includes more context.
 */
export function formatToolArgsRich(toolName: string, args: any, outline = false): RichToolArgs | null {
    if (!args || typeof args !== 'object') return null;

    switch (toolName) {
        case 'view_file': {
            if (!args.path) return null;
            const [basename, folder] = splitPath(args.path);
            let text = basename;
            if (!outline && (args.offset || args.limit)) {
                const offsetStr = args.offset ? `${args.offset}` : '1';
                const limitStr = args.limit ? `${args.offset + args.limit}` : '';
                text += ` (lines ${[offsetStr, limitStr].filter(Boolean).join('-')})`;
            }
            return { text, secondary: folder ? `in ${folder}` : undefined, hoverText: args.path };
        }
        case 'edit_file':
        case 'write_file': {
            if (!args.file_path) return null;
            const [basename, folder] = splitPath(args.file_path);
            return { text: basename, secondary: folder ? `in ${folder}` : undefined, hoverText: args.file_path };
        }
        case 'list_files': {
            if (!args.path) return null;
            const dir = shortenHomePath(args.path).replace(/^~\/?/, '');
            const primary = args.pattern || getFileName(args.path);
            return { text: primary, secondary: dir ? `in ${dir}` : undefined, hoverText: args.path };
        }
        case 'grep_files': {
            const primary = args.pattern ? `"${args.pattern}"` : '';
            if (!primary) return null;
            const dir = args.path ? shortenHomePath(args.path).replace(/^~\/?/, '') : '';
            const hoverText = [args.pattern, args.path, args.include].filter(Boolean).join(' ');
            let secondary = dir ? `in ${dir}` : undefined;
            if (!outline && args.include && secondary) secondary += ` (${args.include})`;
            else if (!outline && args.include) secondary = `(${args.include})`;
            return { text: primary, secondary, hoverText };
        }
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

        case 'generate_image': {
            if (!args.prompt) return null;
            let text = args.prompt;
            if (outline) {
                // Truncate at first sentence boundary (. ! ?) followed by a space or end
                const sentenceEnd = args.prompt.search(/[.!?](\s|$)/);
                if (sentenceEnd > 0 && sentenceEnd < args.prompt.length - 1) {
                    text = args.prompt.slice(0, sentenceEnd + 1) + '\u2026';
                }
            }
            const secondary = args.aspect_ratio ? `Aspect Ratio: ${args.aspect_ratio}` : undefined;
            return { text, secondary, hoverText: args.prompt };
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
