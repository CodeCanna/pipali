// Minimal types for research director

export interface ToolCall {
    name: string;
    args: Record<string, any>;
    id: string;
}

export interface ToolResult {
    toolCall: ToolCall;
    result: string;
}

export interface ResearchIteration {
    toolCalls: ToolCall[];
    toolResults?: ToolResult[];
    warning?: string;
    thought?: string;
}
