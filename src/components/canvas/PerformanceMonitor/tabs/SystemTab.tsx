import { usePerformanceMetricsStore } from '@/stores/performanceMetricsStore'
import { useRendererStore } from '@/stores/rendererStore'
import React from 'react'
import { useShallow } from 'zustand/react/shallow'
import { Icons } from '../icons'
import { InfoCard, ProgressBar, SectionHeader } from '../subcomponents'
import { formatBytes } from '../utils'

// ============================================================================
// SYSTEM TAB - Isolated subscription for system info
// ============================================================================
export const SystemTabContent = React.memo(function SystemTabContent() {
  const { gpuName, viewport, vram } = usePerformanceMetricsStore(
    useShallow((s) => ({
      gpuName: s.gpuName,
      viewport: s.viewport,
      vram: s.vram,
    }))
  )
  const { adapterMode, adapterModeEstimated } = useRendererStore(
    useShallow((s) => ({
      adapterMode: s.webgpuCapabilities?.adapterMode,
      adapterModeEstimated: s.webgpuCapabilities?.adapterModeEstimated ?? false,
    }))
  )

  const normalizedAdapterMode = adapterMode === 'software' ? 'software' : 'hardware'
  const rendererLabel = normalizedAdapterMode === 'software' ? 'Software' : 'Hardware'
  const rendererValue = adapterModeEstimated ? `${rendererLabel} (estimated)` : rendererLabel

  return (
    <div className="space-y-5 p-5">
      <div className="space-y-3">
        <SectionHeader icon={<Icons.Activity />} label="Renderer" />
        <div className="grid grid-cols-1 gap-2">
          <InfoCard
            label="Mode"
            value={rendererValue}
            highlight={normalizedAdapterMode === 'software'}
          />
        </div>
      </div>
      <div className="space-y-3">
        <SectionHeader icon={<Icons.Chip />} label="GPU Info" />
        <div className="p-3 bg-[var(--bg-hover)] rounded-lg border border-border-subtle text-xs text-text-secondary font-mono leading-relaxed">
          {gpuName}
        </div>
      </div>
      <div className="space-y-3">
        <SectionHeader icon={<Icons.Monitor />} label="Viewport" />
        <div className="grid grid-cols-2 gap-2">
          <InfoCard label="Resolution" value={`${viewport.width} × ${viewport.height}`} />
          <InfoCard label="DPR" value={`${viewport.dpr.toFixed(2)}x`} />
        </div>
      </div>
      <div className="space-y-3">
        <SectionHeader icon={<Icons.Database />} label="VRAM Estimation" />
        <div className="bg-[var(--bg-hover)] rounded-lg p-3 space-y-3 border border-border-subtle">
          <div className="flex justify-between items-baseline">
            <span className="text-[10px] text-text-tertiary uppercase tracking-wider">Total</span>
            <span className="text-sm font-bold font-mono text-text-primary">
              {formatBytes(vram.total)}
            </span>
          </div>
          <div className="space-y-2">
            <ProgressBar
              label="Geometry"
              value={vram.geometries}
              total={vram.total}
              color="bg-indigo-500"
            />
            <ProgressBar
              label="Textures"
              value={vram.textures}
              total={vram.total}
              color="bg-pink-500"
            />
          </div>
        </div>
      </div>
    </div>
  )
})
