/**
 * Hilbert–Pólya Analysis Content — "Weil Positivity Monitor" panel.
 *
 * Content component for hilbertPolya (Hilbert–Pólya Spectrum) mode analysis.
 * Displays:
 * - The smallest eigenvalue λ_min of the regularized Weil-intertwiner Gram
 *   matrix W_ε on the first 40 Riemann zeros, with an injectable off-line
 *   doublet (β + iγ₀ and its functional-equation partner 1 − β + iγ₀).
 *   λ_min > 0 at every ε is exactly Weil positivity — equivalent to the
 *   Riemann Hypothesis. Dragging β off 1/2 demonstrates how a single
 *   off-line zero breaks positivity once ε < |2β − 1|.
 * - A Gram-matrix heatmap (one canvas pixel per entry, accent-shaded).
 * - A matched-density ensemble comparison (ζ zeros vs Poisson vs picket
 *   fence) showing GUE level repulsion protecting the metric's positivity.
 *
 * Used inside the unified AnalysisSection.
 *
 * @module components/sections/Analysis/HilbertPolyaAnalysisSection
 */

import React, { useEffect, useMemo, useRef, useState } from 'react'

import { ControlGroup } from '@/components/ui/ControlGroup'
import { Slider } from '@/components/ui/Slider'
import {
  ensembleComparison,
  intertwinerGram,
  minEigenvalueSym,
  withDoublet,
} from '@/lib/physics/hilbertPolya/intertwiner'
import { RIEMANN_ZEROS, unfoldedZeroSpacings } from '@/lib/physics/riemannZeta'

import { MetricRow } from '../AnalysisPrimitives'

/* ────────────────────────────────────────────────────────────── */
/*  Static inputs (the ζ zeros never change)                      */
/* ────────────────────────────────────────────────────────────── */

const ZERO_COUNT = 40
const ZEROS_40: readonly number[] = RIEMANN_ZEROS.slice(0, ZERO_COUNT)
/** Ordinate of the injected off-line doublet — mid-window, between zeros. */
const DOUBLET_GAMMA0 = 60.5
/** CSS pixels per Gram cell (40 cells × 4 px ≈ 160 px heatmap). */
const HEATMAP_CELL_PX = 4
/** Fixed ε for the ensemble comparison (deep into the repulsion regime). */
const ENSEMBLE_EPS = 0.1
const ENSEMBLES = (() => {
  const spacings = unfoldedZeroSpacings().slice(0, ZERO_COUNT - 1)
  const unfolded: number[] = [0]
  for (const s of spacings) unfolded.push(unfolded[unfolded.length - 1]! + s)
  return ensembleComparison(unfolded, ENSEMBLE_EPS)
})()

/* ────────────────────────────────────────────────────────────── */
/*  Content                                                       */
/* ────────────────────────────────────────────────────────────── */

/**
 * Analysis content for hilbertPolya (Hilbert–Pólya Spectrum) mode.
 * Renders the Weil positivity monitor: λ_min of the intertwiner Gram with an
 * injectable off-line doublet, the Gram heatmap, and the GUE/Poisson/crystal
 * ensemble comparison.
 *
 * @returns The Weil positivity monitor panel
 *
 * @example
 * ```tsx
 * <HilbertPolyaAnalysisContent />
 * ```
 */
