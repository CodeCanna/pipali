// Main home page component

import React from 'react';
import type { ActiveTask } from '../../types';
import { TaskCardGallery } from './TaskCardGallery';
import { EmptyHomeState } from './EmptyHomeState';

interface HomePageProps {
    activeTasks: ActiveTask[];
    onSelectTask: (conversationId: string) => void;
    userName?: string;
    hasInput?: boolean;
}

export function HomePage({ activeTasks, onSelectTask, userName, hasInput }: HomePageProps) {
    return (
        <main className="main-content">
            <div className="messages-container">
                {activeTasks.length === 0 ? (
                    <EmptyHomeState userName={userName} hasInput={hasInput} />
                ) : (
                    <TaskCardGallery
                        tasks={activeTasks}
                        onSelectTask={onSelectTask}
                    />
                )}
            </div>
        </main>
    );
}
