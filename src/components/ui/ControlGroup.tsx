import { soundManager } from '@/lib/audio/SoundManager';
import { AnimatePresence, m } from 'motion/react';
import React, { useState } from 'react';

export interface ControlGroupProps {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  collapsible?: boolean;
  className?: string;
  rightElement?: React.ReactNode;
  variant?: 'default' | 'card'; // Added variant
}

export const ControlGroup: React.FC<ControlGroupProps> = ({
  title,
  children,
  defaultOpen = true,
  collapsible = false,
  className = '',
  rightElement,
  variant = 'default',
}) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  const toggle = () => {
    if (collapsible) {
      setIsOpen(!isOpen);
      soundManager.playClick();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (collapsible && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      toggle();
    }
  };

  const isCard = variant === 'card';
  const showTitleSection = collapsible || title.trim() !== '';

  return (
    <div className={`
      ${isCard ? 'border border-[var(--border-subtle)] rounded-lg bg-[var(--bg-hover)] overflow-hidden' : 'border-b border-[var(--border-subtle)] pb-2 last:border-0'}
      ${className}
    `}>
      {showTitleSection && (
        <div
          role={collapsible ? 'button' : undefined}
          tabIndex={collapsible ? 0 : undefined}
          aria-expanded={collapsible ? isOpen : undefined}
          aria-label={collapsible ? `${title} section, ${isOpen ? 'expanded' : 'collapsed'}` : undefined}
          className={`
            flex items-center justify-between py-1.5
            ${isCard ? 'px-3 bg-[var(--bg-active)] border-b border-[var(--border-subtle)]' : ''}
            ${collapsible ? 'cursor-pointer hover:text-[var(--text-primary)] transition-colors focus:outline-none focus:ring-1 focus:ring-accent/50 focus:ring-inset' : ''}
          `}
          onClick={toggle}
          onKeyDown={handleKeyDown}
        >
          <div className="flex items-center gap-2">
            {collapsible && (
              <m.div
                animate={{ rotate: isOpen ? 90 : 0 }}
                transition={{ duration: 0.2 }}
                className="text-text-tertiary"
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6"/></svg>
              </m.div>
            )}
            <span className={`text-xs font-semibold uppercase tracking-wider ${collapsible ? 'text-text-secondary group-hover:text-text-primary' : 'text-text-secondary'}`}>
              {title}
            </span>
          </div>

          {rightElement && (
            <div onClick={(e) => e.stopPropagation()}>
              {rightElement}
            </div>
          )}
        </div>
      )}

      <AnimatePresence initial={false}>
        {(isOpen || !collapsible) && (
          <m.div
            initial={collapsible ? { height: 0, opacity: 0 } : undefined}
            animate={collapsible ? { height: 'auto', opacity: 1 } : undefined}
            exit={collapsible ? { height: 0, opacity: 0 } : undefined}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className={`${isCard ? 'p-3' : 'pt-2'} space-y-3 ml-1 pl-2 border-l border-[var(--border-subtle)]`}>
              {children}
            </div>
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
};
