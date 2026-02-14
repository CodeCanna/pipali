import React from 'react';
import { apiFetch } from '../utils/api';

interface ErrorBoundaryProps {
    children: React.ReactNode;
    /** Optional fallback to render instead of the default error UI */
    fallback?: React.ReactNode;
}

interface ErrorBoundaryState {
    hasError: boolean;
    error: Error | null;
    copied: boolean;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
    constructor(props: ErrorBoundaryProps) {
        super(props);
        this.state = { hasError: false, error: null, copied: false };
    }

    static getDerivedStateFromError(error: Error): ErrorBoundaryState {
        return { hasError: true, error, copied: false };
    }

    override componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
        console.error('ErrorBoundary caught an error:', error, errorInfo);

        // Report to server telemetry
        apiFetch('/api/telemetry/client-error', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message: error.toString(),
                stack: error.stack,
                url: window.location.href,
                componentStack: errorInfo.componentStack,
            }),
        }).catch(() => {});
    }

    getErrorReport = (): string => {
        const error = this.state.error;
        if (!error) return '';
        const lines = [
            `**Error:** ${error.toString()}`,
            '',
            `**URL:** ${window.location.href}`,
            `**Time:** ${new Date().toISOString()}`,
        ];
        if (error.stack) {
            lines.push('', '**Stack Trace:**', '```', error.stack, '```');
        }
        return lines.join('\n');
    };

    handleCopyError = async () => {
        const report = this.getErrorReport();
        try {
            await navigator.clipboard.writeText(report);
            this.setState({ copied: true });
            setTimeout(() => this.setState({ copied: false }), 2000);
        } catch {
            // Fallback: select the pre element text for manual copy
            const pre = document.querySelector('.error-boundary-stack');
            if (pre) {
                const range = document.createRange();
                range.selectNodeContents(pre);
                const selection = window.getSelection();
                selection?.removeAllRanges();
                selection?.addRange(range);
            }
        }
    };

    handleReload = () => {
        window.location.reload();
    };

    override render() {
        if (this.state.hasError) {
            if (this.props.fallback) return this.props.fallback;

            return (
                <div className="error-boundary-container">
                    <div className="error-boundary-content">
                        <h1 className="error-boundary-title">Something went wrong</h1>
                        <p className="error-boundary-message">
                            The application encountered an unexpected error. Copy the details below and share them with the developers to help fix this.
                        </p>
                        <div className="error-boundary-actions">
                            <button
                                className="error-boundary-copy"
                                onClick={this.handleCopyError}
                            >
                                {this.state.copied ? 'Copied!' : 'Copy Error Details'}
                            </button>
                            <button
                                className="error-boundary-reload"
                                onClick={this.handleReload}
                            >
                                Reload
                            </button>
                        </div>
                        {this.state.error && (
                            <details className="error-boundary-details">
                                <summary className="error-boundary-summary">Error details</summary>
                                <pre className="error-boundary-stack">
                                    {this.state.error.toString()}
                                    {this.state.error.stack && `\n\n${this.state.error.stack}`}
                                </pre>
                            </details>
                        )}
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}
