// Visual rendering of chrome-devtools a11y tree snapshots
// Shows the page structure as a scannable outline with role-based styling

import { Globe } from 'lucide-react';
import { parseSnapshotTree, getSnapshotPageInfo, type SnapshotNode } from '../../utils/snapshotParser';

interface ChromeSnapshotViewProps {
    result: string;
}

/** Roles that are interactive and should always be visible */
const INTERACTIVE_ROLES = new Set(['link', 'button', 'combobox', 'textbox', 'tab', 'checkbox', 'radio', 'slider', 'switch']);

/** Roles that define page structure */
const STRUCTURE_ROLES = new Set(['heading', 'navigation', 'main', 'search', 'RootWebArea', 'contentinfo']);

function getRoleClass(role: string): string {
    if (INTERACTIVE_ROLES.has(role)) return `snapshot-role-interactive snapshot-role-${role}`;
    if (STRUCTURE_ROLES.has(role)) return `snapshot-role-structure snapshot-role-${role}`;
    if (role === 'StaticText') return 'snapshot-role-text';
    if (role === 'image') return 'snapshot-role-image';
    return 'snapshot-role-other';
}

function getRoleBadge(role: string): string {
    const badges: Record<string, string> = {
        'link': 'link',
        'button': 'button',
        'combobox': 'input',
        'textbox': 'input',
        'heading': 'h',
        'tab': 'tab',
        'image': 'image',
        'navigation': 'nav',
        'search': 'search',
        'main': 'main',
        'checkbox': 'check',
        'radio': 'radio',
    };
    return badges[role] || '';
}

function truncateLabel(label: string, maxLen = 80): string {
    if (label.length <= maxLen) return label;
    return label.slice(0, maxLen - 1) + '\u2026';
}

function SnapshotNodeRow({ node, baseIndent }: { node: SnapshotNode; baseIndent: number }) {
    const roleClass = getRoleClass(node.role);
    const badge = getRoleBadge(node.role);
    const indent = Math.max(0, node.indent - baseIndent);
    const label = node.label ? truncateLabel(node.label) : '';
    const value = node.attrs.value ? truncateLabel(node.attrs.value, 40) : '';

    return (
        <div className={`snapshot-node ${roleClass}`} style={{ paddingLeft: `${indent * 8 + 4}px` }}>
            {badge && <span className="snapshot-badge">{badge}</span>}
            {label && <span className="snapshot-label">{label}</span>}
            {value && <span className="snapshot-value">{value}</span>}
            {node.role === 'heading' && node.attrs.level && (
                <span className="snapshot-attr">h{node.attrs.level}</span>
            )}
        </div>
    );
}

export function ChromeSnapshotView({ result }: ChromeSnapshotViewProps) {
    const pageInfo = getSnapshotPageInfo(result);
    const nodes = parseSnapshotTree(result);

    if (nodes.length === 0) return null;

    // Find the minimum indent (base indent) to normalize
    const baseIndent = Math.min(...nodes.map(n => n.indent));

    // Show only important nodes to keep it scannable:
    // - Structure roles (headings, nav, main, search)
    // - Interactive elements (links, buttons, inputs)
    // - Text with substantial content (not just whitespace or very short)
    const visibleNodes = nodes.filter(node => {
        if (STRUCTURE_ROLES.has(node.role)) return true;
        if (INTERACTIVE_ROLES.has(node.role)) return true;
        if (node.role === 'image') return true;
        // Keep StaticText only if it has meaningful content not already in a parent
        if (node.role === 'StaticText' && node.label && node.label.length > 3) return true;
        return false;
    });

    return (
        <div className="thought-snapshot">
            <div className="snapshot-header">
                <Globe size={12} />
                {pageInfo ? (
                    <>
                        <span className="snapshot-title">{truncateLabel(pageInfo.title, 60)}</span>
                        <span className="snapshot-url">{(() => {
                            try {
                                const url = new URL(pageInfo.url);
                                return url.hostname + (url.pathname !== '/' ? url.pathname : '');
                            } catch {
                                return pageInfo.url;
                            }
                        })()}</span>
                    </>
                ) : (
                    <span className="snapshot-title">Page Snapshot</span>
                )}
            </div>
            <div className="snapshot-tree">
                {visibleNodes.map((node) => (
                    <SnapshotNodeRow key={node.uid} node={node} baseIndent={baseIndent} />
                ))}
            </div>
            <div className="snapshot-footer">{visibleNodes.length} elements</div>
        </div>
    );
}