export const HilbertPolyaAnalysisContent: React.FC = React.memo(() => {
  const [eps, setEps] = useState(1)
  const [beta, setBeta] = useState(0.5)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  // Gram matrix + λ_min for the current (ε, β). 40 on-line zeros plus the
  // off-line doublet when β ≠ 1/2; a ≤ 42×42 Jacobi solve is UI-instant.
  const weil = useMemo(() => {
    const pts = withDoublet(ZEROS_40, beta, DOUBLET_GAMMA0)
    const gram = intertwinerGram(pts, eps)
    return { gram, n: pts.length, lambdaMin: minEigenvalueSym(gram, pts.length) }
  }, [eps, beta])

  // Gram heatmap: one canvas pixel per matrix entry, upscaled via CSS with
  // pixelated rendering. Cell alpha = clamp(W[i,j], 0, 1) in the accent color.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const { gram, n } = weil
    canvas.width = n
    canvas.height = n
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const accent = getComputedStyle(canvas).getPropertyValue('--theme-accent').trim()
    ctx.clearRect(0, 0, n, n)
    if (accent) ctx.fillStyle = accent
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const w = gram[i * n + j]!
        if (w <= 0) continue
        ctx.globalAlpha = Math.min(1, w)
        ctx.fillRect(j, i, 1, 1)
      }
    }
    ctx.globalAlpha = 1
  }, [weil])

  const positive = weil.lambdaMin > 0
  const heatmapPx = weil.n * HEATMAP_CELL_PX

  return (
    <ControlGroup title="Weil Positivity Monitor — Ŵ ≥ 0 ⟺ RH" data-testid="hp-weil-monitor">
      <Slider
        label="Test scale ε"
        tooltip="Regularization scale of the Weil intertwiner. RH ⟺ the Gram stays positive at EVERY ε; an off-line doublet at β breaks positivity once ε < |2β − 1|."
        value={eps}
        onChange={setEps}
        min={0.1}
        max={5}
        step={0.05}
        data-testid="hp-eps-slider"
      />
      <Slider
        label="Off-line deviation β"
        tooltip="Re-part of an injected counterexample zero ρ₀ = β + iγ₀ (with its functional-equation partner 1 − β + iγ₀). β = 1/2 is the RH-true configuration — no doublet is injected."
        value={beta}
        onChange={setBeta}
        min={0.5}
        max={0.95}
        step={0.01}
        data-testid="hp-beta-slider"
      />

      <div data-testid="hp-lambda-readout" className="flex flex-col gap-0.5 py-0.5">
        <div className="flex items-center justify-between">
          <span className="text-xs text-text-tertiary">λ_min(W_ε)</span>
          <span
            className={`text-xs font-mono tabular-nums ${positive ? 'text-success' : 'text-danger'}`}
            data-testid="hp-lambda-value"
          >
            {weil.lambdaMin.toExponential(3)}
          </span>
        </div>
        <span
          className={`text-2xs ${positive ? 'text-success' : 'text-danger'}`}
          data-testid="hp-lambda-caption"
        >
          {positive ? 'λ_min > 0 — positivity holds (RH)' : 'λ_min < 0 — off-line zero detected'}
        </span>
      </div>

      <div data-testid="hp-gram-heatmap">
        <p className="text-xs text-text-secondary mb-1">Intertwiner Gram W_ε[i, j]</p>
        <canvas
          ref={canvasRef}
          className="border border-[var(--border-subtle)] rounded bg-[var(--bg-surface)]"
          style={{
            width: `${heatmapPx}px`,
            height: `${heatmapPx}px`,
            imageRendering: 'pixelated',
          }}
          aria-label="Weil intertwiner Gram matrix heatmap"
        />
        <p className="text-2xs text-text-tertiary italic leading-snug mt-1">
          Cauchy kernel ε² / (ε² + (γ_n − γ_m)²) on the first {ZERO_COUNT} zeros
          {weil.n > ZERO_COUNT ? ' + injected doublet (last two rows)' : ''}.
        </p>
      </div>

      <div data-testid="hp-ensemble-row">
        <MetricRow label="ζ zeros (GUE)" value={ENSEMBLES.zeros} digits={4} />
        <MetricRow label="Poisson" value={ENSEMBLES.poissonMean} digits={4} />
        <MetricRow label="crystal" value={ENSEMBLES.picket} digits={4} />
        <p className="text-2xs text-text-tertiary italic leading-snug mt-1">
          level repulsion keeps the Hilbert–Pólya metric positive
        </p>
      </div>
    </ControlGroup>
  )
})

HilbertPolyaAnalysisContent.displayName = 'HilbertPolyaAnalysisContent'
