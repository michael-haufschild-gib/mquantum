/**
 * Energy Diagram HUD Overlay
 *
 * Renders a 1D cross-section of V(x) along axis 0 overlaid on the
 * 3D viewport, with the wavepacket kinetic energy level and live
 * R/T coefficients from GPU diagnostics.
 *
 * Anchored to the top-right corner of the scene area, pushed inward
 * when the right editor panel is open.
 *
 * Only visible when quantumMode === 'tdseDynamics' and diagnosticsEnabled.
 *
 * @module components/canvas/EnergyDiagramHUD
 */

import React, { useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useShallow } from 'zustand/react/shallow'
import { useExtendedObjectStore } from '@/stores/extendedObjectStore'
import { useLayoutStore } from '@/stores/layoutStore'
import { useTdseDiagnosticsStore } from '@/stores/tdseDiagnosticsStore'
import {
  samplePotentialProfile,
  computePacketKineticEnergy,
} from '@/lib/physics/tdse/potentialProfile'

const WIDTH = 260
const HEIGHT = 130
const PADDING_X = 32
const PADDING_Y = 16
const PLOT_W = WIDTH - 2 * PADDING_X
const PLOT_H = HEIGHT - 2 * PADDING_Y

const SIDEBAR_WIDTH = 320
const TOP_BAR_HEIGHT = 48
const GAP = 12

