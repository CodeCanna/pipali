// Main automations page component

import React, { useState, useEffect } from 'react';
import { RefreshCw, Plus } from 'lucide-react';
import type { AutomationInfo } from '../../types/automations';
import { AutomationCard } from './AutomationCard';
import { AutomationsEmpty } from './AutomationsEmpty';
import { CreateAutomationModal } from './CreateAutomationModal';
import { AutomationDetailModal } from './AutomationDetailModal';

export function AutomationsPage() {
    const [automations, setAutomations] = useState<AutomationInfo[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [selectedAutomation, setSelectedAutomation] = useState<AutomationInfo | null>(null);

    useEffect(() => {
        fetchAutomations();
    }, []);

    const fetchAutomations = async () => {
        try {
            const res = await fetch('/api/automations');
            if (res.ok) {
                const data = await res.json();
                setAutomations(data.automations || []);
            }
        } catch (e) {
            console.error('Failed to fetch automations', e);
        } finally {
            setIsLoading(false);
        }
    };

    const handleRefresh = async () => {
        setIsRefreshing(true);
        try {
            await fetchAutomations();
        } finally {
            setIsRefreshing(false);
        }
    };

    const handleAutomationCreated = () => {
        setShowCreateModal(false);
        handleRefresh();
    };

    const handleAutomationUpdated = () => {
        setSelectedAutomation(null);
        handleRefresh();
    };

    const handleAutomationDeleted = () => {
        setSelectedAutomation(null);
        handleRefresh();
    };

    if (isLoading) {
        return (
            <main className="main-content">
                <div className="messages-container">
                    <div className="automations-gallery">
                        <div className="automations-loading">Loading automations...</div>
                    </div>
                </div>
            </main>
        );
    }

    return (
        <main className="main-content">
            <div className="messages-container">
                <div className="automations-gallery">
                    <div className="automations-header">
                        <div className="automations-header-left">
                            <h2>Automations</h2>
                            <span className="automations-count">{automations.length}</span>
                        </div>
                        <div className="automations-header-actions">
                            <button
                                onClick={() => setShowCreateModal(true)}
                                className="automations-create-btn"
                            >
                                <Plus size={16} />
                                <span>Create</span>
                            </button>
                            <button
                                onClick={handleRefresh}
                                disabled={isRefreshing}
                                className="automations-reload-btn"
                                title="Refresh automations"
                            >
                                <RefreshCw size={16} className={isRefreshing ? 'spinning' : ''} />
                            </button>
                        </div>
                    </div>

                    {automations.length === 0 ? (
                        <AutomationsEmpty />
                    ) : (
                        <div className="automations-cards">
                            {automations.map((automation) => (
                                <AutomationCard
                                    key={automation.id}
                                    automation={automation}
                                    onClick={() => setSelectedAutomation(automation)}
                                />
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {showCreateModal && (
                <CreateAutomationModal
                    onClose={() => setShowCreateModal(false)}
                    onCreated={handleAutomationCreated}
                />
            )}

            {selectedAutomation && (
                <AutomationDetailModal
                    automation={selectedAutomation}
                    onClose={() => setSelectedAutomation(null)}
                    onUpdated={handleAutomationUpdated}
                    onDeleted={handleAutomationDeleted}
                />
            )}
        </main>
    );
}
