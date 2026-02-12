// App header with sidebar toggle and logo

import { PanelLeftClose, PanelLeft } from 'lucide-react';
import { getApiBaseUrl } from '../../utils/api';

interface HeaderProps {
    sidebarOpen: boolean;
    onToggleSidebar: () => void;
    onGoHome: () => void;
}

export function Header({
    sidebarOpen,
    onToggleSidebar,
    onGoHome,
}: HeaderProps) {
    return (
        <header className="header">
            <div className="header-content">
                <div className="header-left">
                    <button
                        className="sidebar-toggle"
                        onClick={onToggleSidebar}
                    >
                        {sidebarOpen ? <PanelLeftClose size={20} /> : <PanelLeft size={20} />}
                    </button>
                    <div
                        className="logo clickable"
                        onClick={onGoHome}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                onGoHome();
                            }
                        }}
                    >
                        <img src={`${getApiBaseUrl()}/icons/pipali_64.png`} alt="Pipali" className="logo-icon" />
                        <span className="logo-text">Pipali</span>
                    </div>
                </div>
            </div>
        </header>
    );
}
