import React, { useEffect, useState } from 'react';
import { m, AnimatePresence } from 'motion/react';
import { usePerformanceStore } from '@/stores/performanceStore';
import { useEnvironmentStore } from '@/stores/environmentStore';
import { useShallow } from 'zustand/react/shallow';

export const GlobalProgress: React.FC = () => {
  const { sceneTransitioning, refinementProgress } = usePerformanceStore(
    useShallow((s) => ({
      sceneTransitioning: s.sceneTransitioning,
      refinementProgress: s.refinementProgress,
    }))
  );
  const skyboxLoading = useEnvironmentStore((s) => s.skyboxLoading);

  // We show the bar if:
  // 1. Scene is transitioning (indeterminate or just started)
  // 2. Skybox is loading (indeterminate)
  // 3. Refinement is in progress (determinate < 100)
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    if (sceneTransitioning || skyboxLoading || refinementProgress < 100) {
        setIsVisible(true);
    } else {
        // Small delay before hiding to prevent flickering
        timer = setTimeout(() => setIsVisible(false), 500);
    }
    return () => clearTimeout(timer);
  }, [sceneTransitioning, skyboxLoading, refinementProgress]);

  // If indeterminate
  const isIndeterminate = sceneTransitioning || skyboxLoading;

  return (
    <AnimatePresence>
      {isVisible && (
        <m.div
          initial={{ opacity: 0, scaleY: 0 }}
          animate={{ opacity: 1, scaleY: 1 }}
          exit={{ opacity: 0, scaleY: 0 }}
          className="absolute top-0 left-0 right-0 h-[2px] z-[100] origin-left pointer-events-none overflow-hidden"
        >
          {/* Background Track */}
          <div className="absolute inset-0 bg-[var(--bg-active)]" />

          {/* Progress Bar */}
          {isIndeterminate ? (
             <div className="absolute inset-0 bg-gradient-to-r from-transparent via-accent to-transparent w-[50%] animate-[shimmer_1.5s_infinite] translate-x-[-100%]" />
          ) : (
             <m.div 
               className="absolute inset-y-0 left-0 bg-accent shadow-[0_0_10px_var(--color-accent)]"
               initial={{ width: 0 }}
               animate={{ width: `${refinementProgress}%` }}
               transition={{ type: "spring", stiffness: 100, damping: 20 }}
             />
          )}
        </m.div>
      )}
    </AnimatePresence>
  );
};
