/**
 * SVG renderer for the analog-Hawking Page-curve HUD.
 *
 * Pure presentation component — receives the pre-sampled snapshot plus
 * horizon context from its parent and lays out the axes, traces, guides,
 * legend, and empty-state text. Layout constants and the `PageCurveSnapshot`
 * builder live in `./snapshot.ts` so React Fast Refresh stays single-concern.
 *
 * The data-attribute contract (`data-testid`, `data-island-overlay`,
 * `data-has-horizon`) is intentionally stable — consumed by Playwright and
 * unit tests.
 *
 * @module components/overlays/pageCurve/PageCurveSvg
 */

import React from 'react'

import type { HorizonContext } from '@/hooks/usePageCurveSampling'

import {
  PAD_B,
  PAD_L,
  PAD_R,
  PAD_T,
  PAGE_CURVE_HEIGHT,
  PAGE_CURVE_WIDTH,
  type PageCurveSnapshot,
} from './snapshot'

/** Props for {@link PageCurveSvg}. */
export interface PageCurveSvgProps {
  snapshot: PageCurveSnapshot
  horizonContext: HorizonContext
  islandOverlayEnabled: boolean
  lastIslandRadius: number
  dMaxFrac: number
}

/**
 * Render the Page-curve SVG (axes, traces, guide lines, legend, empty state).
 *
 * @param props - See {@link PageCurveSvgProps}.
 * @returns SVG element with stable data-testid / data-attribute hooks.
 */
