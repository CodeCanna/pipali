// Message input area with model selector, file attachment, connection status, and send/stop controls

import React, { useEffect, useRef } from 'react';
import { ArrowUp, Square, Upload, X, FileText, FileSpreadsheet, File, Paperclip, ChevronDown, Check, Circle } from 'lucide-react';
import type { ConfirmationRequest, ChatModelInfo } from '../../types';
import type { StagedFile } from '../../hooks/useFileDrop';
import { ConfirmationDialog } from '../confirmation/ConfirmationDialog';
import { formatFileSize } from '../../utils/formatting';
import { localImageSrc } from '../../utils/markdown';
import { getApiBaseUrl } from '../../utils/api';
import { isTauri } from '../../utils/tauri';

interface InputAreaProps {
    input: string;
    onInputChange: (value: string) => void;
    onSubmit: (e?: React.FormEvent) => void;
    onKeyDown: (e: React.KeyboardEvent) => void;
    isConnected: boolean;
    isProcessing: boolean;
    isStopped: boolean;
    conversationId?: string;
    onStop: () => void;
    pendingConfirmation?: ConfirmationRequest;
    onConfirmationRespond: (optionId: string, guidance?: string) => void;
    textareaRef: React.RefObject<HTMLTextAreaElement | null>;
    onBackgroundSend?: () => void;
    stagedFiles?: StagedFile[];
    isDragging?: boolean;
    onRemoveFile?: (id: string) => void;
    onPasteFiles?: (files: File[]) => void;
    onPickFiles?: (browserFiles?: File[]) => void;
    models: ChatModelInfo[];
    selectedModel: ChatModelInfo | null;
    showModelDropdown: boolean;
    setShowModelDropdown: (show: boolean) => void;
    onSelectModel: (model: ChatModelInfo) => void;
}

const IS_MAC = /Mac|iPhone|iPad|iPod/.test(navigator.platform);
const SHORTCUT_KEY = IS_MAC ? 'Cmd' : 'Ctrl';

const HOME_HINTS = [
    `Tip: Use ${SHORTCUT_KEY}+Enter to start task in background`,
];
const CHAT_HINTS = [
    `Tip: Use ${SHORTCUT_KEY}+Enter to fork this conversation`,
];

function pickRandom(arr: string[]): string {
    return arr[Math.floor(Math.random() * arr.length)] as string;
}

const SPREADSHEET_EXTS = ['.xlsx', '.xls', '.csv'];
const TEXT_EXTS = ['.txt', '.md', '.json', '.xml', '.yaml', '.yml', '.toml', '.log'];

function getFileIcon(fileName: string) {
    const dot = fileName.lastIndexOf('.');
    if (dot === -1) return <File size={20} />;
    const ext = fileName.slice(dot).toLowerCase();
    if (SPREADSHEET_EXTS.includes(ext)) return <FileSpreadsheet size={20} />;
    if (TEXT_EXTS.includes(ext)) return <FileText size={20} />;
    return <File size={20} />;
}

