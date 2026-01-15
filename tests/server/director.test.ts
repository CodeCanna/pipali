import { test, expect, describe } from 'bun:test';
import { truncateToolOutput, MAX_TOOL_OUTPUT_CHARS } from '../../src/server/processor/director';

describe('truncateToolOutput', () => {
    describe('string content', () => {
        test('should not truncate strings under the limit', () => {
            const content = 'Short content';
            const result = truncateToolOutput(content);
            expect(result).toBe(content);
        });

        test('should not truncate strings exactly at the limit', () => {
            const content = 'x'.repeat(MAX_TOOL_OUTPUT_CHARS);
            const result = truncateToolOutput(content);
            expect(result).toBe(content);
        });

        test('should truncate strings over the limit', () => {
            const content = 'x'.repeat(MAX_TOOL_OUTPUT_CHARS + 1000);
            const result = truncateToolOutput(content);

            expect(typeof result).toBe('string');
            expect((result as string).length).toBeLessThan(content.length);
            expect(result).toContain('[Output truncated:');
            expect(result).toContain(`showing first ${MAX_TOOL_OUTPUT_CHARS.toLocaleString()}`);
            expect(result).toContain(`of ${content.length.toLocaleString()} characters]`);
        });

        test('should preserve beginning of truncated content', () => {
            const prefix = 'START_MARKER_';
            const content = prefix + 'x'.repeat(MAX_TOOL_OUTPUT_CHARS + 1000);
            const result = truncateToolOutput(content) as string;

            expect(result.startsWith(prefix)).toBe(true);
        });
    });

    describe('multimodal array content', () => {
        test('should not truncate text items under the limit', () => {
            const content = [
                { type: 'text', text: 'Short text' },
                { type: 'image', data: 'base64data', mimeType: 'image/png' },
            ];
            const result = truncateToolOutput(content);

            expect(Array.isArray(result)).toBe(true);
            expect(result).toEqual(content);
        });

        test('should truncate text items over the limit', () => {
            const longText = 'x'.repeat(MAX_TOOL_OUTPUT_CHARS + 500);
            const content = [
                { type: 'text', text: longText },
            ];
            const result = truncateToolOutput(content) as Array<{ type: string; [key: string]: string }>;

            expect(Array.isArray(result)).toBe(true);
            expect(result[0].type).toBe('text');
            expect(result[0].text.length).toBeLessThan(longText.length);
            expect(result[0].text).toContain('[Output truncated:');
        });

        test('should preserve non-text items (images) unchanged', () => {
            const imageData = 'base64imagedata'.repeat(10000); // Large image data
            const content = [
                { type: 'text', text: 'x'.repeat(MAX_TOOL_OUTPUT_CHARS + 100) },
                { type: 'image', data: imageData, mimeType: 'image/png' },
            ];
            const result = truncateToolOutput(content) as Array<{ type: string; [key: string]: string }>;

            expect(result[1].type).toBe('image');
            expect(result[1].data).toBe(imageData); // Image data preserved exactly
        });

        test('should preserve non-text items (audio) unchanged', () => {
            const audioData = 'base64audiodata'.repeat(10000);
            const content = [
                { type: 'audio', data: audioData, mimeType: 'audio/mp3' },
            ];
            const result = truncateToolOutput(content) as Array<{ type: string; [key: string]: string }>;

            expect(result[0].type).toBe('audio');
            expect(result[0].data).toBe(audioData);
        });

        test('should handle mixed content with some text over limit', () => {
            const shortText = 'Short';
            const longText = 'y'.repeat(MAX_TOOL_OUTPUT_CHARS + 200);
            const content = [
                { type: 'text', text: shortText },
                { type: 'text', text: longText },
                { type: 'image', data: 'imgdata', mimeType: 'image/jpeg' },
            ];
            const result = truncateToolOutput(content) as Array<{ type: string; [key: string]: string }>;

            // First text unchanged
            expect(result[0].text).toBe(shortText);
            // Second text truncated
            expect(result[1].text.length).toBeLessThan(longText.length);
            expect(result[1].text).toContain('[Output truncated:');
            // Image unchanged
            expect(result[2].data).toBe('imgdata');
        });
    });
});
