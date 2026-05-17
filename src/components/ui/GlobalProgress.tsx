import { AnimatePresence, m } from 'motion/react'
import React, { useEffect, useState } from 'react'

import { usePerformanceStore } from '@/stores/runtime/performanceStore'
import { useEnvironmentStore } from '@/stores/scene/environmentStore'

export const GlobalProgress: React.FC = React.memo(() => {
  const sceneTransitioning = usePerformanceStore((s) => s.sceneTransitioning)
  const skyboxLoading = useEnvironmentStore((s) => s.skyboxLoading)

  // Show bar while a scene transition or skybox load is in flight.
  const active = sceneTransitioning || skyboxLoading
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    if (active) {
      timer = setTimeout(() => setIsVisible(true), 0)
    } else {
      // Small delay before hiding to prevent flickering
      timer = setTimeout(() => setIsVisible(false), 500)
    }
    return () => clearTimeout(timer)
  }, [active])

  return (
    <AnimatePresence>
      {isVisible && (
        <m.div
          initial={{ opacity: 0, scaleY: 0 }}
          animate={{ opacity: 1, scaleY: 1 }}
          exit={{ opacity: 0, scaleY: 0 }}
          className="absolute top-0 inset-x-0 h-[2px] z-[100] origin-left pointer-events-none overflow-hidden"
        >
          {/* Background Track */}
          <div className="absolute inset-0 bg-[var(--bg-active)]" />

          {/* Indeterminate shimmer — no determinate progress source remains. */}
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-accent to-transparent w-[50%] animate-[shimmer_1.5s_infinite] translate-x-[-100%]" />
        </m.div>
      )}
    </AnimatePresence>
  )
})

GlobalProgress.displayName = 'GlobalProgress'
