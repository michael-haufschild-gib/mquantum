import React, { useState, useRef, useEffect, useLayoutEffect, useCallback, useId } from 'react';
import { createPortal } from 'react-dom';
import { m, AnimatePresence } from 'motion/react';
import { useShallow } from 'zustand/react/shallow';
import { soundManager } from '@/lib/audio/SoundManager';
import { useDropdownStore } from '@/stores/dropdownStore';

export interface DropdownMenuItem {
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  shortcut?: string;
  'data-testid'?: string;
  items?: DropdownMenuItem[]; // Submenu support
}

export interface DropdownMenuProps {
  trigger: React.ReactNode;
  items: DropdownMenuItem[];
  className?: string;
  align?: 'left' | 'right';
  maxHeight?: number;
  onClose?: () => void;
  /** Optional unique identifier for this dropdown */
  id?: string;
}

/**
 * Portaled submenu that positions itself relative to a trigger rect.
 * Submenus are kept as portals to avoid the popover="auto" mutual exclusivity
 * that would close the parent menu when opening a submenu.
 */
const PortaledSubmenu: React.FC<{
  items: DropdownMenuItem[];
  triggerRect: DOMRect;
  onClose: () => void;
  depth: number;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}> = ({ items, triggerRect, onClose, depth, onMouseEnter, onMouseLeave }) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const [ready, setReady] = useState(false);

  useLayoutEffect(() => {
    if (menuRef.current) {
      const menuRect = menuRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      // Try to position to the right of the trigger
      let left = triggerRect.right + 2;
      let top = triggerRect.top;

      // If overflows right, try left side
      if (left + menuRect.width > viewportWidth - 8) {
        left = triggerRect.left - menuRect.width - 2;
      }

      // If still overflows (very narrow screen), position below
      if (left < 8) {
        left = Math.max(8, triggerRect.left);
        top = triggerRect.bottom + 2;
      }

      // Clamp vertical position
      if (top + menuRect.height > viewportHeight - 8) {
        top = Math.max(8, viewportHeight - menuRect.height - 8);
      }

      setCoords({ top, left });
      setReady(true);
    }
  }, [triggerRect]);

  return createPortal(
    <m.div
      ref={menuRef}
      data-dropdown-content="true"
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: ready ? 1 : 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.12 }}
      className="glass-panel min-w-[180px] max-w-[280px] rounded-lg py-1 shadow-xl border border-border-default"
      style={{
        position: 'fixed',
        top: coords.top,
        left: coords.left,
        zIndex: 200 + depth * 10,
        maxHeight: '60vh',
        overflowY: 'auto',
        backdropFilter: 'blur(16px)',
        visibility: ready ? 'visible' : 'hidden',
      }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <MenuItems items={items} onClose={onClose} depth={depth + 1} />
    </m.div>,
    document.body
  );
};

/**
 * Renders menu items with submenu support
 */
