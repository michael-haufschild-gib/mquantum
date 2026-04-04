/**
 * Coordinate Entanglement Section
 *
 * Standalone collapsible section for inter-dimensional entanglement diagnostics.
 * Shows as disabled (UnavailableSection) when not in tdseDynamics mode.
 * When available, displays entropy time series, per-dimension bars, spectrum,
 * MI heatmap, and atlas sweep controls.
 *
 * @module components/sections/Analysis/CoordinateEntanglementSection
 */

import React, { useCallback } from 'react'
import { useShallow } from 'zustand/react/shallow'

import { Section } from '@/components/sections/Section'
import { UnavailableSection } from '@/components/sections/UnavailableSection'
import { Button } from '@/components/ui/Button'
import { Sparkline } from '@/components/ui/Sparkline'
import { Switch } from '@/components/ui/Switch'
import { useCoordinateEntanglementStore } from '@/stores/coordinateEntanglementStore'
import { useExtendedObjectStore } from '@/stores/extendedObjectStore'
import { useMonitoringSweepStore } from '@/stores/monitoringSweepStore'

import {
  AtlasHeatmap,
  MutualInfoHeatmap,
  PerDimensionBars,
  SpectrumBars,
} from './EntanglementVisualizations'
import { useSweepController } from './useSweepController'

/* ── Helpers ── */

/** Convert Float64Array ring buffer to Float32Array for Sparkline. */
function f64ToF32(src: Float64Array): Float32Array {
  const dst = new Float32Array(src.length)
  for (let i = 0; i < src.length; i++) dst[i] = src[i]!
  return dst
}

/* ── Main Section ── */

/** Props for the coordinate entanglement section. */
export interface CoordinateEntanglementSectionProps {
  defaultOpen?: boolean
}

/**
 * Standalone collapsible section for coordinate entanglement diagnostics.
 * Shows as disabled (UnavailableSection) when not in tdseDynamics mode.
 *
 * @param props - Component props
 * @returns The entanglement section, or an unavailable placeholder
 */
export const CoordinateEntanglementSection: React.FC<CoordinateEntanglementSectionProps> =
  React.memo(({ defaultOpen = false }) => {
    const quantumMode = useExtendedObjectStore((s) => s.schroedinger.quantumMode)

    if (quantumMode !== 'tdseDynamics') {
      return (
        <UnavailableSection
          title="Coordinate Entanglement"
          reason="Available in TDSE Dynamics mode"
        />
      )
    }

    return <CoordinateEntanglementContent defaultOpen={defaultOpen} />
  })

CoordinateEntanglementSection.displayName = 'CoordinateEntanglementSection'

