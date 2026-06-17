/**
 * Bifurcation Horizon Analysis Content — "Throat-Pinned Modular Spectrum" panel.
 *
 * Content component for bifurcationHorizon mode analysis. The modular
 * spectrum pinned to the Einstein–Rosen-bridge throat is the unfolded
 * ζ-zero set, so the panel reuses the same Montgomery–Odlyzko GUE-vs-Poisson
 * spacing analysis as the Arithmetic Horizon mode, framed here as the
 * statistics of the spectrum bound to the bifurcation surface. A small
 * throat-pinning / RH-status readout reflects the live `offLine` knob: when it
 * is on-line the spectrum is pinned to the throat (RH); displacing it breaks
 * the Tomita modular mirror symmetry (¬RH).
 *
 * The zeros never change, so the histogram and both model polylines are
 * computed once at module load. Used inside the unified AnalysisSection.
 *
 * @module components/sections/Analysis/BifurcationHorizonAnalysisSection
 */

import React from 'react'

import { ControlGroup } from '@/components/ui/ControlGroup'
import {
  gueWignerSurmise,
  poissonSpacing,
  spacingFitError,
  spacingHistogram,
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

/** On-line displacement below which the spectrum is pinned to the throat. */
const ON_LINE_EPS = 1e-6

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
  gueFitError: number
  poissonFitError: number
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
    gueFitError: spacingFitError(hist, gueWignerSurmise),
    poissonFitError: spacingFitError(hist, poissonSpacing),
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
      throat-pinned spacings
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
 * Analysis content for bifurcationHorizon mode.
 * Renders the Montgomery–Odlyzko spacing histogram of the modular spectrum
 * pinned to the throat (GUE/Poisson overlays) plus a throat-pinning / RH
 * status readout driven by the live `offLine` knob.
 *
 * @returns The throat-pinned modular-spectrum analysis panel
 *
 * @example
 * ```tsx
 * <BifurcationHorizonAnalysisContent />
 * ```
 */
export const BifurcationHorizonAnalysisContent: React.FC = React.memo(() => {
  const offLine = useExtendedObjectStore((s) => s.schroedinger.bifurcationHorizon.offLine)
  const onLine = offLine < ON_LINE_EPS

  return (
    <ControlGroup title="Throat-Pinned Modular Spectrum" data-testid="bh-modular-spectrum">
      <div data-testid="bh-gue-histogram">
        <p className="text-xs text-text-secondary mb-1">
          Modular spectrum pinned to the throat — unfolded spacing distribution
        </p>
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
              data-testid="bh-poisson-polyline"
            />

            {/* GUE Wigner surmise (quantum chaos) */}
            <polyline
              points={SPACING_CHART.guePoints}
              fill="none"
              stroke="var(--theme-accent)"
              strokeWidth={2}
              strokeLinejoin="round"
              data-testid="bh-gue-polyline"
            />
          </svg>
        </div>
        <LegendRow />
        <p className="text-2xs text-text-tertiary italic leading-snug mt-1.5">
          The modular spectrum bound to the bifurcation surface follows GUE level repulsion — the
          statistical fingerprint of the chaotic modular Hamiltonian generating the wedge boost.
        </p>
      </div>

      <div data-testid="bh-live-stats">
        <MetricRow label="Mean spacing ⟨s⟩" value={SPACING_CHART.meanSpacing} digits={3} />
        <MetricRow label="GUE fit error" value={SPACING_CHART.gueFitError} digits={3} />
        <MetricRow label="Poisson fit error" value={SPACING_CHART.poissonFitError} digits={3} />
      </div>

      <div className="text-2xs text-text-tertiary leading-snug mt-1.5" data-testid="bh-rh-status">
        {onLine
          ? 'On-line (RH): spectrum pinned to the bifurcation surface'
          : `Off-line displacement δu = ${offLine.toFixed(3)}: mirror symmetry broken (¬RH)`}
      </div>
    </ControlGroup>
  )
})

BifurcationHorizonAnalysisContent.displayName = 'BifurcationHorizonAnalysisContent'
