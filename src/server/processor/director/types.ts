// Minimal types for research director

import type { ATIFObservationResult, ATIFToolCall } from "../conversation/atif/atif.types";

export interface ToolCall {
    name: string;
    args: Record<string, any>;
    id: string;
}

export interface ToolResult {
    toolCall: ATIFToolCall;
    result: string | Array<{ type: string; [key: string]: any }>;
}

export interface ResearchIteration {
    toolCalls: ATIFToolCall[];
    toolResults?: ATIFObservationResult[];
    warning?: string;
    thought?: string;
}
