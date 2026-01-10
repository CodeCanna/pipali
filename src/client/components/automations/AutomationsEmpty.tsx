// Empty state when no automations are configured

import { Clock } from 'lucide-react';

export function AutomationsEmpty() {
    return (
        <div className="empty-state automations-empty">
            <Clock className="empty-icon" size={32} strokeWidth={1.5} />
            <h2>No Routines</h2>
            <p>Routines run tasks on a schedule without manual intervention.</p>
            <p className="empty-hint">
                Create a routine to have Pipali perform tasks automatically.
            </p>
        </div>
    );
}
