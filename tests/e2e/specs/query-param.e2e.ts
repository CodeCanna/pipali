/**
 * Query Parameter Test
 *
 * Tests the ability to start a new conversation with a query parameter in the URL.
 * When navigating to /?query=<message>, the app should automatically start a new
 * conversation with that message.
 */

import { test, expect } from '@playwright/test';
import { ChatPage } from '../helpers/page-objects';

test.describe('Query Parameter - Auto-start conversation', () => {
    test('starts new conversation when query param is provided', async ({ page, context }) => {
        const chatPage = new ChatPage(page);

        // Clear any persisted state
        await context.clearCookies();

        // Navigate with query parameter
        const testQuery = 'Hello from query param';
        await page.goto(`/?q=${encodeURIComponent(testQuery)}`);
        await chatPage.waitForConnection();

        // Should be on chat page (not home)
        // The query param should have been cleared from URL
        const url = new URL(page.url());
        expect(url.searchParams.get('q')).toBeNull();

        // User message should appear with the query content
        await page.waitForTimeout(500);
        const messageCount = await chatPage.getMessageCount();
        expect(messageCount.user).toBe(1);

        // Verify the user message content matches the query
        const userMessages = await chatPage.getUserMessages();
        expect(userMessages[0]).toBe(testQuery);

        // Wait for completion (mock responses can be fast, so skip waitForProcessing)
        await chatPage.waitForAssistantResponse();

        // Should have assistant response
        const finalCount = await chatPage.getMessageCount();
        expect(finalCount.assistant).toBe(1);

        // Conversation ID should be in URL
        const convId = await chatPage.getConversationId();
        expect(convId).toBeTruthy();
    });

    test('does not re-send query on WebSocket reconnect', async ({ page, context }) => {
        const chatPage = new ChatPage(page);

        // Clear any persisted state
        await context.clearCookies();

        // Navigate with query parameter
        const testQuery = 'Test reconnect behavior';
        await page.goto(`/?q=${encodeURIComponent(testQuery)}`);
        await chatPage.waitForConnection();

        // Wait for completion (mock responses can be fast)
        await chatPage.waitForAssistantResponse();

        // Should have exactly 1 user message
        let messageCount = await chatPage.getMessageCount();
        expect(messageCount.user).toBe(1);

        // Simulate a page refresh (which would reconnect WebSocket)
        const convId = await chatPage.getConversationId();
        await page.goto(`/?conversationId=${convId}`);
        await chatPage.waitForConnection();

        // Wait for history to load
        await chatPage.waitForConversationHistory();

        // Should still have exactly 1 user message (no duplicate from reconnect)
        messageCount = await chatPage.getMessageCount();
        expect(messageCount.user).toBe(1);
    });

    test('handles special characters in query param', async ({ page, context }) => {
        const chatPage = new ChatPage(page);

        // Clear any persisted state
        await context.clearCookies();

        // Navigate with query containing special characters
        const testQuery = 'What is 2 + 2? Test with special chars: <>&"\'';
        await page.goto(`/?q=${encodeURIComponent(testQuery)}`);
        await chatPage.waitForConnection();

        // User message should appear
        await page.waitForTimeout(500);
        const messageCount = await chatPage.getMessageCount();
        expect(messageCount.user).toBe(1);

        // Verify the user message content matches (special chars preserved)
        const userMessages = await chatPage.getUserMessages();
        expect(userMessages[0]).toBe(testQuery);
    });

    test('ignores empty query param', async ({ page, context }) => {
        const chatPage = new ChatPage(page);

        // Clear any persisted state
        await context.clearCookies();

        // Navigate with empty query parameter
        await page.goto('/?q=');
        await chatPage.waitForConnection();

        // Should be on home page (empty query treated as no query)
        // No messages should be sent
        await page.waitForTimeout(500);
        const messageCount = await chatPage.getMessageCount();
        expect(messageCount.user).toBe(0);
        expect(messageCount.assistant).toBe(0);
    });

    test('query param continues existing conversation when conversationId is provided', async ({ page, context }) => {
        const chatPage = new ChatPage(page);

        // Clear any persisted state
        await context.clearCookies();

        // First, create a conversation
        await page.goto('/');
        await chatPage.waitForConnection();
        await chatPage.sendMessage('First message');
        await chatPage.waitForAssistantResponse();
        const existingConvId = await chatPage.getConversationId();

        // Now navigate with both query and conversationId
        // Query should continue the SAME conversation
        const testQuery = 'Follow up message from query';
        await page.goto(`/?q=${encodeURIComponent(testQuery)}&conversationId=${existingConvId}`);
        await chatPage.waitForConnection();

        // Wait for history to load and new message to complete
        await page.waitForTimeout(500);
        await chatPage.waitForAssistantResponse();

        // Should be in the SAME conversation
        const currentConvId = await chatPage.getConversationId();
        expect(currentConvId).toBe(existingConvId);

        // Should have 2 user messages (original + query)
        const messageCount = await chatPage.getMessageCount();
        expect(messageCount.user).toBe(2);

        const userMessages = await chatPage.getUserMessages();
        expect(userMessages[0]).toBe('First message');
        expect(userMessages[1]).toBe(testQuery);
    });
});
