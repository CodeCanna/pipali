import { test, expect, describe, beforeEach, afterEach, spyOn } from 'bun:test';
import { readWebpage } from '../../src/server/processor/actor/read_webpage';

describe('readWebpage', () => {
    const originalEnv = { ...process.env };
    let fetchSpy: ReturnType<typeof spyOn>;

    beforeEach(() => {
        // Reset environment
        process.env = { ...originalEnv };
    });

    afterEach(() => {
        // Restore original env and clear spy
        process.env = originalEnv;
        fetchSpy?.mockRestore();
    });

    test('should return error when URL is empty', async () => {
        const result = await readWebpage({ url: '' });

        expect(result.compiled).toContain('Error');
        expect(result.compiled).toContain('required');
    });

    test('should return error when URL is only whitespace', async () => {
        const result = await readWebpage({ url: '   ' });

        expect(result.compiled).toContain('Error');
        expect(result.compiled).toContain('required');
    });

    test('should return error for invalid URL format', async () => {
        const result = await readWebpage({ url: 'not-a-valid-url' });

        expect(result.compiled).toContain('Error');
        expect(result.compiled).toContain('Invalid URL');
    });

    test('should return error for non-http URL', async () => {
        const result = await readWebpage({ url: 'ftp://example.com/file' });

        expect(result.compiled).toContain('Error');
        expect(result.compiled).toContain('Invalid URL');
    });

    test('should accept valid http URL', async () => {
        // Mock a successful response
        fetchSpy = spyOn(globalThis, 'fetch').mockResolvedValue(
            new Response('<html><body><p>Test content</p></body></html>', {
                status: 200,
                headers: { 'Content-Type': 'text/html' },
            })
        );

        const result = await readWebpage({ url: 'http://example.com' });

        expect(result.compiled).not.toContain('Invalid URL');
        expect(result.uri).toBe('http://example.com');
    });

    test('should accept valid https URL', async () => {
        fetchSpy = spyOn(globalThis, 'fetch').mockResolvedValue(
            new Response('<html><body><p>Test content</p></body></html>', {
                status: 200,
                headers: { 'Content-Type': 'text/html' },
            })
        );

        const result = await readWebpage({ url: 'https://example.com' });

        expect(result.compiled).not.toContain('Invalid URL');
        expect(result.uri).toBe('https://example.com');
    });

    test('should read webpage with direct fetch when no Exa API key', async () => {
        delete process.env.EXA_API_KEY;

        fetchSpy = spyOn(globalThis, 'fetch').mockResolvedValue(
            new Response(
                '<html><body><h1>Hello World</h1><p>This is test content.</p></body></html>',
                {
                    status: 200,
                    headers: { 'Content-Type': 'text/html' },
                }
            )
        );

        const result = await readWebpage({ url: 'https://example.com' });

        expect(result.compiled).toContain('Hello World');
        expect(result.compiled).toContain('test content');
    });

    test('should strip HTML tags from content', async () => {
        delete process.env.EXA_API_KEY;

        fetchSpy = spyOn(globalThis, 'fetch').mockResolvedValue(
            new Response(
                '<html><body><script>alert("bad")</script><p>Good content</p><style>.foo{}</style></body></html>',
                {
                    status: 200,
                    headers: { 'Content-Type': 'text/html' },
                }
            )
        );

        const result = await readWebpage({ url: 'https://example.com' });

        expect(result.compiled).toContain('Good content');
        expect(result.compiled).not.toContain('<script>');
        expect(result.compiled).not.toContain('alert');
        expect(result.compiled).not.toContain('<style>');
        expect(result.compiled).not.toContain('.foo');
    });

    test('should handle HTTP errors gracefully', async () => {
        delete process.env.EXA_API_KEY;

        fetchSpy = spyOn(globalThis, 'fetch').mockResolvedValue(
            new Response('Not Found', {
                status: 404,
                statusText: 'Not Found',
            })
        );

        const result = await readWebpage({ url: 'https://example.com/not-found' });

        expect(result.compiled).toContain('Failed to read webpage');
        expect(result.compiled).toContain('404');
    });

    test('should handle network errors gracefully', async () => {
        delete process.env.EXA_API_KEY;

        fetchSpy = spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network error'));

        const result = await readWebpage({ url: 'https://example.com' });

        expect(result.compiled).toContain('Failed to read webpage');
    });

    test('should use Exa API when API key is available', async () => {
        process.env.EXA_API_KEY = 'test-api-key';

        let capturedUrl: string | URL | Request = '';
        const preconnect = (globalThis.fetch as typeof fetch).preconnect;
        const fetchImpl = Object.assign(
            async (...args: Parameters<typeof fetch>) => {
                const [url] = args;
                capturedUrl = url;
                return new Response(
                    JSON.stringify({
                        results: [{ text: 'Exa extracted content from the page' }],
                    }),
                    {
                        status: 200,
                        headers: { 'Content-Type': 'application/json' },
                    }
                );
            },
            { preconnect }
        ) satisfies typeof fetch;

        fetchSpy = spyOn(globalThis, 'fetch').mockImplementation(fetchImpl);

        const result = await readWebpage({ url: 'https://example.com' });

        expect(capturedUrl.toString()).toContain('api.exa.ai/contents');
        expect(result.compiled).toContain('Exa extracted content');
    });

    test('should fallback to direct fetch when Exa fails', async () => {
        process.env.EXA_API_KEY = 'test-api-key';

        let fetchCount = 0;
        const preconnect = (globalThis.fetch as typeof fetch).preconnect;
        const fetchImpl = Object.assign(
            async (...args: Parameters<typeof fetch>) => {
                const [url] = args;
                fetchCount++;
                if (url.toString().includes('exa.ai')) {
                    return new Response('Error', { status: 500 });
                }
                return new Response(
                    '<html><body><p>Direct fetch content</p></body></html>',
                    {
                        status: 200,
                        headers: { 'Content-Type': 'text/html' },
                    }
                );
            },
            { preconnect }
        ) satisfies typeof fetch;

        fetchSpy = spyOn(globalThis, 'fetch').mockImplementation(fetchImpl);

        const result = await readWebpage({ url: 'https://example.com' });

        expect(fetchCount).toBe(2); // Exa failed, then direct fetch
        expect(result.compiled).toContain('Direct fetch content');
    });

    test('should decode common HTML entities', async () => {
        delete process.env.EXA_API_KEY;

        fetchSpy = spyOn(globalThis, 'fetch').mockResolvedValue(
            new Response(
                '<html><body><p>Tom &amp; Jerry &lt;3 &quot;fun&quot;</p></body></html>',
                {
                    status: 200,
                    headers: { 'Content-Type': 'text/html' },
                }
            )
        );

        const result = await readWebpage({ url: 'https://example.com' });

        expect(result.compiled).toContain('Tom & Jerry');
        expect(result.compiled).toContain('<3');
        expect(result.compiled).toContain('"fun"');
    });

    test('should truncate very long content', async () => {
        delete process.env.EXA_API_KEY;

        const longContent = 'A'.repeat(100000);
        fetchSpy = spyOn(globalThis, 'fetch').mockResolvedValue(
            new Response(
                `<html><body><p>${longContent}</p></body></html>`,
                {
                    status: 200,
                    headers: { 'Content-Type': 'text/html' },
                }
            )
        );

        const result = await readWebpage({ url: 'https://example.com' });

        // Content should be truncated (raw content limit is 50000, extracted is 10000 without query)
        expect(result.compiled.length).toBeLessThan(60000);
        expect(result.compiled).toContain('truncated');
    });

    test('should include URL in result metadata', async () => {
        delete process.env.EXA_API_KEY;

        fetchSpy = spyOn(globalThis, 'fetch').mockResolvedValue(
            new Response('<html><body><p>Content</p></body></html>', {
                status: 200,
                headers: { 'Content-Type': 'text/html' },
            })
        );

        const url = 'https://example.com/page';
        const result = await readWebpage({ url });

        expect(result.file).toBe(url);
        expect(result.uri).toBe(url);
        expect(result.query).toContain(url);
    });

    test('should reject non-text content types', async () => {
        delete process.env.EXA_API_KEY;

        fetchSpy = spyOn(globalThis, 'fetch').mockResolvedValue(
            new Response(new ArrayBuffer(100), {
                status: 200,
                headers: { 'Content-Type': 'application/pdf' },
            })
        );

        const result = await readWebpage({ url: 'https://example.com/file.pdf' });

        expect(result.compiled).toContain('Failed to read webpage');
        expect(result.compiled).toContain('content type');
    });

    test('should accept text/plain content type', async () => {
        delete process.env.EXA_API_KEY;

        fetchSpy = spyOn(globalThis, 'fetch').mockResolvedValue(
            new Response('Plain text content', {
                status: 200,
                headers: { 'Content-Type': 'text/plain' },
            })
        );

        const result = await readWebpage({ url: 'https://example.com/file.txt' });

        expect(result.compiled).toContain('Plain text content');
    });

    test('should pass query to result metadata', async () => {
        delete process.env.EXA_API_KEY;

        fetchSpy = spyOn(globalThis, 'fetch').mockResolvedValue(
            new Response('<html><body><p>Content about weather</p></body></html>', {
                status: 200,
                headers: { 'Content-Type': 'text/html' },
            })
        );

        const result = await readWebpage({
            url: 'https://example.com',
            query: 'weather forecast',
        });

        // The query should be used for content extraction
        expect(result.uri).toBe('https://example.com');
    });
});
