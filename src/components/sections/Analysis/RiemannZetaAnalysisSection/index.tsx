/**
 * Riemann Zeta Analysis Content — "Montgomery–Odlyzko" panel.
 *
 * Content component for riemannZeta (Arithmetic Horizon) mode analysis.
 * Displays:
 * - An inline SVG histogram of the unfolded ζ-zero nearest-neighbour
 *   spacings, overlaid with the GUE Wigner surmise (quantum chaos) and the
 *   Poisson distribution (classical / uncorrelated null hypothesis)
 * - Live stats: mean unfolded spacing, the truncated primon-gas partition
 *   function Z(β), and the Hagedorn emission gain for the current β
 *
 * The zeros never change, so the histogram and both model polylines are
 * computed once at module load. Used inside the unified AnalysisSection.
 *
 * @module components/sections/Analysis/RiemannZetaAnalysisSection
 */

import React, { useMemo } from 'react'

import { ControlGroup } from '@/components/ui/ControlGroup'
import {
  gueWignerSurmise,
  hagedornPartitionGain,
  poissonSpacing,
  spacingHistogram,
  truncatedZeta,
  unfoldedZeroSpacings,
} from '@/lib/physics/riemannZeta'
import { useExtendedObjectStore } from '@/stores/scene/extendedObjectStore'

import { MetricRow } from '../AnalysisPrimitives'

/* ────────────────────────────────────────────────────────────── */
/*  Static chart geometry (the ζ zeros never change)             */
/* ────────────────────────────────────────────────────────────── */

const CHART_WIDTH = 280
const CHART_HEIGHT = 160
const CHART_PX = 14
const CHART_PY = 12
const CHART_PW = CHART_WIDTH - 2 * CHART_PX
const CHART_PH = CHART_HEIGHT - 2 * CHART_PY
const MAX_S = 4
const MODEL_SAMPLES = 64

interface HistogramBar {
  x: number
  y: number
  width: number
  height: number
}

interface SpacingChart {
  bars: HistogramBar[]
  guePoints: string
  poissonPoints: string
  zeroY: number
  meanSpacing: number
}

function buildSpacingChart(): SpacingChart {
  const spacings = unfoldedZeroSpacings()
  const hist = spacingHistogram(spacings, 0.25, MAX_S)
  const meanSpacing = spacings.reduce((acc, s) => acc + s, 0) / spacings.length

  // Shared y-scale across the empirical bars and both model curves.
  let yMax = 0
  for (const d of hist.density) if (d > yMax) yMax = d
  for (let i = 0; i < MODEL_SAMPLES; i++) {
    const s = (MAX_S * i) / (MODEL_SAMPLES - 1)
    yMax = Math.max(yMax, gueWignerSurmise(s), poissonSpacing(s))
  }
  yMax *= 1.1

  const toX = (s: number) => CHART_PX + (s / MAX_S) * CHART_PW
  const toY = (v: number) => CHART_PY + (1 - v / yMax) * CHART_PH
  const zeroY = toY(0)

  const bars: HistogramBar[] = []
  for (let i = 0; i < hist.centers.length; i++) {
    const density = hist.density[i]!
    if (density <= 0) continue
    const left = toX(hist.centers[i]! - hist.binWidth / 2)
    const top = toY(density)
    bars.push({
      x: left + 0.5,
      y: top,
      width: (hist.binWidth / MAX_S) * CHART_PW - 1,
      height: zeroY - top,
    })
  }

  const guePts: string[] = []
  const poissonPts: string[] = []
  for (let i = 0; i < MODEL_SAMPLES; i++) {
    const s = (MAX_S * i) / (MODEL_SAMPLES - 1)
    guePts.push(`${toX(s).toFixed(1)},${toY(gueWignerSurmise(s)).toFixed(1)}`)
    poissonPts.push(`${toX(s).toFixed(1)},${toY(poissonSpacing(s)).toFixed(1)}`)
  }

  return {
    bars,
    guePoints: guePts.join(' '),
    poissonPoints: poissonPts.join(' '),
    zeroY,
    meanSpacing,
  }
}

const SPACING_CHART = buildSpacingChart()

