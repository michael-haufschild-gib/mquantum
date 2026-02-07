/**
 * Eigenfunction Cache Controls Component
 * Toggle for GPU-accelerated eigenfunction caching.
 */

import { Switch } from '@/components/ui/Switch'
import { usePerformanceStore } from '@/stores/performanceStore'
import React from 'react'
import { useShallow } from 'zustand/react/shallow'

/**
 * Eigenfunction cache controls for the Performance section.
 * Toggles compile-time shader specialization for cached eigenfunction lookup.
 * @returns The eigenfunction cache controls UI component
 */
export const EigenfunctionCacheControls: React.FC = () => {
  const { enabled, setEnabled } = usePerformanceStore(
    useShallow((s) => ({
      enabled: s.eigenfunctionCacheEnabled,
      setEnabled: s.setEigenfunctionCacheEnabled,
    }))
  )

  return (
    <div className="space-y-2">
      <Switch
        checked={enabled}
        onCheckedChange={setEnabled}
        label="Eigenfunction Cache"
        data-testid="eigenfunction-cache-toggle"
      />
      <p className="text-xs text-text-tertiary ml-4">
        Pre-computes eigenfunctions on GPU. Faster rendering for all quantum modes.
      </p>
    </div>
  )
}
