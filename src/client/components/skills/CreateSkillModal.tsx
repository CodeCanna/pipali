// Modal for creating a new skill

import React, { useState } from 'react';
import { X, Loader2 } from 'lucide-react';
import { apiFetch } from '../../utils/api';

interface CreateSkillModalProps {
    onClose: () => void;
    onCreated: () => void;
}

export function CreateSkillModal({ onClose, onCreated }: CreateSkillModalProps) {
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [instructions, setInstructions] = useState('');
    const [isCreating, setIsCreating] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const isValidName = /^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/.test(name);
    const canSubmit = name.length > 0 && isValidName && description.length > 0 && !isCreating;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!canSubmit) return;

        setIsCreating(true);
        setError(null);

        try {
            const res = await apiFetch('/api/skills', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, description, instructions }),
            });

            if (res.ok) {
                onCreated();
            } else {
                const data = await res.json();
                setError(data.error || 'Failed to create skill');
            }
        } catch (e) {
            setError('Failed to create skill');
        } finally {
            setIsCreating(false);
        }
    };

    const handleBackdropClick = (e: React.MouseEvent) => {
        if (e.target === e.currentTarget) {
            onClose();
        }
    };

    return (
        <div className="modal-backdrop" onClick={handleBackdropClick}>
            <div className="modal skill-modal">
                <div className="modal-header">
                    <h2>Create Skill</h2>
                    <button onClick={onClose} className="modal-close">
                        <X size={18} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="skill-form">
                    <div className="form-group">
                        <label htmlFor="skill-name">Name</label>
                        <input
                            id="skill-name"
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
                            placeholder="my-skill"
                        />
                    </div>

                    <div className="form-group">
                        <label htmlFor="skill-description">Description</label>
                        <input
                            id="skill-description"
                            type="text"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="Describe what the skill does and when it should be used"
                        />
                    </div>

                    <div className="form-group">
                        <label htmlFor="skill-instructions">Instructions</label>
                        <textarea
                            id="skill-instructions"
                            value={instructions}
                            onChange={(e) => setInstructions(e.target.value)}
                            placeholder="Detailed instructions for how to use this skill..."
                            rows={6}
                        />
                    </div>

                    {error && <div className="form-error">{error}</div>}

                    <div className="modal-actions">
                        <button type="button" onClick={onClose} className="btn-secondary">
                            Cancel
                        </button>
                        <button type="submit" disabled={!canSubmit} className="btn-primary">
                            {isCreating ? (
                                <>
                                    <Loader2 size={16} className="spinning" />
                                    <span>Creating...</span>
                                </>
                            ) : (
                                'Create Skill'
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
