// Empty state when no MCP servers are configured

import { Hammer } from 'lucide-react';

interface McpToolsEmptyProps {
    onAddServer: () => void;
}

export function McpToolsEmpty({ onAddServer }: McpToolsEmptyProps) {
    return (
        <div className="empty-state mcp-tools-empty">
            <Hammer className="empty-icon" size={32} strokeWidth={1.5} />
            <h2>No Tools</h2>
            <p>Connect your apps and services to Pipali.</p>
            <p className="empty-hint">
               Access data, manage tasks, and automate workflows across your apps and services.
            </p>
            <ul className="mcp-capabilities">
                <li>Interact with Slack, Email, Calendar</li>
                <li>Manage projects on Notion, Linear, Github</li>
                <li>Access files on Google Drive, Dropbox, OneDrive</li>
            </ul>
            <button className="btn-primary" onClick={onAddServer}>
                Integrate Your First Tool
            </button>
        </div>
    );
}