const MenuItems: React.FC<{
  items: DropdownMenuItem[];
  onClose: () => void;
  depth?: number;
}> = ({ items, onClose, depth = 0 }) => {
  const [activeSubmenuIndex, setActiveSubmenuIndex] = useState<number | null>(null);
  const [submenuTriggerRect, setSubmenuTriggerRect] = useState<DOMRect | null>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearCloseTimeout = () => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
  };

  const scheduleClose = () => {
    clearCloseTimeout();
    closeTimeoutRef.current = setTimeout(() => {
      setActiveSubmenuIndex(null);
      setSubmenuTriggerRect(null);
    }, 100);
  };

  const openSubmenu = (index: number) => {
    clearCloseTimeout();
    const button = itemRefs.current[index];
    if (button) {
      setSubmenuTriggerRect(button.getBoundingClientRect());
      setActiveSubmenuIndex(index);
    }
  };

  useEffect(() => {
    return () => clearCloseTimeout();
  }, []);

  return (
    <>
      {items.map((item, index) => {
        // Separator
        if (item.label === '---') {
          return <div key={index} className="h-px bg-[var(--border-subtle)] my-1.5 mx-2" />;
        }

        // Header (non-clickable, no children)
        if (!item.onClick && !item.items && !item.disabled) {
          return (
            <div key={index} className="px-3 py-1.5 text-xs font-bold text-accent uppercase tracking-wider opacity-70">
              {item.label}
            </div>
          );
        }

        const hasSubmenu = !!item.items;
        const isSubmenuOpen = activeSubmenuIndex === index;

        return (
          <React.Fragment key={index}>
            <button
              ref={el => { itemRefs.current[index] = el; }}
              onClick={() => {
                if (hasSubmenu) {
                  if (isSubmenuOpen) {
                    setActiveSubmenuIndex(null);
                    setSubmenuTriggerRect(null);
                  } else {
                    openSubmenu(index);
                  }
                } else if (!item.disabled && item.onClick) {
                  soundManager.playClick();
                  item.onClick();
                  onClose();
                }
              }}
              onMouseEnter={() => {
                if (!item.disabled) soundManager.playHover();
                if (hasSubmenu) {
                  openSubmenu(index);
                } else {
                  // Close any open submenu when hovering a non-submenu item
                  scheduleClose();
                }
              }}
              disabled={item.disabled}
              className={`
                w-full text-left px-3 py-1.5 text-sm flex items-center justify-between group
                ${item.disabled ? 'text-[var(--text-tertiary)] cursor-not-allowed' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] cursor-pointer'}
                ${isSubmenuOpen ? 'bg-[var(--bg-hover)] text-[var(--text-primary)]' : ''}
              `}
              data-testid={item['data-testid']}
            >
              <span>{item.label}</span>
              {hasSubmenu ? (
                <span className="ml-2 opacity-50 text-xs">›</span>
              ) : item.shortcut ? (
                <span className="text-xs text-[var(--text-tertiary)] group-hover:text-[var(--text-secondary)] font-mono ml-4">
                  {item.shortcut}
                </span>
              ) : null}
            </button>

            {/* Portaled Submenu */}
            <AnimatePresence>
              {hasSubmenu && isSubmenuOpen && submenuTriggerRect && (
                <PortaledSubmenu
                  items={item.items!}
                  triggerRect={submenuTriggerRect}
                  onClose={onClose}
                  depth={depth}
                  onMouseEnter={clearCloseTimeout}
                  onMouseLeave={scheduleClose}
                />
              )}
            </AnimatePresence>
          </React.Fragment>
        );
      })}
    </>
  );
};

/**
 * A dropdown menu component with global state coordination.
 * Uses the native HTML popover API for light-dismiss behavior.
 * Only one dropdown can be open at a time across the entire app.
 * Supports submenus, keyboard navigation, and click-outside closing.
 */
