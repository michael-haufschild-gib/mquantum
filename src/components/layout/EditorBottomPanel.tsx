import React from 'react';
import { TimelineControls } from './TimelineControls';

export const EditorBottomPanel: React.FC = () => {
    return (
        <div data-testid="editor-bottom-panel">
            <TimelineControls />
        </div>
    );
};
