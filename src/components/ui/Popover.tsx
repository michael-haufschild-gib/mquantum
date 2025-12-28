import React, { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
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
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const isOpen = isControlled ? controlledOpen : uncontrolledOpen;
  
  const triggerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState({ top: 0, left: 0 });

  const handleOpenChange = useCallback((newOpen: boolean) => {
    if (!isControlled) {
      setUncontrolledOpen(newOpen);
    }
    onOpenChange?.(newOpen);
  }, [isControlled, onOpenChange]);

  // Update position - memoized to avoid stale closure in event listeners
  const updatePosition = useCallback(() => {
    if (triggerRef.current && isOpen) {
      const triggerRect = triggerRef.current.getBoundingClientRect();
      const contentRect = contentRef.current?.getBoundingClientRect() || { width: 0, height: 0 };

      let top = 0;
      let left = 0;

      // Vertical Positioning
      if (side === 'bottom') {
        top = triggerRect.bottom + offset + window.scrollY;
      } else {
        top = triggerRect.top - contentRect.height - offset + window.scrollY;
      }

      // Horizontal Positioning
      if (align === 'start') {
        left = triggerRect.left + window.scrollX;
      } else if (align === 'end') {
        left = triggerRect.right - contentRect.width + window.scrollX;
      } else {
        left = triggerRect.left + (triggerRect.width / 2) - (contentRect.width / 2) + window.scrollX;
      }

      // Viewport Collision Detection (Basic)
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight; // Not accounting for scroll here as we use fixed logic relative to window usually, but let's stick to absolute doc coords

      // Flip to top if bottom overflows
      if (side === 'bottom' && top + contentRect.height > window.scrollY + viewportHeight) {
         top = triggerRect.top - contentRect.height - offset + window.scrollY;
      }

      // Clamp left
      left = Math.max(8, Math.min(left, viewportWidth - contentRect.width - 8));

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

  // Click Outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        isOpen &&
        triggerRef.current && 
        !triggerRef.current.contains(event.target as Node) &&
        contentRef.current && 
        !contentRef.current.contains(event.target as Node)
      ) {
        handleOpenChange(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, handleOpenChange]);

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

      {createPortal(
        <AnimatePresence>
          {isOpen && (
            <m.div
              ref={contentRef}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.1, ease: "easeOut" }}
              className="fixed z-[9999] glass-panel rounded-lg shadow-2xl border border-border-default"
              style={{ 
                top: coords.top, 
                left: coords.left,
                position: 'absolute', // We calculated doc-relative coords
                backdropFilter: 'blur(24px)'
              }}
            >
              {content}
            </m.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
  );
};