export const DropdownMenu: React.FC<DropdownMenuProps> = ({
  trigger,
  items,
  className = '',
  align = 'left',
  maxHeight,
  onClose,
  id: providedId
}) => {
  // Auto-generate ID if not provided
  const autoId = useId();
  const dropdownId = providedId || `dropdown-${autoId}`;
  const popoverRef = useRef<HTMLDivElement>(null);

  // Subscribe to store - only re-render when THIS dropdown's open state changes
  const { isOpen, toggleDropdown, closeDropdown, openDropdown } = useDropdownStore(
    useShallow((state) => ({
      isOpen: state.openDropdownId === dropdownId,
      toggleDropdown: state.toggleDropdown,
      closeDropdown: state.closeDropdown,
      openDropdown: state.openDropdown,
    }))
  );

  const triggerRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const offset = 4;

  // Track previous isOpen state to call onClose callback
  const prevIsOpenRef = useRef(isOpen);
  useEffect(() => {
    if (prevIsOpenRef.current && !isOpen && onClose) {
      onClose();
    }
    prevIsOpenRef.current = isOpen;
  }, [isOpen, onClose]);

  // Sync popover visibility with store state
  useEffect(() => {
    const popover = popoverRef.current;
    if (!popover) return;

    if (isOpen && !popover.matches(':popover-open')) {
      popover.showPopover();
    } else if (!isOpen && popover.matches(':popover-open')) {
      popover.hidePopover();
    }
  }, [isOpen]);

  // Handle toggle event to sync store when popover closes via light-dismiss
  useEffect(() => {
    const popover = popoverRef.current;
    if (!popover) return;

    const handleToggle = (e: Event) => {
      const toggleEvent = e as ToggleEvent;
      if (toggleEvent.newState === 'closed') {
        closeDropdown(dropdownId);
      } else if (toggleEvent.newState === 'open') {
        openDropdown(dropdownId);
      }
    };

    popover.addEventListener('toggle', handleToggle);
    return () => popover.removeEventListener('toggle', handleToggle);
  }, [dropdownId, closeDropdown, openDropdown]);

  const updatePosition = useCallback(() => {
    if (triggerRef.current && isOpen && popoverRef.current) {
      const triggerRect = triggerRef.current.getBoundingClientRect();
      const contentRect = popoverRef.current.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      const viewportWidth = window.innerWidth;

      let top = triggerRect.bottom + offset;
      const overflowsBottom = (triggerRect.bottom + offset + contentRect.height) > viewportHeight;

      if (overflowsBottom) {
        const topSpace = triggerRect.top;
        const bottomSpace = viewportHeight - triggerRect.bottom;
        if (topSpace > bottomSpace) {
          top = triggerRect.top - contentRect.height - offset;
          if (top < 8) top = 8;
        }
      }

      let left = align === 'right'
        ? triggerRect.right - contentRect.width
        : triggerRect.left;

      left = Math.max(8, Math.min(left, viewportWidth - contentRect.width - 8));
      setCoords({ top, left });
    }
  }, [isOpen, align]);

  useLayoutEffect(() => {
    if (!isOpen) return;

    // Throttle scroll/resize handlers with RAF to avoid layout thrashing
    let rafId: number | null = null;

    const throttledUpdate = () => {
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        updatePosition();
        rafId = null;
      });
    };

    requestAnimationFrame(() => updatePosition());
    window.addEventListener('resize', throttledUpdate);
    window.addEventListener('scroll', throttledUpdate, true);

    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      window.removeEventListener('resize', throttledUpdate);
      window.removeEventListener('scroll', throttledUpdate, true);
    };
  }, [isOpen, updatePosition]);

  const handleToggle = (e: React.MouseEvent) => {
    if (!isOpen) {
      soundManager.playClick();
    }
    toggleDropdown(dropdownId);
    e.stopPropagation();
  };

  const closeMenu = () => {
    closeDropdown(dropdownId);
  };

  const menuVariants = {
    closed: { opacity: 0, y: -8, scale: 0.95, transition: { duration: 0.1 } },
    open: { opacity: 1, y: 0, scale: 1, transition: { type: 'spring' as const, damping: 25, stiffness: 400, mass: 0.5 } }
  };

  return (
    <>
      <div
        ref={triggerRef}
        data-dropdown-trigger={dropdownId}
        onClick={handleToggle}
        role="button"
        className={`cursor-pointer ${className}`}
        aria-haspopup="menu"
        aria-expanded={isOpen}
      >
        {trigger}
      </div>

      <div
        ref={popoverRef}
        popover="auto"
        id={dropdownId}
        data-dropdown-content="true"
        data-dropdown-id={dropdownId}
        className="m-0 p-0 border-none bg-transparent"
        style={{
          position: 'fixed',
          top: coords.top,
          left: coords.left,
        }}
      >
        <AnimatePresence>
          {isOpen && (
            <m.div
              initial="closed"
              animate="open"
              exit="closed"
              variants={menuVariants}
              className="glass-panel min-w-[180px] rounded-lg py-1 shadow-xl border border-border-default"
              style={{
                maxHeight: maxHeight || '80vh',
                overflowY: 'auto',
                backdropFilter: 'blur(16px)',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <MenuItems items={items} onClose={closeMenu} />
            </m.div>
          )}
        </AnimatePresence>
      </div>
    </>
  );
};
