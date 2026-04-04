/**
 * Entanglement Visualization Sub-Components
 *
 * SVG-based visualizations for coordinate entanglement diagnostics:
 * per-dimension entropy bars, eigenvalue spectrum, MI heatmap,
 * atlas heatmap, and sweep controls.
 *
 * Extracted from CoordinateEntanglementSection to keep file size under lint limit.
 *
 * @module components/sections/Analysis/EntanglementVisualizations
 */

import React, { useEffect, useRef } from 'react'

import { Button } from '@/components/ui/Button'
import { ControlGroup } from '@/components/ui/ControlGroup'
import {
  type AtlasSweepConfig,
  lambdaForStep,
  useCoordinateEntanglementStore,
} from '@/stores/coordinateEntanglementStore'
import { useExtendedObjectStore } from '@/stores/extendedObjectStore'
import { useGeometryStore } from '@/stores/geometryStore'

/* ── SVG layout constants ── */
const BAR_W = 260
const BAR_H = 60
const PAD = { left: 24, right: 8, top: 4, bottom: 12 }
const PLOT_W = BAR_W - PAD.left - PAD.right
const PLOT_H = BAR_H - PAD.top - PAD.bottom

const HEATMAP_SIZE = 120

/* ── Per-Dimension Bars ── */

/** Horizontal bar chart of S_d / log(M_d) for each dimension. */
export const PerDimensionBars: React.FC<{
  entropies: number[]
  maxEntropies: number[]
}> = React.memo(({ entropies, maxEntropies }) => {
  if (entropies.length === 0) return null
  const N = entropies.length

  return (
    <div className="mt-1">
      <p className="text-[10px] text-text-secondary mb-0.5">Per-dimension S_d / S_max</p>
      <div className="rounded-md overflow-hidden bg-[var(--bg-surface)]">
        <svg width="100%" viewBox={`0 0 ${BAR_W} ${BAR_H}`} className="block">
          {entropies.map((S, d) => {
            const maxS = maxEntropies[d]!
            const frac = maxS > 0 ? Math.min(S / maxS, 1) : 0
            const y = PAD.top + (d / N) * PLOT_H
            const h = Math.max(PLOT_H / N - 1, 2)
            return (
              <g key={d}>
                <rect
                  x={PAD.left}
                  y={y}
                  width={PLOT_W}
                  height={h}
                  fill="var(--bg-elevated)"
                  rx={1}
                />
                <rect
                  x={PAD.left}
                  y={y}
                  width={Math.max(frac * PLOT_W, 1)}
                  height={h}
                  fill="var(--chart-pass-2)"
                  rx={1}
                />
                <text
                  x={PAD.left - 4}
                  y={y + h / 2}
                  textAnchor="end"
                  dominantBaseline="central"
                  fill="var(--text-secondary)"
                  fontSize={8}
                >
                  {d}
                </text>
              </g>
            )
          })}
        </svg>
      </div>
    </div>
  )
})
PerDimensionBars.displayName = 'PerDimensionBars'

/* ── Eigenvalue Spectrum ── */

/** Bar chart of the eigenvalue spectrum of ρ₁. */
export const SpectrumBars: React.FC<{ spectrum: number[] }> = React.memo(({ spectrum }) => {
  if (spectrum.length === 0) return null
  const significant = spectrum.filter((v) => v > 1e-6)
  if (significant.length === 0) return null

  const maxVal = significant[0]!
  const barCount = Math.min(significant.length, 16)

  return (
    <div className="mt-1">
      <p className="text-[10px] text-text-secondary mb-0.5">
        ρ₁ spectrum ({significant.length} non-zero)
      </p>
      <div className="rounded-md overflow-hidden bg-[var(--bg-surface)]">
        <svg width="100%" viewBox={`0 0 ${BAR_W} ${BAR_H}`} className="block">
          {significant.slice(0, barCount).map((val, i) => {
            const frac = maxVal > 0 ? val / maxVal : 0
            const barW = Math.max(PLOT_W / barCount - 1, 2)
            const x = PAD.left + i * (PLOT_W / barCount)
            const h = Math.max(frac * PLOT_H, 1)
            return (
              <rect
                key={i}
                x={x}
                y={PAD.top + PLOT_H - h}
                width={barW}
                height={h}
                fill="var(--chart-pass-4)"
                rx={1}
              />
            )
          })}
        </svg>
      </div>
    </div>
  )
})
SpectrumBars.displayName = 'SpectrumBars'

