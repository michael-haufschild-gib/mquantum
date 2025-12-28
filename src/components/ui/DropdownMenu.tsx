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
 * Portaled submenu that positions itself relative to a trigger rect
 * @param props - Component properties
 * @param props.items - Menu items to render
 * @param props.triggerRect - Bounding rect of the trigger element
 * @param props.onClose - Callback when menu should close
 * @param props.depth - Nesting depth for z-index calculation
 * @param props.onMouseEnter - Mouse enter handler
 * @param props.onMouseLeave - Mouse leave handler
 * @returns Rendered submenu portal
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
 * @param props - Component properties
 * @param props.items - Menu items to render
 * @param props.onClose - Callback when menu should close
 * @param props.depth - Nesting depth for z-index calculation
 * @returns Rendered menu items
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
 * Only one dropdown can be open at a time across the entire app.
 * Supports submenus, keyboard navigation, and click-outside closing.
 *
 * @param props - Component properties
 * @param props.trigger - The element that triggers the dropdown
 * @param props.items - Array of menu items to display
 * @param props.className - Additional CSS classes for the trigger wrapper
 * @param props.align - Alignment of the dropdown ('left' or 'right')
 * @param props.maxHeight - Maximum height of the dropdown content
 * @param props.onClose - Callback fired when the dropdown closes
 * @param props.id - Optional unique identifier (auto-generated if not provided)
 * @returns Rendered dropdown menu component
 *
 * @example
 * ```tsx
 * <DropdownMenu
 *   trigger={<Button>Open Menu</Button>}
 *   items={[
 *     { label: 'Item 1', onClick: () => console.log('clicked') },
 *     { label: '---' }, // Separator
 *     { label: 'Item 2', shortcut: '⌘S', onClick: handleSave },
 *   ]}
 * />
 * ```
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

  // Subscribe to store - only re-render when THIS dropdown's open state changes
  const { isOpen, toggleDropdown, closeDropdown } = useDropdownStore(
    useShallow((state) => ({
      isOpen: state.openDropdownId === dropdownId,
      toggleDropdown: state.toggleDropdown,
      closeDropdown: state.closeDropdown,
    }))
  );

  const triggerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
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

  const updatePosition = useCallback(() => {
    if (triggerRef.current && isOpen && contentRef.current) {
      const triggerRect = triggerRef.current.getBoundingClientRect();
      const contentRect = contentRef.current.getBoundingClientRect();
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
    if (isOpen) {
      requestAnimationFrame(() => updatePosition());
      window.addEventListener('resize', updatePosition);
      window.addEventListener('scroll', updatePosition, true);
    }
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [isOpen, updatePosition]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;

      // Let trigger clicks be handled by their onClick handlers
      if (target.closest('[data-dropdown-trigger]')) {
        return;
      }

      // Don't close when clicking inside dropdown content (including submenus)
      if (target.closest('[data-dropdown-content]')) {
        return;
      }

      // Click is outside all dropdowns - close this one
      if (isOpen && triggerRef.current && !triggerRef.current.contains(target)) {
        closeDropdown(dropdownId);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, dropdownId, closeDropdown]);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isOpen) {
        closeDropdown(dropdownId);
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
    }
    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, dropdownId, closeDropdown]);

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

      {createPortal(
        <AnimatePresence>
          {isOpen && (
            <m.div
              ref={contentRef}
              data-dropdown-content="true"
              data-dropdown-id={dropdownId}
              initial="closed"
              animate="open"
              exit="closed"
              variants={menuVariants}
              className="glass-panel min-w-[180px] rounded-lg py-1 shadow-xl border border-border-default"
              style={{
                position: 'fixed',
                top: coords.top,
                left: coords.left,
                zIndex: 150,
                maxHeight: maxHeight || '80vh',
                overflowY: 'auto',
                backdropFilter: 'blur(16px)',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <MenuItems items={items} onClose={closeMenu} />
            </m.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
  );
};
