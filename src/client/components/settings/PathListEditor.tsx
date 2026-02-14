/**
 * PathListEditor - A component for editing a list of file system paths.
 * Used in the sandbox settings UI to manage allowed/denied paths.
 * In Tauri desktop mode, shows native file/folder picker buttons.
 */

import React, { useState } from 'react';
import { Plus, Trash2, FolderOpen, File } from 'lucide-react';
import { isTauri, pickPath } from '../../utils/tauri';
import { shortenHomePath } from '../../utils/formatting';

/** Strip home dir prefix for display: /Users/x/Documents → Documents */
function displayPath(fullPath: string): string {
    return shortenHomePath(fullPath).replace(/^~\//, '');
}

interface PathListEditorProps {
    /** The list of paths */
    paths: string[];
    /** Callback when paths change */
    onChange: (paths: string[]) => void;
    /** Placeholder text for new path input (web mode) */
    placeholder?: string;
    /** Whether the editor is disabled */
    disabled?: boolean;
    /** 'directory' shows only a folder picker, 'any' shows both file and folder pickers */
    mode?: 'directory' | 'any';
}

export function PathListEditor({
    paths,
    onChange,
    placeholder = 'Enter a path (e.g., ~/Documents)',
    disabled = false,
    mode = 'directory',
}: PathListEditorProps) {
    const [newPath, setNewPath] = useState('');
    const showBrowse = isTauri();

    const addPath = (path: string) => {
        const trimmed = path.trim();
        if (trimmed && !paths.includes(trimmed)) {
            onChange([...paths, trimmed]);
        }
    };

    const handleAdd = () => {
        addPath(newPath);
        setNewPath('');
    };

    const handleBrowse = async (directory: boolean) => {
        const selected = await pickPath({ directory });
        if (selected) addPath(selected);
    };

    const handleRemove = (index: number) => {
        onChange(paths.filter((_, i) => i !== index));
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleAdd();
        }
    };

    return (
        <div className="path-list-editor">
            {paths.length > 0 && (
                <div className="path-list">
                    {paths.map((pathItem, index) => (
                        <div key={index} className="path-item">
                            <FolderOpen size={14} className="path-icon" />
                            <span className="path-text" title={pathItem} aria-label={pathItem}>
                                {displayPath(pathItem)}
                            </span>
                            <button
                                type="button"
                                className="path-remove-btn"
                                onClick={() => handleRemove(index)}
                                disabled={disabled}
                                title="Remove path"
                            >
                                <Trash2 size={14} />
                            </button>
                        </div>
                    ))}
                </div>
            )}

            <div className="path-add-row">
                {showBrowse ? (
                    <>
                        <button
                            type="button"
                            onClick={() => handleBrowse(true)}
                            disabled={disabled}
                            className="path-browse-btn"
                        >
                            <FolderOpen size={14} />
                            Add folder
                        </button>
                        {mode === 'any' && (
                            <button
                                type="button"
                                onClick={() => handleBrowse(false)}
                                disabled={disabled}
                                className="path-browse-btn"
                            >
                                <File size={14} />
                                Add file
                            </button>
                        )}
                    </>
                ) : (
                    <>
                        <input
                            type="text"
                            value={newPath}
                            onChange={(e) => setNewPath(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder={placeholder}
                            disabled={disabled}
                            className="path-input"
                        />
                        <button
                            type="button"
                            onClick={handleAdd}
                            disabled={disabled || !newPath.trim()}
                            className="path-add-btn"
                            title="Add path"
                        >
                            <Plus size={16} />
                        </button>
                    </>
                )}
            </div>
        </div>
    );
}