export function InputArea({
    input,
    onInputChange,
    onSubmit,
    onKeyDown,
    isConnected,
    isProcessing,
    isStopped,
    conversationId,
    onStop,
    pendingConfirmation,
    onConfirmationRespond,
    textareaRef,
    onBackgroundSend,
    stagedFiles = [],
    isDragging = false,
    onRemoveFile,
    onPasteFiles,
    onPickFiles,
    models,
    selectedModel,
    showModelDropdown,
    setShowModelDropdown,
    onSelectModel,
}: InputAreaProps) {
    const hasFiles = stagedFiles.length > 0;
    const canSend = input.trim() || hasFiles;
    const fileInputRef = useRef<HTMLInputElement>(null);
    const modelDropdownRef = useRef<HTMLDivElement>(null);
    const showHint = useRef(Math.random() < 0.05).current;
    const placeholder = !showHint
        ? 'Ask anything'
        : pickRandom(conversationId ? CHAT_HINTS : HOME_HINTS);

    // Close model dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (modelDropdownRef.current && !modelDropdownRef.current.contains(e.target as Node)) {
                setShowModelDropdown(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [setShowModelDropdown]);

    // Auto-resize textarea
    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 200) + 'px';
        }
    }, [input, textareaRef]);

    return (
        <footer className="input-area">
            {/* Drop zone overlay */}
            {isDragging && (
                <div className="drop-zone-overlay">
                    <div className="drop-zone-inner">
                        <Upload size={32} />
                        <p>Drop files here</p>
                    </div>
                </div>
            )}

            {/* Confirmation Dialog - positioned above chat input for current conversation */}
            {pendingConfirmation && (
                <ConfirmationDialog
                    request={pendingConfirmation}
                    onRespond={onConfirmationRespond}
                />
            )}

            <div className="input-container">
                <form onSubmit={onSubmit} className="input-form">
                    {/* Staged file chips */}
                    {hasFiles && (
                        <div className="staged-files">
                            {stagedFiles.map(file => (
                                <div key={file.id} className="staged-file-chip">
                                    {file.isImage ? (
                                        <img
                                            src={localImageSrc(file.filePath, getApiBaseUrl()) || ''}
                                            alt={file.fileName}
                                            className="file-thumbnail"
                                        />
                                    ) : (
                                        <span className="file-icon">{getFileIcon(file.fileName)}</span>
                                    )}
                                    <span className="file-info">
                                        <span className="file-name" title={file.fileName}>{file.fileName}</span>
                                        <span className="file-size">{formatFileSize(file.sizeBytes)}</span>
                                    </span>
                                    <button
                                        type="button"
                                        className="remove-file"
                                        onClick={() => onRemoveFile?.(file.id)}
                                        title="Remove file"
                                    >
                                        <X size={14} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}

                    <textarea
                        ref={textareaRef}
                        value={input}
                        onChange={(e) => onInputChange(e.target.value)}
                        onPaste={(e) => {
                            const files = e.clipboardData?.files;
                            if (files && files.length > 0) {
                                e.preventDefault();
                                onPasteFiles?.([...files]);
                            }
                        }}
                        onKeyDown={(e) => {
                            // Cmd+Enter (Mac) or Ctrl+Enter (Windows/Linux): background task
                            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !e.shiftKey) {
                                e.preventDefault();
                                onBackgroundSend?.();
                                return;
                            }
                            // Pass through to parent handler for other cases
                            onKeyDown(e);
                        }}
                        placeholder={
                            isStopped
                                ? "Stopped. Type a new message..."
                                : isProcessing
                                    ? "Type to interrupt with a message..."
                                    : placeholder
                        }
                        rows={1}
                        disabled={!isConnected}
                        autoFocus
                    />

                    {/* Divider between textarea and toolbar */}
                    <div className="input-divider" />

                    {/* Toolbar row: status + model selector (left), attach + send/stop (right) */}
                    <div className="input-toolbar">
                        <div className="input-toolbar-left">
                            <Circle
                                className={`status-dot ${isConnected ? 'connected' : 'disconnected'}`}
                                size={8}
                                fill="currentColor"
                            />

                            {/* Model selector */}
                            <div className="model-selector" ref={modelDropdownRef}>
                                <button
                                    type="button"
                                    className="model-selector-btn"
                                    onClick={() => setShowModelDropdown(!showModelDropdown)}
                                >
                                    <span className="model-name">
                                        {selectedModel?.friendlyName || selectedModel?.name || 'Select model'}
                                    </span>
                                    <ChevronDown size={12} className={showModelDropdown ? 'rotated' : ''} />
                                </button>

                                {showModelDropdown && (
                                    <div className="model-dropdown">
                                        {models.length === 0 ? (
                                            <div className="model-dropdown-empty">
                                                No models available
                                            </div>
                                        ) : (
                                            models.map(model => (
                                                <button
                                                    key={model.id}
                                                    type="button"
                                                    className={`model-option ${selectedModel?.id === model.id ? 'selected' : ''}`}
                                                    onClick={() => onSelectModel(model)}
                                                >
                                                    <span className="model-option-name">
                                                        {model.friendlyName || model.name}
                                                    </span>
                                                    {selectedModel?.id === model.id && <Check size={14} />}
                                                </button>
                                            ))
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                        <div className="input-toolbar-right">
                            <input
                                ref={fileInputRef}
                                type="file"
                                multiple
                                className="hidden-file-input"
                                onChange={(e) => {
                                    const files = e.target.files;
                                    if (files && files.length > 0) {
                                        onPickFiles?.([...files]);
                                    }
                                    e.target.value = '';
                                }}
                            />
                            <button
                                type="button"
                                className="toolbar-button"
                                onClick={() => isTauri() ? onPickFiles?.() : fileInputRef.current?.click()}
                                title="Attach files"
                            >
                                <Paperclip size={16} />
                            </button>
                            {isProcessing ? (
                                canSend ? (
                                    <button
                                        type="submit"
                                        disabled={!isConnected}
                                        className="action-button send"
                                        title="Send message (soft interrupt)"
                                    >
                                        <ArrowUp size={16} />
                                    </button>
                                ) : (
                                    <button
                                        type="button"
                                        onClick={onStop}
                                        className="action-button stop"
                                        title="Stop (Esc)"
                                    >
                                        <Square size={16} />
                                    </button>
                                )
                            ) : (
                                <button
                                    type="submit"
                                    disabled={!canSend || !isConnected}
                                    className="action-button send"
                                >
                                    <ArrowUp size={16} />
                                </button>
                            )}
                        </div>
                    </div>
                </form>
            </div>
        </footer>
    );
}
