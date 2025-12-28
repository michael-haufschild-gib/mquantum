import React, { useState, useEffect, useMemo } from 'react';
import { m, AnimatePresence } from 'motion/react';
import { useLayoutStore, type LayoutStore } from '@/stores/layoutStore';
import { useCameraStore } from '@/stores/cameraStore';
import { useDropdownStore } from '@/stores/dropdownStore';
import { useShallow } from 'zustand/react/shallow';

const DROPDOWN_ID = 'canvas-context-menu';

interface MenuItem {
  label: string;
  shortcut?: string;
  action?: () => void;
  type?: 'separator';
}

export const CanvasContextMenu: React.FC = () => {
  const [position, setPosition] = useState({ x: 0, y: 0 });

  const { isOpen, openDropdown, closeDropdown } = useDropdownStore(
    useShallow((state) => ({
      isOpen: state.openDropdownId === DROPDOWN_ID,
      openDropdown: state.openDropdown,
      closeDropdown: state.closeDropdown,
    }))
  );
  
  const layoutSelector = useShallow((state: LayoutStore) => ({
    toggleCinematicMode: state.toggleCinematicMode,
    toggleCollapsed: state.toggleCollapsed,
    toggleLeftPanel: state.toggleLeftPanel,
  }));
  const { toggleCinematicMode, toggleCollapsed, toggleLeftPanel } = useLayoutStore(layoutSelector);
  const resetCamera = useCameraStore(state => state.reset);

  useEffect(() => {
    const handleContextMenu = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const isCanvas = target.tagName === 'CANVAS' || target.id === 'canvas-container' || target.closest('#canvas-container');

      if (isCanvas) {
        e.preventDefault();
        setPosition({ x: e.clientX, y: e.clientY });
        openDropdown(DROPDOWN_ID);
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        closeDropdown(DROPDOWN_ID);
      }
    };

    window.addEventListener('contextmenu', handleContextMenu);
    document.addEventListener('keydown', handleEscape);

    return () => {
      window.removeEventListener('contextmenu', handleContextMenu);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, openDropdown, closeDropdown]);

  const items: MenuItem[] = useMemo(() => [
    { label: 'Reset Camera', shortcut: 'R', action: resetCamera },
    { label: 'Toggle Cinematic Mode', shortcut: 'C', action: toggleCinematicMode },
    { type: 'separator', label: '' },
    { label: 'Toggle Left Panel', shortcut: 'Shift+\\', action: toggleLeftPanel },
    { label: 'Toggle Right Panel', shortcut: '\\', action: toggleCollapsed },
  ], [resetCamera, toggleCinematicMode, toggleLeftPanel, toggleCollapsed]);

  return (
    <AnimatePresence>
      {isOpen && (
        <m.div
          initial={{ opacity: 0, scale: 0.9, x: -10, y: -10 }}
          animate={{ opacity: 1, scale: 1, x: 0, y: 0 }}
          exit={{ opacity: 0, scale: 0.9 }}
          transition={{ type: "spring", stiffness: 400, damping: 25 }}
          className="fixed z-50 min-w-[180px] glass-panel rounded-lg shadow-xl overflow-hidden py-1"
          style={{ top: position.y, left: position.x }}
        >
          {items.map((item, index) => {
            if (item.type === 'separator') {
              return <div key={index} className="h-[1px] bg-white/10 my-1 mx-2" />;
            }
            return (
              <button
                key={index}
                onClick={() => {
                    if (item.action) item.action();
                    closeDropdown(DROPDOWN_ID);
                }}
                className="w-full text-left px-3 py-1.5 text-xs text-text-secondary hover:text-text-primary hover:bg-white/10 flex justify-between items-center transition-colors group"
              >
                <span>{item.label}</span>
                {item.shortcut && <span className="text-[9px] font-mono text-text-tertiary group-hover:text-text-secondary">{item.shortcut}</span>}
              </button>
            );
          })}
        </m.div>
      )}
    </AnimatePresence>
  );
};