export const PageCurveSvg = React.memo(function PageCurveSvg({
  snapshot,
  horizonContext,
  islandOverlayEnabled,
  lastIslandRadius,
  dMaxFrac,
}: PageCurveSvgProps) {
  const tPagePixel =
    snapshot.tPage !== null && snapshot.tMax > snapshot.tMin
      ? PAD_L +
        ((snapshot.tPage - snapshot.tMin) / (snapshot.tMax - snapshot.tMin)) *
          (PAGE_CURVE_WIDTH - PAD_L - PAD_R)
      : null
  const sBHPixel =
    snapshot.sMax > 0
      ? PAD_T +
        (PAGE_CURVE_HEIGHT - PAD_T - PAD_B) -
        (snapshot.sBH / snapshot.sMax) * (PAGE_CURVE_HEIGHT - PAD_T - PAD_B)
      : null

  // Island extent guide line — the illustrative 50 % mid-band marker. The
  // deferred 3D GPU island channel will replace this UI-only approximation.
  const showEmptyState = horizonContext.isBec && !horizonContext.horizonPresent
  const showIslandLine =
    !showEmptyState &&
    islandOverlayEnabled &&
    snapshot.tPage !== null &&
    lastIslandRadius > 0 &&
    dMaxFrac > 0
  const islandPixel = showIslandLine
    ? PAD_T +
      (PAGE_CURVE_HEIGHT - PAD_T - PAD_B) -
      Math.min(1, lastIslandRadius / Math.max(dMaxFrac * 5, 1e-6)) *
        (PAGE_CURVE_HEIGHT - PAD_T - PAD_B) *
        0.5
    : null

  return (
    <svg
      viewBox={`0 0 ${PAGE_CURVE_WIDTH} ${PAGE_CURVE_HEIGHT}`}
      width={PAGE_CURVE_WIDTH}
      height={PAGE_CURVE_HEIGHT}
      role="img"
      aria-label="Page curve"
      data-testid="hawking-page-curve-svg"
      data-island-overlay={islandOverlayEnabled ? 'on' : 'off'}
      data-has-horizon={horizonContext.horizonPresent ? 'on' : 'off'}
    >
      {/* Axes */}
      <rect
        x={PAD_L}
        y={PAD_T}
        width={PAGE_CURVE_WIDTH - PAD_L - PAD_R}
        height={PAGE_CURVE_HEIGHT - PAD_T - PAD_B}
        fill="var(--color-control)"
        stroke="var(--color-panel-border)"
        strokeWidth={1}
      />
      {/* Empty state — supersedes the traces when no horizon exists. */}
      {showEmptyState && (
        <g data-testid="hawking-empty-state">
          <text
            x={PAGE_CURVE_WIDTH / 2}
            y={PAGE_CURVE_HEIGHT / 2 - 6}
            fontSize={11}
            fontFamily="monospace"
            textAnchor="middle"
            fill="var(--color-warning)"
          >
            No horizon — raise v_max above c_s0
          </text>
          <text
            x={PAGE_CURVE_WIDTH / 2}
            y={PAGE_CURVE_HEIGHT / 2 + 10}
            fontSize={10}
            fontFamily="monospace"
            textAnchor="middle"
            fill="var(--color-text-tertiary)"
          >
            c_s0 ≈ {horizonContext.cs0.toFixed(3)}
          </text>
        </g>
      )}
      {/* S_BH line — only meaningful when a horizon exists. */}
      {!showEmptyState && sBHPixel !== null && (
        <line
          x1={PAD_L}
          x2={PAGE_CURVE_WIDTH - PAD_R}
          y1={sBHPixel}
          y2={sBHPixel}
          stroke="var(--color-warning)"
          strokeDasharray="3 3"
          strokeWidth={1}
        />
      )}
      {/* t_Page line */}
      {!showEmptyState && tPagePixel !== null && (
        <line
          x1={tPagePixel}
          x2={tPagePixel}
          y1={PAD_T}
          y2={PAGE_CURVE_HEIGHT - PAD_B}
          stroke="var(--color-text-secondary)"
          strokeDasharray="2 3"
          strokeWidth={1}
        />
      )}
      {/* Island extent guide — only after t_Page and when the toggle is on. */}
      {islandPixel !== null && (
        <>
          <line
            x1={PAD_L}
            x2={PAGE_CURVE_WIDTH - PAD_R}
            y1={islandPixel}
            y2={islandPixel}
            stroke="var(--color-accent)"
            strokeDasharray="1 4"
            strokeWidth={1}
            data-testid="hawking-island-extent-line"
          />
          <text
            x={PAGE_CURVE_WIDTH - PAD_R - 2}
            y={islandPixel - 2}
            fontSize={9}
            fontFamily="monospace"
            textAnchor="end"
            fill="var(--color-accent)"
          >
            island d*
          </text>
        </>
      )}
      {/* S_therm trace */}
      {!showEmptyState && snapshot.hasData && (
        <path
          d={snapshot.thermPath}
          fill="none"
          stroke="var(--color-danger)"
          strokeWidth={1.5}
          strokeLinejoin="round"
          data-testid="hawking-stherm-path"
        />
      )}
      {/* S_page trace */}
      {!showEmptyState && snapshot.hasData && (
        <path
          d={snapshot.pagePath}
          fill="none"
          stroke="var(--color-accent)"
          strokeWidth={1.5}
          strokeLinejoin="round"
          data-testid="hawking-spage-path"
        />
      )}
      {/* Legend */}
      <g
        transform={`translate(${PAD_L + 4} ${PAD_T + 4})`}
        fontSize={10}
        fontFamily="monospace"
        fill="var(--color-text-primary)"
      >
        <rect x={0} y={0} width={86} height={30} fill="var(--color-overlay)" rx={2} />
        <line x1={4} y1={9} x2={14} y2={9} stroke="var(--color-danger)" strokeWidth={2} />
        <text x={18} y={12}>
          S_therm
        </text>
        <line x1={4} y1={22} x2={14} y2={22} stroke="var(--color-accent)" strokeWidth={2} />
        <text x={18} y={25}>
          S_page
        </text>
      </g>
      {/* Axis labels */}
      <text
        x={PAD_L}
        y={PAGE_CURVE_HEIGHT - 4}
        fontSize={10}
        fontFamily="monospace"
        fill="var(--color-text-tertiary)"
      >
        t {snapshot.hasData ? snapshot.tMin.toFixed(2) : '—'}
      </text>
      <text
        x={PAGE_CURVE_WIDTH - PAD_R}
        y={PAGE_CURVE_HEIGHT - 4}
        fontSize={10}
        fontFamily="monospace"
        textAnchor="end"
        fill="var(--color-text-tertiary)"
      >
        t {snapshot.hasData ? snapshot.tMax.toFixed(2) : '—'}
      </text>
      <text
        x={4}
        y={PAD_T + 10}
        fontSize={10}
        fontFamily="monospace"
        fill="var(--color-text-tertiary)"
      >
        S {snapshot.hasData ? snapshot.sMax.toExponential(1) : '—'}
      </text>
      <text
        x={4}
        y={PAGE_CURVE_HEIGHT - PAD_B}
        fontSize={10}
        fontFamily="monospace"
        fill="var(--color-text-tertiary)"
      >
        0
      </text>
    </svg>
  )
})
