// WebSocket message types for server communication

export type WebSocketMessage = {
    type: 'iteration' | 'complete' | 'error' | 'research' | 'pause' | 'confirmation_request' | 'conversation_created' | 'tool_call_start' | 'user_message_persisted';
    data?: any;
    error?: string;
    conversationId?: string;
};