/* ── Pairwise MI Heatmap ── */

/** N×N heatmap of pairwise mutual information I(d₁,d₂). */
export const MutualInfoHeatmap: React.FC<{
  matrix: Float64Array
  N: number
}> = React.memo(({ matrix, N }) => {
  const cellSize = HEATMAP_SIZE / N

  let maxMI = 0
  for (let i = 0; i < N; i++) {
    for (let j = i + 1; j < N; j++) {
      const val = matrix[i * N + j]!
      if (val > maxMI) maxMI = val
    }
  }

  return (
    <div className="mt-1">
      <p className="text-[10px] text-text-secondary mb-0.5">Pairwise mutual information</p>
      <div className="rounded-md overflow-hidden bg-[var(--bg-surface)] inline-block">
        <svg width={HEATMAP_SIZE + 20} height={HEATMAP_SIZE + 20} className="block">
          {Array.from({ length: N }, (_, i) =>
            Array.from({ length: N }, (__, j) => {
              const val = matrix[i * N + j]!
              const frac = maxMI > 0 ? Math.min(val / maxMI, 1) : 0
              const lightness = 0.95 - 0.55 * frac
              return (
                <rect
                  key={`${i}-${j}`}
                  x={10 + j * cellSize}
                  y={10 + i * cellSize}
                  width={cellSize - 1}
                  height={cellSize - 1}
                  // Dynamic heatmap gradient — cannot use static CSS variable
                  fill={`oklch(${lightness} ${0.15 * frac} 30)`} // eslint-disable-line project-rules/no-hardcoded-colors
                  rx={1}
                />
              )
            })
          )}
          {Array.from({ length: N }, (_, d) => (
            <g key={`label-${d}`}>
              <text
                x={5}
                y={10 + d * cellSize + cellSize / 2}
                textAnchor="end"
                dominantBaseline="central"
                fill="var(--text-secondary)"
                fontSize={8}
              >
                {d}
              </text>
              <text
                x={10 + d * cellSize + cellSize / 2}
                y={HEATMAP_SIZE + 18}
                textAnchor="middle"
                fill="var(--text-secondary)"
                fontSize={8}
              >
                {d}
              </text>
            </g>
          ))}
        </svg>
      </div>
    </div>
  )
})
MutualInfoHeatmap.displayName = 'MutualInfoHeatmap'

/* ── Atlas Sweep Heatmap ── */

/** 2D heatmap of S̄_∞(λ, N) sweep results. */
export const AtlasHeatmap: React.FC<{
  results: { lambda: number; dim: number; entropy: number }[]
}> = React.memo(({ results }) => {
  if (results.length === 0) return null

  const dims = [...new Set(results.map((r) => r.dim))].sort((a, b) => a - b)
  const lambdas = [...new Set(results.map((r) => r.lambda))].sort((a, b) => a - b)
  const maxEntropy = Math.max(...results.map((r) => r.entropy), 1e-6)

  const cellW = PLOT_W / lambdas.length
  const cellH = PLOT_H / dims.length

  return (
    <div className="mt-1">
      <p className="text-[10px] text-text-secondary mb-0.5">
        Atlas: S̄_∞(λ, N) — {results.length} points
      </p>
      <div className="rounded-md overflow-hidden bg-[var(--bg-surface)]">
        <svg width="100%" viewBox={`0 0 ${BAR_W} ${BAR_H + 10}`} className="block">
          {results.map((r) => {
            const li = lambdas.indexOf(r.lambda)
            const di = dims.indexOf(r.dim)
            if (li < 0 || di < 0) return null
            const frac = r.entropy / maxEntropy
            const lightness = 0.95 - 0.55 * frac
            return (
              <rect
                key={`${r.lambda}-${r.dim}`}
                x={PAD.left + li * cellW}
                y={PAD.top + di * cellH}
                width={Math.max(cellW - 1, 2)}
                height={Math.max(cellH - 1, 2)}
                // Dynamic heatmap gradient — cannot use static CSS variable
                fill={`oklch(${lightness} ${0.18 * frac} 30)`} // eslint-disable-line project-rules/no-hardcoded-colors
                rx={1}
              />
            )
          })}
          <text
            x={BAR_W / 2}
            y={BAR_H + 8}
            textAnchor="middle"
            fill="var(--text-secondary)"
            fontSize={8}
          >
            λ →
          </text>
          <text
            x={4}
            y={BAR_H / 2}
            textAnchor="middle"
            dominantBaseline="central"
            fill="var(--text-secondary)"
            fontSize={8}
            transform={`rotate(-90, 4, ${BAR_H / 2})`}
          >
            N
          </text>
        </svg>
      </div>
    </div>
  )
})
AtlasHeatmap.displayName = 'AtlasHeatmap'

