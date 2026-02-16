// Find in page component with Cmd/Ctrl+F support

import { useState, useEffect, useRef, useCallback } from 'react';
import { Search, X, ChevronUp, ChevronDown } from 'lucide-react';

interface FindInPageProps {
    isOpen: boolean;
    onClose: () => void;
    containerSelector?: string; // CSS selector for the container to search in
    initialQuery?: string; // Pre-fill the search query (e.g. from chat switcher search)
}

interface MatchInfo {
    node: Text;
    startIndex: number;
    endIndex: number;
}

export function FindInPage({ isOpen, onClose, containerSelector = '.main-content', initialQuery }: FindInPageProps) {
    const [query, setQuery] = useState('');
    const [matches, setMatches] = useState<MatchInfo[]>([]);
    const [currentMatchIndex, setCurrentMatchIndex] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);
    const highlightClass = 'find-highlight';
    const activeHighlightClass = 'find-highlight-active';

    // Clear all highlights
    const clearHighlights = useCallback(() => {
        const container = document.querySelector(containerSelector);
        if (!container) return;

        // Remove highlight spans and restore original text
        const highlights = container.querySelectorAll(`.${highlightClass}`);
        highlights.forEach(highlight => {
            const parent = highlight.parentNode;
            if (parent) {
                parent.replaceChild(document.createTextNode(highlight.textContent || ''), highlight);
                parent.normalize(); // Merge adjacent text nodes
            }
        });
    }, [containerSelector, highlightClass]);

    // Find and highlight matches
    const findMatches = useCallback((searchQuery: string) => {
        clearHighlights();

        if (!searchQuery.trim()) {
            setMatches([]);
            setCurrentMatchIndex(0);
            return;
        }

        const container = document.querySelector(containerSelector);
        if (!container) return;

        const foundMatches: MatchInfo[] = [];
        const searchLower = searchQuery.toLowerCase();

        // Walk through text nodes
        const walker = document.createTreeWalker(
            container,
            NodeFilter.SHOW_TEXT,
            {
                acceptNode: (node) => {
                    // Skip script and style tags
                    const parent = node.parentElement;
                    if (parent && (parent.tagName === 'SCRIPT' || parent.tagName === 'STYLE')) {
                        return NodeFilter.FILTER_REJECT;
                    }
                    // Skip empty text nodes
                    if (!node.textContent?.trim()) {
                        return NodeFilter.FILTER_REJECT;
                    }
                    return NodeFilter.FILTER_ACCEPT;
                }
            }
        );

        let node: Text | null;
        while ((node = walker.nextNode() as Text | null)) {
            const text = node.textContent || '';
            const textLower = text.toLowerCase();
            let startIndex = 0;

            while ((startIndex = textLower.indexOf(searchLower, startIndex)) !== -1) {
                foundMatches.push({
                    node,
                    startIndex,
                    endIndex: startIndex + searchQuery.length
                });
                startIndex += searchQuery.length;
            }
        }

        // Highlight matches (in reverse order to preserve indices)
        const processedNodes = new Set<Text>();

        // Group matches by node
        const matchesByNode = new Map<Text, MatchInfo[]>();
        for (const match of foundMatches) {
            const existing = matchesByNode.get(match.node) || [];
            existing.push(match);
            matchesByNode.set(match.node, existing);
        }

        // Process each node
        matchesByNode.forEach((nodeMatches, textNode) => {
            if (processedNodes.has(textNode)) return;
            processedNodes.add(textNode);

            const text = textNode.textContent || '';
            const fragment = document.createDocumentFragment();
            let lastIndex = 0;

            // Sort matches by start index
            nodeMatches.sort((a, b) => a.startIndex - b.startIndex);

            for (const match of nodeMatches) {
                // Add text before match
                if (match.startIndex > lastIndex) {
                    fragment.appendChild(document.createTextNode(text.slice(lastIndex, match.startIndex)));
                }

                // Add highlighted match
                const highlight = document.createElement('mark');
                highlight.className = highlightClass;
                highlight.textContent = text.slice(match.startIndex, match.endIndex);
                fragment.appendChild(highlight);

                lastIndex = match.endIndex;
            }

            // Add remaining text
            if (lastIndex < text.length) {
                fragment.appendChild(document.createTextNode(text.slice(lastIndex)));
            }

            // Replace original node with fragment
            textNode.parentNode?.replaceChild(fragment, textNode);
        });

        setMatches(foundMatches);
        setCurrentMatchIndex(foundMatches.length > 0 ? 0 : -1);
    }, [containerSelector, clearHighlights, highlightClass]);

    // Update active highlight
    const updateActiveHighlight = useCallback((index: number) => {
        const container = document.querySelector(containerSelector);
        if (!container) return;

        // Remove active class from all
        const allHighlights = container.querySelectorAll(`.${highlightClass}`);
        allHighlights.forEach(h => h.classList.remove(activeHighlightClass));

        // Add active class to current
        if (index >= 0 && index < allHighlights.length) {
            const activeHighlight = allHighlights[index];
            activeHighlight?.classList.add(activeHighlightClass);
            activeHighlight?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }, [containerSelector, highlightClass, activeHighlightClass]);

    // Navigate to next match
    const goToNextMatch = useCallback(() => {
        if (matches.length === 0) return;
        const nextIndex = (currentMatchIndex + 1) % matches.length;
        setCurrentMatchIndex(nextIndex);
        updateActiveHighlight(nextIndex);
    }, [matches.length, currentMatchIndex, updateActiveHighlight]);

    // Navigate to previous match
    const goToPreviousMatch = useCallback(() => {
        if (matches.length === 0) return;
        const prevIndex = currentMatchIndex <= 0 ? matches.length - 1 : currentMatchIndex - 1;
        setCurrentMatchIndex(prevIndex);
        updateActiveHighlight(prevIndex);
    }, [matches.length, currentMatchIndex, updateActiveHighlight]);

    // Handle input change with debounce
    useEffect(() => {
        const timer = setTimeout(() => {
            findMatches(query);
        }, 150);
        return () => clearTimeout(timer);
    }, [query, findMatches]);

    // Update active highlight when index changes
    useEffect(() => {
        if (matches.length > 0) {
            updateActiveHighlight(currentMatchIndex);
        }
    }, [currentMatchIndex, matches.length, updateActiveHighlight]);

    // Focus input when opened, pre-fill with initialQuery if provided
    useEffect(() => {
        if (isOpen) {
            if (initialQuery) {
                setQuery(initialQuery);
            }
            inputRef.current?.focus();
            inputRef.current?.select();
        } else {
            clearHighlights();
            setQuery('');
            setMatches([]);
            setCurrentMatchIndex(0);
        }
    }, [isOpen, clearHighlights, initialQuery]);

    // Handle keyboard shortcuts within the find bar
    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Escape') {
            e.preventDefault();
            onClose();
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (e.shiftKey) {
                goToPreviousMatch();
            } else {
                goToNextMatch();
            }
        } else if (e.key === 'F3' || (e.key === 'g' && (e.metaKey || e.ctrlKey))) {
            e.preventDefault();
            if (e.shiftKey) {
                goToPreviousMatch();
            } else {
                goToNextMatch();
            }
        }
    };

    if (!isOpen) return null;

    return (
        <div className="find-in-page-bar">
            <div className="find-input-wrapper">
                <Search size={16} className="find-icon" />
                <input
                    ref={inputRef}
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Find in page..."
                    className="find-input"
                    autoComplete="off"
                    spellCheck={false}
                />
                {query && (
                    <span className="find-count">
                        {matches.length > 0
                            ? `${currentMatchIndex + 1} of ${matches.length}`
                            : 'No results'}
                    </span>
                )}
            </div>
            <div className="find-actions">
                <button
                    onClick={goToPreviousMatch}
                    disabled={matches.length === 0}
                    className="find-nav-button"
                    title="Previous match (Shift+Enter)"
                    aria-label="Previous match"
                >
                    <ChevronUp size={18} />
                </button>
                <button
                    onClick={goToNextMatch}
                    disabled={matches.length === 0}
                    className="find-nav-button"
                    title="Next match (Enter)"
                    aria-label="Next match"
                >
                    <ChevronDown size={18} />
                </button>
                <button
                    onClick={onClose}
                    className="find-close-button"
                    title="Close (Escape)"
                    aria-label="Close find bar"
                >
                    <X size={18} />
                </button>
            </div>
        </div>
    );
}
