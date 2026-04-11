/**
 * SVG log-scale power spectrum plot for the TDSE wavepacket
 * spectrometer panel. Kept in its own file so the main panel stays
 * under the project's `max-lines` cap and the heavy geometry code does
 * not bloat the state-machine reading of {@link TDSESpectrometerPanel}.
 *
 * @module components/sections/Analysis/SpectrometerPlot
 */

import React, { useMemo } from 'react'

import type { HellerSpectrum } from '@/lib/physics/tdse/heller'

import {
  buildPlotData,
  type HarmonicOverlay,
  type PlotGeometry,
  type StatusMessage,
} from './spectrometerHelpers'

/* ── SVG plot geometry ─────────────────────────────────────────── */
const PLOT_W = 300
const PLOT_H = 180
const PLOT_PAD_L = 34
const PLOT_PAD_R = 10
const PLOT_PAD_T = 12
const PLOT_PAD_B = 30
const PLOT_AREA_W = PLOT_W - PLOT_PAD_L - PLOT_PAD_R
const PLOT_AREA_H = PLOT_H - PLOT_PAD_T - PLOT_PAD_B

const GEOM: PlotGeometry = {
  padL: PLOT_PAD_L,
  padT: PLOT_PAD_T,
  areaW: PLOT_AREA_W,
  areaH: PLOT_AREA_H,
}

/** Props for the spectrum plot. */
export interface SpectrometerPlotProps {
  /** Current spectrum; null or empty → render the placeholder. */
  spectrum: HellerSpectrum | null
  /** Theoretical overlay to draw on top, or null. */
  overlay: HarmonicOverlay | null
  /** Status message shown inside the placeholder. */
  statusMessage: StatusMessage
}

/**
 * Inline SVG log-scale power spectrum plot with peak markers,
 * numeric X-axis ticks, and (when applicable) theoretical reference
 * lines.
 *
 * @param props - Props
 * @returns SVG plot, or a contextual placeholder when no spectrum
 */
export const SpectrometerPlot: React.FC<SpectrometerPlotProps> = React.memo(
  ({ spectrum, overlay, statusMessage }) => {
    const plotData = useMemo(() => buildPlotData(spectrum, overlay, GEOM), [spectrum, overlay])

    if (!plotData) {
      return (
        <div
          className="rounded-md bg-[var(--bg-surface)] flex flex-col items-center justify-center px-3 py-2"
          style={{ width: '100%', aspectRatio: `${PLOT_W} / ${PLOT_H}` }}
          data-testid="heller-spectrum-placeholder"
        >
          <span className="text-xs text-text-secondary">{statusMessage.label}</span>
          {statusMessage.detail && (
            <span className="text-xs text-text-tertiary mt-0.5 text-center">
              {statusMessage.detail}
            </span>
          )}
        </div>
      )
    }

    return (
      <div
        className="rounded-md overflow-hidden bg-[var(--bg-surface)]"
        data-testid="heller-spectrum-plot"
      >
        <svg width="100%" viewBox={`0 0 ${PLOT_W} ${PLOT_H}`} className="block">
          {/* Theoretical overlay (drawn first so peaks draw on top) */}
          {plotData.overlayLines.length > 0 && (
            <g data-testid="heller-theory-overlay">
              {plotData.overlayLines.map((line, idx) => (
                <g key={idx} data-testid={`heller-theory-line-${idx}`}>
                  <line
                    x1={line.x}
                    y1={PLOT_PAD_T}
                    x2={line.x}
                    y2={PLOT_PAD_T + PLOT_AREA_H}
                    stroke="var(--color-success)"
                    strokeWidth={0.5}
                    strokeDasharray="1,3"
                  />
                  <text
                    x={line.x}
                    y={PLOT_PAD_T - 2}
                    textAnchor="middle"
                    fill="var(--text-tertiary)"
                    fontSize={7}
                    fontFamily="monospace"
                  >
                    {line.label}
                  </text>
                </g>
              ))}
            </g>
          )}

          {/* Axes */}
          <line
            x1={PLOT_PAD_L}
            y1={PLOT_PAD_T}
            x2={PLOT_PAD_L}
            y2={PLOT_PAD_T + PLOT_AREA_H}
            stroke="var(--text-secondary)"
            strokeWidth={0.5}
          />
          <line
            x1={PLOT_PAD_L}
            y1={PLOT_PAD_T + PLOT_AREA_H}
            x2={PLOT_PAD_L + PLOT_AREA_W}
            y2={PLOT_PAD_T + PLOT_AREA_H}
            stroke="var(--text-secondary)"
            strokeWidth={0.5}
          />

          {/* X-axis ticks with numeric labels */}
          {plotData.xTicks.map((tick, idx) => (
            <g key={idx}>
              <line
                x1={tick.x}
                y1={PLOT_PAD_T + PLOT_AREA_H}
                x2={tick.x}
                y2={PLOT_PAD_T + PLOT_AREA_H + 3}
                stroke="var(--text-secondary)"
                strokeWidth={0.5}
              />
              <text
                x={tick.x}
                y={PLOT_PAD_T + PLOT_AREA_H + 11}
                textAnchor="middle"
                fill="var(--text-tertiary)"
                fontSize={8}
                fontFamily="monospace"
              >
                {tick.label}
              </text>
            </g>
          ))}

          {/* Spectrum polyline */}
          <polyline
            points={plotData.polyline}
            fill="none"
            stroke="var(--theme-accent)"
            strokeWidth={1}
            strokeLinejoin="round"
          />

          {/* Peak markers */}
          {plotData.peakMarkers.map((marker, idx) => (
            <g key={idx}>
              <line
                x1={marker.x}
                y1={marker.y}
                x2={marker.x}
                y2={PLOT_PAD_T + PLOT_AREA_H}
                stroke="var(--color-warning)"
                strokeWidth={0.5}
                strokeDasharray="2,2"
              />
              <circle cx={marker.x} cy={marker.y} r={2} fill="var(--color-warning)" />
            </g>
          ))}

          {/* Axis titles */}
          <text
            x={PLOT_PAD_L + PLOT_AREA_W / 2}
            y={PLOT_H - 4}
            textAnchor="middle"
            fill="var(--text-tertiary)"
            fontSize={9}
            fontFamily="monospace"
          >
            ω (E = ℏω)
          </text>
          <text
            x={6}
            y={PLOT_PAD_T + PLOT_AREA_H / 2}
            textAnchor="middle"
            fill="var(--text-tertiary)"
            fontSize={9}
            fontFamily="monospace"
            transform={`rotate(-90, 6, ${PLOT_PAD_T + PLOT_AREA_H / 2})`}
          >
            log |P(ω)|²
          </text>
          {plotData.overlayCaption && (
            <text
              x={PLOT_PAD_L + PLOT_AREA_W}
              y={PLOT_H - 4}
              textAnchor="end"
              fill="var(--text-tertiary)"
              fontSize={7}
              fontFamily="monospace"
            >
              {plotData.overlayCaption}
            </text>
          )}
        </svg>
      </div>
    )
  }
)

SpectrometerPlot.displayName = 'SpectrometerPlot'
