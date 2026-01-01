/**
 * Tabs Component
 *
 * A reusable tab component for organizing content into switchable panels.
 * Follows the project's premium aesthetic with subtle motion and glass effects.
 *
 * Optimized to avoid forced reflows and support "keep-alive" with "mount-on-demand" for tab content.
 */

import ChevronLeftIcon from '@/assets/icons/chevron-left2.svg?react';
import ChevronRightIcon from '@/assets/icons/chevron-right2.svg?react';
import { soundManager } from '@/lib/audio/SoundManager';
import { m } from 'motion/react';
import React, { useCallback, useEffect, useId, useRef, useState, useTransition, useMemo } from 'react';

export interface Tab {
  /** Unique identifier for the tab */
  id: string;
  /** Label displayed on the tab button */
  label: React.ReactNode;
  /** Content rendered when tab is active */
  content: React.ReactNode;
}

export interface TabsProps {
  /** Array of tab definitions */
  tabs: Tab[];
  /** Currently active tab id */
  value: string;
  /** Callback when active tab changes */
  onChange: (id: string) => void;
  /** Optional class name for the container */
  className?: string;
  /** Optional class name for the tab list */
  tabListClassName?: string;
  /** Optional class name for the content panel */
  contentClassName?: string;
  /** Visual variant of the tabs */
  variant?: 'default' | 'minimal' | 'pills';
  /** Whether tabs should expand to fill the container width */
  fullWidth?: boolean;
  /** Test ID for testing */
  'data-testid'?: string;
}

// Individual tab button component for proper memoization
const TabButton = React.memo(({
  tab,
  index,
  isActive,
  isPending,
  instanceId,
  variant,
  fullWidth,
  testId,
  onTabChange,
  onKeyDown,
  tabRef,
}: {
  tab: Tab;
  index: number;
  isActive: boolean;
  isPending: boolean;
  instanceId: string;
  variant: 'default' | 'minimal' | 'pills';
  fullWidth: boolean;
  testId?: string;
  onTabChange: (id: string) => void;
  onKeyDown: (e: React.KeyboardEvent, index: number) => void;
  tabRef: (el: HTMLButtonElement | null) => void;
}) => {
  const handleClick = useCallback(() => {
    onTabChange(tab.id);
  }, [onTabChange, tab.id]);

  const handleMouseEnter = useCallback(() => {
    if (!isActive) {
      soundManager.playHover();
    }
  }, [isActive]);

  const handleKeyDownWrapper = useCallback((e: React.KeyboardEvent) => {
    onKeyDown(e, index);
  }, [onKeyDown, index]);

  return (
    <button
      ref={tabRef}
      type="button"
      role="tab"
      id={`tab-${tab.id}`}
      aria-selected={isActive}
      aria-controls={`panel-${tab.id}`}
      tabIndex={isActive ? 0 : -1}
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      onKeyDown={handleKeyDownWrapper}
      className={`
        relative px-4 py-2 text-[10px] uppercase tracking-widest font-bold whitespace-nowrap select-none transition-colors duration-200 cursor-pointer
        outline-none focus:outline-none focus-visible:outline-none border-none focus:ring-0
        ${fullWidth ? 'flex-1' : ''}
        ${isActive ? 'text-accent text-glow-subtle' : 'text-text-secondary hover:text-text-primary'}
        ${variant === 'pills' && isActive ? 'bg-[var(--bg-active)] rounded shadow-sm' : ''}
        ${variant === 'pills' && !isActive ? 'hover:bg-[var(--bg-hover)] rounded' : ''}
        ${isPending && !isActive ? 'opacity-50' : ''}
      `}
      data-testid={testId ? `${testId}-tab-${tab.id}` : undefined}
    >
      {isActive && variant !== 'pills' && (
        <m.div
          layoutId={`activeTab-${instanceId}`}
          className="absolute bottom-[-1px] inset-inline-0 h-[2px] bg-accent shadow-[0_0_8px_var(--color-accent)]"
          transition={{ type: "spring", bounce: 0.2, duration: 0.5 }}
        />
      )}
      {isActive && variant !== 'pills' && (
        <div className="absolute inset-0 bg-gradient-to-t from-accent/5 to-transparent pointer-events-none" />
      )}
      <span className="relative z-10">{tab.label}</span>
    </button>
  );
});

