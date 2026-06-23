/**
 * Modular Knot Analysis Content — "Rademacher Φ Spectrum" panel.
 *
 * Content component for modularKnot mode analysis. Enumerates the primitive
 * hyperbolic conjugacy classes of PSL₂(ℤ) up to the live word-length cap
 * (`enumerateModularGeodesics`), then renders the **distribution of Rademacher
 * invariants Φ** across the splatted geodesics as a diverging histogram (cool
 * Φ < 0 / neutral 0 / warm Φ > 0, matching the volume's Φ colormap). Each Φ is
 * exactly the linking number of that modular knot with the trefoil core
 * (Ghys), and the same global winding that S(T) = arg ζ(½ + iT) realizes
 * analytically.
 *
 * The geodesic set depends only on the bake knobs (`maxLen`, `geodesicCount`),
 * so the chart recomputes when those change. Used inside the unified
 * AnalysisSection.
 *
 * @module components/sections/Analysis/ModularKnotAnalysisSection
 */

import React, { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'

import { ControlGroup } from '@/components/ui/ControlGroup'
import { enumerateModularGeodesics, phiColor } from '@/lib/physics/modularKnot'
import { useExtendedObjectStore } from '@/stores/scene/extendedObjectStore'

import { MetricRow } from '../AnalysisPrimitives'

/* ────────────────────────────────────────────────────────────── */
/*  Chart geometry                                                */
/* ────────────────────────────────────────────────────────────── */

const CHART_WIDTH = 280
const CHART_HEIGHT = 160
const CHART_PX = 14
const CHART_PY = 12
const CHART_PW = CHART_WIDTH - 2 * CHART_PX
const CHART_PH = CHART_HEIGHT - 2 * CHART_PY

interface PhiBar {
  x: number
  y: number
  width: number
  height: number
  fill: string
  phi: number
}

interface PhiSpectrum {
  bars: PhiBar[]
  baselineY: number
  count: number
  minPhi: number
  maxPhi: number
  meanAbsPhi: number
}

/**
 * Bin the enumerated geodesics' Φ values into a per-integer-Φ histogram. Φ is
 * integer-valued on SL₂(ℤ), so one bin per distinct Φ is the faithful spectrum
 * (no arbitrary binning width). Bars are colored by the same diverging Φ
 * colormap the rendered volume uses.
 */
function buildPhiSpectrum(maxLen: number, geodesicCount: number): PhiSpectrum {
  const geos = enumerateModularGeodesics(maxLen).slice(0, geodesicCount)
  const phis = geos.map((g) => g.phi)

  if (phis.length === 0) {
    return {
      bars: [],
      baselineY: CHART_PY + CHART_PH,
      count: 0,
      minPhi: 0,
      maxPhi: 0,
      meanAbsPhi: 0,
    }
  }

  let minPhi = phis[0]!
  let maxPhi = phis[0]!
  let absSum = 0
  for (const p of phis) {
    if (p < minPhi) minPhi = p
    if (p > maxPhi) maxPhi = p
    absSum += Math.abs(p)
  }

  // One integer bin per Φ in [minPhi, maxPhi], inclusive.
  const binCount = maxPhi - minPhi + 1
  const counts = new Array<number>(binCount).fill(0)
  for (const p of phis) counts[p - minPhi]! += 1

  let yMax = 0
  for (const c of counts) if (c > yMax) yMax = c
  yMax *= 1.1
  if (yMax <= 0) yMax = 1

  const maxAbsPhi = Math.max(1, Math.abs(minPhi), Math.abs(maxPhi))
  const baselineY = CHART_PY + CHART_PH
  const slotW = CHART_PW / binCount

  const bars: PhiBar[] = []
  for (let i = 0; i < binCount; i++) {
    const c = counts[i]!
    if (c <= 0) continue
    const phi = minPhi + i
    const top = CHART_PY + (1 - c / yMax) * CHART_PH
    const [r, g, b] = phiColor(phi, maxAbsPhi)
    bars.push({
      x: CHART_PX + i * slotW + 0.5,
      y: top,
      width: Math.max(1, slotW - 1),
      height: baselineY - top,
      // Data-derived diverging Φ colormap (the exact colormap the rendered
      // volume uses) — not a design token, so the no-hardcoded-colors rule
      // is suppressed here, matching the EntanglementVisualizations heatmap.
      // eslint-disable-next-line project-rules/no-hardcoded-colors
      fill: `rgb(${r}, ${g}, ${b})`,
      phi,
    })
  }

  return {
    bars,
    baselineY,
    count: phis.length,
    minPhi,
    maxPhi,
    meanAbsPhi: absSum / phis.length,
  }
}

/* ────────────────────────────────────────────────────────────── */
/*  Content                                                       */
/* ────────────────────────────────────────────────────────────── */

/**
 * Analysis content for modularKnot mode.
 * Renders the Rademacher Φ spectrum — the distribution of linking numbers
 * lk(modular knot, trefoil) = Φ across the enumerated geodesics — plus the
 * geodesic count and the Φ range.
 *
 * @returns The Rademacher Φ spectrum analysis panel
 *
 * @example
 * ```tsx
 * <ModularKnotAnalysisContent />
 * ```
 */
export const ModularKnotAnalysisContent: React.FC = React.memo(() => {
  const { maxLen, geodesicCount } = useExtendedObjectStore(
    useShallow((s) => ({
      maxLen: s.schroedinger.modularKnot.maxLen,
      geodesicCount: s.schroedinger.modularKnot.geodesicCount,
    }))
  )

  const spectrum = useMemo(() => buildPhiSpectrum(maxLen, geodesicCount), [maxLen, geodesicCount])

  return (
    <ControlGroup title="Rademacher Φ Spectrum" data-testid="mk-phi-spectrum">
      <div data-testid="mk-phi-histogram">
        <p className="text-xs text-text-secondary mb-1">
          Distribution of the Rademacher invariant Φ across the enumerated modular geodesics
        </p>
        <div className="rounded-md overflow-hidden bg-[var(--bg-surface)]">
          <svg width="100%" viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} className="block">
            {/* Baseline */}
            <line
              x1={CHART_PX}
              y1={spectrum.baselineY}
              x2={CHART_PX + CHART_PW}
              y2={spectrum.baselineY}
              stroke="var(--text-tertiary)"
              strokeWidth={0.5}
            />

            {/* Φ-binned histogram, colored by the diverging Φ colormap */}
            {spectrum.bars.map((bar) => (
              <rect
                key={bar.phi}
                x={bar.x}
                y={bar.y}
                width={bar.width}
                height={bar.height}
                fill={bar.fill}
                opacity={0.85}
              />
            ))}
          </svg>
        </div>
        <p className="text-2xs text-text-tertiary italic leading-snug mt-1.5">
          Linking number with the trefoil = Rademacher Φ = the global winding S(T) = arg ζ(½ + iT)
          realizes (Ghys).
        </p>
      </div>

      <div data-testid="mk-phi-stats">
        <MetricRow label="Geodesics enumerated" value={spectrum.count} digits={0} />
        <MetricRow label="Min Φ" value={spectrum.minPhi} digits={0} />
        <MetricRow label="Max Φ" value={spectrum.maxPhi} digits={0} />
        <MetricRow label="Mean |Φ|" value={spectrum.meanAbsPhi} digits={3} />
      </div>
    </ControlGroup>
  )
})

ModularKnotAnalysisContent.displayName = 'ModularKnotAnalysisContent'
