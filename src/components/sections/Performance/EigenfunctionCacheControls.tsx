/**
 * Eigenfunction Cache Controls Component
 * Toggle for GPU-accelerated eigenfunction caching.
 */

import React from 'react'
import { useShallow } from 'zustand/react/shallow'

import { Switch } from '@/components/ui/Switch'
import { usePerformanceStore } from '@/stores/runtime/performanceStore'

/**
 * Eigenfunction cache controls for the Performance section.
 * Toggles compile-time shader specialization for cached eigenfunction lookup.
 * @returns The eigenfunction cache controls UI component
 */
export const EigenfunctionCacheControls: React.FC = () => {
  const {
    cacheEnabled,
    setCacheEnabled,
    analyticalGradientEnabled,
    setAnalyticalGradientEnabled,
    fastEigenInterpolationEnabled,
    setFastEigenInterpolationEnabled,
  } = usePerformanceStore(
    useShallow((s) => ({
      cacheEnabled: s.eigenfunctionCacheEnabled,
      setCacheEnabled: s.setEigenfunctionCacheEnabled,
      analyticalGradientEnabled: s.analyticalGradientEnabled,
      setAnalyticalGradientEnabled: s.setAnalyticalGradientEnabled,
      fastEigenInterpolationEnabled: s.fastEigenInterpolationEnabled,
      setFastEigenInterpolationEnabled: s.setFastEigenInterpolationEnabled,
    }))
  )

  return (
    <div className="space-y-2">
      <Switch
        checked={cacheEnabled}
        onCheckedChange={setCacheEnabled}
        label="Eigenfunction Cache"
        tooltip="Cache computed eigenfunctions in GPU textures for faster rendering. Trades memory for performance on repeated evaluations."
        data-testid="eigenfunction-cache-toggle"
      />
      <div className="ms-4 space-y-2">
        <Switch
          checked={analyticalGradientEnabled}
          onCheckedChange={setAnalyticalGradientEnabled}
          label="Analytical Gradient"
          tooltip="Use analytically computed gradients for surface normals instead of finite differences. More accurate lighting at no extra GPU cost."
          disabled={!cacheEnabled}
          data-testid="analytical-gradient-toggle"
        />
        <Switch
          checked={fastEigenInterpolationEnabled}
          onCheckedChange={setFastEigenInterpolationEnabled}
          label="Fast Eigen Interpolation"
          tooltip="Use bilinear texture interpolation for cached eigenfunctions. Faster but less precise than the robust path."
          disabled={!cacheEnabled}
          data-testid="fast-eigen-interpolation-toggle"
        />
      </div>
      <p className="text-xs text-text-tertiary ms-4">
        Fast Eigen Interpolation ON favors FPS; OFF enables the slower robust interpolation path.
      </p>
    </div>
  )
}
