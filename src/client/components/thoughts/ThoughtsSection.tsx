// Expandable thoughts section showing AI reasoning and tool calls
// Uses org-mode S-TAB style 3-level cycling: Collapsed → Outline → Full → Collapsed

import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, ChevronUp, Globe, FileSearch, Pencil, Terminal, Wrench } from 'lucide-react';
import type { Thought } from '../../types';
import { ThoughtItem } from './ThoughtItem';
import { getToolCategory, type ToolCategory } from '../../utils/formatting';
import { parseSnapshotUids } from '../../utils/snapshotParser';

const CATEGORY_ICONS: Record<ToolCategory, React.ComponentType<{ size?: number }>> = {
    web: Globe,
    read: FileSearch,
    write: Pencil,
    execute: Terminal,
    other: Wrench,
};

const CATEGORY_ORDER: ToolCategory[] = ['web', 'read', 'write', 'execute', 'other'];

// 0 = collapsed, 1 = outline (titles only), 2 = full (titles + results)
type ExpandLevel = 0 | 1 | 2;

const CHEVRON_ICONS: Record<ExpandLevel, React.ComponentType<{ size?: number; className?: string }>> = {
    0: ChevronRight,
    1: ChevronDown,
    2: ChevronUp,
};

interface ThoughtsSectionProps {
    thoughts: Thought[];
    isStreaming?: boolean;
}

// Split a thought with multiple **heading** sections into separate thoughts for display.
// e.g. "**Doing X**\nbody\n**Doing Y**\nbody2" → two thought items.
function splitMultiHeadingThoughts(thoughts: Thought[]): Thought[] {
    const result: Thought[] = [];
    for (const thought of thoughts) {
        if (thought.type !== 'thought' || !thought.content) {
            result.push(thought);
            continue;
        }

        const text = thought.content.trim();
        // Split on lines that start with **heading** (bold markdown)
        const sections = text.split(/(?=^\*\*[^*]+\*\*)/m);
        if (sections.length <= 1) {
            result.push(thought);
            continue;
        }

        for (let i = 0; i < sections.length; i++) {
            const section = sections[i]!.trim();
            if (!section) continue;
            result.push({
                ...thought,
                id: `${thought.id}-${i}`,
                content: section,
            });
        }
    }
    return result;
}

export function ThoughtsSection({ thoughts, isStreaming }: ThoughtsSectionProps) {
    const [expandLevel, setExpandLevel] = useState<ExpandLevel>(0);

    if (thoughts.length === 0) return null;

    const toolCalls = thoughts.filter(t => t.type === 'tool_call');
    const thoughtCount = thoughts.filter(t => t.type === 'thought').length;

    // Build uid→label map from chrome snapshot results for resolving interaction tool args
    const uidMap = useMemo(() => {
        const map = new Map<string, { role: string; label: string }>();
        for (const t of thoughts) {
            if (t.type === 'tool_call' && t.toolName === 'chrome-browser__take_snapshot' && t.toolResult) {
                for (const [uid, info] of parseSnapshotUids(t.toolResult)) {
                    map.set(uid, info); // Later snapshots overwrite earlier ones (uid numbers change)
                }
            }
        }
        return map.size > 0 ? map : undefined;
    }, [thoughts]);

    // Get the most recent thought/tool_call for streaming preview
    const latestThought = thoughts.length > 0 ? thoughts[thoughts.length - 1] : null;

    // Calculate the step number for a thought (position among tool_call thoughts)
    const getStepNumber = (idx: number): number => {
        return thoughts.slice(0, idx).filter(t => t.type === 'tool_call').length + 1;
    };

    // Cycle: 0 → 1 → 2 → 0
    const cycleExpand = () => setExpandLevel(prev => ((prev + 1) % 3) as ExpandLevel);

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

    const Chevron = CHEVRON_ICONS[expandLevel];

    return (
        <div className="thoughts-section">
            <div className="thoughts-header">
                <button
                    className="thoughts-toggle"
                    onClick={cycleExpand}
                >
                    <span className="thoughts-summary">
                        {renderSummary()}
                    </span>
                    <Chevron size={14} className="thoughts-chevron" />
                </button>
            </div>

            {/* Show streaming preview of latest thought when collapsed */}
            {isStreaming && expandLevel === 0 && latestThought && (
                <div className="thoughts-preview">
                    <ThoughtItem
                        thought={latestThought}
                        stepNumber={getStepNumber(thoughts.length - 1)}
                        isPreview={true}
                        uidMap={uidMap}
                    />
                </div>
            )}

            {/* Level 1: Outline - titles with category dots, no results */}
            {/* Level 2: Full - titles with category dots + tool results */}
            {expandLevel > 0 && (() => {
                const displayThoughts = splitMultiHeadingThoughts(thoughts);
                let toolCallIndex = 0;
                return (
                    <div className="thoughts-list">
                        {displayThoughts.map((thought) => {
                            const stepNumber = thought.type === 'tool_call' ? ++toolCallIndex : 0;
                            return (
                                <ThoughtItem
                                    key={thought.id}
                                    thought={thought}
                                    stepNumber={stepNumber}
                                    isPreview={false}
                                    showResult={expandLevel === 2}
                                    uidMap={uidMap}
                                />
                            );
                        })}
                    </div>
                );
            })()}
        </div>
    );
}
