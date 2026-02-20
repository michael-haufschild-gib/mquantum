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
  const {
    cacheEnabled,
    setCacheEnabled,
    analyticalGradientEnabled,
    setAnalyticalGradientEnabled,
    robustEigenInterpolationEnabled,
    setRobustEigenInterpolationEnabled,
  } = usePerformanceStore(
    useShallow((s) => ({
      cacheEnabled: s.eigenfunctionCacheEnabled,
      setCacheEnabled: s.setEigenfunctionCacheEnabled,
      analyticalGradientEnabled: s.analyticalGradientEnabled,
      setAnalyticalGradientEnabled: s.setAnalyticalGradientEnabled,
      robustEigenInterpolationEnabled: s.robustEigenInterpolationEnabled,
      setRobustEigenInterpolationEnabled: s.setRobustEigenInterpolationEnabled,
    }))
  )

  return (
    <div className="space-y-2">
      <Switch
        checked={cacheEnabled}
        onCheckedChange={setCacheEnabled}
        label="Eigenfunction Cache"
        data-testid="eigenfunction-cache-toggle"
      />
      <div className="ml-4 space-y-2">
        <Switch
          checked={analyticalGradientEnabled}
          onCheckedChange={setAnalyticalGradientEnabled}
          label="Analytical Gradient"
          disabled={!cacheEnabled}
          data-testid="analytical-gradient-toggle"
        />
        <Switch
          checked={robustEigenInterpolationEnabled}
          onCheckedChange={setRobustEigenInterpolationEnabled}
          label="Robust Eigen Interpolation"
          disabled={!cacheEnabled}
          data-testid="robust-eigen-interpolation-toggle"
        />
      </div>
      <p className="text-xs text-text-tertiary ml-4">
        Cache accelerates HO/Hydrogen-ND lookups; subordinate toggles let you isolate gradient and interpolation effects.
      </p>
    </div>
  )
}
