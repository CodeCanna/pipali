import { AIMessage, HumanMessage, SystemMessage, ToolMessage } from '@langchain/core/messages';
import type { ToolCall } from '@langchain/core/messages/tool';

export type ChatMessage = HumanMessage | AIMessage | ToolMessage | SystemMessage;

export interface ResponseWithThought {
    message?: string;
    thought?: string;
    raw?: ToolCall[];
};

export interface ToolDefinition {
    schema: Record<string, any>;
    name: string;
    description?: string;
}