/* ── Sweep Controls ── */

const SWEEP_EVOLVE_ENTRIES = 20
const SWEEP_MEASURE_ENTRIES = 10
const SWEEP_POLL_MS = 500

/** Atlas sweep controls: start/abort/progress + results heatmap. */
export const SweepControls: React.FC<{
  sweepStatus: string
  sweepProgress: number
  sweepResults: { lambda: number; dim: number; entropy: number }[]
}> = React.memo(({ sweepStatus, sweepProgress, sweepResults }) => {
  const sweepTickRef = useRef<ReturnType<typeof setInterval> | null>(null)
  /** longTimeN at the start of the current sweep step — monotonically increasing, never caps. */
  const stepStartNRef = useRef(0)

  const handleStartSweep = () => {
    const config: AtlasSweepConfig = {
      lambdaMin: 0.01,
      lambdaMax: 50,
      lambdaSteps: 15,
      dimensions: [3, 4, 5],
    }
    const entStore = useCoordinateEntanglementStore.getState()
    entStore.clearHistory()
    entStore.startSweep(config)
    stepStartNRef.current = 0

    const firstLambda = lambdaForStep(config, 0)
    const ext = useExtendedObjectStore.getState()
    ext.setTdsePotentialType('coupledAnharmonic')
    ext.setTdseAnharmonicLambda(firstLambda)
    useGeometryStore.getState().setDimension(config.dimensions[0]!)
    ext.resetTdseField()
  }

  const handleAbortSweep = () => {
    useCoordinateEntanglementStore.getState().abortSweep()
  }

  useEffect(() => {
    if (sweepStatus !== 'running') {
      if (sweepTickRef.current) {
        clearInterval(sweepTickRef.current)
        sweepTickRef.current = null
      }
      return
    }

    sweepTickRef.current = setInterval(() => {
      const entStore = useCoordinateEntanglementStore.getState()
      if (entStore.sweepStatus !== 'running') return

      // Use longTimeN (monotonically increasing) instead of historyCount (caps at ring buffer size)
      const samplesSinceStart = entStore.longTimeN - stepStartNRef.current
      const totalNeeded = SWEEP_EVOLVE_ENTRIES + SWEEP_MEASURE_ENTRIES

      if (samplesSinceStart >= SWEEP_EVOLVE_ENTRIES) {
        entStore.recordSweepSample(entStore.currentNormalizedEntropy)
      }

      if (samplesSinceStart >= totalNeeded) {
        entStore.completeSweepStep()
        const next = entStore.advanceSweepStep()

        if (next) {
          stepStartNRef.current = entStore.longTimeN
          const ext = useExtendedObjectStore.getState()
          ext.setTdseAnharmonicLambda(next.lambda)
          const currentDim = useGeometryStore.getState().dimension
          if (currentDim !== next.dim) {
            useGeometryStore.getState().setDimension(next.dim)
          }
          ext.resetTdseField()
        } else {
          entStore.completeSweep()
        }
      }
    }, SWEEP_POLL_MS)

    return () => {
      if (sweepTickRef.current) {
        clearInterval(sweepTickRef.current)
        sweepTickRef.current = null
      }
    }
  }, [sweepStatus])

  return (
    <div className="mt-2 border-t border-border-subtle pt-1">
      <ControlGroup title="Atlas Sweep">
        {sweepStatus === 'idle' && (
          <Button variant="secondary" size="sm" onClick={handleStartSweep}>
            Start λ×N Sweep
          </Button>
        )}
        {sweepStatus === 'running' && (
          <>
            <div className="text-[10px] text-text-secondary mb-1">
              Sweep progress: {(sweepProgress * 100).toFixed(0)}%
            </div>
            <Button variant="secondary" size="sm" onClick={handleAbortSweep}>
              Abort Sweep
            </Button>
          </>
        )}
        {sweepStatus === 'complete' && (
          <div className="text-[10px] text-text-secondary">
            Sweep complete — {sweepResults.length} points
          </div>
        )}
      </ControlGroup>
      {sweepResults.length > 0 && <AtlasHeatmap results={sweepResults} />}
    </div>
  )
})
SweepControls.displayName = 'SweepControls'