TabButton.displayName = 'TabButton';

export const Tabs: React.FC<TabsProps> = React.memo(({
  tabs,
  value,
  onChange,
  className = '',
  tabListClassName = '',
  contentClassName = '',
  variant = 'default',
  fullWidth = false,
  'data-testid': testId,
}) => {
  const instanceId = useId();
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [mountedTabs, setMountedTabs] = useState<Set<string>>(new Set([value]));

  // Track direction for slide animation
  const prevValue = useRef(value);
  const activeIndex = tabs.findIndex((tab) => tab.id === value);
  const prevIndex = tabs.findIndex((tab) => tab.id === prevValue.current);

  useEffect(() => {
    if (activeIndex !== prevIndex) {
        prevValue.current = value;
    }
    // Mark tab as mounted when it becomes active
    setMountedTabs(prev => {
        if (prev.has(value)) return prev;
        const next = new Set(prev);
        next.add(value);
        return next;
    });
  }, [value, activeIndex, prevIndex]);

  // Optimized Scroll Checking using ResizeObserver
  // Wait for layout to stabilize before showing scroll indicators
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    let stableCheckCount = 0;
    let lastScrollWidth = 0;
    let lastClientWidth = 0;

    const checkScroll = () => {
      if (!container) return;
      const { scrollLeft, scrollWidth, clientWidth } = container;

      // Only show scroll indicators if there's meaningful overflow (> 5px)
      // This prevents false positives from sub-pixel rendering and animation timing
      const overflowThreshold = 5;
      const hasLeftOverflow = scrollLeft > overflowThreshold;
      const hasRightOverflow = scrollWidth - clientWidth - scrollLeft > overflowThreshold;

      setCanScrollLeft(hasLeftOverflow);
      setCanScrollRight(hasRightOverflow);
    };

    // Stability check: wait for dimensions to stabilize before initial check
    // This handles the Section open animation timing issue
    const waitForStableLayout = () => {
      const { scrollWidth, clientWidth } = container;

      if (scrollWidth === lastScrollWidth && clientWidth === lastClientWidth) {
        stableCheckCount++;
        if (stableCheckCount >= 2) {
          // Layout is stable, do the real check
          checkScroll();
          return;
        }
      } else {
        stableCheckCount = 0;
      }

      lastScrollWidth = scrollWidth;
      lastClientWidth = clientWidth;

      // Check again in next frame
      requestAnimationFrame(waitForStableLayout);
    };

    // Use ResizeObserver for size changes after initial mount
    const resizeObserver = new ResizeObserver(() => {
      requestAnimationFrame(checkScroll);
    });
    resizeObserver.observe(container);

    // Wait for stable layout before initial check
    requestAnimationFrame(waitForStableLayout);

    // Check on scroll (throttled via RAF naturally)
    const handleScroll = () => requestAnimationFrame(checkScroll);
    container.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      resizeObserver.disconnect();
      container.removeEventListener('scroll', handleScroll);
    };
  }, []);

  const scrollLeft = useCallback(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollBy({
        left: -100,
        behavior: 'smooth',
      });
    }
  }, []);

  const scrollRight = useCallback(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollBy({
        left: 100,
        behavior: 'smooth',
      });
    }
  }, []);

  const handleTabChange = useCallback((id: string) => {
    if (id !== value) {
        soundManager.playClick();
        startTransition(() => {
            onChange(id);
        });
    }
  }, [value, onChange]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent, index: number) => {
      let newIndex = index;
      switch (event.key) {
        case 'ArrowLeft':
          newIndex = index === 0 ? tabs.length - 1 : index - 1;
          break;
        case 'ArrowRight':
          newIndex = index === tabs.length - 1 ? 0 : index + 1;
          break;
        case 'Home':
          newIndex = 0;
          break;
        case 'End':
          newIndex = tabs.length - 1;
          break;
        default:
          return;
      }
      event.preventDefault();
      const targetTab = tabs[newIndex];
      if (targetTab) {
        handleTabChange(targetTab.id);
        tabRefs.current[newIndex]?.focus();
      }
    },
    [tabs, handleTabChange]
  );

  // Styling logic
  const listContainerStyles = variant === 'pills'
    ? 'bg-[var(--bg-hover)] rounded-lg p-1 gap-1'
    : 'border-b border-border-subtle pb-[1px]';

  const widthStyles = fullWidth ? 'w-full' : 'min-w-full w-max';

  // Memoize tab ref callback generator
  const getTabRef = useCallback((index: number) => (el: HTMLButtonElement | null) => {
    tabRefs.current[index] = el;
  }, []);

  // Memoize mounted tabs check
  const tabPanels = useMemo(() => tabs.map((tab) => {
    if (!mountedTabs.has(tab.id)) return null;

    return (
      <div
        key={tab.id}
        className={`w-full h-full ${tab.id === value ? 'block animate-fade-in' : 'hidden'}`}
        role="tabpanel"
        aria-labelledby={`tab-${tab.id}`}
        data-testid={testId ? `${testId}-panel-${tab.id}` : undefined}
      >
        {tab.content}
      </div>
    );
  }), [tabs, mountedTabs, value, testId]);

  return (
    <div className={`flex flex-col ${className}`} data-testid={testId}>
      {/* Header Area - tabListClassName applied here for spacing, outside indicator context */}
      <div className={`shrink-0 z-10 ${tabListClassName}`}>
        {/* Inner wrapper for scroll indicator positioning - excludes margin */}
        <div className="relative">
          {/* Scroll Indicators */}
          {canScrollLeft && (
            <button
              type="button"
              onClick={scrollLeft}
              className="absolute left-0 top-0 bottom-0 z-20 px-1 bg-gradient-to-r from-panel to-transparent flex items-center justify-center text-text-secondary hover:text-text-primary transition-colors"
            >
              <ChevronLeftIcon className="w-3 h-3" />
            </button>
          )}

          {/* Tab List */}
          <div
            ref={scrollContainerRef}
            className={`overflow-x-auto scrollbar-none ${fullWidth ? 'w-full' : ''}`}
          >
            <div
              className={`flex items-center ${listContainerStyles} ${widthStyles}`}
              role="tablist"
            >
              {tabs.map((tab, index) => {
                const isActive = tab.id === value;
                return (
                  <TabButton
                    key={tab.id}
                    tab={tab}
                    index={index}
                    isActive={isActive}
                    isPending={isPending}
                    instanceId={instanceId}
                    variant={variant}
                    fullWidth={fullWidth}
                    testId={testId}
                    onTabChange={handleTabChange}
                    onKeyDown={handleKeyDown}
                    tabRef={getTabRef(index)}
                  />
                );
              })}
            </div>
          </div>

          {/* Right Scroll Indicator */}
          {canScrollRight && (
            <button
              type="button"
              onClick={scrollRight}
              className="absolute right-0 top-0 bottom-0 z-20 px-1 bg-gradient-to-l from-panel to-transparent flex items-center justify-center text-text-secondary hover:text-text-primary transition-colors"
            >
              <ChevronRightIcon className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* Content Panel - Keep Alive with Mount on Demand */}
      <div className={`flex-1 min-h-0 relative overflow-y-auto scrollbar-none ${contentClassName}`}>
        {tabPanels}
      </div>
    </div>
  );
});

Tabs.displayName = 'Tabs';
