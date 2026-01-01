import React from 'react';
import { TimelineControls } from './TimelineControls';

export const EditorBottomPanel: React.FC = React.memo(() => {
    return (
        <div data-testid="editor-bottom-panel">
            <TimelineControls />
        </div>
    );
});

EditorBottomPanel.displayName = 'EditorBottomPanel';
