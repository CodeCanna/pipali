// Expandable thoughts section showing AI reasoning and tool calls

import React, { useState } from 'react';
import { ChevronDown, Globe, FileSearch, Pencil, Terminal, Wrench } from 'lucide-react';
import type { Thought } from '../../types';
import { ThoughtItem } from './ThoughtItem';
import { getToolCategory, type ToolCategory } from '../../utils/formatting';

const CATEGORY_ICONS: Record<ToolCategory, React.ComponentType<{ size?: number }>> = {
    web: Globe,
    read: FileSearch,
    write: Pencil,
    execute: Terminal,
    other: Wrench,
};

const CATEGORY_ORDER: ToolCategory[] = ['web', 'read', 'write', 'execute', 'other'];

interface ThoughtsSectionProps {
    thoughts: Thought[];
    isStreaming?: boolean;
}

export function ThoughtsSection({ thoughts, isStreaming }: ThoughtsSectionProps) {
    const [isExpanded, setIsExpanded] = useState(false);

    if (thoughts.length === 0) return null;

    const toolCalls = thoughts.filter(t => t.type === 'tool_call');
    const thoughtCount = thoughts.filter(t => t.type === 'thought').length;

    // Get the most recent thought/tool_call for streaming preview
    const latestThought = thoughts.length > 0 ? thoughts[thoughts.length - 1] : null;

    // Calculate the step number for a thought (position among tool_call thoughts)
    const getStepNumber = (idx: number): number => {
        return thoughts.slice(0, idx).filter(t => t.type === 'tool_call').length + 1;
    };

    // Render grouped category icons with counts for the toggle button
    const renderSummary = () => {
        if (toolCalls.length === 0) {
            if (thoughtCount > 0) {
                return <span className="thoughts-summary-text">Reasoning</span>;
            }
            return null;
        }

        // Count tool calls by category
        const counts = new Map<ToolCategory, number>();
        for (const tc of toolCalls) {
            const cat = getToolCategory(tc.toolName || '');
            counts.set(cat, (counts.get(cat) || 0) + 1);
        }

        // Find which category is currently pending (if any)
        const pendingToolCall = toolCalls.findLast(tc => tc.isPending);
        const pendingCategory = pendingToolCall
            ? getToolCategory(pendingToolCall.toolName || '')
            : null;

        return (
            <span className="thoughts-icon-trail">
                {CATEGORY_ORDER
                    .filter(cat => counts.has(cat))
                    .map(cat => {
                        const Icon = CATEGORY_ICONS[cat];
                        const count = counts.get(cat)!;
                        const isPending = cat === pendingCategory;
                        return (
                            <span key={cat} className="trail-group">
                                <span className={`trail-icon trail-icon--${cat}${isPending ? ' trail-icon--pending' : ''}`}>
                                    <Icon size={10} />
                                </span>
                                <span className="trail-group-count">{count}</span>
                            </span>
                        );
                    })}
            </span>
        );
    };

    return (
        <div className="thoughts-section">
            <div className="thoughts-header">
                <button
                    className="thoughts-toggle"
                    onClick={() => setIsExpanded(!isExpanded)}
                >
                    <span className="thoughts-summary">
                        {renderSummary()}
                    </span>
                    <ChevronDown
                        size={14}
                        className={`thoughts-chevron ${isExpanded ? 'expanded' : ''}`}
                    />
                </button>
                {toolCalls.length > 0 && (
                    <span className="thoughts-dots">
                        {toolCalls.map(tc => {
                            const category = getToolCategory(tc.toolName || '');
                            return (
                                <span
                                    key={tc.id}
                                    className={`thoughts-dot thoughts-dot--${category}${tc.isPending ? ' thoughts-dot--pending' : ''}`}
                                />
                            );
                        })}
                    </span>
                )}
            </div>

            {/* Show streaming preview of latest thought when not expanded */}
            {isStreaming && !isExpanded && latestThought && (
                <div className="thoughts-preview">
                    <ThoughtItem
                        thought={latestThought}
                        stepNumber={getStepNumber(thoughts.length - 1)}
                        isPreview={true}
                    />
                </div>
            )}

            {isExpanded && (
                <div className="thoughts-list">
                    {thoughts.map((thought, idx) => (
                        <ThoughtItem
                            key={thought.id}
                            thought={thought}
                            stepNumber={getStepNumber(idx)}
                            isPreview={false}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}
