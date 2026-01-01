import { usePanelCollision } from '@/hooks/usePanelCollision';
import { useUIStore } from '@/stores/uiStore';
import { AnimatePresence, LazyMotion, domMax, m, useMotionValue } from 'motion/react';
import React, { useEffect, useRef, useState } from 'react';
import { CollapsedView } from './CollapsedView';
import { ExpandedContent } from './ExpandedContent';

// ============================================================================
// MAIN COMPONENT - NO store subscriptions, minimal re-renders
// ============================================================================
/**
 * Performance Monitor UI Component
 *
 * PERFORMANCE OPTIMIZATION:
 * - Parent has ZERO store subscriptions to avoid re-renders when collapsed
 * - CollapsedView updates via refs (no React re-renders)
 * - ExpandedContent delegates to memoized tab components
 * - Each tab component has isolated subscriptions
 * - sceneGpu updates throttled to 2Hz (was 60Hz)
 * @returns The performance monitor overlay component
 */
export function PerformanceMonitor() {
  // -- State --
  // Use store for expanded state so PerformanceStatsCollector can read it
  const expanded = useUIStore((s) => s.perfMonitorExpanded);
  const setExpanded = useUIStore((s) => s.setPerfMonitorExpanded);
  const [isDragging, setIsDragging] = useState(false);
  const [didDrag, setDidDrag] = useState(false);

  // -- Dimensions & Positioning --
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(180);
  const [height, setHeight] = useState(48);

  // Motion values for drag
  const x = useMotionValue(0);
  const y = useMotionValue(0);

  // Resize Observer - only when expanded
  useEffect(() => {
    if (!expanded) {
      setWidth(180);
      setHeight(48);
      return;
    }

    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setWidth(entry.contentRect.width);
        setHeight(entry.contentRect.height);
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [expanded]);

  // Panel collision - keeps monitor from being covered by sidebars/toolbars
  usePanelCollision(x, y, width, height, isDragging);

  return (
    <LazyMotion features={domMax}>
      <m.div
        ref={containerRef}
        drag
        dragMomentum={false}
        style={{ x, y }}
        onDragStart={() => { setIsDragging(true); setDidDrag(true); }}
        onDragEnd={() => setTimeout(() => { setIsDragging(false); setDidDrag(false); }, 100)}
        onTap={() => {
          if (!expanded && !didDrag) setExpanded(true);
        }}
        className="absolute top-20 left-4 z-[50] pointer-events-auto select-none"
      >
        {/* Collapsed View - static, no animations */}
        {!expanded && (
          <div
            className="
              relative overflow-hidden rounded-full
              glass-panel hover:brightness-110 cursor-pointer
              shadow-[var(--shadow-hard)]
              transition-all duration-300
            "
          >
            <CollapsedView />
          </div>
        )}

        {/* Expanded View */}
        <AnimatePresence mode="wait">
          {expanded && (
            <m.div
              key="expanded"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ type: "spring", stiffness: 400, damping: 30 }}
              className="
                flex flex-col w-[360px]
                relative overflow-hidden rounded-2xl
                glass-panel
                shadow-[var(--shadow-hard)]
              "
            >
              <ExpandedContent onCollapse={() => setExpanded(false)} didDrag={didDrag} />
            </m.div>
          )}
        </AnimatePresence>
      </m.div>
    </LazyMotion>
  );
}
