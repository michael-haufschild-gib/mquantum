/**
 * (η, v) atlas heatmap for the Bell-experiment sweep.
 *
 * Renders the sweep's |S| grid as a colored canvas: rows = detection
 * efficiency η, columns = Werner visibility v. Cells with |S| > 2 are
 * tinted with the `--chart-pass-1` token (CHSH violation); the rest are
 * mapped on the warmth ramp of `--chart-cost-warm` so the violation
 * boundary stands out without leaving the project's color palette.
 *
 * All colors are sourced from CSS custom properties via
 * {@link getComputedStyle} at draw time — no literal hex / rgb strings
 * appear in this file. That keeps the heatmap consistent with theme
 * switches and obeys the project's `no-hardcoded-colors` lint rule.
 *
 * Pure presentational component — receives the flat result list and
 * renders. The sweep driver lives in
 * {@link lib/physics/bell/atlasSweep.runFullEtaVisibilitySweep}.
 *
 * @module components/sections/Analysis/BellAtlasHeatmap
 */

import React, { useEffect, useRef } from 'react'

import type { AtlasSweepCellResult } from '@/lib/physics/bell/atlasSweep'
import { CLASSICAL_BOUND, TSIRELSON_BOUND } from '@/lib/physics/bell/chsh'

/** Props for {@link BellAtlasHeatmap}. */
export interface BellAtlasHeatmapProps {
  /** Flat row-major list of sweep results (row = η, col = v). */
  results: readonly AtlasSweepCellResult[]
  /** Number of η rows in the sweep grid. */
  etaSteps: number
  /** Number of v columns in the sweep grid. */
  visibilitySteps: number
  /** Pixel size for each cell (heatmap renders at `etaSteps · cellPx × visibilitySteps · cellPx`). */
  cellPx?: number
}

/** Theme tokens read at draw time so the heatmap follows the active theme. */
interface ThemePalette {
  /** Color for empty / background cells. */
  bg: string
  /** Warm color used for sub-violation cells (mapped to alpha by |S|/2). */
  warm: string
  /** Pass color used for violation cells (mapped to alpha by (|S|−2)/(2√2−2)). */
  pass: string
  /** Outline color drawn around violation cells. */
  outline: string
}

/**
 * Read the heatmap palette from CSS variables on the given element.
 *
 * Avoids hardcoded color values in the source — all four entries come
 * from theme tokens defined in `src/styles/theme.css`. Reading via
 * {@link getComputedStyle} resolves nested `var()` references to a
 * concrete string (e.g. an `oklch()` literal) that the canvas can parse.
 *
 * @param el - Element whose computed style is consulted.
 * @returns The four palette entries.
 */
function readPalette(el: HTMLElement): ThemePalette {
  const cs = getComputedStyle(el)
  const read = (token: string, fallbackToken: string): string => {
    const v = cs.getPropertyValue(token).trim()
    if (v) return v
    return cs.getPropertyValue(fallbackToken).trim()
  }
  return {
    // Use the panel surface as the heatmap background so empty cells blend in.
    bg: read('--bg-surface-2', '--bg-glass'),
    warm: read('--chart-cost-warm', '--chart-pass-3'),
    pass: read('--chart-pass-1', '--chart-pass-1'),
    outline: read('--text-primary', '--text-primary'),
  }
}

/**
 * Canvas-backed atlas heatmap. Re-renders to its 2D context whenever
 * {@link results} or grid dimensions change.
 *
 * @param props - Heatmap props.
 * @returns Heatmap react element.
 */
export const BellAtlasHeatmap: React.FC<BellAtlasHeatmapProps> = React.memo((props) => {
  const { results, etaSteps, visibilitySteps, cellPx = 24 } = props
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const w = visibilitySteps * cellPx
    const h = etaSteps * cellPx
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const palette = readPalette(canvas)

    // Fill background.
    ctx.globalAlpha = 1
    ctx.fillStyle = palette.bg
    ctx.fillRect(0, 0, w, h)

    for (const cell of results) {
      const yIdx = etaSteps - 1 - cell.rowIndex
      const x = cell.colIndex * cellPx
      const y = yIdx * cellPx
      if (!Number.isFinite(cell.absS)) {
        continue
      }
      if (cell.absS < CLASSICAL_BOUND) {
        // Warm ramp: alpha = absS / 2 ∈ [0, 1].
        ctx.globalAlpha = Math.max(0, Math.min(1, cell.absS / CLASSICAL_BOUND))
        ctx.fillStyle = palette.warm
        ctx.fillRect(x, y, cellPx, cellPx)
      } else {
        // Pass color: alpha = (absS − 2) / (2√2 − 2) ∈ [0, 1].
        const denom = TSIRELSON_BOUND - CLASSICAL_BOUND
        ctx.globalAlpha = Math.max(0.25, Math.min(1, (cell.absS - CLASSICAL_BOUND) / denom + 0.25))
        ctx.fillStyle = palette.pass
        ctx.fillRect(x, y, cellPx, cellPx)
        // Outline for violation cells.
        ctx.globalAlpha = 0.6
        ctx.strokeStyle = palette.outline
        ctx.lineWidth = 1
        ctx.strokeRect(x + 0.5, y + 0.5, cellPx - 1, cellPx - 1)
      }
    }
    ctx.globalAlpha = 1
  }, [results, etaSteps, visibilitySteps, cellPx])

  if (results.length === 0) return null

  return (
    <div className="flex flex-col items-start gap-1" data-testid="bell-atlas-heatmap">
      <canvas
        ref={canvasRef}
        className="border border-[var(--border-subtle)] rounded"
        style={{
          width: `${visibilitySteps * cellPx}px`,
          height: `${etaSteps * cellPx}px`,
        }}
        aria-label="Bell experiment (η, v) atlas heatmap"
      />
      <div className="flex justify-between w-full text-3xs text-text-secondary px-0.5">
        <span>v = lo</span>
        <span>v = hi</span>
      </div>
      <p className="text-3xs text-text-secondary">
        Rows: η (top = hi). Columns: v (right = hi). Outlined cells = CHSH violation.
      </p>
    </div>
  )
})

BellAtlasHeatmap.displayName = 'BellAtlasHeatmap'
