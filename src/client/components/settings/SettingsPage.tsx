// Settings page component

import React, { useState, useEffect } from 'react';
import { Save, Loader2, Check, AlertCircle, Shield, User, FolderLock } from 'lucide-react';
import { apiFetch } from '../../utils/api';
import { PathListEditor } from './PathListEditor';

type SettingsTab = 'profile' | 'permissions';

interface UserContext {
    name?: string;
    location?: string;
    instructions?: string;
}

interface SandboxConfig {
    enabled: boolean;
    allowedWritePaths: string[];
    deniedWritePaths: string[];
    deniedReadPaths: string[];
    allowedDomains: string[];
    allowLocalBinding: boolean;
}

interface DefaultPaths {
    allowedWritePaths: string[];
    deniedReadPaths: string[];
}

interface SandboxStatus {
    enabled: boolean;
    supported: boolean;
    platform: string;
}

/** Filter out system-managed default paths for display */
function getUserPaths(paths: string[], defaultPaths: string[]): string[] {
    const defaults = new Set(defaultPaths);
    return paths.filter(p => !defaults.has(p));
}

/** Merge user-edited paths back with defaults for saving */
function mergeWithDefaults(userPaths: string[], defaultPaths: string[]): string[] {
    return [...defaultPaths, ...userPaths.filter(p => !defaultPaths.includes(p))];
}

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export function SettingsPage() {
    const [activeTab, setActiveTab] = useState<SettingsTab>('profile');
    const [name, setName] = useState('');
    const [location, setLocation] = useState('');
    const [instructions, setInstructions] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
    const [error, setError] = useState<string | null>(null);

    // Sandbox state
    const [sandboxStatus, setSandboxStatus] = useState<SandboxStatus | null>(null);
    const [sandboxConfig, setSandboxConfig] = useState<SandboxConfig | null>(null);
    const [defaultPaths, setDefaultPaths] = useState<DefaultPaths | null>(null);
    const [sandboxError, setSandboxError] = useState<string | null>(null);

    // Track if form has unsaved changes
    const [originalValues, setOriginalValues] = useState<UserContext>({});
    const hasChanges =
        name !== (originalValues.name || '') ||
        location !== (originalValues.location || '') ||
        instructions !== (originalValues.instructions || '');

    useEffect(() => {
        fetchUserContext();
        fetchSandboxData();
    }, []);

    const fetchUserContext = async () => {
        try {
            const res = await apiFetch('/api/user/context');
            if (res.ok) {
                const data: UserContext = await res.json();
                setName(data.name || '');
                setLocation(data.location || '');
                setInstructions(data.instructions || '');
                setOriginalValues(data);
            }
        } catch (e) {
            console.error('Failed to fetch user context', e);
            setError('Failed to load settings');
        } finally {
            setIsLoading(false);
        }
    };

    const fetchSandboxData = async () => {
        try {
            // Fetch sandbox status and config in parallel
            const [statusRes, configRes] = await Promise.all([
                apiFetch('/api/sandbox/status'),
                apiFetch('/api/user/sandbox'),
            ]);

            if (statusRes.ok) {
                const status: SandboxStatus = await statusRes.json();
                setSandboxStatus(status);
            }

            if (configRes.ok) {
                const data = await configRes.json();
                const { defaults, ...config } = data as SandboxConfig & { defaults: DefaultPaths };
                setSandboxConfig(config);
                setDefaultPaths(defaults);
            }
        } catch (e) {
            console.error('Failed to fetch sandbox data', e);
            setSandboxError('Failed to load sandbox settings');
        }
    };

    const handleSave = async () => {
        setSaveStatus('saving');
        setError(null);

        try {
            const res = await apiFetch('/api/user/context', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: name || undefined,
                    location: location || undefined,
                    instructions: instructions || undefined,
                }),
            });

            if (res.ok) {
                setSaveStatus('saved');
                setOriginalValues({ name, location, instructions });
                // Reset status after a delay
                setTimeout(() => setSaveStatus('idle'), 2000);
            } else {
                const data = await res.json();
                throw new Error(data.error || 'Failed to save');
            }
        } catch (e) {
            console.error('Failed to save user context', e);
            setSaveStatus('error');
            setError(e instanceof Error ? e.message : 'Failed to save settings');
        }
    };

    /** Toggle sandbox on/off — saves immediately without requiring the Save button. */
    const handleToggleSandbox = async (enabled: boolean) => {
        if (!sandboxConfig) return;
        setSandboxConfig({ ...sandboxConfig, enabled });
        setSandboxError(null);
        try {
            const res = await apiFetch('/api/user/sandbox', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ enabled }),
            });
            if (res.ok) {
                const statusRes = await apiFetch('/api/sandbox/status');
                if (statusRes.ok) setSandboxStatus(await statusRes.json());
            } else {
                // Revert on failure
                setSandboxConfig(prev => prev ? { ...prev, enabled: !enabled } : prev);
                const data = await res.json();
                throw new Error(data.error || 'Failed to save');
            }
        } catch (e) {
            console.error('Failed to toggle sandbox', e);
            setSandboxError(e instanceof Error ? e.message : 'Failed to toggle sandbox');
        }
    };

    /** Update paths and save immediately. */
    const savePaths = async (updates: Partial<SandboxConfig>) => {
        if (!sandboxConfig) return;
        const updated = { ...sandboxConfig, ...updates };
        setSandboxConfig(updated);
        setSandboxError(null);
        try {
            const res = await apiFetch('/api/user/sandbox', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    allowedWritePaths: updated.allowedWritePaths,
                    deniedReadPaths: updated.deniedReadPaths,
                }),
            });
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Failed to save');
            }
        } catch (e) {
            console.error('Failed to save file permissions', e);
            setSandboxConfig(sandboxConfig); // revert
            setSandboxError(e instanceof Error ? e.message : 'Failed to save file permissions');
        }
    };

    if (isLoading) {
        return (
            <main className="main-content">
                <div className="messages-container">
                    <div className="settings-page">
                        <div className="settings-loading">Loading settings...</div>
                    </div>
                </div>
            </main>
        );
    }

    return (
        <main className="main-content">
            <div className="messages-container">
                <div className="settings-page">
                    <div className="settings-header">
                        <h2>Settings</h2>
                        {sandboxStatus?.supported && (
                            <div className="settings-tabs">
                                <button
                                    className={`settings-tab ${activeTab === 'profile' ? 'active' : ''}`}
                                    onClick={() => setActiveTab('profile')}
                                >
                                    <User size={16} />
                                    <span>Profile</span>
                                </button>
                                <button
                                    className={`settings-tab ${activeTab === 'permissions' ? 'active' : ''}`}
                                    onClick={() => setActiveTab('permissions')}
                                >
                                    <Shield size={16} />
                                    <span>Permissions</span>
                                </button>
                            </div>
                        )}
                    </div>

                    {error && (
                        <div className="settings-error">
                            <AlertCircle size={14} />
                            <span>{error}</span>
                        </div>
                    )}

                    {activeTab === 'profile' && (
                        <div className="settings-section">
                            <h3 className="settings-section-title">
                                <User size={18} />
                                About You
                            </h3>
                            <p className="settings-section-description">
                                This information helps Pipali personalize responses and understand your context.
                            </p>

                            <div className="settings-form">
                                <div className="settings-field">
                                    <label htmlFor="name">Name</label>
                                    <input
                                        id="name"
                                        type="text"
                                        value={name}
                                        onChange={(e) => setName(e.target.value)}
                                        placeholder="Your name"
                                    />
                                </div>

                                <div className="settings-field">
                                    <label htmlFor="location">Location</label>
                                    <input
                                        id="location"
                                        type="text"
                                        value={location}
                                        onChange={(e) => setLocation(e.target.value)}
                                        placeholder="City, Country"
                                    />
                                </div>

                                <div className="settings-field">
                                    <label htmlFor="instructions">Custom Instructions</label>
                                    <p className="settings-field-hint">
                                        Tell Pipali about yourself, your preferences, and how you'd like it to respond.
                                    </p>
                                    <textarea
                                        id="instructions"
                                        value={instructions}
                                        onChange={(e) => setInstructions(e.target.value)}
                                        placeholder="Example:&#10;I work as a sales representative. Please explain technical concepts simply.&#10;&#10;Always write new files to my Desktop/Pipali folder.&#10;Do not overwrite my existing files unless I specifically ask."
                                        rows={10}
                                    />
                                </div>

                                <div className="settings-actions">
                                    <button
                                        onClick={handleSave}
                                        disabled={saveStatus === 'saving' || !hasChanges}
                                        className={`settings-save-btn ${saveStatus === 'saved' ? 'saved' : ''}`}
                                    >
                                        {saveStatus === 'saving' ? (
                                            <>
                                                <Loader2 size={16} className="spinning" />
                                                <span>Saving...</span>
                                            </>
                                        ) : saveStatus === 'saved' ? (
                                            <>
                                                <Check size={16} />
                                                <span>Saved</span>
                                            </>
                                        ) : (
                                            <>
                                                <Save size={16} />
                                                <span>Save Changes</span>
                                            </>
                                        )}
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'permissions' && (
                    <>
                        {sandboxError && (
                            <div className="settings-error">
                                <AlertCircle size={14} />
                                <span>{sandboxError}</span>
                            </div>
                        )}

                        {/* Sandbox toggle */}
                        <div className="settings-section">
                            <div className="settings-section-header">
                                <div>
                                    <h3 className="settings-section-title">
                                        <Shield size={18} />
                                        Sandbox
                                    </h3>
                                    <p className="settings-section-description">
                                        When enabled, shell commands run in an OS-enforced sandbox without requiring confirmation.
                                    </p>
                                </div>
                                {sandboxConfig && (
                                    <label className="toggle-switch">
                                        <input
                                            id="sandbox-enabled"
                                            type="checkbox"
                                            checked={sandboxConfig.enabled}
                                            onChange={(e) => handleToggleSandbox(e.target.checked)}
                                        />
                                        <span className="toggle-slider"></span>
                                    </label>
                                )}
                            </div>
                        </div>

                        {/* File permissions */}
                        {sandboxConfig && (
                        <div className="settings-section">
                            <h3 className="settings-section-title">
                                <FolderLock size={18} />
                                File Permissions
                            </h3>
                            <p className="settings-section-description">
                                Control which files and folders Pipali can read or write without asking.
                            </p>

                            <div className="settings-form">
                                <div className="settings-field">
                                    <label>Allowed Write Directories</label>
                                    <p className="settings-field-hint">
                                        Never require your confirmation to manage files in these folders.
                                    </p>
                                    <PathListEditor
                                        paths={getUserPaths(sandboxConfig.allowedWritePaths, defaultPaths?.allowedWritePaths ?? [])}
                                        onChange={(paths) => savePaths({ allowedWritePaths: mergeWithDefaults(paths, defaultPaths?.allowedWritePaths ?? []) })}
                                        placeholder="e.g., Documents/pipali"
                                    />
                                </div>

                                <div className="settings-field">
                                    <label>Protected Read Paths</label>
                                    <p className="settings-field-hint">
                                        Always require your confirmation to view these files or folders.
                                    </p>
                                    <PathListEditor
                                        paths={getUserPaths(sandboxConfig.deniedReadPaths, defaultPaths?.deniedReadPaths ?? [])}
                                        onChange={(paths) => savePaths({ deniedReadPaths: mergeWithDefaults(paths, defaultPaths?.deniedReadPaths ?? []) })}
                                        placeholder="e.g., Documents/passwords.docx"
                                        mode="any"
                                    />
                                </div>

                            </div>
                        </div>
                        )}
                    </>
                    )}
                </div>
            </div>
        </main>
    );
}