/** Inner content — only rendered when quantumMode === 'tdseDynamics'. */
const CoordinateEntanglementContent: React.FC<{ defaultOpen: boolean }> = React.memo(
  ({ defaultOpen }) => {
    const monitoringSweepRunning = useMonitoringSweepStore((s) => s.status === 'running')

    const {
      enabled,
      computePairwiseMI,
      computeBipartitions,
      setEnabled,
      setComputePairwiseMI,
      setComputeBipartitions,
      historyAverage,
      historyHead,
      historyCount,
      currentEntropies,
      currentAverageEntropy,
      currentNormalizedEntropy,
      currentSpectrum,
      currentBipartitionEntropies,
      mutualInfoMatrix,
      longTimeAverage,
      longTimeVariance,
      sweepStatus,
      sweepResults,
      sweepProgress,
    } = useCoordinateEntanglementStore(
      useShallow((s) => ({
        enabled: s.enabled,
        computePairwiseMI: s.computePairwiseMI,
        computeBipartitions: s.computeBipartitions,
        setEnabled: s.setEnabled,
        setComputePairwiseMI: s.setComputePairwiseMI,
        setComputeBipartitions: s.setComputeBipartitions,
        historyAverage: s.historyAverage,
        historyHead: s.historyHead,
        historyCount: s.historyCount,
        currentEntropies: s.currentEntropies,
        currentAverageEntropy: s.currentAverageEntropy,
        currentNormalizedEntropy: s.currentNormalizedEntropy,
        currentSpectrum: s.currentSpectrum,
        currentBipartitionEntropies: s.currentBipartitionEntropies,
        mutualInfoMatrix: s.mutualInfoMatrix,
        longTimeAverage: s.longTimeAverage,
        longTimeVariance: s.longTimeVariance,
        sweepStatus: s.sweepStatus,
        sweepResults: s.sweepResults,
        sweepProgress: s.sweepProgress,
      }))
    )

    // historyAverage is mutated in place (ring buffer) — compute fresh each render (256 elements, trivially cheap)
    const sparklineData = f64ToF32(historyAverage)
    const maxEnts = useCoordinateEntanglementStore((s) => s.currentMaxEntropies)

    const { handleStartSweep, handleAbortSweep } = useSweepController()

    const handleEnableChange = useCallback((v: boolean) => setEnabled(v), [setEnabled])
    const handleMIChange = useCallback(
      (v: boolean) => setComputePairwiseMI(v),
      [setComputePairwiseMI]
    )
    const handleBipartitionChange = useCallback(
      (v: boolean) => setComputeBipartitions(v),
      [setComputeBipartitions]
    )

    return (
      <Section
        title="Coordinate Entanglement"
        defaultOpen={defaultOpen}
        data-testid="coordinate-entanglement-section"
      >
        <fieldset
          disabled={monitoringSweepRunning}
          className={`border-0 p-0 m-0 min-w-0 transition-opacity${monitoringSweepRunning ? ' opacity-50' : ''}`}
        >
          {/* Row 1: Enable toggle + sweep action (right-aligned) */}
          <div className="flex items-center justify-between">
            <Switch
              label="Enable"
              tooltip="Track inter-dimensional entanglement entropy via reduced density matrices. Runs in a Web Worker to avoid blocking rendering."
              checked={enabled}
              onCheckedChange={handleEnableChange}
              disabled={sweepStatus === 'running'}
            />
            {enabled && (sweepStatus === 'idle' || sweepStatus === 'complete') && (
              <Button variant="primary" size="sm" onClick={handleStartSweep}>
                Start λ×N Sweep
              </Button>
            )}
            {enabled && sweepStatus === 'running' && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-text-secondary">
                  {(sweepProgress * 100).toFixed(0)}%
                </span>
                <Button variant="secondary" size="sm" onClick={handleAbortSweep}>
                  Abort
                </Button>
              </div>
            )}
          </div>

          {/* Atlas heatmap directly below the header row */}
          {enabled && sweepResults.length > 0 && <AtlasHeatmap results={sweepResults} />}

          {enabled && (
            <>
              {/* Options: toggles left, extra info right */}
              <div className="mt-1 flex gap-4">
                <div className="flex flex-col gap-1 shrink-0">
                  <Switch
                    label="Pairwise MI"
                    tooltip="Compute pairwise mutual information I(d₁,d₂) between all dimension pairs. CPU-expensive for large grids (M > 32)."
                    checked={computePairwiseMI}
                    onCheckedChange={handleMIChange}
                    disabled={sweepStatus === 'running'}
                  />
                  <Switch
                    label="Bipartitions"
                    tooltip="Compute sequential bipartition entropy S({0..k-1}|{k..N-1}) for each k up to N/2. Uses the first k coordinates as the kept subsystem. Only feasible for small per-dimension grid sizes."
                    checked={computeBipartitions}
                    onCheckedChange={handleBipartitionChange}
                    disabled={sweepStatus === 'running'}
                  />
                </div>
                <div className="flex-1 min-w-0 text-xs text-text-secondary pt-0.5">
                  {currentBipartitionEntropies.length > 0 && (
                    <div className="flex flex-wrap gap-x-2">
                      <span>Bipartition S:</span>
                      {currentBipartitionEntropies.map((s, k) => (
                        <span key={k}>
                          k={k + 1}: {s !== null ? s.toFixed(3) : '—'}
                        </span>
                      ))}
                    </div>
                  )}
                  {mutualInfoMatrix && currentEntropies.length > 0 && (
                    <MutualInfoHeatmap matrix={mutualInfoMatrix} N={currentEntropies.length} />
                  )}
                </div>
              </div>

              <div className="mt-1 flex gap-3 text-xs text-text-secondary">
                <span>S̄ = {currentAverageEntropy.toFixed(4)}</span>
                <span>S̄/S_max = {(currentNormalizedEntropy * 100).toFixed(1)}%</span>
              </div>

              {longTimeAverage > 0 && (
                <div className="flex gap-3 text-xs text-text-secondary">
                  <span>⟨S̄⟩ = {longTimeAverage.toFixed(4)}</span>
                  <span>σ = {Math.sqrt(Math.max(longTimeVariance, 0)).toFixed(4)}</span>
                </div>
              )}

              {historyCount > 1 && (
                <div className="mt-1">
                  <p className="text-xs text-text-secondary mb-0.5">S̄(t) time series</p>
                  <Sparkline
                    data={sparklineData}
                    head={historyHead}
                    count={historyCount}
                    min={0}
                    height={32}
                  />
                </div>
              )}

              <PerDimensionBars entropies={currentEntropies} maxEntropies={maxEnts} />
              <SpectrumBars spectrum={currentSpectrum} />
            </>
          )}
        </fieldset>
      </Section>
    )
  }
)
CoordinateEntanglementContent.displayName = 'CoordinateEntanglementContent'
