import React from 'react'
import { useShallow } from 'zustand/react/shallow'

import { usePerformanceMetricsStore } from '@/stores/diagnostics/performanceMetricsStore'

import { Icons } from '../icons'
import { InfoCard, SectionHeader } from '../subcomponents'
import { formatMetric } from '../utils'

// ============================================================================
// STATS TAB - Isolated subscription for GPU/memory stats
// ============================================================================
export const StatsTabContent = React.memo(function StatsTabContent() {
  // Grouped subscription for stats data
  const { gpu, sceneGpu, memory } = usePerformanceMetricsStore(
    useShallow((s) => ({
      gpu: s.gpu,
      sceneGpu: s.sceneGpu,
      memory: s.memory,
    }))
  )

  return (
    <div className="grid grid-cols-1 gap-5 p-5">
      <div className="space-y-3">
        <SectionHeader icon={<Icons.Zap />} label="Scene Geometry" />
        <div className="grid grid-cols-2 gap-2">
          <InfoCard label="Calls" value={sceneGpu.calls} />
          <InfoCard label="Triangles" value={formatMetric(sceneGpu.triangles)} />
          <InfoCard label="Vertices" value={formatMetric(sceneGpu.vertices)} />
          <InfoCard label="Points" value={formatMetric(sceneGpu.points)} />
        </div>
      </div>
      <div className="space-y-3">
        <SectionHeader icon={<Icons.Layers />} label="Total Rendered" />
        <div className="grid grid-cols-2 gap-2">
          <InfoCard label="Calls" value={gpu.calls} />
          <InfoCard label="Triangles" value={formatMetric(gpu.triangles)} />
          <InfoCard label="Vertices" value={formatMetric(gpu.vertices)} />
          <InfoCard label="Points" value={formatMetric(gpu.points)} />
        </div>
      </div>
      <div className="space-y-3">
        <SectionHeader icon={<Icons.Database />} label="Memory" />
        <div className="grid grid-cols-2 gap-2">
          <InfoCard label="Textures" value={memory.textures} />
          <InfoCard label="Programs" value={memory.programs} />
          <InfoCard label="Geometries" value={memory.geometries} />
          <InfoCard label="Heap" value={`${memory.heap.toFixed(1)} MB`} />
        </div>
      </div>
    </div>
  )
})
