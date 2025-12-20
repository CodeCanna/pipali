/**
 * Web Search Actor Tool
 *
 * Performs web searches using configured search providers (Exa).
 * Returns search results including titles, links, and snippets.
 */

import { db } from '../../db';
import { WebScraper } from '../../db/schema';
import { desc, eq } from 'drizzle-orm';

// Timeout for web search requests (in milliseconds)
const SEARCH_REQUEST_TIMEOUT = 30000;

// Get environment variables at runtime (not module load time)
function getExaApiKey(): string | undefined {
    return process.env.EXA_API_KEY;
}

function getExaApiBaseUrl(): string {
    return process.env.EXA_API_URL || 'https://api.exa.ai';
}

/**
 * Arguments for the web_search tool
 */
export interface WebSearchArgs {
    /** The search query */
    query: string;
    /** Maximum number of results to return (default: 10, max: 20) */
    max_results?: number;
    /** Country code for localized results (e.g., 'US', 'GB') */
    country_code?: string;
}

/**
 * A single search result
 */
export interface SearchResult {
    title: string;
    link: string;
    snippet?: string;
}

/**
 * Result from web_search tool
 */
export interface WebSearchResult {
    query: string;
    file: string;
    uri: string;
    compiled: string;
    results?: SearchResult[];
}

/**
 * Get enabled web scrapers from database, ordered by priority (highest first)
 */
async function getEnabledWebScrapers(): Promise<(typeof WebScraper.$inferSelect)[]> {
    try {
        const scrapers = await db
            .select()
            .from(WebScraper)
            .where(eq(WebScraper.enabled, true))
            .orderBy(desc(WebScraper.priority));
        return scrapers;
    } catch (error) {
        console.log('[WebSearch] No web scrapers configured in database, using environment variables');
        return [];
    }
}

/**
 * Search using Exa API
 */
async function searchWithExa(
    query: string,
    maxResults: number,
    countryCode: string,
    apiKey?: string,
    apiBaseUrl?: string
): Promise<SearchResult[]> {
    const effectiveApiKey = apiKey || getExaApiKey();
    const effectiveBaseUrl = apiBaseUrl || getExaApiBaseUrl();

    if (!effectiveApiKey) {
        throw new Error('Exa API key not configured');
    }

    const searchEndpoint = `${effectiveBaseUrl}/search`;
    const headers = {
        'Content-Type': 'application/json',
        'x-api-key': effectiveApiKey,
    };

    const payload = {
        query,
        type: 'auto',
        userLocation: countryCode.toUpperCase(),
        numResults: maxResults,
        contents: {
            text: false,
            highlights: {
                numSentences: 3,
                highlightsPerUrl: 1,
            },
        },
    };

    console.log(`[WebSearch] Searching Exa for: "${query}"`);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), SEARCH_REQUEST_TIMEOUT);

    try {
        const response = await fetch(searchEndpoint, {
            method: 'POST',
            headers,
            body: JSON.stringify(payload),
            signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Exa search failed: ${response.status} - ${errorText}`);
        }

        const data = await response.json();
        const results = data.results || [];

        return results.map((item: any) => ({
            title: item.title || '',
            link: item.url || '',
            snippet: item.highlights?.[0] || item.text?.slice(0, 200) || '',
        }));
    } catch (error) {
        clearTimeout(timeoutId);
        if (error instanceof Error && error.name === 'AbortError') {
            throw new Error('Search request timed out');
        }
        throw error;
    }
}

/**
 * Main web search function
 */
export async function webSearch(args: WebSearchArgs): Promise<WebSearchResult> {
    const {
        query,
        max_results = 10,
        country_code = 'US',
    } = args;

    if (!query || query.trim().length === 0) {
        return {
            query: 'Web search',
            file: '',
            uri: '',
            compiled: 'Error: Search query is required',
        };
    }

    const effectiveMaxResults = Math.min(Math.max(1, max_results), 20);

    try {
        // Get configured web scrapers from database
        const scrapers = await getEnabledWebScrapers();

        // Filter to Exa scrapers or use environment variable
        const exaScrapers = scrapers.filter(s => s.type === 'exa');

        let results: SearchResult[] = [];
        let lastError: Error | null = null;

        // Try Exa scrapers from database first
        for (const scraper of exaScrapers) {
            try {
                results = await searchWithExa(
                    query,
                    effectiveMaxResults,
                    country_code,
                    scraper.apiKey || undefined,
                    scraper.apiBaseUrl || undefined
                );
                if (results.length > 0) {
                    console.log(`[WebSearch] Found ${results.length} results using ${scraper.name}`);
                    break;
                }
            } catch (error) {
                lastError = error instanceof Error ? error : new Error(String(error));
                console.warn(`[WebSearch] Failed with ${scraper.name}: ${lastError.message}`);
            }
        }

        // Fallback to environment variable if no database scrapers worked
        if (results.length === 0 && getExaApiKey()) {
            try {
                console.log('[WebSearch] Trying Exa with environment variable API key');
                results = await searchWithExa(query, effectiveMaxResults, country_code);
            } catch (error) {
                lastError = error instanceof Error ? error : new Error(String(error));
                console.warn(`[WebSearch] Exa env fallback failed: ${lastError.message}`);
            }
        }

        if (results.length === 0) {
            const errorMessage = lastError
                ? `No search results found. Last error: ${lastError.message}`
                : 'No search results found. Ensure a web search provider (Exa) is configured.';

            return {
                query: `**Web search for**: "${query}"`,
                file: '',
                uri: '',
                compiled: errorMessage,
            };
        }

        // Format results for display
        const formattedResults = results.map((r, i) => {
            let entry = `${i + 1}. **${r.title}**\n   ${r.link}`;
            if (r.snippet) {
                entry += `\n   ${r.snippet}`;
            }
            return entry;
        }).join('\n\n');

        return {
            query: `**Web search for**: "${query}"`,
            file: '',
            uri: '',
            compiled: `Found ${results.length} results:\n\n${formattedResults}`,
            results,
        };
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`[WebSearch] Error: ${errorMessage}`);

        return {
            query: `**Web search for**: "${query}"`,
            file: '',
            uri: '',
            compiled: `Error performing web search: ${errorMessage}`,
        };
    }
}
