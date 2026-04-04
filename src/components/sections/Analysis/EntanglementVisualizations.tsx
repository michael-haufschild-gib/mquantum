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

import React, { useState } from 'react'

import { Tooltip } from '@/components/ui/Tooltip'

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
  entropies: (number | null)[]
  maxEntropies: (number | null)[]
}> = React.memo(({ entropies, maxEntropies }) => {
  if (entropies.length === 0) return null
  const N = entropies.length

  return (
    <div className="mt-1">
      <p className="text-xs text-text-secondary mb-0.5">Per-dimension S_d / S_max</p>
      <div className="rounded-md overflow-hidden bg-[var(--bg-surface)]">
        <svg width="100%" viewBox={`0 0 ${BAR_W} ${BAR_H}`} className="block">
          {entropies.map((S, d) => {
            const maxS = maxEntropies[d] ?? null
            const skipped = S === null || maxS === null
            const frac = skipped || maxS <= 0 ? 0 : Math.min(S / maxS, 1)
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
                {skipped ? (
                  <text
                    x={PAD.left + PLOT_W / 2}
                    y={y + h / 2}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fill="var(--text-tertiary)"
                    fontSize={7}
                  >
                    N/A
                  </text>
                ) : (
                  <rect
                    x={PAD.left}
                    y={y}
                    width={Math.max(frac * PLOT_W, 1)}
                    height={h}
                    fill="var(--chart-pass-2)"
                    rx={1}
                  />
                )}
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
      <p className="text-xs text-text-secondary mb-0.5">
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
      <p className="text-xs text-text-secondary mb-0.5">Pairwise mutual information</p>
      <div className="rounded-md overflow-hidden bg-[var(--bg-surface)] inline-block">
        <svg width={HEATMAP_SIZE + 20} height={HEATMAP_SIZE + 20} className="block">
          {Array.from({ length: N }, (_, i) =>
            Array.from({ length: N }, (__, j) => {
              const val = matrix[i * N + j]!
              const notComputed = Number.isNaN(val)
              const frac = notComputed ? 0 : maxMI > 0 ? Math.min(val / maxMI, 1) : 0
              const lightness = 0.95 - 0.55 * frac
              return (
                <rect
                  key={`${i}-${j}`}
                  x={10 + j * cellSize}
                  y={10 + i * cellSize}
                  width={cellSize - 1}
                  height={cellSize - 1}
                  // Dynamic heatmap gradient — cannot use static CSS variable
                  fill={
                    notComputed
                      ? 'var(--bg-elevated)' // Hatched/neutral for "not computed"
                      : `oklch(${lightness} ${0.15 * frac} 30)` // eslint-disable-line project-rules/no-hardcoded-colors
                  }
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

const ATLAS = { W: 280, H: 120, pad: { left: 26, right: 10, top: 18, bottom: 28 } }
const ATLAS_PW = ATLAS.W - ATLAS.pad.left - ATLAS.pad.right
const ATLAS_PH = ATLAS.H - ATLAS.pad.top - ATLAS.pad.bottom

function fmtLambda(v: number): string {
  return v >= 10 ? v.toFixed(0) : v >= 1 ? v.toFixed(1) : v.toFixed(2)
}

function entropyLabel(frac: number): string {
  if (frac < 0.1) return 'Nearly separable'
  if (frac < 0.3) return 'Weak entanglement'
  if (frac < 0.6) return 'Moderate entanglement'
  if (frac < 0.85) return 'Strong entanglement'
  return 'Near-maximal entanglement'
}

function entropyDesc(frac: number): string {
  if (frac < 0.1) return 'Dimensions evolve almost independently — close to a product state.'
  if (frac < 0.3)
    return 'Some inter-dimensional coupling, but each dimension retains most of its identity.'
  if (frac < 0.6)
    return 'Significant correlation — the wavefunction cannot be easily factored across dimensions.'
  if (frac < 0.85)
    return 'Highly coupled — tracing out any dimension loses substantial information.'
  return 'Approaching a fully mixed reduced state — maximum quantum correlation between dimensions.'
}

function atlasInsight(
  results: { lambda: number; dim: number; entropy: number }[],
  maxE: number
): string {
  if (results.length < 2) return 'Collecting data — need at least 2 points for analysis.'
  const sorted = [...results].sort((a, b) => a.entropy - b.entropy)
  const lo = sorted[0]!,
    hi = sorted[sorted.length - 1]!
  const rangePct = maxE > 0 ? (((hi.entropy - lo.entropy) / maxE) * 100).toFixed(0) : '0'

  const byDim = new Map<number, { lambda: number; entropy: number }[]>()
  for (const r of results) {
    const arr = byDim.get(r.dim) ?? []
    arr.push(r)
    byDim.set(r.dim, arr)
  }
  let up = 0,
    down = 0
  for (const [, g] of byDim) {
    if (g.length < 2) continue
    const s = [...g].sort((a, b) => a.lambda - b.lambda)
    if (s[s.length - 1]!.entropy > s[0]!.entropy * 1.1) up++
    else if (s[0]!.entropy > s[s.length - 1]!.entropy * 1.1) down++
  }
  const trend =
    up > down
      ? 'Entropy rises with λ — coupling drives entanglement as expected.'
      : down > up
        ? 'Entropy falls with λ — possible Anderson-like localization.'
        : 'No clear λ-dependence at this resolution.'

  return `Range: ${rangePct}% of S_max. Peak at λ=${fmtLambda(hi.lambda)}, ${hi.dim}D. ${trend}`
}

interface HoveredAtlasCell {
  lambda: number
  dim: number
  entropy: number
  frac: number
  x: number
  y: number
}

/** Interactive heatmap of S̄_∞(λ, N) sweep results with tooltips and auto-interpretation. */
export const AtlasHeatmap: React.FC<{
  results: { lambda: number; dim: number; entropy: number }[]
}> = React.memo(({ results }) => {
  const [hovered, setHovered] = useState<HoveredAtlasCell | null>(null)

  if (results.length === 0) return null

  const dims = [...new Set(results.map((r) => r.dim))].sort((a, b) => a - b)
  const lambdas = [...new Set(results.map((r) => r.lambda))].sort((a, b) => a - b)
  const finiteEntropies = results.map((r) => r.entropy).filter(Number.isFinite)
  const maxEntropy = finiteEntropies.length > 0 ? Math.max(...finiteEntropies, 1e-6) : 1e-6

  const cellW = ATLAS_PW / lambdas.length
  const cellH = ATLAS_PH / dims.length
  const maxTicks = 7
  const tickStep = Math.max(1, Math.ceil(lambdas.length / maxTicks))
  const insight = atlasInsight(results, maxEntropy)

  return (
    <div className="mt-1 relative">
      <div className="flex items-center gap-1.5 mb-0.5">
        <Tooltip
          position="bottom"
          content={
            <div className="max-w-[260px]">
              <p className="font-semibold mb-1">Entanglement Atlas</p>
              <p className="mb-1">
                Maps normalized entanglement entropy (S̄/S_max) across coupling strength (λ) and
                spatial dimensions (N).
              </p>
              <p className="mb-1">
                Each cell is one simulated configuration. The sweep automatically evolves the TDSE,
                measures long-time-average entropy, then moves to the next (λ, N) point.
              </p>
              <p>
                <strong>Reading the colors:</strong> Light = low entanglement (near product state).
                Dark red = high entanglement (near maximally mixed). Look for entropy growing with λ
                (coupling drives entanglement) and with N (more entanglement pathways). Deviations
                hint at localization or dimensional saturation.
              </p>
            </div>
          }
        >
          <span className="text-xs text-text-secondary cursor-help underline decoration-dotted decoration-text-tertiary underline-offset-2">
            Entanglement Atlas
          </span>
        </Tooltip>
        <span className="text-xs text-text-tertiary ml-auto">{results.length} pts</span>
      </div>

      <div className="rounded-md overflow-visible bg-[var(--bg-surface)]">
        <svg width="100%" viewBox={`0 0 ${ATLAS.W} ${ATLAS.H}`} className="block">
          {results.map((r) => {
            const li = lambdas.indexOf(r.lambda)
            const di = dims.indexOf(r.dim)
            if (li < 0 || di < 0) return null
            const frac = Number.isFinite(r.entropy) ? r.entropy / maxEntropy : 0
            const lightness = 0.95 - 0.55 * frac
            const active = hovered?.lambda === r.lambda && hovered?.dim === r.dim
            return (
              <g
                key={`${r.lambda}-${r.dim}`}
                className="cursor-crosshair"
                onMouseEnter={(e) => {
                  const box = (e.currentTarget as unknown as Element).getBoundingClientRect()
                  setHovered({
                    lambda: r.lambda,
                    dim: r.dim,
                    entropy: r.entropy,
                    frac,
                    x: box.left + box.width / 2,
                    y: box.top,
                  })
                }}
                onMouseLeave={() => setHovered(null)}
              >
                <rect
                  x={ATLAS.pad.left + li * cellW}
                  y={ATLAS.pad.top + di * cellH}
                  width={Math.max(cellW - 1, 2)}
                  height={Math.max(cellH - 1, 2)}
                  fill={`oklch(${lightness} ${0.18 * frac} 30)`} // eslint-disable-line project-rules/no-hardcoded-colors
                  rx={1}
                  stroke={active ? 'var(--text-primary)' : 'none'}
                  strokeWidth={active ? 0.8 : 0}
                />
              </g>
            )
          })}

          {/* Y-axis: dimension labels */}
          {dims.map((dim, di) => (
            <text
              key={`y-${dim}`}
              x={ATLAS.pad.left - 4}
              y={ATLAS.pad.top + di * cellH + cellH / 2}
              textAnchor="end"
              dominantBaseline="central"
              fill="var(--text-secondary)"
              className="text-xs"
            >
              {dim}D
            </text>
          ))}

          {/* X-axis: lambda tick values */}
          {lambdas.map((l, li) => {
            if (li % tickStep !== 0 && li !== lambdas.length - 1) return null
            return (
              <text
                key={`x-${l}`}
                x={ATLAS.pad.left + li * cellW + cellW / 2}
                y={ATLAS.H - 4}
                textAnchor="middle"
                fill="var(--text-tertiary)"
                className="text-xs"
              >
                {fmtLambda(l)}
              </text>
            )
          })}
        </svg>
      </div>

      {/* Axis label + color legend, centered */}
      <div className="flex flex-col items-center mt-0.5 gap-0.5">
        <Tooltip
          position="bottom"
          content="λ = anharmonic coupling strength. Controls how strongly the spatial dimensions interact via the potential V(x) = ½x² + λx⁴. Higher λ drives more inter-dimensional entanglement."
        >
          <span className="text-xs text-text-tertiary cursor-help">Coupling (λ) →</span>
        </Tooltip>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-text-tertiary">low</span>
          <div
            className="w-14 h-2 rounded-full"
            style={{
              background: 'linear-gradient(to right, oklch(0.95 0 30), oklch(0.40 0.18 30))', // eslint-disable-line project-rules/no-hardcoded-colors
            }}
          />
          <span className="text-xs text-text-tertiary">high</span>
        </div>
      </div>

      {/* Floating cell tooltip */}
      {hovered && (
        <div
          className="fixed z-[100] glass-panel-dark border border-border-default rounded-lg px-3 py-2 pointer-events-none max-w-[240px] shadow-lg"
          style={{
            left: `${hovered.x}px`,
            top: `${hovered.y - 8}px`,
            transform: 'translate(-50%, -100%)',
            textShadow: '0 1px 2px var(--bg-overlay)',
          }}
        >
          <div className="text-xs font-medium text-text-primary">
            λ = {hovered.lambda.toFixed(2)}, N = {hovered.dim}
          </div>
          <div className="text-xs text-text-secondary mt-0.5">
            S̄/S_max = {(hovered.frac * 100).toFixed(1)}% — {entropyLabel(hovered.frac)}
          </div>
          <div className="text-xs text-text-tertiary mt-0.5 leading-snug">
            {entropyDesc(hovered.frac)}
          </div>
        </div>
      )}

      {/* Auto-generated insight */}
      <p className="text-xs text-text-tertiary mt-1 leading-snug">{insight}</p>
    </div>
  )
})
AtlasHeatmap.displayName = 'AtlasHeatmap'