export const EnergyDiagramHUD: React.FC = React.memo(() => {
  const { tdse, quantumMode } = useExtendedObjectStore(
    useShallow((s) => ({
      tdse: s.schroedinger.tdse,
      quantumMode: s.schroedinger.quantumMode,
    })),
  )

  const { isRightOpen, isCinematic } = useLayoutStore(
    useShallow((s) => ({
      isRightOpen: !s.isCollapsed && !s.isCinematicMode,
      isCinematic: s.isCinematicMode,
    })),
  )

  const { R, T, totalNorm, normDrift, hasData } = useTdseDiagnosticsStore(
    useShallow((s) => ({
      R: s.R,
      T: s.T,
      totalNorm: s.totalNorm,
      normDrift: s.normDrift,
      hasData: s.hasData,
    })),
  )

  const isVisible = quantumMode === 'tdseDynamics' && tdse.diagnosticsEnabled && !isCinematic

  // tdse is a new object reference on every store mutation, so using it
  // directly as a dep is correct and avoids stale closure issues.
  const profile = useMemo(() => {
    if (!isVisible) return null
    return samplePotentialProfile(tdse, 200)
  }, [isVisible, tdse])

  const kineticEnergy = useMemo(() => {
    if (!isVisible) return 0
    return computePacketKineticEnergy(tdse)
  }, [isVisible, tdse])

  if (!isVisible || !profile) return null

  // Compute plot bounds — include both V range and E_kinetic
  const eMax = Math.max(profile.vMax, kineticEnergy, 1)
  const eMin = Math.min(profile.vMin, 0)
  const eRange = eMax - eMin || 1
  const yLow = eMin - eRange * 0.1
  const yHigh = eMax + eRange * 0.1
  const yRange = yHigh - yLow

  const xMin = profile.xs[0]!
  const xMax = profile.xs[profile.xs.length - 1]!
  const xRange = xMax - xMin || 1

  const toSvgX = (x: number) => PADDING_X + ((x - xMin) / xRange) * PLOT_W
  const toSvgY = (v: number) => PADDING_Y + (1 - (v - yLow) / yRange) * PLOT_H

  // Build V(x) path
  const pathParts: string[] = []
  for (let i = 0; i < profile.xs.length; i++) {
    const sx = toSvgX(profile.xs[i]!)
    const sy = toSvgY(profile.vs[i]!)
    pathParts.push(i === 0 ? `M${sx},${sy}` : `L${sx},${sy}`)
  }
  const vPath = pathParts.join(' ')

  const eLineY = toSvgY(kineticEnergy)
  const zeroY = toSvgY(0)

  // Y-axis tick marks
  const yTicks: { y: number; label: string }[] = []
  const niceStep = niceNum(yRange / 4, true)
  const tickStart = Math.ceil(yLow / niceStep) * niceStep
  for (let v = tickStart; v <= yHigh; v += niceStep) {
    yTicks.push({ y: toSvgY(v), label: formatNum(v) })
  }

  // Position: top-right, pushed left when right panel is open
  const rightOffset = (isRightOpen ? SIDEBAR_WIDTH : 0) + GAP
  const topOffset = TOP_BAR_HEIGHT + GAP

  return createPortal(
    <div
      className="fixed z-[90] pointer-events-none select-none"
      style={{
        top: topOffset,
        right: rightOffset,
        transition: 'right 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
      }}
      data-testid="energy-diagram-hud"
    >
      <div
        className="glass-panel rounded-lg overflow-hidden"
        style={{ width: WIDTH }}
      >
        <svg width={WIDTH} height={HEIGHT} className="block">
          {/* Zero line */}
          <line
            x1={PADDING_X} y1={zeroY}
            x2={PADDING_X + PLOT_W} y2={zeroY}
            stroke="var(--text-tertiary)" strokeWidth={0.5} strokeDasharray="2,2"
          />

          {/* Y-axis ticks */}
          {yTicks.map((tick, i) => (
            <g key={i}>
              <line
                x1={PADDING_X - 3} y1={tick.y}
                x2={PADDING_X} y2={tick.y}
                stroke="var(--text-tertiary)" strokeWidth={0.5}
              />
              <text
                x={PADDING_X - 5} y={tick.y + 3}
                textAnchor="end" fill="var(--text-tertiary)"
                fontSize={8} fontFamily="monospace"
              >
                {tick.label}
              </text>
            </g>
          ))}

          {/* V(x) fill */}
          <path
            d={`${vPath} L${toSvgX(xMax)},${zeroY} L${toSvgX(xMin)},${zeroY} Z`}
            fill="var(--accent)" fillOpacity={0.15}
          />

          {/* V(x) line */}
          <path d={vPath} fill="none" stroke="var(--accent)" strokeWidth={2} />

          {/* Kinetic energy level */}
          <line
            x1={PADDING_X} y1={eLineY}
            x2={PADDING_X + PLOT_W} y2={eLineY}
            stroke="#f59e0b" strokeWidth={1} strokeDasharray="4,3"
          />
          <text
            x={PADDING_X + PLOT_W + 2} y={eLineY + 3}
            fill="#f59e0b" fontSize={8} fontFamily="monospace"
          >
            E
          </text>

          {/* Axes */}
          <line
            x1={PADDING_X} y1={PADDING_Y}
            x2={PADDING_X} y2={PADDING_Y + PLOT_H}
            stroke="var(--text-secondary)" strokeWidth={0.5}
          />
          <line
            x1={PADDING_X} y1={PADDING_Y + PLOT_H}
            x2={PADDING_X + PLOT_W} y2={PADDING_Y + PLOT_H}
            stroke="var(--text-secondary)" strokeWidth={0.5}
          />

          {/* Axis labels */}
          <text
            x={PADDING_X + PLOT_W / 2} y={HEIGHT - 2}
            textAnchor="middle" fill="var(--text-tertiary)"
            fontSize={8} fontFamily="monospace"
          >
            x
          </text>
          <text
            x={4} y={PADDING_Y + PLOT_H / 2}
            textAnchor="middle" fill="var(--text-tertiary)"
            fontSize={8} fontFamily="monospace"
            transform={`rotate(-90, 4, ${PADDING_Y + PLOT_H / 2})`}
          >
            V(x)
          </text>
        </svg>

        {/* Metrics readout */}
        <div className="px-2 pb-1.5 flex gap-3 text-[9px] font-mono leading-tight">
          {hasData ? (
            <>
              <span style={{ color: 'var(--text-secondary)' }}>
                R={R.toFixed(3)} T={T.toFixed(3)}
              </span>
              <span style={{ color: 'var(--text-tertiary)' }}>
                ||ψ||²={totalNorm.toFixed(4)}
              </span>
              <span style={{ color: normDrift > 0.01 ? '#ef4444' : 'var(--text-tertiary)' }}>
                Δ={normDrift >= 0 ? '+' : ''}{(normDrift * 100).toFixed(2)}%
              </span>
            </>
          ) : (
            <span style={{ color: 'var(--text-tertiary)' }}>Awaiting diagnostics...</span>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
})

EnergyDiagramHUD.displayName = 'EnergyDiagramHUD'

function niceNum(range: number, round: boolean): number {
  const exp = Math.floor(Math.log10(Math.abs(range) || 1))
  const frac = range / Math.pow(10, exp)
  let nice: number
  if (round) {
    if (frac < 1.5) nice = 1
    else if (frac < 3) nice = 2
    else if (frac < 7) nice = 5
    else nice = 10
  } else {
    if (frac <= 1) nice = 1
    else if (frac <= 2) nice = 2
    else if (frac <= 5) nice = 5
    else nice = 10
  }
  return nice * Math.pow(10, exp)
}

function formatNum(v: number): string {
  if (Math.abs(v) < 0.001) return '0'
  if (Math.abs(v) >= 100) return v.toFixed(0)
  if (Math.abs(v) >= 1) return v.toFixed(1)
  return v.toFixed(2)
}
