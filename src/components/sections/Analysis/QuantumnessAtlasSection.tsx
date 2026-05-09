/**
 * Quantumness Atlas Section
 *
 * Standalone collapsible section for the 3-axis parameter sweep (λ, N, γ)
 * mapping three independent diagnostics of quantumness: coordinate
 * entanglement (S̄/log M), Wigner negativity (N̄_W), and spatial
 * delocalization (IPR_norm).
 *
 * Shows as UnavailableSection when not in tdseDynamics mode or dim < 3.
 * Visualization sub-components in QuantumnessAtlasVisualizations.tsx.
 *
 * @module components/sections/Analysis/QuantumnessAtlasSection
 */

import React, { useCallback, useMemo, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'

import { Section } from '@/components/sections/Section'
import { UnavailableSection } from '@/components/sections/UnavailableSection'
import { Button } from '@/components/ui/Button'
import { NumberInput } from '@/components/ui/NumberInput'
import { Select } from '@/components/ui/Select'
import { Tooltip } from '@/components/ui/Tooltip'
import { useAnySweepRunning } from '@/hooks/useAnySweepRunning'
import { downloadAtlasCSV, downloadAtlasJSON } from '@/lib/export/dataExport'
import { useExtendedObjectStore } from '@/stores/extendedObjectStore'
import { useGeometryStore } from '@/stores/geometryStore'
import {
  type AtlasSweepConfig,
  DEFAULT_ATLAS_CONFIG,
  lambdaForStep,
  useQuantumnessAtlasStore,
} from '@/stores/quantumnessAtlasStore'

import {
  DIAG_COLORS,
  DiagnosticScatter,
  type DimCompareData,
  DimensionComparison,
  type ErosionCurveData,
  ErosionCurves,
  TripleHeatmap,
} from './QuantumnessAtlasVisualizations'
import { useAtlasSweepController } from './useAtlasSweepController'

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Extract unique sorted values from an array. */
function uniqueSorted(arr: number[]): number[] {
  return [...new Set(arr)].sort((a, b) => a - b)
}

// ─── View Types ──────────────────────────────────────────────────────────────

type AtlasView = 'erosion' | 'scatter' | 'heatmap' | 'dimCompare'

const VIEW_OPTIONS = [
  { value: 'erosion' as const, label: 'Erosion Curves' },
  { value: 'scatter' as const, label: 'S̄ vs N̄_W Scatter' },
  { value: 'heatmap' as const, label: 'λ × N Heatmaps' },
  { value: 'dimCompare' as const, label: 'Dimension Comparison' },
]

// ─── Props ───────────────────────────────────────────────────────────────────

/**
 * Props for QuantumnessAtlasSection.
 *
 * @param defaultOpen - Whether the section starts expanded
 */
export interface QuantumnessAtlasSectionProps {
  defaultOpen?: boolean
}

// ─── Outer Guard ─────────────────────────────────────────────────────────────

/**
 * Standalone section for the Quantumness Atlas sweep.
 * Shows UnavailableSection when conditions are not met.
 */
export const QuantumnessAtlasSection: React.FC<QuantumnessAtlasSectionProps> = React.memo(
  ({ defaultOpen = false }) => {
    const quantumMode = useExtendedObjectStore((s) => s.schroedinger.quantumMode)
    const dimension = useGeometryStore((s) => s.dimension)

    if (quantumMode !== 'tdseDynamics') {
      return (
        <UnavailableSection title="Quantumness Atlas" reason="Available in TDSE Dynamics mode" />
      )
    }

    if (dimension < 3) {
      return <UnavailableSection title="Quantumness Atlas" reason="Requires 3+ dimensions" />
    }

    return <QuantumnessAtlasContent defaultOpen={defaultOpen} />
  }
)
QuantumnessAtlasSection.displayName = 'QuantumnessAtlasSection'

// ─── Content ─────────────────────────────────────────────────────────────────

/** Inner content — only rendered when TDSE mode and dim >= 3. */
const QuantumnessAtlasContent: React.FC<{ defaultOpen: boolean }> = React.memo(
  ({ defaultOpen }) => {
    const atlasSelector = useShallow((s: ReturnType<typeof useQuantumnessAtlasStore.getState>) => ({
      status: s.status,
      progress: s.progress,
      results: s.results,
      config: s.config,
    }))
    const { status, progress, results, config } = useQuantumnessAtlasStore(atlasSelector)

    const otherSweepRunning = useAnySweepRunning()

    const { handleStartAtlasSweep, handleAbortAtlasSweep } = useAtlasSweepController()

    const [view, setView] = useState<AtlasView>('erosion')
    const [lambdaSteps, setLambdaSteps] = useState(DEFAULT_ATLAS_CONFIG.lambdaSteps)
    const [lambdaMin, setLambdaMin] = useState(DEFAULT_ATLAS_CONFIG.lambdaMin)
    const [lambdaMax, setLambdaMax] = useState(DEFAULT_ATLAS_CONFIG.lambdaMax)

    // Selectors for filtering results by (λ, N, γ)
    const availableLambdas = useMemo(() => uniqueSorted(results.map((r) => r.lambda)), [results])
    const availableDims = useMemo(() => uniqueSorted(results.map((r) => r.dim)), [results])
    const availableGammas = useMemo(() => uniqueSorted(results.map((r) => r.gamma)), [results])

    const [selectedLambda, setSelectedLambda] = useState<number | null>(null)
    const [selectedDim, setSelectedDim] = useState<number | null>(null)
    const [selectedGamma, setSelectedGamma] = useState<number | null>(null)

    const activeLambda =
      selectedLambda !== null && availableLambdas.includes(selectedLambda)
        ? selectedLambda
        : (availableLambdas[0] ?? null)
    const activeDim =
      selectedDim !== null && availableDims.includes(selectedDim)
        ? selectedDim
        : (availableDims[0] ?? null)
    const activeGamma =
      selectedGamma !== null && availableGammas.includes(selectedGamma)
        ? selectedGamma
        : (availableGammas[0] ?? null)

    // Erosion curve data: filter at (λ, N), varying γ
    const erosionData = useMemo<ErosionCurveData[]>(() => {
      if (activeLambda === null || activeDim === null) return []
      return results
        .filter((r) => r.lambda === activeLambda && r.dim === activeDim)
        .sort((a, b) => a.gamma - b.gamma)
        .map((r) => ({
          gamma: r.gamma,
          entanglement: r.avgNormalizedEntropy,
          wigner: r.avgWignerNegativity,
          ipr: r.avgIPR,
        }))
    }, [results, activeLambda, activeDim])

    // Dimension comparison data: filter at (λ, γ), varying N
    const dimCompareData = useMemo<DimCompareData[]>(() => {
      if (activeLambda === null || activeGamma === null) return []
      return results
        .filter((r) => r.lambda === activeLambda && r.gamma === activeGamma)
        .sort((a, b) => a.dim - b.dim)
        .map((r) => ({
          dim: r.dim,
          entanglement: r.avgNormalizedEntropy,
          wigner: r.avgWignerNegativity,
          ipr: r.avgIPR,
        }))
    }, [results, activeLambda, activeGamma])

    const isRunning = status === 'running'
    const isComplete = status === 'complete'
    const pct =
      progress.totalPoints > 0
        ? Math.round((progress.completedPoints / progress.totalPoints) * 100)
        : 0

    // Estimate total points for the warning
    const estimatedPoints = config.dimensions.length * lambdaSteps * config.gammas.length

    const handleStart = useCallback(() => {
      const cfg: Partial<AtlasSweepConfig> = {
        lambdaMin: Math.min(lambdaMin, lambdaMax),
        lambdaMax: Math.max(lambdaMin, lambdaMax),
        lambdaSteps,
      }
      handleStartAtlasSweep(cfg)
    }, [lambdaMin, lambdaMax, lambdaSteps, handleStartAtlasSweep])

    const handleExportCSV = useCallback(() => downloadAtlasCSV(results), [results])
    const handleExportJSON = useCallback(() => downloadAtlasJSON(results), [results])

    return (
      <Section
        title="Quantumness Atlas"
        defaultOpen={defaultOpen}
        data-testid="quantumness-atlas-section"
      >
        <div className="space-y-2">
          {/* ── Warning Panel ── */}
          {!isRunning && !isComplete && (
            <div
              className="rounded-lg border border-warning-border bg-warning-bg px-3 py-2 text-xs text-warning"
              data-testid="atlas-duration-warning"
            >
              Full parameter sweep is compute-intensive. Default config ({estimatedPoints} points)
              takes 1-3 hours depending on grid size and hardware. Reduce λ steps or dimensions for
              a faster scan.
            </div>
          )}

          {/* ── Sweep Config ── */}
          {!isRunning && (
            <div className="grid grid-cols-3 gap-1.5">
              <Tooltip content="Lower bound of the coupling strength range (log-spaced). Controls the integrability-to-chaos transition.">
                <div>
                  <NumberInput
                    label="λ min"
                    value={lambdaMin}
                    onChange={setLambdaMin}
                    min={0.001}
                    max={100}
                    step={0.1}
                  />
                </div>
              </Tooltip>
              <Tooltip content="Upper bound of the coupling strength range (log-spaced).">
                <div>
                  <NumberInput
                    label="λ max"
                    value={lambdaMax}
                    onChange={setLambdaMax}
                    min={0.001}
                    max={100}
                    step={1}
                  />
                </div>
              </Tooltip>
              <Tooltip content="Number of log-spaced λ values to sweep. More steps = finer resolution but longer runtime.">
                <div>
                  <NumberInput
                    label="λ steps"
                    value={lambdaSteps}
                    onChange={setLambdaSteps}
                    min={2}
                    max={30}
                    step={1}
                  />
                </div>
              </Tooltip>
            </div>
          )}

          {/* ── Start / Abort / Progress ── */}
          <div className="flex items-center gap-1.5">
            {!isRunning ? (
              <Tooltip content="Begin the 3-axis parameter sweep (N × λ × γ). Automatically configures TDSE potential, monitoring, and entanglement diagnostics for each point. Physics state is restored after sweep completes or is aborted.">
                <div>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={handleStart}
                    disabled={otherSweepRunning}
                  >
                    Start Sweep
                  </Button>
                </div>
              </Tooltip>
            ) : (
              <Tooltip content="Stop the sweep and restore pre-sweep physics state. Completed points are preserved.">
                <div>
                  <Button variant="secondary" size="sm" onClick={handleAbortAtlasSweep}>
                    Abort
                  </Button>
                </div>
              </Tooltip>
            )}
            {isRunning && (
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between text-[10px] text-text-tertiary mb-0.5">
                  <span>
                    N={config.dimensions[progress.dimIdx]} λ=
                    {lambdaForStep(config, progress.lambdaIdx).toFixed(2)} γ=
                    {config.gammas[progress.gammaIdx]}
                  </span>
                  <span>
                    {progress.completedPoints}/{progress.totalPoints} ({pct}%)
                  </span>
                </div>
                <div className="h-1 rounded-full bg-[var(--bg-elevated)] overflow-hidden">
                  <div
                    className="h-full rounded-full bg-accent transition-[width] duration-300"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            )}
            {isComplete && (
              <span className="text-[10px] text-text-secondary">
                {results.length} points collected
              </span>
            )}
          </div>

          {/* ── Results ── */}
          {results.length > 0 && (
            <>
              <Tooltip content="Choose how to visualize the atlas data. Erosion curves show how diagnostics decay with monitoring rate γ. Scatter plots reveal correlations between measures.">
                <div>
                  <Select
                    label="View"
                    value={view}
                    onChange={(v) => setView(v as AtlasView)}
                    options={VIEW_OPTIONS}
                  />
                </div>
              </Tooltip>

              <div className="flex items-center gap-3 text-[9px]">
                <Tooltip content="Normalized coordinate entanglement S̄/log(M). Measures quantum correlations across spatial dimensions. 0 = separable, 1 = maximally entangled.">
                  <span style={{ color: DIAG_COLORS.entanglement }}>● S̄/logM</span>
                </Tooltip>
                <Tooltip content="Average Wigner negativity N̄_W across per-dimension reduced states. Measures phase-space nonclassicality. 0 = classical (Gaussian), > 0 = quantum interference.">
                  <span style={{ color: DIAG_COLORS.wigner }}>● N̄_W</span>
                </Tooltip>
                <Tooltip content="Normalized inverse participation ratio IPR/totalSites. Measures spatial delocalization. 1 = uniform spread, ~0 = localized.">
                  <span style={{ color: DIAG_COLORS.ipr }}>● IPR</span>
                </Tooltip>
              </div>

              {/* Erosion Curves */}
              {view === 'erosion' && (
                <div className="space-y-1.5">
                  <div className="grid grid-cols-2 gap-1.5">
                    {availableLambdas.length > 1 && (
                      <Select
                        label="λ"
                        value={String(activeLambda)}
                        onChange={(v) => setSelectedLambda(Number(v))}
                        options={availableLambdas.map((l) => ({
                          value: String(l),
                          label: l < 1 ? l.toFixed(2) : l.toFixed(1),
                        }))}
                      />
                    )}
                    {availableDims.length > 1 && (
                      <Select
                        label="N"
                        value={String(activeDim)}
                        onChange={(v) => setSelectedDim(Number(v))}
                        options={availableDims.map((d) => ({ value: String(d), label: `${d}D` }))}
                      />
                    )}
                  </div>
                  <ErosionCurves data={erosionData} />
                </div>
              )}

              {/* Scatter */}
              {view === 'scatter' && <DiagnosticScatter results={results} />}

              {/* Heatmaps */}
              {view === 'heatmap' && (
                <div className="space-y-1.5">
                  {availableGammas.length > 1 && (
                    <Select
                      label="γ"
                      value={String(activeGamma)}
                      onChange={(v) => setSelectedGamma(Number(v))}
                      options={availableGammas.map((g) => ({
                        value: String(g),
                        label: g === 0 ? '0' : g < 1 ? g.toFixed(2) : g.toFixed(1),
                      }))}
                    />
                  )}
                  {activeGamma !== null && <TripleHeatmap results={results} gamma={activeGamma} />}
                </div>
              )}

              {/* Dimension Comparison */}
              {view === 'dimCompare' && (
                <div className="space-y-1.5">
                  <div className="grid grid-cols-2 gap-1.5">
                    {availableLambdas.length > 1 && (
                      <Select
                        label="λ"
                        value={String(activeLambda)}
                        onChange={(v) => setSelectedLambda(Number(v))}
                        options={availableLambdas.map((l) => ({
                          value: String(l),
                          label: l < 1 ? l.toFixed(2) : l.toFixed(1),
                        }))}
                      />
                    )}
                    {availableGammas.length > 1 && (
                      <Select
                        label="γ"
                        value={String(activeGamma)}
                        onChange={(v) => setSelectedGamma(Number(v))}
                        options={availableGammas.map((g) => ({
                          value: String(g),
                          label: g === 0 ? '0' : g < 1 ? g.toFixed(2) : g.toFixed(1),
                        }))}
                      />
                    )}
                  </div>
                  <DimensionComparison data={dimCompareData} />
                </div>
              )}

              {/* Export */}
              <div className="flex gap-1.5 pt-1 border-t border-border-subtle">
                <Tooltip content="Download atlas results as CSV with columns: dim, lambda, gamma, avg_normalized_entropy, variance, Wigner negativity, IPR, grid size, sample counts.">
                  <div>
                    <Button variant="ghost" size="sm" onClick={handleExportCSV}>
                      Export CSV
                    </Button>
                  </div>
                </Tooltip>
                <Tooltip content="Download atlas results as JSON with full numeric precision.">
                  <div>
                    <Button variant="ghost" size="sm" onClick={handleExportJSON}>
                      Export JSON
                    </Button>
                  </div>
                </Tooltip>
              </div>
            </>
          )}
        </div>
      </Section>
    )
  }
)
QuantumnessAtlasContent.displayName = 'QuantumnessAtlasContent'
