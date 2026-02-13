// Individual thought/tool_call rendering

import React from 'react';
import type { Thought } from '../../types';
import { formatToolArgs, getFriendlyToolName, formatToolArgsRich, getToolCategory } from '../../utils/formatting';
import { getToolResultStatus } from '../../utils/toolStatus';
import { ExternalLink } from '../ExternalLink';
import { ThoughtDiffView } from '../tool-views/ThoughtDiffView';
import { ThoughtWriteView } from '../tool-views/ThoughtWriteView';
import { GrepResultView } from '../tool-views/GrepResultView';
import { ListResultView } from '../tool-views/ListResultView';
import { BashCommandView } from '../tool-views/BashCommandView';
import { ReadFileView } from '../tool-views/ReadFileView';
import { WebSearchView } from '../tool-views/WebSearchView';
import { WebpageView } from '../tool-views/WebpageView';
import { ToolResultView } from '../tool-views/ToolResultView';

interface ThoughtItemProps {
    thought: Thought;
    stepNumber: number; // Position among tool_call thoughts
    isPreview?: boolean;
    showResult?: boolean; // false = outline (title only), true = full (title + result)
}

// Parse markdown bold (**text**) into React elements
function formatBoldText(text: string): React.ReactNode[] {
    const parts = text.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**')) {
            return <b key={i}>{part.slice(2, -2)}</b>;
        }
        return part;
    });
}

export function ThoughtItem({ thought, stepNumber, isPreview = false, showResult = true }: ThoughtItemProps) {
    if (thought.type === 'thought' && thought.content) {
        const text = thought.content.trim();
        const firstLine = showResult ? text : (text.split('\n')[0] ?? text);
        return (
            <div className={`thought-item reasoning ${thought.isInternalThought ? 'internal' : ''} ${isPreview ? 'preview' : ''}`}>
                <div className="thought-step"><span className="thought-reasoning-dot" /></div>
                <div className="thought-content">
                    <div className={`thought-reasoning ${thought.isInternalThought ? 'italic' : ''} ${!showResult ? 'outline' : ''}`}>
                        {formatBoldText(firstLine)}
                    </div>
                </div>
            </div>
        );
    }

    if (thought.type === 'tool_call') {
        const toolName = thought.toolName || '';
        const richArgs = formatToolArgsRich(toolName, thought.toolArgs, !showResult);
        const formattedArgs = richArgs ? '' : formatToolArgs(toolName, thought.toolArgs);
        const friendlyToolName = getFriendlyToolName(toolName);
        const isInterrupted = thought.toolResult?.trim() === '[interrupted]';
        const category = getToolCategory(toolName);

        // Determine success/error status for step indicator (pending takes precedence)
        const stepStatus = thought.isPending ? 'pending' : getToolResultStatus(thought.toolResult, toolName);

        return (
            <div className={`thought-item ${isPreview ? 'preview' : ''} ${thought.isPending ? 'pending' : ''}`}>
                <div className={`thought-step ${showResult ? stepStatus : ''}`}>
                    {showResult ? stepNumber : (
                        <span className={`thought-category-dot thought-category-dot--${category}${thought.isPending ? ' thought-category-dot--pending' : ''}`} />
                    )}
                </div>
                <div className="thought-content">
                    <div className="thought-tool">
                        {friendlyToolName}
                        {richArgs ? (
                            <span className="thought-args" title={richArgs.hoverText}>
                                {' '}
                                {richArgs.url ? (
                                    <ExternalLink href={richArgs.url} className="thought-args-link">
                                        {richArgs.text}
                                    </ExternalLink>
                                ) : (
                                    <span className="thought-args-primary">{richArgs.text}</span>
                                )}
                                {richArgs.secondary && (
                                    <span className="thought-args-secondary"> {richArgs.secondary}</span>
                                )}
                            </span>
                        ) : formattedArgs ? (
                            <span className="thought-args"> {formattedArgs}</span>
                        ) : null}
                    </div>
                    {showResult && (
                        <>
                            {/* Show diff view for edit operations */}
                            {toolName === 'edit_file' && thought.toolArgs?.old_string && thought.toolArgs?.new_string && (
                                <ThoughtDiffView
                                    oldText={thought.toolArgs.old_string}
                                    newText={thought.toolArgs.new_string}
                                    filePath={thought.toolArgs.file_path}
                                />
                            )}
                            {/* Show content preview for write operations */}
                            {toolName === 'write_file' && thought.toolArgs?.content && (
                                <ThoughtWriteView
                                    content={thought.toolArgs.content}
                                    filePath={thought.toolArgs.file_path}
                                />
                            )}
                            {/* Show formatted grep results */}
                            {toolName === 'grep_files' && thought.toolResult && !isInterrupted && (
                                <GrepResultView result={thought.toolResult} />
                            )}
                            {/* Show formatted list results */}
                            {toolName === 'list_files' && thought.toolResult && !isInterrupted && (
                                <ListResultView result={thought.toolResult} />
                            )}
                            {/* Show bash command view */}
                            {toolName === 'shell_command' && thought.toolArgs?.command && (
                                <BashCommandView
                                    command={thought.toolArgs.command}
                                    justification={thought.toolArgs.justification}
                                    cwd={thought.toolArgs.cwd}
                                    result={thought.toolResult}
                                />
                            )}
                            {/* Show formatted read file results */}
                            {toolName === 'view_file' && thought.toolResult && !isInterrupted && (
                                <ReadFileView
                                    result={thought.toolResult}
                                    filePath={thought.toolArgs?.path}
                                />
                            )}
                            {/* Show formatted web search results */}
                            {toolName === 'search_web' && thought.toolResult && !isInterrupted && (
                                <WebSearchView
                                    result={thought.toolResult}
                                    query={thought.toolArgs?.query}
                                />
                            )}
                            {/* Show formatted webpage content */}
                            {toolName === 'read_webpage' && thought.toolResult && !isInterrupted && (
                                <WebpageView
                                    result={thought.toolResult}
                                    url={thought.toolArgs?.url}
                                />
                            )}
                            {/* Show interrupted tool output */}
                            {isInterrupted && thought.toolResult && (
                                <ToolResultView
                                    result={thought.toolResult}
                                    toolName={friendlyToolName}
                                />
                            )}
                            {/* Show regular result for other tools */}
                            {!isInterrupted && !['edit_file', 'write_file', 'grep_files', 'list_files', 'shell_command', 'view_file', 'search_web', 'read_webpage'].includes(toolName) && thought.toolResult && (
                                <ToolResultView
                                    result={thought.toolResult}
                                    toolName={friendlyToolName}
                                />
                            )}
                        </>
                    )}
                </div>
            </div>
        );
    }

    return null;
}
