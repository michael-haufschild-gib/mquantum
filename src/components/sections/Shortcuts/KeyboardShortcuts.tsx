/**
 * Keyboard Shortcuts Component
 * Displays available keyboard shortcuts
 */

import React from 'react'
import { SHORTCUTS, getShortcutLabel } from '@/hooks/useKeyboardShortcuts'

export interface KeyboardShortcutsProps {
  className?: string
}

export const KeyboardShortcuts: React.FC<KeyboardShortcutsProps> = ({ className = '' }) => {
  return (
    <div className={`space-y-2 text-sm ${className}`}>
      <div className="grid grid-cols-2 gap-2">
        {SHORTCUTS.map((shortcut, index) => (
          <div key={index} className="flex items-center gap-2">
            <kbd className="px-2 py-1 bg-panel-bg border border-panel-border rounded text-xs font-mono text-text-secondary">
              {getShortcutLabel(shortcut)}
            </kbd>
            <span className="text-xs text-text-muted truncate">{shortcut.description}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
