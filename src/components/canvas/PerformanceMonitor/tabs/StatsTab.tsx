import { getConfigStoreKey, isRaymarchingType } from '@/lib/geometry/registry'
import { useExtendedObjectStore } from '@/stores/extendedObjectStore'
import { useGeometryStore } from '@/stores/geometryStore'
import { usePerformanceMetricsStore } from '@/stores/performanceMetricsStore'
import React from 'react'
import { useShallow } from 'zustand/react/shallow'
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

  const objectType = useGeometryStore((s) => s.objectType)
  const { mandelbulbConfig, quaternionJuliaConfig } = useExtendedObjectStore(
    useShallow((s) => ({
      mandelbulbConfig: s.mandelbulb,
      quaternionJuliaConfig: s.quaternionJulia,
    }))
  )

  const sceneVertices = sceneGpu.triangles * 3 + sceneGpu.lines * 2 + sceneGpu.points
  const totalVertices = gpu.triangles * 3 + gpu.lines * 2 + gpu.points
  const isRaymarching = isRaymarchingType(objectType)
  const configKey = getConfigStoreKey(objectType)
  const raySteps =
    configKey === 'mandelbulb'
      ? mandelbulbConfig.maxIterations
      : configKey === 'quaternionJulia'
        ? quaternionJuliaConfig.maxIterations
        : 0

  return (
    <div className="grid grid-cols-1 gap-5 p-5">
      <div className="space-y-3">
        <SectionHeader icon={<Icons.Zap />} label="Scene Geometry" />
        <div className="grid grid-cols-2 gap-2">
          <InfoCard label="Calls" value={sceneGpu.calls} />
          <InfoCard label="Triangles" value={formatMetric(sceneGpu.triangles)} />
          <InfoCard label="Vertices" value={formatMetric(sceneVertices)} />
          <InfoCard label="Points" value={formatMetric(sceneGpu.points)} />
        </div>
      </div>
      <div className="space-y-3">
        <SectionHeader icon={<Icons.Layers />} label="Total Rendered" />
        <div className="grid grid-cols-2 gap-2">
          <InfoCard label="Calls" value={gpu.calls} />
          <InfoCard label="Triangles" value={formatMetric(gpu.triangles)} />
          <InfoCard label="Vertices" value={formatMetric(totalVertices)} />
          <InfoCard label="Points" value={formatMetric(gpu.points)} />
        </div>
      </div>
      <div className="space-y-3">
        <SectionHeader icon={<Icons.Database />} label="Memory" />
        <div className="grid grid-cols-2 gap-2">
          <InfoCard label="Textures" value={memory.textures} />
          <InfoCard label="Programs" value={memory.programs} />
          <InfoCard label="Geometries" value={memory.geometries} />
          <InfoCard label="Heap" value={`${memory.heap} MB`} />
        </div>
      </div>
      {isRaymarching && (
        <div className="space-y-3">
          <SectionHeader icon={<Icons.Activity />} label="Raymarching" />
          <div className="grid grid-cols-2 gap-2">
            <InfoCard label="Steps" value={raySteps} highlight />
            <InfoCard label="Precision" value="High" />
          </div>
        </div>
      )}
    </div>
  )
})
