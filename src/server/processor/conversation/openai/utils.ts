import type { ToolDefinition } from "../conversation";
import type { Responses } from 'openai/resources/responses/responses';

export function toOpenaiTools(tools?: ToolDefinition[]): Responses.FunctionTool[] | undefined {
    if (!tools) return undefined;
    return tools.map((tool) => ({
        type: "function" as const,
        name: tool.name,
        description: tool.description ?? undefined,
        parameters: tool.schema,
        strict: false,
    }));
}

/**
 * Get the reasoning content as a string from a Responses API reasoning object.
 * Returns undefined if no reasoning is present.
 */
export function getReasoningText(reasoning: Responses.ResponseReasoningItem | undefined): string | undefined {
    if (!reasoning?.summary || reasoning.summary.length === 0) {
        return undefined;
    }
    return reasoning.summary.map(s => s.text).join('\n\n');
}
