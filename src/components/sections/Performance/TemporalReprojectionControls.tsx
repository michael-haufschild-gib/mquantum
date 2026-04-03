/**
 * Temporal Reprojection Controls Component
 * Controls for temporal accumulation and reprojection.
 */

import React from 'react'
import { useShallow } from 'zustand/react/shallow'

import { Switch } from '@/components/ui/Switch'
import { type ExtendedObjectState, useExtendedObjectStore } from '@/stores/extendedObjectStore'
import { useGeometryStore } from '@/stores/geometryStore'
import { usePerformanceStore } from '@/stores/performanceStore'

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
  const representation = useExtendedObjectStore(
    (s: ExtendedObjectState) => s.schroedinger?.representation ?? 'position'
  )

  if (dimension <= 2 || representation === 'wigner') return null

  return (
    <div className="space-y-2">
      <Switch
        checked={enabled}
        onCheckedChange={setEnabled}
        label="Temporal Reprojection"
        tooltip="Accumulate volumetric samples across frames at quarter resolution for smoother, less noisy rendering during motion."
        data-testid="temporal-reprojection-toggle"
      />
      <p className="text-xs text-text-tertiary ms-4">
        Schrödinger volumetrics only. Quarter-resolution accumulation for smoother motion.
      </p>
    </div>
  )
}
