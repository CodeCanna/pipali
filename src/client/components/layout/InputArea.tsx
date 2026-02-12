// Message input area with send/stop controls and file attachment support

import React, { useEffect } from 'react';
import { ArrowUp, Square, Upload, X, FileText, FileSpreadsheet, File } from 'lucide-react';
import type { ConfirmationRequest } from '../../types';
import type { StagedFile } from '../../hooks/useFileDrop';
import { ConfirmationDialog } from '../confirmation/ConfirmationDialog';
import { formatFileSize } from '../../utils/formatting';
import { localImageSrc } from '../../utils/markdown';
import { getApiBaseUrl } from '../../utils/api';

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
}: InputAreaProps) {
    const hasFiles = stagedFiles.length > 0;
    const canSend = input.trim() || hasFiles;

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
                                    : "Ask anything..."
                        }
                        rows={1}
                        disabled={!isConnected}
                        autoFocus
                    />
                    <div className="input-buttons">
                        {/* Single action button: Send / Stop */}
                        {isProcessing ? (
                            canSend ? (
                                <button
                                    type="submit"
                                    disabled={!isConnected}
                                    className="action-button send"
                                    title="Send message (soft interrupt)"
                                >
                                    <ArrowUp size={18} />
                                </button>
                            ) : (
                                <button
                                    type="button"
                                    onClick={onStop}
                                    className="action-button stop"
                                    title="Stop (Esc)"
                                >
                                    <Square size={18} />
                                </button>
                            )
                        ) : (
                            <button
                                type="submit"
                                disabled={!canSend || !isConnected}
                                className="action-button send"
                            >
                                <ArrowUp size={18} />
                            </button>
                        )}
                    </div>
                </form>
                <p className="input-hint">
                    {isStopped
                        ? "Stopped. Send a new message to start a new run."
                        : isProcessing
                            ? "Type to interrupt, or press Esc to stop"
                            : `Enter to send, ${navigator.platform.indexOf('Mac') !== -1 ? 'Cmd' : 'Ctrl'}+Enter to ${conversationId ? 'fork conversation' : 'to run in background'}`
                    }
                </p>
            </div>
        </footer>
    );
}
