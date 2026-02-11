/**
 * Temporal Reprojection Controls Component
 * Controls for temporal accumulation and reprojection.
 */

import { Switch } from '@/components/ui/Switch'
import { useGeometryStore } from '@/stores/geometryStore'
import { usePerformanceStore } from '@/stores/performanceStore'
import React from 'react'
import { useShallow } from 'zustand/react/shallow'

/**
 * Temporal reprojection controls for the Performance section.
 * Affects Schrödinger volumetric rendering modes.
 * @returns The temporal reprojection controls UI component
 */
export const TemporalReprojectionControls: React.FC = () => {
  const { enabled, setEnabled } = usePerformanceStore(
    useShallow((s) => ({
      enabled: s.temporalReprojectionEnabled,
      setEnabled: s.setTemporalReprojectionEnabled,
    }))
  )
  const dimension = useGeometryStore((s) => s.dimension)

  if (dimension <= 2) return null

  return (
    <div className="space-y-2">
      <Switch
        checked={enabled}
        onCheckedChange={setEnabled}
        label="Temporal Reprojection"
        data-testid="temporal-reprojection-toggle"
      />
      <p className="text-xs text-text-tertiary ml-4">
        Schrödinger volumetrics only. Quarter-resolution accumulation for smoother motion.
      </p>
    </div>
  )
}
