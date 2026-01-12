/**
 * Custom link component that opens external URLs in the system's default browser
 * and file:// URLs with the system's default application.
 * Used with ReactMarkdown to ensure links don't navigate within the WebView.
 */

import type { AnchorHTMLAttributes, MouseEvent } from 'react';
import { openInBrowser, openFile, isTauri } from '../utils/tauri';

type ExternalLinkProps = AnchorHTMLAttributes<HTMLAnchorElement>;

/**
 * Link component that opens URLs externally (in system browser) when in desktop mode,
 * and opens file:// URLs with the system's default application.
 * For use as a custom component in ReactMarkdown.
 */
export function ExternalLink({ href, children, ...props }: ExternalLinkProps) {
    const handleClick = (e: MouseEvent<HTMLAnchorElement>) => {
        // Handle file:// URLs - open with system default app
        if (href?.startsWith('file://')) {
            e.preventDefault();
            openFile(href);
            return;
        }

        // Handle external links (http/https) - open in browser
        if (href?.startsWith('http://') || href?.startsWith('https://')) {
            e.preventDefault();
            openInBrowser(href);
            return;
        }
        // Let other links (like anchors) work normally
    };

    // For file:// URLs, show a visual cue that it's a file link (only in Tauri)
    const isFileLink = href?.startsWith('file://');
    const linkProps = isFileLink && isTauri()
        ? { ...props, title: props.title || 'Open with default application' }
        : props;

    return (
        <a href={href} onClick={handleClick} {...linkProps}>
            {children}
        </a>
    );
}
