/// <reference lib="dom" />
/// <reference lib="dom.iterable" />

import React, { useState, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import { ArrowUp, Sparkles, ChevronDown, ChevronUp, Circle, Loader2, Plus, MessageSquare, Trash2, PanelLeftClose, PanelLeft, Check, MoreVertical, Download, Pause, Play, X, AlertCircle } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";

// Types
type Message = {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    thoughts?: Thought[];
    isStreaming?: boolean;
};

type Thought = {
    id: string;
    type: 'thought' | 'tool_call' | 'tool_result';
    content: string;
    toolName?: string;
    toolArgs?: any;
    toolResult?: string;
    isInternalThought?: boolean; // True for model's internal reasoning (rendered in italics)
};

type WebSocketMessage = {
    type: 'iteration' | 'complete' | 'error' | 'research' | 'pause' | 'confirmation_request' | 'conversation_created';
    data?: any;
    error?: string;
    conversationId?: string;
};

// Confirmation types (mirroring server types for frontend)
type ConfirmationOption = {
    id: string;
    label: string;
    description?: string;
    style?: 'primary' | 'secondary' | 'danger' | 'warning';
    persistPreference?: boolean;
};

type DiffInfo = {
    filePath: string;
    oldText?: string;
    newText?: string;
    isNewFile?: boolean;
};

type ConfirmationRequest = {
    requestId: string;
    inputType: 'choice' | 'multi_select' | 'number_range' | 'text_input';
    title: string;
    message: string;
    operation: string;
    context?: {
        toolName: string;
        toolArgs: Record<string, unknown>;
        affectedFiles?: string[];
        riskLevel?: 'low' | 'medium' | 'high';
    };
    diff?: DiffInfo;
    options: ConfirmationOption[];
    defaultOptionId?: string;
    timeoutMs?: number;
};

type ConversationSummary = {
    id: string;
    title: string;
    preview: string;
    createdAt: string;
    updatedAt: string;
    isActive?: boolean;
    latestReasoning?: string;
};

// Per-conversation state for tracking active tasks
type ConversationState = {
    isProcessing: boolean;
    isPaused: boolean;
    latestReasoning?: string;
    // Store messages for this conversation to preserve streaming updates when switching
    messages: Message[];
};

type ChatModelInfo = {
    id: number;
    name: string;
    friendlyName: string | null;
    modelType: string;
    visionEnabled?: boolean;
    providerName: string | null;
};

const App = () => {
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState("");
    const [isConnected, setIsConnected] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [isPaused, setIsPaused] = useState(false);
    const [conversationId, setConversationId] = useState<string | undefined>(undefined);
    const [conversations, setConversations] = useState<ConversationSummary[]>([]);
    const [models, setModels] = useState<ChatModelInfo[]>([]);
    const [selectedModel, setSelectedModel] = useState<ChatModelInfo | null>(null);
    const [showModelDropdown, setShowModelDropdown] = useState(false);
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [openConversationMenuId, setOpenConversationMenuId] = useState<string | null>(null);
    const [exportingConversationId, setExportingConversationId] = useState<string | null>(null);
    // Multiple pending confirmations - one per conversation
    const [pendingConfirmations, setPendingConfirmations] = useState<Map<string, ConfirmationRequest>>(new Map());
    // Per-conversation state for tracking active tasks across all conversations
    const [conversationStates, setConversationStates] = useState<Map<string, ConversationState>>(new Map());
    const wsRef = useRef<WebSocket | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const modelDropdownRef = useRef<HTMLDivElement>(null);
    const prevConversationIdRef = useRef<string | undefined>(undefined);

    const focusTextarea = () => {
        const textarea = textareaRef.current;
        if (!textarea) return;
        if (textarea.disabled) return;
        // If the element isn't currently visible/layouted, focusing can be flaky.
        if (textarea.offsetParent === null) return;
        textarea.focus({ preventScroll: true });
    };

    const scheduleTextareaFocus = () => {
        // Schedule after React commits + browser paints to avoid focus being lost
        // due to re-renders/state transitions.
        requestAnimationFrame(() => {
            setTimeout(() => focusTextarea(), 0);
        });
    };

    // Initialize WebSocket and fetch data
    useEffect(() => {
        connectWebSocket();
        fetchConversations();
        fetchModels();
        fetchUserModel();

        // Check URL for conversationId
        const params = new URLSearchParams(window.location.search);
        const cid = params.get('conversationId');
        if (cid) {
            setConversationId(cid);
        }

        return () => {
            if (wsRef.current) {
                wsRef.current.close();
            }
        };
    }, []);

    // Keep the cursor in the chat input on initial load.
    useEffect(() => {
        scheduleTextareaFocus();
    }, []);

    // Keep the cursor in the chat input after switching conversations.
    useEffect(() => {
        scheduleTextareaFocus();
    }, [conversationId]);

    // After sending completes (processing ends) and whenever we become connected,
    // ensure the input regains focus.
    useEffect(() => {
        if (!isConnected) return;
        if (isProcessing) return;
        scheduleTextareaFocus();
    }, [isConnected, isProcessing]);

    // Close model dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (modelDropdownRef.current && !modelDropdownRef.current.contains(e.target as Node)) {
                setShowModelDropdown(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Close conversation menu when clicking outside
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            const target = e.target as HTMLElement | null;
            if (!target) return;
            if (target.closest('.conversation-menu-container')) return;
            setOpenConversationMenuId(null);
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Fetch history if conversationId changes
    useEffect(() => {
        const prevId = prevConversationIdRef.current;

        // Update URL
        if (conversationId) {
            const url = new URL(window.location.href);
            url.searchParams.set('conversationId', conversationId);
            window.history.pushState({}, '', url);
        } else {
            const url = new URL(window.location.href);
            url.searchParams.delete('conversationId');
            window.history.pushState({}, '', url);
        }

        // Skip clearing/fetching if this is just a new conversation getting its ID assigned
        // (indicated by going from undefined to a value while we have streaming messages)
        const isNewConversationGettingId = prevId === undefined && conversationId !== undefined;
        if (isNewConversationGettingId) {
            // Check if we have a streaming message (meaning we just completed first message)
            setMessages(prev => {
                const hasStreamingOrJustCompleted = prev.some(m => m.role === 'assistant');
                if (hasStreamingOrJustCompleted) {
                    // Don't clear - just update the ref and return unchanged
                    prevConversationIdRef.current = conversationId;
                    return prev;
                }
                // No messages yet - this is initial page load, fetch history
                fetchHistory(conversationId!);
                prevConversationIdRef.current = conversationId;
                return [];
            });
            return;
        }

        // Clear messages for conversation switches or new chat
        // Note: selectConversation already sets messages from cache for active tasks,
        // but this effect runs after, so we check if messages were just set
        setMessages(_prev => {
            // Check if we have cached messages for this conversation (from active/recent task)
            const convState = conversationStates.get(conversationId || '');
            if (convState?.messages && convState.messages.length > 0) {
                // Use cached messages, don't fetch from server
                prevConversationIdRef.current = conversationId;
                return convState.messages;
            }
            // Fetch from server
            if (conversationId) {
                fetchHistory(conversationId);
            }
            prevConversationIdRef.current = conversationId;
            return [];
        });
    }, [conversationId]);

    // Auto-resize textarea
    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 200) + 'px';
        }
    }, [input]);

    const fetchConversations = async () => {
        try {
            const res = await fetch('/api/conversations');
            if (res.ok) {
                const data = await res.json();
                setConversations(data.conversations);
            }
        } catch (e) {
            console.error("Failed to fetch conversations", e);
        }
    };

    const fetchModels = async () => {
        try {
            const res = await fetch('/api/models');
            if (res.ok) {
                const data = await res.json();
                setModels(data.models);
            }
        } catch (e) {
            console.error("Failed to fetch models", e);
        }
    };

    const fetchUserModel = async () => {
        try {
            const res = await fetch('/api/user/model');
            if (res.ok) {
                const data = await res.json();
                if (data.model) {
                    setSelectedModel(data.model);
                }
            }
        } catch (e) {
            console.error("Failed to fetch user model", e);
        }
    };

    const selectModel = async (model: ChatModelInfo) => {
        try {
            const res = await fetch('/api/user/model', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ modelId: model.id }),
            });
            if (res.ok) {
                setSelectedModel(model);
                setShowModelDropdown(false);
            }
        } catch (e) {
            console.error("Failed to select model", e);
        }
    };

    const fetchHistory = async (id: string) => {
        try {
            const res = await fetch(`/api/chat/${id}/history`);
            if (!res.ok) return;
            const data = await res.json();
            const historyMessages: Message[] = [];
            let currentAgentMessage: Message | null = null;
            let thoughts: Thought[] = [];

            // Helper to finalize and push current agent state
            const finalizeCurrentAgent = () => {
                if (currentAgentMessage) {
                    if (thoughts.length > 0) {
                        currentAgentMessage.thoughts = thoughts;
                    }
                    historyMessages.push(currentAgentMessage);
                } else if (thoughts.length > 0) {
                    // We have thoughts but no agent message - create one for the thoughts
                    historyMessages.push({
                        role: 'assistant',
                        content: '',
                        thoughts: thoughts,
                        id: crypto.randomUUID(),
                    });
                }
                thoughts = [];
                currentAgentMessage = null;
            };

            // Collate ATIF trajectory steps into turn-based format
            for (const msg of data.history) {
                if (msg.source === 'user') {
                    // Finalize any pending agent message/thoughts before user message
                    finalizeCurrentAgent();

                    // Add user message
                    historyMessages.push({
                        role: 'user',
                        content: typeof msg.message === 'string' ? msg.message : JSON.stringify(msg.message),
                        id: msg.step_id,
                    });
                }

                if (msg.source === 'agent') {
                    let toolResultsMap: Map<string, string> = new Map();
                    const hasMessage = msg.message && msg.message.trim() !== '';

                    // Add reasoning and tool calls to thoughts first
                    // reasoning_content is the model's internal thinking, shown in italics
                    if (msg.reasoning_content) {
                        thoughts.push({
                            type: 'thought',
                            content: msg.reasoning_content,
                            id: crypto.randomUUID(),
                            isInternalThought: true,
                        });
                    }

                    if (msg.observation && msg.observation.results) {
                        // First pass: collect tool results
                        toolResultsMap = new Map(
                            msg.observation.results
                            .filter((res: any) => res.source_call_id && res.content)
                            .map((res: any) => [res.source_call_id, res.content])
                        );

                        // Second pass: build thoughts with matched results
                        for (const tc of msg.tool_calls) {
                            thoughts.push({
                                type: 'tool_call',
                                toolName: tc.function_name,
                                toolArgs: tc.arguments,
                                toolResult: toolResultsMap.get(tc.tool_call_id),
                                content: '',
                                id: tc.tool_call_id,
                            });
                        }
                    }

                    // If this agent step has a final message, create the agent message
                    if (hasMessage) {
                        currentAgentMessage = {
                            role: 'assistant',
                            content: msg.message,
                            id: msg.step_id,
                        };
                    }
                }
            }

            // Finalize any remaining agent message/thoughts
            finalizeCurrentAgent();

            setMessages(historyMessages);
        } catch (e) {
            console.error("Failed to fetch history", e);
        }
    };

    const getFilenameFromContentDisposition = (headerValue: string | null): string | null => {
        if (!headerValue) return null;

        // RFC 5987 (filename*=UTF-8''...) support
        const filenameStarMatch = headerValue.match(/filename\*=(?:UTF-8'')?([^;]+)/i);
        if (filenameStarMatch?.[1]) {
            try {
                return decodeURIComponent(filenameStarMatch[1].trim().replace(/^"|"$/g, ''));
            } catch {
                // fall through
            }
        }

        const filenameMatch = headerValue.match(/filename=("[^"]+"|[^;]+)/i);
        if (filenameMatch?.[1]) {
            return filenameMatch[1].trim().replace(/^"|"$/g, '');
        }

        return null;
    };

    const exportConversationAsATIF = async (id: string) => {
        if (!id) return;
        if (exportingConversationId) return;

        setExportingConversationId(id);
        try {
            const res = await fetch(`/api/conversations/${id}/export/atif`);
            if (!res.ok) {
                const text = await res.text().catch(() => '');
                throw new Error(text || `Export failed (${res.status})`);
            }

            const blob = await res.blob();
            const filename =
                getFilenameFromContentDisposition(res.headers.get('Content-Disposition'))
                || `conversation_${id}.atif.json`;

            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
        } catch (e) {
            console.error('Failed to export conversation as ATIF', e);
            alert(e instanceof Error ? e.message : 'Failed to export conversation');
        } finally {
            setExportingConversationId(null);
        }
    };

    const toggleConversationMenu = (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        setOpenConversationMenuId(prev => (prev === id ? null : id));
    };

    const selectConversation = (id: string) => {
        // Save current conversation's messages to state before switching
        if (conversationId) {
            const currentState = conversationStates.get(conversationId);
            if (currentState?.isProcessing) {
                // Save current messages to conversation state
                setConversationStates(prev => {
                    const next = new Map(prev);
                    const existing = next.get(conversationId);
                    if (existing) {
                        next.set(conversationId, { ...existing, messages });
                    }
                    return next;
                });
            }
        }

        setConversationId(id);
        setOpenConversationMenuId(null);

        // Update local processing state based on the selected conversation's state
        const convState = conversationStates.get(id);
        setIsProcessing(convState?.isProcessing ?? false);
        setIsPaused(convState?.isPaused ?? false);

        // If switching to a conversation with active/cached messages, use those
        if (convState?.messages && convState.messages.length > 0) {
            setMessages(convState.messages);
        }
        // Otherwise, the useEffect will fetch history from the database
    };

    const handleConversationKeyDown = (id: string, e: React.KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            selectConversation(id);
        }
    };

    const startNewConversation = () => {
        setConversationId(undefined);
        // Reset local processing state for new conversation
        setIsProcessing(false);
        setIsPaused(false);
    };

    const deleteConversation = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        try {
            const res = await fetch(`/api/conversations/${id}`, { method: 'DELETE' });
            if (res.ok) {
                setConversations(prev => prev.filter(c => c.id !== id));
                if (conversationId === id) {
                    startNewConversation();
                }
            }
        } catch (e) {
            console.error("Failed to delete conversation", e);
        }
    };

    const connectWebSocket = () => {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws/chat`;

        const ws = new WebSocket(wsUrl);

        ws.onopen = () => {
            console.log("Connected to WebSocket");
            setIsConnected(true);
        };

        ws.onclose = () => {
            console.log("Disconnected from WebSocket");
            setIsConnected(false);
            setTimeout(connectWebSocket, 3000);
        };

        ws.onmessage = (event) => {
            try {
                const message: WebSocketMessage = JSON.parse(event.data);
                handleWebSocketMessage(message);
            } catch (e) {
                console.error("Failed to parse message:", e);
            }
        };

        wsRef.current = ws;
    };

    const handleWebSocketMessage = (message: WebSocketMessage) => {
        const msgConversationId = message.conversationId;

        if (message.type === 'error') {
            console.error("Server error:", message.error);
            // Update state for the specific conversation or current if not specified
            if (msgConversationId) {
                setConversationStates(prev => {
                    const next = new Map(prev);
                    next.delete(msgConversationId);
                    return next;
                });
            }
            // Only update local processing state if this is for current conversation
            if (!msgConversationId || msgConversationId === conversationId) {
                setIsProcessing(false);
                setIsPaused(false);
                setMessages(prev => [...prev, {
                    id: crypto.randomUUID(),
                    role: 'assistant',
                    content: `Error: ${message.error}`,
                }]);
            }
            return;
        }

        if (message.type === 'research') {
            // Update conversation state for the specific conversation
            if (msgConversationId) {
                setConversationStates(prev => {
                    const next = new Map(prev);
                    const existing = next.get(msgConversationId);
                    // Ensure we have a streaming assistant message to collect thoughts
                    let msgs = existing?.messages || [];
                    const lastMsg = msgs[msgs.length - 1];
                    if (!lastMsg || !lastMsg.isStreaming) {
                        // Add a streaming assistant message placeholder
                        msgs = [...msgs, {
                            id: crypto.randomUUID(),
                            role: 'assistant' as const,
                            content: '',
                            isStreaming: true,
                            thoughts: [],
                        }];
                    }
                    next.set(msgConversationId, {
                        isProcessing: true,
                        isPaused: false,
                        latestReasoning: existing?.latestReasoning,
                        messages: msgs,
                    });
                    return next;
                });
            }
            // Only update local state if this is for current conversation
            if (!msgConversationId || msgConversationId === conversationId) {
                setIsProcessing(true);
                setIsPaused(false);
            }
            return;
        }

        if (message.type === 'pause') {
            // Update conversation state for the specific conversation
            if (msgConversationId) {
                setConversationStates(prev => {
                    const next = new Map(prev);
                    const existing = next.get(msgConversationId);
                    next.set(msgConversationId, {
                        isProcessing: true,
                        isPaused: true,
                        latestReasoning: existing?.latestReasoning,
                        messages: existing?.messages || [],
                    });
                    return next;
                });
            }
            // Only update local state if this is for current conversation
            if (!msgConversationId || msgConversationId === conversationId) {
                setIsPaused(true);
            }
            return;
        }

        if (message.type === 'conversation_created') {
            const newConvId = message.conversationId;
            setConversationId(newConvId);

            // Sync current messages to the new conversation's state
            // This is critical for new conversations - messages were added locally before we had an ID
            if (newConvId) {
                // Get current messages and sync to conversationStates
                setMessages(currentMessages => {
                    // Update conversationStates with current messages
                    setConversationStates(prevStates => {
                        const next = new Map(prevStates);
                        next.set(newConvId, {
                            isProcessing: true,
                            isPaused: false,
                            latestReasoning: undefined,
                            messages: currentMessages,
                        });
                        return next;
                    });
                    return currentMessages;
                });
            }

            // Refresh sidebar to show the new conversation
            fetchConversations();
            return;
        }

        if (message.type === 'confirmation_request') {
            const confirmationData = message.data as ConfirmationRequest;
            console.log("Confirmation request received:", confirmationData, "for conversation:", msgConversationId);
            if (msgConversationId) {
                setPendingConfirmations(prev => {
                    const next = new Map(prev);
                    next.set(msgConversationId, confirmationData);
                    return next;
                });
            }
            return;
        }

        if (message.type === 'iteration') {
            const { data } = message;

            // Helper to create new thoughts from iteration data
            const createThoughts = (): Thought[] => {
                const newThoughts: Thought[] = [];

                // Add reasoning to train of thought:
                // - If message is present during tool calls, show it as primary reasoning
                // - If final thoughts are present, show them as internal thoughts (italicized)
                if (data.message && data.toolCalls) {
                    newThoughts.push({
                        id: crypto.randomUUID(),
                        type: 'thought',
                        content: data.message,
                    });
                } else if (data.thought) {
                    newThoughts.push({
                        id: crypto.randomUUID(),
                        type: 'thought',
                        content: data.thought,
                        isInternalThought: true, // Mark as internal thought for italic styling
                    });
                }

                // Add tool calls with their results
                if (data.toolCalls && Array.isArray(data.toolCalls)) {
                    for (const toolCall of data.toolCalls) {
                        // Find the matching result for this tool call
                        const toolResult = data.toolResults?.find(
                            (tr: any) => tr.source_call_id === toolCall.tool_call_id
                        )?.content;
                        const matchingToolContent = !!toolResult && typeof toolResult !== 'string' ? JSON.stringify(toolResult) : toolResult;

                        newThoughts.push({
                            id: toolCall.tool_call_id || crypto.randomUUID(),
                            type: 'tool_call',
                            content: '',
                            toolName: toolCall.function_name,
                            toolArgs: toolCall.arguments,
                            toolResult: matchingToolContent,
                        });
                    }
                }

                return newThoughts;
            };

            // Helper to update messages with new thoughts
            const updateMessagesWithThoughts = (msgs: Message[]): Message[] => {
                const lastMsg = msgs[msgs.length - 1];
                if (lastMsg && lastMsg.role === 'assistant' && lastMsg.isStreaming) {
                    const newThoughts = createThoughts();
                    return msgs.map(msg =>
                        msg.id === lastMsg.id
                            ? { ...msg, thoughts: [...(msg.thoughts || []), ...newThoughts] }
                            : msg
                    );
                }
                return msgs;
            };

            // For current conversation: update local messages
            // For all conversations with an ID: update conversationStates
            // Also update local if conversationId is undefined (new conversation)
            const isCurrentConversation = !msgConversationId || msgConversationId === conversationId || !conversationId;

            if (isCurrentConversation) {
                // Update local messages for current conversation
                setMessages(prev => updateMessagesWithThoughts(prev));
            }

            // Update conversationStates for any conversation with an ID
            const targetConvId = msgConversationId || conversationId;
            if (targetConvId) {
                setConversationStates(prev => {
                    const next = new Map(prev);
                    const existing = next.get(targetConvId);
                    const existingMessages = existing?.messages || [];

                    // Derive latest reasoning using the same logic as createThoughts()
                    // This ensures sidebar subtitle matches what's shown in train of thought
                    let newReasoning: string | undefined;
                    if (data.message && data.toolCalls?.length > 0) {
                        // Message with tool calls = primary reasoning (matches train of thought display)
                        newReasoning = data.message;
                    } else if (data.thought) {
                        // Internal thought (shown in italics in train of thought)
                        newReasoning = data.thought;
                    } else if (data.toolCalls?.length > 0) {
                        // No reasoning text - format tool calls like train of thought does
                        newReasoning = formatToolCallsForSidebar(data.toolCalls);
                    }

                    next.set(targetConvId, {
                        isProcessing: true,
                        isPaused: false,
                        latestReasoning: newReasoning || existing?.latestReasoning,
                        messages: updateMessagesWithThoughts(existingMessages),
                    });
                    return next;
                });
            }
        }

        if (message.type === 'complete') {
            const { data } = message;
            const completedConvId = msgConversationId || data.conversationId;

            // Helper to finalize messages with the response
            // Finds the streaming assistant message and sets its content
            // If no streaming message exists, creates a new assistant message
            const finalizeMessages = (msgs: Message[]): Message[] => {
                const lastMsg = msgs[msgs.length - 1];
                if (lastMsg && lastMsg.role === 'assistant' && lastMsg.isStreaming) {
                    return msgs.map(msg =>
                        msg.id === lastMsg.id
                            ? { ...msg, content: data.response, isStreaming: false }
                            : msg
                    );
                }
                // No streaming message found - add a new completed message
                // This can happen if messages got out of sync
                return [...msgs, {
                    id: crypto.randomUUID(),
                    role: 'assistant' as const,
                    content: data.response,
                    isStreaming: false,
                }];
            };

            // Consider it current conversation if:
            // 1. No completedConvId (shouldn't happen but safe fallback)
            // 2. completedConvId matches current conversationId
            // 3. conversationId is undefined (new conversation that hasn't had its ID set yet)
            const isCurrentConversation = !completedConvId || completedConvId === conversationId || !conversationId;

            if (isCurrentConversation) {
                // Current conversation: update local messages
                setConversationId(data.conversationId);
                setIsProcessing(false);
                setIsPaused(false);
                setMessages(prev => finalizeMessages(prev));
            }

            // Update conversationStates for any completed conversation (current or background)
            if (completedConvId) {
                setConversationStates(prev => {
                    const next = new Map(prev);
                    const existing = next.get(completedConvId);
                    // Use existing messages from state, or empty array if none
                    const existingMessages = existing?.messages || [];
                    next.set(completedConvId, {
                        isProcessing: false,
                        isPaused: false,
                        latestReasoning: existing?.latestReasoning,
                        messages: finalizeMessages(existingMessages),
                    });
                    return next;
                });

                // Clear any pending confirmation for this conversation
                setPendingConfirmations(prev => {
                    const next = new Map(prev);
                    next.delete(completedConvId);
                    return next;
                });
            }

            // Refresh conversations list
            fetchConversations();
        }
    };

    const pauseResearch = () => {
        if (!isConnected || !isProcessing || isPaused || !conversationId) return;
        wsRef.current?.send(JSON.stringify({ type: 'pause', conversationId }));
    };

    const resumeResearch = (withMessage?: string) => {
        if (!isConnected || !isPaused || !conversationId) return;
        wsRef.current?.send(JSON.stringify({ type: 'resume', message: withMessage, conversationId }));
    };

    // Send confirmation response for a specific conversation
    const sendConfirmationResponse = (convId: string, optionId: string) => {
        const pendingConfirmation = pendingConfirmations.get(convId);
        if (!pendingConfirmation || !isConnected) return;

        const response = {
            type: 'confirmation_response',
            conversationId: convId,
            data: {
                requestId: pendingConfirmation.requestId,
                selectedOptionId: optionId,
                timestamp: new Date().toISOString(),
            }
        };

        console.log("Sending confirmation response:", response);
        wsRef.current?.send(JSON.stringify(response));

        // Remove from pending confirmations
        setPendingConfirmations(prev => {
            const next = new Map(prev);
            next.delete(convId);
            return next;
        });
    };

    // Convenience function for current conversation
    const sendCurrentConfirmationResponse = (optionId: string) => {
        if (conversationId) {
            sendConfirmationResponse(conversationId, optionId);
        }
    };

    const sendMessage = async (e?: React.FormEvent) => {
        e?.preventDefault();
        if (!input.trim() || !isConnected) return;

        // Clear any pending confirmation dialog for current conversation when user sends a new message
        if (conversationId) {
            setPendingConfirmations(prev => {
                const next = new Map(prev);
                next.delete(conversationId);
                return next;
            });
        }

        // If paused and user sends a message, resume with that message
        if (isPaused) {
            const resumeMsg = input.trim();
            setInput("");

            // Add user message and a new streaming assistant message to collect thoughts
            // Also finalize the previous streaming assistant message
            const userMsg: Message = {
                id: crypto.randomUUID(),
                role: 'user',
                content: resumeMsg
            };
            const assistantMsg: Message = {
                id: crypto.randomUUID(),
                role: 'assistant',
                content: '',
                thoughts: [],
                isStreaming: true
            };

            // Calculate new messages
            const calcNewMessages = (prev: Message[]) => {
                const updated = prev.map(msg =>
                    msg.isStreaming ? { ...msg, isStreaming: false } : msg
                );
                return [...updated, userMsg, assistantMsg];
            };

            setMessages(prev => {
                const newMsgs = calcNewMessages(prev);
                // Sync to conversationStates
                if (conversationId) {
                    setConversationStates(prevStates => {
                        const next = new Map(prevStates);
                        const existing = next.get(conversationId);
                        next.set(conversationId, {
                            isProcessing: true,
                            isPaused: false,
                            latestReasoning: existing?.latestReasoning,
                            messages: newMsgs,
                        });
                        return next;
                    });
                }
                return newMsgs;
            });

            resumeResearch(resumeMsg);
            scheduleTextareaFocus();
            return;
        }

        // If processing (not paused) and user sends a message, pause and resume with that message
        if (isProcessing && conversationId) {
            const interruptMsg = input.trim();
            setInput("");

            // Pause first, then add messages and resume
            wsRef.current?.send(JSON.stringify({ type: 'pause', conversationId }));

            // Add user message and a new streaming assistant message
            const userMsg: Message = {
                id: crypto.randomUUID(),
                role: 'user',
                content: interruptMsg
            };
            const assistantMsg: Message = {
                id: crypto.randomUUID(),
                role: 'assistant',
                content: '',
                thoughts: [],
                isStreaming: true
            };

            // Calculate new messages
            const calcNewMessages = (prev: Message[]) => {
                const updated = prev.map(msg =>
                    msg.isStreaming ? { ...msg, isStreaming: false } : msg
                );
                return [...updated, userMsg, assistantMsg];
            };

            setMessages(prev => {
                const newMsgs = calcNewMessages(prev);
                // Sync to conversationStates
                setConversationStates(prevStates => {
                    const next = new Map(prevStates);
                    const existing = next.get(conversationId);
                    next.set(conversationId, {
                        isProcessing: true,
                        isPaused: false,
                        latestReasoning: existing?.latestReasoning,
                        messages: newMsgs,
                    });
                    return next;
                });
                return newMsgs;
            });

            // Small delay to let pause complete, then resume with the message
            setTimeout(() => {
                wsRef.current?.send(JSON.stringify({ type: 'resume', message: interruptMsg, conversationId }));
            }, 100);

            scheduleTextareaFocus();
            return;
        }

        const userMsg: Message = {
            id: crypto.randomUUID(),
            role: 'user',
            content: input
        };

        const assistantMsg: Message = {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: '',
            thoughts: [],
            isStreaming: true
        };

        const newMessages = [...messages, userMsg, assistantMsg];
        setMessages(newMessages);
        setIsProcessing(true);

        // Sync to conversationStates so background iteration updates work
        // We do this even if conversationId is undefined - it will be set when conversation_created arrives
        if (conversationId) {
            setConversationStates(prev => {
                const next = new Map(prev);
                next.set(conversationId, {
                    isProcessing: true,
                    isPaused: false,
                    latestReasoning: undefined,
                    messages: newMessages,
                });
                return next;
            });
        }

        wsRef.current?.send(JSON.stringify({
            message: input,
            conversationId
        }));

        setInput("");
        scheduleTextareaFocus();
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
        // Note: Escape key is handled by global listener in useEffect
    };

    // Auto-scroll
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    // Global Escape key listener for pausing research
    useEffect(() => {
        const handleGlobalKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && isProcessing && !isPaused && isConnected && conversationId) {
                e.preventDefault();
                e.stopPropagation();
                wsRef.current?.send(JSON.stringify({ type: 'pause', conversationId }));
                // Re-focus textarea after Escape
                textareaRef.current?.focus();
            }
        };

        window.addEventListener('keydown', handleGlobalKeyDown);
        return () => window.removeEventListener('keydown', handleGlobalKeyDown);
    }, [isProcessing, isPaused, isConnected, conversationId]);

    return (
        <div className="app-wrapper">
            {/* Sidebar */}
            <aside className={`sidebar ${sidebarOpen ? 'open' : 'closed'}`}>
                <div className="sidebar-header">
                    <button className="new-chat-btn" onClick={startNewConversation}>
                        <Plus size={18} />
                        <span>New chat</span>
                    </button>
                </div>

                <div className="conversations-list">
                    {conversations.map(conv => {
                        // Get live state from conversationStates, fallback to API data
                        const liveState = conversationStates.get(conv.id);
                        const isActive = liveState?.isProcessing ?? conv.isActive ?? false;
                        const latestReasoning = liveState?.latestReasoning ?? conv.latestReasoning;
                        const hasPendingConfirmation = pendingConfirmations.has(conv.id);

                        return (
                            <div
                                key={conv.id}
                                className={`conversation-item ${conversationId === conv.id ? 'active' : ''} ${isActive ? 'has-active-task' : ''}`}
                                onClick={() => selectConversation(conv.id)}
                                onKeyDown={(e) => handleConversationKeyDown(conv.id, e)}
                                role="button"
                                tabIndex={0}
                                aria-label={`Open conversation: ${conv.title}`}
                            >
                                {/* Activity indicator */}
                                {isActive ? (
                                    <Loader2 size={16} className="spinning conversation-icon" />
                                ) : hasPendingConfirmation ? (
                                    <AlertCircle size={16} className="conversation-icon needs-attention" />
                                ) : (
                                    <MessageSquare size={16} className="conversation-icon" />
                                )}

                                <div className="conversation-info">
                                    <span className="conversation-title">{conv.title}</span>
                                    {/* Subtitle with train of thought */}
                                    {isActive && latestReasoning && (
                                        <span className="conversation-subtitle">
                                            {(() => {
                                                const firstLine = latestReasoning.split('\n')[0] ?? '';
                                                return firstLine.length > 60
                                                    ? firstLine.slice(0, 60) + '...'
                                                    : firstLine;
                                            })()}
                                        </span>
                                    )}
                                </div>

                                <div className="conversation-menu-container">
                                    <button
                                        className="menu-btn"
                                        onClick={(e) => toggleConversationMenu(conv.id, e)}
                                        aria-label="Conversation actions"
                                    >
                                        <MoreVertical size={16} />
                                    </button>

                                    {openConversationMenuId === conv.id && (
                                        <div className="conversation-menu" role="menu">
                                            <button
                                                className="conversation-menu-item"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setOpenConversationMenuId(null);
                                                    exportConversationAsATIF(conv.id);
                                                }}
                                                disabled={exportingConversationId === conv.id}
                                                role="menuitem"
                                            >
                                                {exportingConversationId === conv.id ? (
                                                    <Loader2 size={14} className="spinning" />
                                                ) : (
                                                    <Download size={14} />
                                                )}
                                                <span>Export</span>
                                            </button>

                                            <button
                                                className="conversation-menu-item danger"
                                                onClick={(e) => {
                                                    setOpenConversationMenuId(null);
                                                    deleteConversation(conv.id, e);
                                                }}
                                                role="menuitem"
                                            >
                                                <Trash2 size={14} />
                                                <span>Delete</span>
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                    {conversations.length === 0 && (
                        <div className="no-conversations">No conversations yet</div>
                    )}
                </div>
            </aside>

            {/* Main Content */}
            <div className="app-container">
                {/* Header */}
                <header className="header">
                    <div className="header-content">
                        <div className="header-left">
                            <button
                                className="sidebar-toggle"
                                onClick={() => setSidebarOpen(!sidebarOpen)}
                            >
                                {sidebarOpen ? <PanelLeftClose size={20} /> : <PanelLeft size={20} />}
                            </button>
                            <h1 className="logo">Panini</h1>
                        </div>

                        <div className="header-right">
                            {/* Model Selector */}
                            <div className="model-selector" ref={modelDropdownRef}>
                                <button
                                    className="model-selector-btn"
                                    onClick={() => setShowModelDropdown(!showModelDropdown)}
                                >
                                    <span className="model-name">
                                        {selectedModel?.friendlyName || selectedModel?.name || 'Select model'}
                                    </span>
                                    <ChevronDown size={14} className={showModelDropdown ? 'rotated' : ''} />
                                </button>

                                {showModelDropdown && (
                                    <div className="model-dropdown">
                                        {models.map(model => (
                                            <button
                                                key={model.id}
                                                className={`model-option ${selectedModel?.id === model.id ? 'selected' : ''}`}
                                                onClick={() => selectModel(model)}
                                            >
                                                <div className="model-option-info">
                                                    <span className="model-option-name">
                                                        {model.friendlyName || model.name}
                                                    </span>
                                                    <span className="model-option-provider">
                                                        {model.providerName}
                                                    </span>
                                                </div>
                                                {selectedModel?.id === model.id && <Check size={16} />}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div className="status">
                                <Circle
                                    className={`status-dot ${isConnected ? 'connected' : 'disconnected'}`}
                                    size={8}
                                    fill="currentColor"
                                />
                            </div>
                        </div>
                    </div>
                </header>

                {/* Main Content */}
                <main className="main-content">
                    <div className="messages-container">
                        {messages.length === 0 ? (
                            <div className="empty-state">
                                <Sparkles className="empty-icon" size={32} strokeWidth={1.5} />
                                <h2>What can I help you with?</h2>
                                <p>Ask me anything about your files, data, or tasks.</p>
                            </div>
                        ) : (
                            <div className="messages">
                                {messages.map((msg) => (
                                    <MessageItem key={msg.id} message={msg} />
                                ))}
                                <div ref={messagesEndRef} />
                            </div>
                        )}
                    </div>
                </main>

                {/* Input Area */}
                <footer className="input-area">
                    {/* Confirmation Dialog - positioned above chat input for current conversation */}
                    {conversationId && pendingConfirmations.has(conversationId) && (
                        <ConfirmationDialog
                            request={pendingConfirmations.get(conversationId)!}
                            onRespond={sendCurrentConfirmationResponse}
                        />
                    )}

                    <div className="input-container">
                        <form onSubmit={sendMessage} className="input-form">
                            <textarea
                                ref={textareaRef}
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyDown={handleKeyDown}
                                placeholder={isPaused ? "Type to resume with a message, or click play..." : isProcessing ? "Type to interrupt with a message..." : "Ask anything..."}
                                rows={1}
                                disabled={!isConnected}
                            />
                            <div className="input-buttons">
                                {/* Single action button: Send / Pause / Play */}
                                {isProcessing && !isPaused ? (
                                    // When processing: show send if there's input, otherwise pause
                                    input.trim() ? (
                                        <button
                                            type="submit"
                                            disabled={!isConnected}
                                            className="action-button send"
                                            title="Send message (interrupts current task)"
                                        >
                                            <ArrowUp size={18} />
                                        </button>
                                    ) : (
                                        <button
                                            type="button"
                                            onClick={pauseResearch}
                                            className="action-button pause"
                                            title="Pause research (Esc)"
                                        >
                                            <Pause size={18} />
                                        </button>
                                    )
                                ) : isPaused ? (
                                    // When paused: show send if there's input, otherwise play
                                    input.trim() ? (
                                        <button
                                            type="submit"
                                            disabled={!isConnected}
                                            className="action-button send"
                                            title="Resume with message"
                                        >
                                            <ArrowUp size={18} />
                                        </button>
                                    ) : (
                                        <button
                                            type="button"
                                            onClick={() => resumeResearch()}
                                            className="action-button play"
                                            title="Resume research"
                                        >
                                            <Play size={18} />
                                        </button>
                                    )
                                ) : (
                                    // Send button when idle
                                    <button
                                        type="submit"
                                        disabled={!input.trim() || !isConnected}
                                        className="action-button send"
                                    >
                                        <ArrowUp size={18} />
                                    </button>
                                )}
                            </div>
                        </form>
                        <p className="input-hint">
                            {isPaused
                                ? "Research paused. Send a message or click play to resume."
                                : isProcessing
                                    ? "Type to interrupt, or press Esc to pause"
                                    : "Press Enter to send, Shift + Enter for new line"
                            }
                        </p>
                    </div>
                </footer>
            </div>

            {/* Toast notifications for confirmations from other conversations */}
            <ToastContainer
                confirmations={pendingConfirmations}
                conversations={conversations}
                currentConversationId={conversationId}
                onRespond={sendConfirmationResponse}
                onDismiss={(convId) => {
                    setPendingConfirmations(prev => {
                        const next = new Map(prev);
                        next.delete(convId);
                        return next;
                    });
                }}
            />
        </div>
    );
};

/**
 * Toast container for confirmation notifications from background conversations
 */
const ToastContainer = ({
    confirmations,
    conversations,
    currentConversationId,
    onRespond,
    onDismiss,
}: {
    confirmations: Map<string, ConfirmationRequest>;
    conversations: ConversationSummary[];
    currentConversationId?: string;
    onRespond: (convId: string, optionId: string) => void;
    onDismiss: (convId: string) => void;
}) => {
    // Filter out confirmations for current conversation (shown inline instead)
    const toastConfirmations = Array.from(confirmations.entries())
        .filter(([convId]) => convId !== currentConversationId);

    if (toastConfirmations.length === 0) return null;

    return (
        <div className="toast-container">
            {toastConfirmations.map(([convId, request]) => {
                const conv = conversations.find(c => c.id === convId);
                return (
                    <ConfirmationToast
                        key={request.requestId}
                        convId={convId}
                        convTitle={conv?.title || 'Background Task'}
                        request={request}
                        onRespond={onRespond}
                        onDismiss={onDismiss}
                    />
                );
            })}
        </div>
    );
};

/**
 * Individual toast notification for a confirmation request
 */
const ConfirmationToast = ({
    convId,
    convTitle,
    request,
    onRespond,
    onDismiss,
}: {
    convId: string;
    convTitle: string;
    request: ConfirmationRequest;
    onRespond: (convId: string, optionId: string) => void;
    onDismiss: (convId: string) => void;
}) => {
    const [isExpanded, setIsExpanded] = useState(false);

    // Get button style class based on option style
    const getButtonClass = (option: ConfirmationOption): string => {
        switch (option.style) {
            case 'primary':
                return 'toast-btn primary';
            case 'danger':
                return 'toast-btn danger';
            default:
                return 'toast-btn secondary';
        }
    };

    // Parse command execution message into structured sections (same as main dialog)
    const parseCommandMessage = (message: string): { reason?: string; command?: string; workdir?: string } | null => {
        if (!message.includes('**Why:**') && !message.includes('**Command:**')) {
            return null;
        }
        const result: { reason?: string; command?: string; workdir?: string } = {};

        // Extract reason (after **Why:** until **Command:**)
        const whyMatch = message.match(/\*\*Why:\*\*\s*([\s\S]*?)(?=\*\*Command:\*\*|$)/);
        if (whyMatch && whyMatch[1]) {
            result.reason = whyMatch[1].trim();
        }

        // Extract command (after **Command:** until **Working directory:**)
        const cmdMatch = message.match(/\*\*Command:\*\*\s*([\s\S]*?)(?=\*\*Working directory:\*\*|$)/);
        if (cmdMatch && cmdMatch[1]) {
            result.command = cmdMatch[1].trim();
        }

        // Extract working directory
        const wdMatch = message.match(/\*\*Working directory:\*\*\s*([\s\S]*?)$/);
        if (wdMatch && wdMatch[1]) {
            result.workdir = wdMatch[1].trim();
        }

        return result;
    };

    const commandInfo = request.message ? parseCommandMessage(request.message) : null;

    // Determine if we have expandable content
    const hasExpandableContent = commandInfo?.command || request.diff || (request.message && request.message.length > 120);

    // For non-command messages, show truncated preview
    const messagePreview = !commandInfo && request.message
        ? (request.message.length > 120 ? request.message.slice(0, 120) + '...' : request.message)
        : !commandInfo && request.context?.toolName
            ? `${request.context.toolName}: ${JSON.stringify(request.context.toolArgs || {}).slice(0, 80)}...`
            : '';

    return (
        <div className="confirmation-toast">
            <div className="toast-header">
                <div className="toast-info">
                    <span className="toast-conversation">{convTitle}</span>
                    <span className="toast-title">{request.title}</span>
                    {/* For command executions, show reason by default */}
                    {commandInfo?.reason && (
                        <span className="toast-preview">{commandInfo.reason}</span>
                    )}
                    {/* For non-command messages, show truncated preview */}
                    {messagePreview && (
                        <span className="toast-preview">{messagePreview}</span>
                    )}
                </div>
                <div className="toast-controls">
                    {/* Show expand button if there's more content */}
                    {hasExpandableContent && (
                        <button
                            className="toast-expand-btn"
                            onClick={() => setIsExpanded(!isExpanded)}
                            title={isExpanded ? 'Collapse' : 'Expand'}
                        >
                            {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        </button>
                    )}
                    <button
                        className="toast-close-btn"
                        onClick={() => onDismiss(convId)}
                        title="Dismiss"
                    >
                        <X size={14} />
                    </button>
                </div>
            </div>

            {isExpanded && (
                <div className="toast-body">
                    {/* For command executions, show the command block */}
                    {commandInfo?.command && (
                        <div className="toast-command-section">
                            <div className="toast-command-header">
                                <span className="toast-command-label">Command</span>
                                {commandInfo.workdir && (
                                    <code className="toast-workdir">
                                        in {commandInfo.workdir.replace(/^\/Users\/[^/]+/, '~')}
                                    </code>
                                )}
                            </div>
                            <pre className="toast-command-code">
                                <code>{commandInfo.command}</code>
                            </pre>
                        </div>
                    )}
                    {/* For non-command messages, show full message when expanded */}
                    {!commandInfo && request.message && request.message.length > 120 && (
                        <div className="toast-message">{request.message}</div>
                    )}
                    {request.diff && <DiffView diff={request.diff} />}
                </div>
            )}

            <div className="toast-actions">
                {request.options.slice(0, 2).map((option, idx) => (
                    <button
                        key={option.id}
                        className={getButtonClass(option)}
                        onClick={() => onRespond(convId, option.id)}
                        title={option.description}
                    >
                        <span className="btn-shortcut">{idx + 1}</span>
                        {option.label}
                    </button>
                ))}
            </div>
        </div>
    );
};

const MessageItem = ({ message }: { message: Message }) => {
    const isUser = message.role === 'user';

    return (
        <div className={`message ${isUser ? 'user-message' : 'assistant-message'}`}>
            <div className="message-label">
                {isUser ? 'You' : 'Panini'}
            </div>

            {/* Thoughts / Reasoning */}
            {message.thoughts && message.thoughts.length > 0 && (
                <ThoughtsSection thoughts={message.thoughts} isStreaming={message.isStreaming} />
            )}

            {/* Message Content */}
            {message.content ? (
                <div className="message-content">
                    <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>{message.content}</ReactMarkdown>
                </div>
            ) : message.isStreaming ? (
                <div className="message-content streaming">
                    <span className="streaming-dot" />
                    <span className="streaming-dot" />
                    <span className="streaming-dot" />
                </div>
            ) : null}
        </div>
    );
};

const ThoughtsSection = ({ thoughts, isStreaming }: { thoughts: Thought[], isStreaming?: boolean }) => {
    const [isExpanded, setIsExpanded] = useState(false);

    if (thoughts.length === 0) return null;

    const toolCallCount = thoughts.filter(t => t.type === 'tool_call').length;
    const thoughtCount = thoughts.filter(t => t.type === 'thought').length;

    // Get the most recent thought/tool_call for streaming preview
    const latestThought = thoughts.length > 0 ? thoughts[thoughts.length - 1] : null;

    // Build summary text
    const getSummary = () => {
        if (toolCallCount > 0) {
            return `${toolCallCount} step${toolCallCount > 1 ? 's' : ''} taken`;
        } else if (thoughtCount > 0) {
            return 'Reasoning';
        }
        return '';
    };

    // Render a single thought item (reusable for both expanded list and streaming preview)
    const renderThoughtItem = (thought: Thought, idx: number, isPreview: boolean = false) => {
        if (thought.type === 'thought' && thought.content) {
            return (
                <div key={thought.id} className={`thought-item reasoning ${thought.isInternalThought ? 'internal' : ''} ${isPreview ? 'preview' : ''}`}>
                    <div className="thought-step">💭</div>
                    <div className="thought-content">
                        <div className={`thought-reasoning ${thought.isInternalThought ? 'italic' : ''}`}>
                            {thought.content}
                        </div>
                    </div>
                </div>
            );
        } else if (thought.type === 'tool_call') {
            // Count tool call position (excluding reasoning thoughts)
            const toolCallIdx = thoughts.slice(0, idx).filter(t => t.type === 'tool_call').length + 1;
            const toolName = thought.toolName || '';
            const formattedArgs = formatToolArgs(toolName, thought.toolArgs);
            const friendlyToolName = {
                "view_file": "Read",
                "list_files": "List",
                "grep_files": "Search",
                "edit_file": "Edit",
                "write_file": "Write",
                "bash_command": "Shell",
            }[toolName] || formatToolName(toolName);

            // Check if this is an edit/write operation with diff info
            const isEditOp = toolName === 'edit_file' && thought.toolArgs?.old_string && thought.toolArgs?.new_string;
            const isWriteOp = toolName === 'write_file' && thought.toolArgs?.content;
            const isGrepOp = toolName === 'grep_files' && thought.toolResult;
            const isListOp = toolName === 'list_files' && thought.toolResult;
            const isBashOp = toolName === 'bash_command' && thought.toolArgs?.command;

            // Determine success/error status for step indicator
            const stepStatus = getToolResultStatus(thought.toolResult, toolName);

            return (
                <div key={thought.id} className={`thought-item ${isPreview ? 'preview' : ''}`}>
                    <div className={`thought-step ${stepStatus}`}>{toolCallIdx}</div>
                    <div className="thought-content">
                        <div className="thought-tool">
                            {friendlyToolName}
                            {formattedArgs && (
                                <span className="thought-args"> {formattedArgs}</span>
                            )}
                        </div>
                        {/* Show diff view for edit operations */}
                        {isEditOp && (
                            <ThoughtDiffView
                                oldText={thought.toolArgs.old_string}
                                newText={thought.toolArgs.new_string}
                            />
                        )}
                        {/* Show content preview for write operations */}
                        {isWriteOp && (
                            <ThoughtWriteView
                                content={thought.toolArgs.content}
                            />
                        )}
                        {/* Show formatted grep results */}
                        {isGrepOp && thought.toolResult && (
                            <GrepResultView result={thought.toolResult} />
                        )}
                        {/* Show formatted list results */}
                        {isListOp && thought.toolResult && (
                            <ListResultView result={thought.toolResult} />
                        )}
                        {/* Show bash command view */}
                        {isBashOp && (
                            <BashCommandView
                                command={thought.toolArgs.command}
                                justification={thought.toolArgs.justification}
                                cwd={thought.toolArgs.cwd}
                                result={thought.toolResult}
                            />
                        )}
                        {/* Show regular result for other tools */}
                        {!isEditOp && !isWriteOp && !isGrepOp && !isListOp && !isBashOp && thought.toolResult && (
                            <pre className="thought-result">
                                {thought.toolResult.slice(0, 200)}
                                {thought.toolResult.length > 200 && '...'}
                            </pre>
                        )}
                    </div>
                </div>
            );
        }
        return null;
    };

    return (
        <div className="thoughts-section">
            <button
                className="thoughts-toggle"
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <span className="thoughts-summary">
                    {getSummary()}
                </span>
                <ChevronDown
                    size={14}
                    className={`thoughts-chevron ${isExpanded ? 'expanded' : ''}`}
                />
            </button>

            {/* Show streaming preview of latest thought when not expanded */}
            {isStreaming && !isExpanded && latestThought && (
                <div className="thoughts-preview">
                    {renderThoughtItem(latestThought, thoughts.length - 1, true)}
                </div>
            )}

            {isExpanded && (
                <div className="thoughts-list">
                    {/* Render thoughts in the order they appear */}
                    {thoughts.map((thought, idx) => renderThoughtItem(thought, idx, false))}
                </div>
            )}
        </div>
    );
};

const formatToolName = (name: string): string => {
    return name
        .replace(/_/g, ' ')
        .replace(/\b\w/g, c => c.toUpperCase());
};

const formatToolArgs = (toolName: string, args: any): string => {
    if (!args || typeof args !== 'object') return '';

    // Tool-specific formatting for readability
    switch (toolName) {
        case 'view_file':
            if (args.offset || args.limit) {
                const offsetStr = args.offset ? `${args.offset}` : '1';
                const limitStr = args.limit ? `${args.offset + args.limit}` : '';
                const params = [offsetStr, limitStr].filter(Boolean).join('-');
                return `${args.path} (lines ${params})`;
            }
            return args.path || '';

        case 'list_files':
            if (args.path && args.pattern) {
                return `${args.path}/${args.pattern}`;
            }
            return args.path || args.pattern || '';

        case 'grep_files':
            const parts = [];
            if (args.pattern) parts.push(`"${args.pattern}"`);
            if (args.path) parts.push(`in ${args.path}`);
            if (args.include) parts.push(`(${args.include})`);
            return parts.join(' ');

        case 'edit_file':
        case 'write_file':
            return args.file_path || '';

        case 'bash_command':
            return args.justification || '';

        default:
            // Generic formatting: show key values in a readable way
            return Object.entries(args)
                .filter(([_, v]) => v !== undefined && v !== null && v !== '')
                .map(([k, v]) => {
                    if (typeof v === 'string' && v.length > 50) {
                        return `${k}: "${v.slice(0, 47)}..."`;
                    }
                    return typeof v === 'string' ? `${k}: "${v}"` : `${k}: ${v}`;
                })
                .join(', ');
    }
};

/**
 * Format tool calls for sidebar subtitle display
 * Uses the same friendly names and formatting as the train of thought display
 */
const formatToolCallsForSidebar = (toolCalls: any[]): string => {
    if (!toolCalls || toolCalls.length === 0) return '';

    const friendlyNames: Record<string, string> = {
        "view_file": "Read",
        "list_files": "List",
        "grep_files": "Search",
        "edit_file": "Edit",
        "write_file": "Write",
        "bash_command": "Shell",
        "read_file": "Read",
        "text": "Respond",
    };

    // Format each tool call with friendly name and key argument
    const formatted = toolCalls.map(tc => {
        const toolName = tc.function_name || '';
        const friendly = friendlyNames[toolName] || formatToolName(toolName);
        const args = tc.arguments || {};

        // Get a concise description of what's being done
        let detail = '';
        switch (toolName) {
            case 'view_file':
            case 'read_file':
                detail = args.path ? ` ${getFileName(args.path)}` : '';
                break;
            case 'list_files':
                detail = args.path ? ` ${args.path}` : '';
                break;
            case 'grep_files':
                detail = args.pattern ? ` "${args.pattern}"` : '';
                break;
            case 'edit_file':
            case 'write_file':
                detail = args.file_path ? ` ${getFileName(args.file_path)}` : '';
                break;
            case 'bash_command':
                detail = args.justification ? ` ${args.justification}` : '';
                break;
        }

        return `${friendly}${detail}`;
    });

    // Join multiple tool calls
    return formatted.join(', ');
};

/** Extract filename from path */
const getFileName = (path: string): string => {
    if (!path) return '';
    const parts = path.split('/');
    return parts[parts.length - 1] || path;
};

/**
 * Compact diff view for edit operations in thoughts section
 */
const ThoughtDiffView = ({ oldText, newText }: { oldText: string; newText: string }) => {
    const diffLines = computeUnifiedDiff(oldText, newText);
    const maxLines = 10;
    const truncated = diffLines.length > maxLines;
    const displayLines = truncated ? diffLines.slice(0, maxLines) : diffLines;

    return (
        <div className="thought-diff">
            {displayLines.map((line, idx) => (
                <div key={idx} className={`thought-diff-line ${line.type}`}>
                    <span className="thought-diff-indicator">
                        {line.type === 'removed' ? '−' : line.type === 'added' ? '+' : ' '}
                    </span>
                    <span className="thought-diff-content">{line.content || ' '}</span>
                </div>
            ))}
            {truncated && (
                <div className="thought-diff-truncated">
                    ... {diffLines.length - maxLines} more lines
                </div>
            )}
        </div>
    );
};

/**
 * Compact content preview for write operations in thoughts section
 */
const ThoughtWriteView = ({ content }: { content: string }) => {
    const lines = content.split('\n');
    const maxLines = 8;
    const truncated = lines.length > maxLines;
    const displayLines = truncated ? lines.slice(0, maxLines) : lines;

    return (
        <div className="thought-diff">
            {displayLines.map((line, idx) => (
                <div key={idx} className="thought-diff-line added">
                    <span className="thought-diff-indicator">+</span>
                    <span className="thought-diff-content">{line || ' '}</span>
                </div>
            ))}
            {truncated && (
                <div className="thought-diff-truncated">
                    ... {lines.length - maxLines} more lines
                </div>
            )}
        </div>
    );
};

/**
 * Formatted grep results view for the thoughts section
 * Groups results by file with filename as heading and line numbers in gutter
 */
const GrepResultView = ({ result }: { result: string }) => {
    const lines = result.split('\n').filter(Boolean);

    // Parse grep result line: /full/path/to/file:linenum:matched text (or -text for context)
    type ParsedLine = { filename: string; lineNum: string; text: string; isMatch: boolean };

    const parseLine = (line: string): ParsedLine | null => {
        const match = line.match(/^(.+?):(\d+)([:|-])(.*)$/);
        if (match && match[1] && match[2] && match[3] && match[4] !== undefined) {
            const fullPath = match[1];
            const lineNum = match[2];
            const separator = match[3];
            const text = match[4];
            const filename = fullPath.split('/').pop() || fullPath;
            const isMatch = separator === ':';
            return { filename, lineNum, text, isMatch };
        }
        return null;
    };

    // Group lines by filename
    type FileGroup = { filename: string; lines: Array<{ lineNum: string; text: string; isMatch: boolean }> };
    const fileGroups: FileGroup[] = [];
    let currentGroup: FileGroup | null = null;

    for (const line of lines) {
        if (!line || line === '--') continue;
        const parsed = parseLine(line);
        if (parsed) {
            if (!currentGroup || currentGroup.filename !== parsed.filename) {
                currentGroup = { filename: parsed.filename, lines: [] };
                fileGroups.push(currentGroup);
            }
            currentGroup.lines.push({ lineNum: parsed.lineNum, text: parsed.text, isMatch: parsed.isMatch });
        }
    }

    // Calculate total lines for truncation message
    const totalLines = fileGroups.reduce((sum, g) => sum + g.lines.length, 0);
    const maxTotalLines = 12;
    let lineCount = 0;
    let truncated = false;

    return (
        <div className="thought-grep">
            {fileGroups.map((group, groupIdx) => {
                if (lineCount >= maxTotalLines) {
                    truncated = true;
                    return null;
                }

                const remainingLines = maxTotalLines - lineCount;
                const linesToShow = group.lines.slice(0, remainingLines);
                lineCount += linesToShow.length;

                if (linesToShow.length < group.lines.length) {
                    truncated = true;
                }

                return (
                    <div key={groupIdx} className="grep-file-group">
                        <div className="grep-file-header">{group.filename}</div>
                        {linesToShow.map((line, lineIdx) => (
                            <div key={lineIdx} className={`grep-result-line ${line.isMatch ? 'match' : 'context'}`}>
                                <span className="grep-line-num">{line.lineNum}</span>
                                <span className="grep-text">{line.text}</span>
                            </div>
                        ))}
                    </div>
                );
            })}
            {truncated && (
                <div className="grep-result-truncated">
                    ... {totalLines - maxTotalLines} more matches
                </div>
            )}
        </div>
    );
};

/**
 * Formatted list files view for the thoughts section
 * Groups files by directory with directory as heading and filenames below
 */
const ListResultView = ({ result }: { result: string }) => {
    const lines = result.split('\n').filter(Boolean);

    // Parse list result line: "- /full/path/to/file"
    type ParsedFile = { dir: string; filename: string; fullPath: string };

    const parseFile = (line: string): ParsedFile | null => {
        // Match lines starting with "- " followed by a path
        const match = line.match(/^- (.+)$/);
        if (match && match[1]) {
            const fullPath = match[1];
            const lastSlash = fullPath.lastIndexOf('/');
            if (lastSlash >= 0) {
                const dir = fullPath.substring(0, lastSlash) || '/';
                const filename = fullPath.substring(lastSlash + 1);
                return { dir, filename, fullPath };
            }
            return { dir: '', filename: fullPath, fullPath };
        }
        return null;
    };

    // Group files by full directory path (not short name) using a Map
    const dirMap = new Map<string, Array<{ filename: string; fullPath: string }>>();
    let truncationMessage = '';

    for (const line of lines) {
        if (!line) continue;
        // Check for truncation message
        if (line.startsWith('...')) {
            truncationMessage = line;
            continue;
        }
        const parsed = parseFile(line);
        if (parsed) {
            // Use full dir path as key to keep different directories separate
            const existing = dirMap.get(parsed.dir);
            if (existing) {
                existing.push({ filename: parsed.filename, fullPath: parsed.fullPath });
            } else {
                dirMap.set(parsed.dir, [{ filename: parsed.filename, fullPath: parsed.fullPath }]);
            }
        }
    }

    // Convert to array and sort by directory name
    type DirGroup = { dir: string; displayDir: string; files: Array<{ filename: string; fullPath: string }> };

    // Get a short display name for directory
    const getShortDir = (dir: string): string => {
        const parts = dir.split('/').filter(Boolean);
        // Show last 2-3 parts of the path
        if (parts.length <= 2) return dir;
        return '.../' + parts.slice(-2).join('/');
    };

    const dirGroups: DirGroup[] = Array.from(dirMap.entries())
        .map(([dir, files]) => ({ dir, displayDir: getShortDir(dir), files }))
        .sort((a, b) => a.dir.localeCompare(b.dir));

    // Calculate total files for truncation message
    const totalFiles = dirGroups.reduce((sum, g) => sum + g.files.length, 0);

    // Limit total files shown
    const maxTotalFiles = 15;
    let fileCount = 0;
    let truncated = false;

    return (
        <div className="thought-list">
            {dirGroups.map((group) => {
                if (fileCount >= maxTotalFiles) {
                    truncated = true;
                    return null;
                }

                const remainingFiles = maxTotalFiles - fileCount;
                const filesToShow = group.files.slice(0, remainingFiles);
                fileCount += filesToShow.length;

                if (filesToShow.length < group.files.length) {
                    truncated = true;
                }

                return (
                    <div key={group.dir} className="list-dir-group">
                        <div className="list-dir-header">{group.displayDir}</div>
                        {filesToShow.map((file, fileIdx) => (
                            <div key={fileIdx} className="list-file-item">
                                <span className="list-file-name">{file.filename}</span>
                            </div>
                        ))}
                    </div>
                );
            })}
            {(truncated || truncationMessage) && (
                <div className="list-result-truncated">
                    {truncationMessage || `... ${totalFiles - maxTotalFiles} more files`}
                </div>
            )}
        </div>
    );
};

/**
 * Bash command view for the thoughts section
 * Shows command, justification, working directory, and output
 */
const BashCommandView = ({ command, justification, cwd, result }: {
    command: string;
    justification?: string;
    cwd?: string;
    result?: string;
}) => {
    const [expanded, setExpanded] = useState(false);
    const hasOutput = result && result.length > 0;
    const isError = result?.toLowerCase().includes('error') ||
                    result?.toLowerCase().includes('cancelled') ||
                    result?.includes('[Exit code:');
    const outputPreview = result?.slice(0, 150) || '';
    const needsTruncation = result && result.length > 150;

    // Shorten home directory path for display
    const displayCwd = cwd?.replace(/^\/Users\/[^/]+/, '~') || '~';

    return (
        <div className="thought-bash">
            <div className="bash-command-block">
                <div className="bash-command-header">
                    <code className="bash-cwd">{displayCwd}</code>
                    <span className="bash-prompt">$</span>
                </div>
                <pre className="bash-command-text"><code>{command}</code></pre>
            </div>
            {hasOutput && (
                <div className={`bash-output ${isError ? 'error' : 'success'}`}>
                    <div
                        className="bash-output-header"
                        onClick={() => needsTruncation && setExpanded(!expanded)}
                        style={{ cursor: needsTruncation ? 'pointer' : 'default' }}
                    >
                        <span className="bash-label">Output</span>
                        {needsTruncation && (
                            <span className="bash-expand-hint">
                                {expanded ? '▼ collapse' : '▶ expand'}
                            </span>
                        )}
                    </div>
                    <pre className="bash-output-text">
                        {expanded ? result : outputPreview}
                        {!expanded && needsTruncation && '...'}
                    </pre>
                </div>
            )}
        </div>
    );
};

/**
 * Determine if a tool result indicates success or failure
 */
const getToolResultStatus = (toolResult: string | undefined, toolName: string | undefined): 'success' | 'error' | 'neutral' => {
    if (!toolResult) return 'neutral';

    const lowerResult = toolResult.toLowerCase();

    // Tool-specific success indicators
    if (toolName === 'edit_file' || toolName === 'write_file') {
        if (lowerResult.includes('success') || lowerResult.includes('updated') || lowerResult.includes('created') || lowerResult.includes('wrote')) {
            return 'success';
        } else {
            return 'error';
        }
    }

    // For read/list/grep, having content usually means success
    if (toolName === 'view_file' || toolName === 'list_files' || toolName === 'grep_files') {
        if (toolResult.length > 0 && !lowerResult.startsWith('error')) {
            return 'success';
        } else {
            return 'error';
        }
    }

    // For bash_command, check for errors or non-zero exit codes
    if (toolName === 'bash_command') {
        if (lowerResult.includes('cancelled') || lowerResult.includes('[exit code:') || lowerResult.startsWith('error')) {
            return 'error';
        }
        return 'success';
    }

    return 'neutral';
};

/**
 * Compute unified diff lines from old and new text
 * Returns lines with type: 'context' | 'removed' | 'added'
 */
function computeUnifiedDiff(oldText: string, newText: string): Array<{ type: 'context' | 'removed' | 'added'; content: string }> {
    const oldLines = oldText.split('\n');
    const newLines = newText.split('\n');
    const result: Array<{ type: 'context' | 'removed' | 'added'; content: string }> = [];

    // Simple LCS-based diff
    const lcs = computeLCS(oldLines, newLines);

    let oldIdx = 0;
    let newIdx = 0;
    let lcsIdx = 0;

    while (oldIdx < oldLines.length || newIdx < newLines.length) {
        const oldLine = oldLines[oldIdx];
        const newLine = newLines[newIdx];
        const lcsLine = lcs[lcsIdx];

        if (lcsIdx < lcs.length && oldIdx < oldLines.length && oldLine === lcsLine) {
            // This line is in both - check if new also matches
            if (newIdx < newLines.length && newLine === lcsLine) {
                result.push({ type: 'context', content: oldLine ?? '' });
                oldIdx++;
                newIdx++;
                lcsIdx++;
            } else if (newLine !== undefined) {
                // New has different line before matching LCS
                result.push({ type: 'added', content: newLine });
                newIdx++;
            }
        } else if (oldIdx < oldLines.length && oldLine !== undefined && (lcsIdx >= lcs.length || oldLine !== lcsLine)) {
            // Old line not in LCS - it was removed
            result.push({ type: 'removed', content: oldLine });
            oldIdx++;
        } else if (newIdx < newLines.length && newLine !== undefined) {
            // New line not yet processed
            result.push({ type: 'added', content: newLine });
            newIdx++;
        } else {
            // Safety break to prevent infinite loop
            break;
        }
    }

    return result;
}

/**
 * Compute Longest Common Subsequence of two string arrays
 */
function computeLCS(a: string[], b: string[]): string[] {
    const m = a.length;
    const n = b.length;
    const dp: number[][] = [];
    for (let i = 0; i <= m; i++) {
        const row: number[] = [];
        for (let j = 0; j <= n; j++) {
            row[j] = 0;
        }
        dp[i] = row;
    }

    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            const aVal = a[i - 1];
            const bVal = b[j - 1];
            const prevDiag = dp[i - 1]?.[j - 1] ?? 0;
            const prevUp = dp[i - 1]?.[j] ?? 0;
            const prevLeft = dp[i]?.[j - 1] ?? 0;

            if (aVal === bVal) {
                dp[i][j] = prevDiag + 1;
            } else {
                dp[i][j] = Math.max(prevUp, prevLeft);
            }
        }
    }

    // Backtrack to find LCS
    const lcs: string[] = [];
    let i = m, j = n;
    while (i > 0 && j > 0) {
        const aVal = a[i - 1];
        const bVal = b[j - 1];
        const prevUp = dp[i - 1]?.[j] ?? 0;
        const prevLeft = dp[i]?.[j - 1] ?? 0;

        if (aVal === bVal && aVal !== undefined) {
            lcs.unshift(aVal);
            i--;
            j--;
        } else if (prevUp > prevLeft) {
            i--;
        } else {
            j--;
        }
    }

    return lcs;
}

/**
 * Diff View Component
 * Shows unified inline diff of changes that will be made to a file
 */
const DiffView = ({ diff }: { diff: DiffInfo }) => {
    // For edit operations, show unified inline diff with file path
    if (diff.oldText !== undefined && diff.newText !== undefined) {
        const diffLines = computeUnifiedDiff(diff.oldText, diff.newText);

        return (
            <div className="diff-container">
                <div className="diff-file-header">
                    <span className="diff-file-path">{diff.filePath}</span>
                </div>
                <div className="diff-inline">
                    {diffLines.map((line, idx) => (
                        <div key={idx} className={`diff-line ${line.type}`}>
                            <span className="diff-line-indicator">
                                {line.type === 'removed' ? '−' : line.type === 'added' ? '+' : ' '}
                            </span>
                            <span className="diff-line-content">{line.content || ' '}</span>
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    // For write operations, show the content (truncated if too long)
    if (diff.newText !== undefined) {
        const lines = diff.newText.split('\n');
        const maxLines = 20;
        const truncated = lines.length > maxLines;
        const displayLines = truncated ? lines.slice(0, maxLines) : lines;

        return (
            <div className="diff-container">
                <div className="diff-file-header">
                    <span className="diff-file-path">{diff.filePath}</span>
                    <span className="diff-meta">
                        {diff.isNewFile ? '(new file)' : '(overwrite)'} • {lines.length} lines
                    </span>
                </div>
                <div className="diff-inline">
                    {displayLines.map((line, idx) => (
                        <div key={idx} className="diff-line added">
                            <span className="diff-line-indicator">+</span>
                            <span className="diff-line-content">{line || ' '}</span>
                        </div>
                    ))}
                </div>
                {truncated && (
                    <div className="diff-meta">
                        ... {lines.length - maxLines} more lines
                    </div>
                )}
            </div>
        );
    }

    return null;
};

/**
 * Confirmation Dialog Component
 * Displays a modal dialog for user confirmation of dangerous operations
 * Positioned above the chat input with keyboard shortcuts (1, 2, 3)
 */
const ConfirmationDialog = ({
    request,
    onRespond,
}: {
    request: ConfirmationRequest;
    onRespond: (optionId: string) => void;
}) => {
    // Handle keyboard shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Number keys 1, 2, 3 for quick selection
            const keyNum = parseInt(e.key);
            if (keyNum >= 1 && keyNum <= request.options.length) {
                e.preventDefault();
                const option = request.options[keyNum - 1];
                if (option) {
                    onRespond(option.id);
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [request.options, onRespond]);

    // Get button style class based on option style
    const getButtonClass = (option: ConfirmationOption): string => {
        const baseClass = 'confirmation-btn';
        switch (option.style) {
            case 'primary':
                return `${baseClass} primary`;
            case 'danger':
                return `${baseClass} danger`;
            case 'warning':
                return `${baseClass} warning`;
            default:
                return `${baseClass} secondary`;
        }
    };

    // Get risk level badge class
    const getRiskBadgeClass = (level?: string): string => {
        switch (level) {
            case 'high':
                return 'risk-badge high';
            case 'medium':
                return 'risk-badge medium';
            case 'low':
                return 'risk-badge low';
            default:
                return 'risk-badge';
        }
    };

    // Parse command execution message into structured sections
    const parseCommandMessage = (message: string): { reason?: string; command?: string; workdir?: string } | null => {
        if (!message.includes('**Why:**') && !message.includes('**Command:**')) {
            return null;
        }
        const result: { reason?: string; command?: string; workdir?: string } = {};

        // Extract reason (after **Why:** until **Command:**)
        const whyMatch = message.match(/\*\*Why:\*\*\s*([\s\S]*?)(?=\*\*Command:\*\*|$)/);
        if (whyMatch && whyMatch[1]) {
            result.reason = whyMatch[1].trim();
        }

        // Extract command (after **Command:** until **Working directory:**)
        const cmdMatch = message.match(/\*\*Command:\*\*\s*([\s\S]*?)(?=\*\*Working directory:\*\*|$)/);
        if (cmdMatch && cmdMatch[1]) {
            result.command = cmdMatch[1].trim();
        }

        // Extract working directory
        const wdMatch = message.match(/\*\*Working directory:\*\*\s*([\s\S]*?)$/);
        if (wdMatch && wdMatch[1]) {
            result.workdir = wdMatch[1].trim();
        }

        return result;
    };

    const commandInfo = request.message ? parseCommandMessage(request.message) : null;

    return (
        <div className="confirmation-container">
            <div className="confirmation-dialog">
                <div className="confirmation-header">
                    <h3 className="confirmation-title">{request.title}</h3>
                    {request.context?.riskLevel && (
                        <span className={getRiskBadgeClass(request.context.riskLevel)}>
                            {request.context.riskLevel} risk
                        </span>
                    )}
                </div>

                <div className="confirmation-body">
                    {/* Structured command execution view */}
                    {commandInfo ? (
                        <div className="command-confirmation">
                            {commandInfo.reason && (
                                <div className="command-section">
                                    <div className="command-section-label">Reason</div>
                                    <div className="command-section-content reason-content">
                                        {commandInfo.reason}
                                    </div>
                                </div>
                            )}
                            {commandInfo.command && (
                                <div className="command-section">
                                    <div className="command-section-header">
                                        <span className="command-section-label">Command</span>
                                        {commandInfo.workdir && (
                                            <code className="workdir-pill" title={commandInfo.workdir}>
                                                in {commandInfo.workdir.replace(/^\/Users\/[^/]+/, '~')}
                                            </code>
                                        )}
                                    </div>
                                    <pre className="command-section-content command-content">
                                        <code>{commandInfo.command}</code>
                                    </pre>
                                </div>
                            )}
                        </div>
                    ) : request.message ? (
                        /* Fallback: plain message for non-command operations */
                        <div className="confirmation-message">
                            {request.message.split('\n').map((line, idx) => (
                                <p key={idx}>{line || <br />}</p>
                            ))}
                        </div>
                    ) : null}

                    {/* Diff view for showing changes */}
                    {request.diff && <DiffView diff={request.diff} />}

                    {/* File path if no diff and no message */}
                    {!request.diff && !request.message && request.context?.affectedFiles && request.context.affectedFiles.length > 0 && (
                        <div className="confirmation-files">
                            <span className="files-label">Affected files:</span>
                            <ul className="files-list">
                                {request.context.affectedFiles.map((file, idx) => (
                                    <li key={idx} className="file-item">{file}</li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>

                <div className="confirmation-actions">
                    {request.options.map((option, index) => (
                        <button
                            key={option.id}
                            className={getButtonClass(option)}
                            onClick={() => onRespond(option.id)}
                            title={`${option.description} (Press ${index + 1})`}
                        >
                            <span className="btn-shortcut">{index + 1}</span>
                            {option.label}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
};

const root = createRoot(document.getElementById("root")!);
root.render(<App />);
