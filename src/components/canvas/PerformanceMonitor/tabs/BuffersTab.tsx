import { Button } from '@/components/ui/Button'
import { useGeometryStore } from '@/stores/geometryStore'
import { usePerformanceMetricsStore, type BufferStats } from '@/stores/performanceMetricsStore'
import { usePerformanceStore } from '@/stores/performanceStore'
import { useUIStore } from '@/stores/uiStore'
import React, { useCallback, useEffect, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { Icons } from '../icons'
import { BufferRow, DebugToggle, SectionHeader } from '../subcomponents'

// ============================================================================
// BUFFERS TAB - Manual refresh, isolated subscriptions
// ============================================================================
export const BuffersTabContent = React.memo(function BuffersTabContent() {
  const objectType = useGeometryStore((s) => s.objectType)
  const temporalReprojectionEnabled = usePerformanceStore((s) => s.temporalReprojectionEnabled)

  const {
    showDepthBuffer,
    setShowDepthBuffer,
    showNormalBuffer,
    setShowNormalBuffer,
    showTemporalDepthBuffer,
    setShowTemporalDepthBuffer,
  } = useUIStore(
    useShallow((s) => ({
      showDepthBuffer: s.showDepthBuffer,
      setShowDepthBuffer: s.setShowDepthBuffer,
      showNormalBuffer: s.showNormalBuffer,
      setShowNormalBuffer: s.setShowNormalBuffer,
      showTemporalDepthBuffer: s.showTemporalDepthBuffer,
      setShowTemporalDepthBuffer: s.setShowTemporalDepthBuffer,
    }))
  )

  const [bufferStats, setBufferStats] = useState<BufferStats | null>(null)

  // Temporal preview availability
  const temporalPreviewAvailable =
    temporalReprojectionEnabled && objectType === 'schroedinger'

  // Graceful handling: turn off temporal preview when object type changes to unsupported
  useEffect(() => {
    if (showTemporalDepthBuffer && !temporalPreviewAvailable) {
      setShowTemporalDepthBuffer(false)
    }
  }, [temporalPreviewAvailable, showTemporalDepthBuffer, setShowTemporalDepthBuffer])

  // Refresh buffer stats on mount
  const refreshBufferStats = useCallback(() => {
    const currentStats = usePerformanceMetricsStore.getState().buffers
    setBufferStats({ ...currentStats })
  }, [])

  useEffect(() => {
    refreshBufferStats()
  }, [refreshBufferStats])

  return (
    <div className="space-y-5 p-5">
      <div className="flex items-center justify-between">
        <SectionHeader icon={<Icons.Square />} label="Render Targets" />
        <Button
          variant="ghost"
          size="icon"
          onClick={refreshBufferStats}
          ariaLabel="Refresh buffer stats"
        >
          <Icons.RefreshCw className="w-3 h-3" />
        </Button>
      </div>
      {!bufferStats ? (
        <div className="text-center text-text-tertiary py-4 text-xs">Loading...</div>
      ) : (
        <div className="space-y-2">
          <BufferRow
            label="Screen"
            w={bufferStats.screen.width}
            h={bufferStats.screen.height}
            baseW={bufferStats.screen.width}
          />
          <BufferRow
            label="Depth"
            w={bufferStats.depth.width}
            h={bufferStats.depth.height}
            baseW={bufferStats.screen.width}
          />
          <BufferRow
            label="Normal"
            w={bufferStats.normal.width}
            h={bufferStats.normal.height}
            baseW={bufferStats.screen.width}
          />
          <BufferRow
            label="Temporal"
            w={bufferStats.temporal.width}
            h={bufferStats.temporal.height}
            baseW={bufferStats.screen.width}
            highlight={bufferStats.temporal.width !== bufferStats.screen.width * 0.5}
          />
        </div>
      )}
      <div className="space-y-3 pt-3 border-t border-border-subtle">
        <SectionHeader icon={<Icons.Monitor />} label="Debug View" />
        <div className="grid grid-cols-3 gap-2">
          <DebugToggle
            label="Depth"
            active={showDepthBuffer}
            onClick={() => setShowDepthBuffer(!showDepthBuffer)}
          />
          <DebugToggle
            label="Normal"
            active={showNormalBuffer}
            onClick={() => setShowNormalBuffer(!showNormalBuffer)}
          />
          <DebugToggle
            label="Temporal"
            active={showTemporalDepthBuffer}
            onClick={() => setShowTemporalDepthBuffer(!showTemporalDepthBuffer)}
            disabled={!temporalPreviewAvailable}
          />
        </div>
      </div>
    </div>
  )
})
