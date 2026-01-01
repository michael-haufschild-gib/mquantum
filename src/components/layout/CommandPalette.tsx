import React, { useState, useEffect, useRef, useMemo } from 'react';
import { m, AnimatePresence } from 'motion/react';
import { useLayoutStore, type LayoutStore } from '@/stores/layoutStore';
import { useThemeStore } from '@/stores/themeStore';
import { useCameraStore } from '@/stores/cameraStore';
import { useShallow } from 'zustand/react/shallow';

interface Command {
  id: string;
  label: string;
  category: 'Actions' | 'Navigation' | 'Theme' | 'Tools';
  shortcut?: string;
  action: () => void;
  icon?: React.ReactNode;
}

export const CommandPalette: React.FC = React.memo(() => {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

    const { toggleCinematicMode, toggleCollapsed, toggleLeftPanel, toggleShortcuts } = useLayoutStore(useShallow((state: LayoutStore) => ({

      toggleCinematicMode: state.toggleCinematicMode,

      toggleCollapsed: state.toggleCollapsed,

      toggleLeftPanel: state.toggleLeftPanel,

      toggleShortcuts: state.toggleShortcuts

    })));

    const { setAccent, setMode } = useThemeStore(useShallow((state) => ({ setAccent: state.setAccent, setMode: state.setMode })));

  const resetCamera = useCameraStore(state => state.reset);

  const commands: Command[] = useMemo(() => [
    {
      id: 'cinematic',
      label: 'Toggle Cinematic Mode',
      category: 'Actions',
      shortcut: 'C',
      action: () => toggleCinematicMode(),
      icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="2" y1="7" x2="7" y2="7"/><line x1="2" y1="17" x2="7" y2="17"/><line x1="17" y1="17" x2="22" y2="17"/><line x1="17" y1="7" x2="22" y2="7"/></svg>
    },
    {
        id: 'sidebar-right',
        label: 'Toggle Right Sidebar',
        category: 'Navigation',
        shortcut: '\\',
        action: () => toggleCollapsed(),
        icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="15" y1="3" x2="15" y2="21"/></svg>
    },
    {
        id: 'sidebar-left',
        label: 'Toggle Left Sidebar',
        category: 'Navigation',
        shortcut: 'Shift+\\',
        action: () => toggleLeftPanel(),
        icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="9" y1="3" x2="9" y2="21"/></svg>
    },
    {
        id: 'reset-camera',
        label: 'Reset Camera View',
        category: 'Actions',
        shortcut: 'R',
        action: () => resetCamera(),
        icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M23 4v6h-6"/><path d="M20.49 15a9 9 0 1 1 2.12-9.36L23 10"/></svg>
    },
    {
        id: 'shortcuts',
        label: 'Show Shortcuts',
        category: 'Tools',
        shortcut: '?',
        action: () => toggleShortcuts(),
        icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
    },
    // Modes
    {
        id: 'mode-light',
        label: 'Switch Mode: Light',
        category: 'Theme',
        action: () => setMode('light'),
        icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
    },
    {
        id: 'mode-dark',
        label: 'Switch Mode: Dark',
        category: 'Theme',
        action: () => setMode('dark'),
        icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
    },
    // Accents
    {
        id: 'accent-green',
        label: 'Switch Accent: Green',
        category: 'Theme',
        action: () => setAccent('green'),
        icon: <div className="w-3 h-3 rounded-full bg-green-500"/>
    },
    {
        id: 'accent-magenta',
        label: 'Switch Accent: Magenta',
        category: 'Theme',
        action: () => setAccent('magenta'),
        icon: <div className="w-3 h-3 rounded-full bg-pink-500"/>
    },
    {
        id: 'accent-orange',
        label: 'Switch Accent: Orange',
        category: 'Theme',
        action: () => setAccent('orange'),
        icon: <div className="w-3 h-3 rounded-full bg-orange-500"/>
    },
    {
        id: 'accent-blue',
        label: 'Switch Accent: Blue',
        category: 'Theme',
        action: () => setAccent('blue'),
        icon: <div className="w-3 h-3 rounded-full bg-blue-500"/>
    },
    {
        id: 'accent-cyan',
        label: 'Switch Accent: Cyan (Default)',
        category: 'Theme',
        action: () => setAccent('cyan'),
        icon: <div className="w-3 h-3 rounded-full bg-cyan-500"/>
    },
     {
        id: 'accent-violet',
        label: 'Switch Accent: Violet',
        category: 'Theme',
        action: () => setAccent('violet'),
        icon: <div className="w-3 h-3 rounded-full bg-violet-500"/>
    },
     {
        id: 'accent-red',
        label: 'Switch Accent: Red',
        category: 'Theme',
        action: () => setAccent('red'),
        icon: <div className="w-3 h-3 rounded-full bg-red-500"/>
    }
  ], [toggleCinematicMode, toggleCollapsed, toggleLeftPanel, toggleShortcuts, resetCamera, setMode, setAccent]);

  const filteredCommands = commands.filter(cmd =>
    cmd.label.toLowerCase().includes(query.toLowerCase()) ||
    cmd.category.toLowerCase().includes(query.toLowerCase())
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsOpen(prev => !prev);
        setQuery('');
      }

      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 10);
      setSelectedIndex(0);
    }
  }, [isOpen]);

  useEffect(() => {
    // Reset selection when query changes
    setSelectedIndex(0);
  }, [query]);

  const handleListKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => Math.min(prev + 1, filteredCommands.length - 1));
      // Scroll into view logic could be added here
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredCommands[selectedIndex]) {
        filteredCommands[selectedIndex].action();
        setIsOpen(false);
      }
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[20vh] px-4">
          <m.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsOpen(false)}
            className="absolute inset-0 bg-[var(--bg-overlay)] backdrop-blur-sm"
          />

          <m.div
            initial={{ opacity: 0, scale: 0.95, y: -20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -20 }}
            transition={{ type: "spring", duration: 0.3 }}
            className="w-full max-w-lg relative z-10 overflow-hidden rounded-xl border border-[var(--border-subtle)] shadow-2xl glass-panel-dark"
          >
            <div className="relative border-b border-[var(--border-subtle)]">
              <div className="absolute left-4 top-3.5 text-[var(--text-tertiary)]">
                 <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              </div>
              <input
                ref={inputRef}
                type="text"
                placeholder="Type a command or search..."
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={handleListKeyDown}
                className="w-full bg-transparent border-none py-3.5 pl-12 pr-4 text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:ring-0 focus:outline-none text-base"
              />
              <div className="absolute right-3 top-3.5 px-2 py-0.5 rounded border border-[var(--border-subtle)] text-[10px] font-mono text-[var(--text-tertiary)]">
                ESC
              </div>
            </div>

            <div className="max-h-[300px] overflow-y-auto p-2" ref={listRef}>
               {filteredCommands.length === 0 ? (
                 <div className="py-8 text-center text-[var(--text-tertiary)] text-sm">No results found.</div>
               ) : (
                 <ul className="space-y-1">
                   {filteredCommands.map((cmd, index) => (
                     <li key={cmd.id}>
                       <button
                         onClick={() => {
                           cmd.action();
                           setIsOpen(false);
                         }}
                         onMouseEnter={() => setSelectedIndex(index)}
                         className={`
                           w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm transition-colors
                           ${index === selectedIndex ? 'bg-accent/20 text-accent' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'}
                         `}
                       >
                         <div className="flex items-center gap-3">
                           <span className={index === selectedIndex ? 'text-accent' : 'text-[var(--text-tertiary)]'}>
                             {cmd.icon}
                           </span>
                           <span>{cmd.label}</span>
                         </div>
                         {cmd.shortcut && (
                           <span className="text-[10px] font-mono opacity-50 border border-[var(--border-subtle)] px-1.5 py-0.5 rounded">
                             {cmd.shortcut}
                           </span>
                         )}
                       </button>
                     </li>
                   ))}
                 </ul>
               )}
            </div>

            <div className="px-4 py-2 bg-[var(--bg-hover)] border-t border-[var(--border-subtle)] flex justify-between text-[10px] text-[var(--text-tertiary)]">
                <span>Navigate <span className="font-mono">↑↓</span></span>
                <span>Select <span className="font-mono">↵</span></span>
            </div>
          </m.div>
        </div>
      )}
    </AnimatePresence>
  );
});

CommandPalette.displayName = 'CommandPalette';
