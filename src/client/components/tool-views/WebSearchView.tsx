// Formatted web search results view for the thoughts section
// Shows search results with titles, links, and snippets in a scrollable box

import { Search } from 'lucide-react';
import { ExternalLink } from '../ExternalLink';
import { safeMarkdownUrlTransform } from '../../utils/markdown';

interface WebSearchViewProps {
    result: string;
    query?: string;
}

interface SearchResult {
    title: string;
    link: string;
    snippet?: string;
}

export function WebSearchView({ result, query }: WebSearchViewProps) {
    // Parse search results from the markdown-formatted output
    const parseResults = (text: string): SearchResult[] => {
        const results: SearchResult[] = [];

        // Format: "1. **Title**\n   https://url\n   snippet (multiline until next number)"
        // Use a pattern that captures everything between numbered items
        const pattern = /(\d+)\.\s+\*\*(.+?)\*\*\n\s+(https?:\/\/\S+)\n?([\s\S]*?)(?=\n\d+\.\s+\*\*|$)/g;

        let match;
        while ((match = pattern.exec(text)) !== null) {
            const snippet = match[4]?.trim()
                // Remove leading indentation from each line
                .split('\n')
                .map(line => line.replace(/^\s{2,}/, ''))
                .join(' ')
                .trim();

            results.push({
                title: match[2] || '',
                link: match[3] || '',
                snippet: snippet || undefined,
            });
        }

        return results;
    };

    const results = parseResults(result);

    // Check for actual search errors (not just the word "error" in content)
    // Search errors typically start with "Error:" or "Search failed"
    const isSearchError = result.startsWith('Error:') || result.startsWith('Search failed');

    // Show as plain text if parsing failed or actual error occurred
    if (isSearchError || results.length === 0) {
        return (
            <div className="thought-web-search error">
                <div className="web-search-content">{result}</div>
            </div>
        );
    }

    return (
        <div className="thought-web-search">
            <div className="web-search-header">
                <Search size={12} />
                <span className="web-search-query">{query ? `${query.slice(0, 50)}${query.length > 50 ? '...' : ''}` : 'Search Results'}</span>
            </div>
            <div className="web-search-results">
                {results.map((result, idx) => (
                    <div key={idx} className="web-search-result">
                        <div className="web-search-title">{result.title}</div>
                        <div className="web-search-link">
                            {(() => {
                                const safeLink = safeMarkdownUrlTransform(result.link);
                                if (!safeLink) return result.link;
                                return <ExternalLink href={safeLink}>{result.link}</ExternalLink>;
                            })()}
                        </div>
                        {result.snippet && (
                            <div className="web-search-snippet">{result.snippet}</div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}
