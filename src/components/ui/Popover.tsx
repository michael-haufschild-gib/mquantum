import React, { useState, useRef, useEffect, useLayoutEffect, useCallback, useId } from 'react';
import { m, AnimatePresence } from 'motion/react';

export interface PopoverProps {
  trigger: React.ReactNode;
  content: React.ReactNode;
  className?: string;
  align?: 'start' | 'end' | 'center';
  side?: 'top' | 'bottom';
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  offset?: number;
}

export const Popover: React.FC<PopoverProps> = ({
  trigger,
  content,
  className = '',
  align = 'start',
  side = 'bottom',
  open: controlledOpen,
  onOpenChange,
  offset = 4,
}) => {
  const popoverRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const popoverId = useId();

  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const isOpen = isControlled ? controlledOpen : uncontrolledOpen;

  const [coords, setCoords] = useState({ top: 0, left: 0 });

  const handleOpenChange = useCallback((newOpen: boolean) => {
    if (!isControlled) {
      setUncontrolledOpen(newOpen);
    }
    onOpenChange?.(newOpen);
  }, [isControlled, onOpenChange]);

  // Sync popover visibility with React state
  useEffect(() => {
    const popover = popoverRef.current;
    if (!popover) return;

    if (isOpen && !popover.matches(':popover-open')) {
      popover.showPopover();
    } else if (!isOpen && popover.matches(':popover-open')) {
      popover.hidePopover();
    }
  }, [isOpen]);

  // Handle toggle event to sync state when popover closes via light-dismiss
  useEffect(() => {
    const popover = popoverRef.current;
    if (!popover) return;

    const handleToggle = (e: Event) => {
      const toggleEvent = e as ToggleEvent;
      handleOpenChange(toggleEvent.newState === 'open');
    };

    popover.addEventListener('toggle', handleToggle);
    return () => popover.removeEventListener('toggle', handleToggle);
  }, [handleOpenChange]);

  // Update position - memoized to avoid stale closure in event listeners
  const updatePosition = useCallback(() => {
    if (triggerRef.current && isOpen) {
      const triggerRect = triggerRef.current.getBoundingClientRect();
      const popoverRect = popoverRef.current?.getBoundingClientRect() || { width: 0, height: 0 };

      let top = 0;
      let left = 0;

      // Vertical Positioning
      if (side === 'bottom') {
        top = triggerRect.bottom + offset;
      } else {
        top = triggerRect.top - popoverRect.height - offset;
      }

      // Horizontal Positioning
      if (align === 'start') {
        left = triggerRect.left;
      } else if (align === 'end') {
        left = triggerRect.right - popoverRect.width;
      } else {
        left = triggerRect.left + (triggerRect.width / 2) - (popoverRect.width / 2);
      }

      // Viewport Collision Detection (Basic)
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      // Flip to top if bottom overflows
      if (side === 'bottom' && top + popoverRect.height > viewportHeight) {
        top = triggerRect.top - popoverRect.height - offset;
      }

      // Clamp left
      left = Math.max(8, Math.min(left, viewportWidth - popoverRect.width - 8));

      setCoords({ top, left });
    }
  }, [isOpen, side, align, offset]);

  useLayoutEffect(() => {
    if (isOpen) {
      updatePosition();
      window.addEventListener('resize', updatePosition);
      window.addEventListener('scroll', updatePosition, true); // Capture phase for nested scrolls
    }
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [isOpen, updatePosition]);

  return (
    <>
      <div
        ref={triggerRef}
        onClick={() => handleOpenChange(!isOpen)}
        className={`inline-block cursor-pointer ${className}`}
        role="button"
        aria-haspopup="dialog"
        aria-expanded={isOpen}
      >
        {trigger}
      </div>

      <div
        ref={popoverRef}
        popover="auto"
        id={popoverId}
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
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.1, ease: "easeOut" }}
              className="glass-panel rounded-lg shadow-2xl border border-border-default"
              style={{ backdropFilter: 'blur(24px)' }}
            >
              {content}
            </m.div>
          )}
        </AnimatePresence>
      </div>
    </>
  );
};