/* ────────────────────────────────────────────────────────────── */
/*  Legend                                                        */
/* ────────────────────────────────────────────────────────────── */

const LegendRow: React.FC = () => (
  <div className="flex items-center gap-3 mt-1 text-2xs text-text-tertiary">
    <span className="flex items-center gap-1">
      <span className="inline-block w-2.5 h-2.5 rounded-[2px] bg-[var(--text-tertiary)] opacity-40" />
      ζ-zero spacings
    </span>
    <span className="flex items-center gap-1">
      <span className="inline-block w-3 border-t-2 border-[var(--theme-accent)]" />
      GUE (quantum chaos)
    </span>
    <span className="flex items-center gap-1">
      <span className="inline-block w-3 border-t border-dashed border-[var(--text-tertiary)]" />
      Poisson (classical)
    </span>
  </div>
)

/* ────────────────────────────────────────────────────────────── */
/*  Content                                                       */
/* ────────────────────────────────────────────────────────────── */

/**
 * Analysis content for riemannZeta (Arithmetic Horizon) mode.
 * Renders the Montgomery–Odlyzko spacing histogram with GUE/Poisson
 * overlays plus live partition-function stats for the current β.
 *
 * @returns The Montgomery–Odlyzko analysis panel
 *
 * @example
 * ```tsx
 * <RiemannZetaAnalysisContent />
 * ```
 */
export const RiemannZetaAnalysisContent: React.FC = React.memo(() => {
  const beta = useExtendedObjectStore((s) => s.schroedinger.riemannZeta.beta)

  const { zBeta, hagedornGain } = useMemo(
    () => ({ zBeta: truncatedZeta(beta), hagedornGain: hagedornPartitionGain(beta) }),
    [beta]
  )

  return (
    <ControlGroup title="Montgomery–Odlyzko" data-testid="rz-montgomery-odlyzko">
      <div data-testid="rz-gue-histogram">
        <p className="text-xs text-text-secondary mb-1">Unfolded ζ-zero spacing distribution</p>
        <div className="rounded-md overflow-hidden bg-[var(--bg-surface)]">
          <svg width="100%" viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} className="block">
            {/* Baseline */}
            <line
              x1={CHART_PX}
              y1={SPACING_CHART.zeroY}
              x2={CHART_PX + CHART_PW}
              y2={SPACING_CHART.zeroY}
              stroke="var(--text-tertiary)"
              strokeWidth={0.5}
            />

            {/* Empirical spacing histogram */}
            {SPACING_CHART.bars.map((bar) => (
              <rect
                key={bar.x}
                x={bar.x}
                y={bar.y}
                width={bar.width}
                height={bar.height}
                fill="var(--text-tertiary)"
                opacity={0.35}
              />
            ))}

            {/* Poisson (classical null hypothesis) */}
            <polyline
              points={SPACING_CHART.poissonPoints}
              fill="none"
              stroke="var(--text-tertiary)"
              strokeWidth={1.5}
              strokeDasharray="4,3"
              strokeLinejoin="round"
              data-testid="rz-poisson-polyline"
            />

            {/* GUE Wigner surmise (quantum chaos) */}
            <polyline
              points={SPACING_CHART.guePoints}
              fill="none"
              stroke="var(--theme-accent)"
              strokeWidth={2}
              strokeLinejoin="round"
              data-testid="rz-gue-polyline"
            />
          </svg>
        </div>
        <LegendRow />
        <p className="text-2xs text-text-tertiary italic leading-snug mt-1.5">
          Unfolded ζ-zero spacings follow GUE level repulsion — the statistical fingerprint of a
          chaotic quantum Hamiltonian (Hilbert–Pólya).
        </p>
      </div>

      <div data-testid="rz-live-stats">
        <MetricRow label="Mean spacing ⟨s⟩" value={SPACING_CHART.meanSpacing} digits={3} />
        <MetricRow label="Z(β) = Σ n⁻ᵝ" value={zBeta} digits={3} />
        <MetricRow label="Hagedorn gain" value={hagedornGain} digits={2} />
      </div>
    </ControlGroup>
  )
})

RiemannZetaAnalysisContent.displayName = 'RiemannZetaAnalysisContent'
